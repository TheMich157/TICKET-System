require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const mongoose = require('mongoose');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const ejs = require('ejs');

const bot = require('./discordBot.js');
bot.startBot();
const startHeartbeat = require('./heartbeat.js');
startHeartbeat();

const Ticket = require('./models/Ticket');
const User = require('./models/User');
const { sendEmail, emailTemplates } = require('./utils/emailService');

const app = express();

// Apply rate limiting to all routes with improved configuration
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skipSuccessfulRequests: false, // Count successful requests against the rate limit
    skipFailedRequests: false, // Count failed requests against the rate limit
    handler: (req, res) => {
        res.status(429).render('error', {
            message: 'Too many requests, please try again later.',
            error: { status: 429 }
        });
    }
});

app.use(limiter);

// Connect to MongoDB with improved retry logic and error handling
const connectDB = async () => {
  const maxRetries = 5;
  let retryCount = 0;

  const connect = async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        heartbeatFrequencyMS: 2000,
        maxPoolSize: 50,
        minPoolSize: 10,
        retryWrites: true,
        w: 'majority'
      });
      console.log('Connected to MongoDB successfully');
    } catch (err) {
      console.error(`MongoDB connection error (Attempt ${retryCount + 1}/${maxRetries}):`, err);
      if (retryCount < maxRetries) {
        retryCount++;
        console.log(`Retrying connection in 5 seconds... (Attempt ${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return connect();
      } else {
        console.error('Max retry attempts reached. Could not connect to MongoDB.');
        process.exit(1);
      }
    }
  };

  await connect();
};

connectDB();

app.use((req, res, next) => {
  console.log(`Request received: ${req.method} ${req.url}`);
  next();
});

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected! Attempting to reconnect...');
  setTimeout(connectDB, 5000);
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err);
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration with enhanced security
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60, // 1 day in seconds
    autoRemove: 'native',
    touchAfter: 24 * 3600 // Only update session once per 24 hours
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 day
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  },
  name: 'sessionId', // Change session cookie name from default 'connect.sid'
  rolling: true // Extend session on activity
}));

// Initialize Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Apply logIp middleware after Passport
const logIp = require('./middleware/logIp');
app.use(logIp);

// Apply authentication middleware
const authMiddleware = require('./middleware/auth');
app.use(authMiddleware.router);

// View engine setup
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.engine('ejs', require('ejs').__express);

// Configure EJS options
app.locals.async = true;
app.locals.rmWhitespace = true;

// Make user data available to all views
app.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.isAuthenticated = req.isAuthenticated();
  res.locals.isStaff = req.user && (req.user.roles.includes('Staff') || req.user.roles.includes('Admin'));
  res.locals.isAdmin = req.user && req.user.roles.includes('Admin');
  next();
});

// Check if user has Staff role
const isStaff = (req, res, next) => {
    if (req.isAuthenticated() && (req.user.roles.includes('Staff') || req.user.roles.includes('Admin'))) {
        return next();
    }
    res.status(403).render('error', {
        message: 'Access denied. Staff privileges required.'
    });
};

// Initialize Passport config
require('./config/passport'); // Ensure this line is present

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/ticket', require('./routes/ticket'));
app.use('/staff', require('./routes/staff'));

// Register admin routes
app.use('/admin', require('./routes/admin'));

// After your routes setup
app.use(require('./middleware/errorHandler'));

// Configure better error handling for async routes
const wrapAsync = fn => {
  return function(req, res, next) {
    fn(req, res, next).catch(next);
  };
};

// Update ticket routes to use wrapAsync
app.use('/ticket', wrapAsync(require('./routes/ticket')));

// Error handler middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Handle specific errors
  if (err.name === 'ValidationError') {
    return res.status(400).render('error', { 
      message: 'Validation error', 
      error: err.message 
    });
  }
  
  if (err.name === 'MongoError') {
    return res.status(500).render('error', { 
      message: 'Database error', 
      error: 'A database error occurred' 
    });
  }

  // Default error handler
  res.status(err.status || 500).render('error', { 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { 
    error: {}, // Pass an empty error object
    message: 'Page not found' 
  });
});

// SLA breach checker
const checkSLABreaches = async () => {
    try {
        const overdueTickets = await Ticket.find({ status: { $ne: 'closed' }, slaDeadline: { $lt: new Date() } });
        
        for (const ticket of overdueTickets) {
            if (!ticket.assignedTo) continue;
            
            const staff = await User.findById(ticket.assignedTo);
            if (staff && staff.email) {
                await sendEmail(staff.email, emailTemplates.highPriorityTicket(ticket, staff));
                console.log(`SLA breach email sent for ticket #${ticket._id} to ${staff.email}`);
            }
        }
    } catch (error) {
        console.error('Error in SLA breach checker:', error);
    }
};

// Run every hour
setInterval(checkSLABreaches, 60 * 60 * 1000);

const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 60000,
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  },
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
  });
});

// Emit ticket updates
const emitTicketUpdate = (ticketId, update) => {
    io.emit(`ticket-update-${ticketId}`, update);
};

// Add WebSocket server for real-time chat

const chatServer = http.createServer(app);
const chatIo = new Server(chatServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinTicket', (ticketId) => {
        socket.join(`ticket-${ticketId}`);
        console.log(`User joined ticket room: ticket-${ticketId}`);
    });

    socket.on('sendMessage', async ({ ticketId, message, userId, username, role }) => {
        // Broadcast the message to the ticket room
        io.to(`ticket-${ticketId}`).emit('receiveMessage', { username, role, message });

        // Award points to staff members for participation
        if (role === 'Staff' || role === 'Admin') {
            const User = require('./models/User');
            const user = await User.findById(userId);
            if (user) {
                await user.addPoints('chatParticipation');
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
    });
});

module.exports = { emitTicketUpdate };

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});