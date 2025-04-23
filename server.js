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

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    handler: (req, res) => {
        res.status(429).render('error', {
            message: 'Too many requests, please try again later.',
            error: { status: 429 }
        });
    }
});

app.use(limiter);

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
    console.log(`${req.method} ${req.url}`); // Simpler format without brackets
    next();
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected! Attempting to reconnect...');
    setTimeout(connectDB, 5000);
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60,
    autoRemove: 'native',
    touchAfter: 24 * 3600
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  },
  name: 'sessionId',
  rolling: true
}));

app.use(passport.initialize());
app.use(passport.session());

const logIp = require('./middleware/logIp');
app.use(logIp);

const authMiddleware = require('./middleware/auth');
app.use(authMiddleware.router);

app.use(expressLayouts);
app.set('layout', 'layout');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.engine('ejs', require('ejs').__express);

app.locals.async = true;
app.locals.rmWhitespace = true;

app.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.isAuthenticated = req.isAuthenticated();
  res.locals.isStaff = req.user && (req.user.roles.includes('Staff') || req.user.roles.includes('Admin'));
  res.locals.isAdmin = req.user && req.user.roles.includes('Admin');
  next();
});

const isStaff = (req, res, next) => {
    if (req.isAuthenticated() && (req.user.roles.includes('Staff') || req.user.roles.includes('Admin'))) {
        return next();
    }
    res.status(403).render('error', {
        message: 'Access denied. Staff privileges required.'
    });
};

require('./config/passport');

app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/ticket', require('./routes/ticket'));
app.use('/staff', require('./routes/staff'));

app.use('/admin', require('./routes/admin'));

app.use(require('./middleware/errorHandler'));

const wrapAsync = fn => {
  return function(req, res, next) {
    fn(req, res, next).catch(next);
  };
};

app.use('/ticket', wrapAsync(require('./routes/ticket')));

app.use((err, req, res, next) => {
  console.error(err.stack);
  
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

  res.status(err.status || 500).render('error', { 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

app.use((req, res) => {
  res.status(404).render('error', { 
    error: {},
    message: 'Page not found' 
  });
});

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

const emitTicketUpdate = (ticketId, update) => {
    io.emit(`ticket-update-${ticketId}`, update);
};

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
        try {
            // Validate input
            if (!ticketId || !message || !userId || !username || !role) {
                throw new Error('Missing required fields');
            }

            // Emit message to room
            io.to(`ticket-${ticketId}`).emit('receiveMessage', {
                username,
                role,
                message,
                timestamp: new Date()
            });

            // Award points for staff participation
            if (role === 'Staff' || role === 'Admin') {
                const user = await User.findById(userId);
                if (user) {
                    await user.addPoints(5); // Add specific point value
                    console.log(`Awarded points to ${username} for chat participation`);
                }
            }

            // Log message to database
            await Ticket.findByIdAndUpdate(ticketId, {
                $push: {
                    messages: {
                        sender: userId,
                        content: message,
                        role: role,
                        createdAt: new Date()
                    }
                }
            });

        } catch (error) {
            console.error('Error in sendMessage:', error);
            socket.emit('messageError', { error: 'Failed to send message' });
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