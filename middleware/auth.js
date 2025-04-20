// Authentication and Authorization Middleware
const Ticket = require('../models/Ticket');
const express = require('express');
const passport = require('passport');
const logIp = require('../middleware/logIp');

const router = express.Router();

// Initialize Passport middleware
router.use(passport.initialize());
router.use(passport.session());

// Apply logIp middleware after Passport
router.use(logIp);

// Filter tickets and users by serverId
const filterByServer = (req, res, next) => {
    if (!req.user) {
        // If user is not authenticated, skip filtering
        return next();
    }

    if (!req.user.roles.includes('Admin')) {
        req.query.serverId = req.user.serverId;
    }
    next();
};

router.use(filterByServer);

// Make user data available to all views
router.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.isAuthenticated = req.isAuthenticated();
  res.locals.isStaff = req.user && (req.user.roles.includes('Staff') || req.user.roles.includes('Admin'));
  res.locals.isAdmin = req.user && req.user.roles.includes('Admin');
  next();
});

// Check if user is authenticated
const isAuthenticated = (req, res, next) => {
  console.log(`Request Path: ${req.path}, User Authenticated: ${req.isAuthenticated()}, Banned: ${req.user?.banned}`);

  if (req.isAuthenticated()) {
    if (req.user.banned) {
      console.log('User is banned. Redirecting to error page.');
      return res.status(403).render('error', { message: 'You are banned from using the ticket system.' });
    }

    // Remove email verification check
    return next();
  }

  console.log('User not authenticated. Redirecting to /auth/discord.');
  req.session.returnTo = req.originalUrl;
  res.redirect('/auth/discord');
};

// Update isStaff middleware to include Admins
const isStaff = (req, res, next) => {
    if (req.isAuthenticated() && (req.user.roles.includes('Staff') || req.user.roles.includes('Admin'))) {
        return next();
    }
    res.status(403).render('error', {
        message: 'Access denied. Staff privileges required.'
    });
};

// Check if user has Admin role
const isAdmin = (req, res, next) => {
    if (req.isAuthenticated() && req.user.roles.includes('Admin')) {
        return next();
    }
    res.status(403).render('error', { message: 'Access denied. Admin privileges required.' });
};

// Check if user can access ticket
const canAccessTicket = async (req, res, next) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        
        if (!ticket) {
            return res.status(404).render('error', {
                message: 'Ticket not found'
            });
        }

        // Allow access if user is ticket owner, staff, or admin
        if (ticket.user.equals(req.user._id) || 
            req.user.roles.includes('Staff') || 
            req.user.roles.includes('Admin')) {
            req.ticket = ticket;
            return next();
        }

        res.status(403).render('error', {
            message: 'You do not have permission to access this ticket'
        });
    } catch (err) {
        next(err);
    }
};

// Check if user can manage roles (Admin only)
const canManageRoles = (req, res, next) => {
    if (req.isAuthenticated() && req.user.roles.includes('Admin')) {
        return next();
    }
    res.status(403).render('error', {
        message: 'Access denied. Admin privileges required to manage roles.'
    });
};

// Check if user can manage staff (Admin only)
const canManageStaff = (req, res, next) => {
    if (req.isAuthenticated() && req.user.roles.includes('Admin')) {
        return next();
    }
    res.status(403).render('error', {
        message: 'Access denied. Admin privileges required to manage staff.'
    });
};

// Check if user can view staff dashboard
const canViewStaffDashboard = (req, res, next) => {
    if (req.isAuthenticated() && (req.user.roles.includes('Staff') || req.user.roles.includes('Admin'))) {
        return next();
    }
    res.status(403).render('error', {
        message: 'Access denied. Staff privileges required to view dashboard.'
    });
};

// Update canManageTickets middleware to include Admins
const canManageTickets = (req, res, next) => {
    if (req.isAuthenticated() && (req.user.roles.includes('Staff') || req.user.roles.includes('Admin'))) {
        return next();
    }
    res.status(403).render('error', {
        message: 'Access denied. Staff privileges required to manage tickets.'
    });
};

// Restrict functionalities based on selected server
const restrictByServer = (req, res, next) => {
    if (req.user.roles.includes('Admin')) {
        // Admins have access to all servers
        return next();
    }

    const selectedServer = req.session.selectedServer;
    if (!selectedServer) {
        return res.redirect('/auth/select-server');
    }

    if (!req.user.staffServers.includes(selectedServer)) {
        return res.status(403).render('error', {
            message: 'You do not have access to this server.'
        });
    }

    next();
};

router.get('/verify', isAuthenticated, (req, res) => {
  if (req.user.emailVerified) {
    console.log('User already verified. Redirecting to dashboard.');
    return res.redirect('/dashboard');
  }

  res.render('auth/verify', { title: 'Verify Email' });
});

module.exports = {
    isAuthenticated,
    isStaff,
    isAdmin,
    canAccessTicket,
    canManageRoles,
    canManageStaff,
    canViewStaffDashboard,
    canManageTickets,
    restrictByServer,
    router
};
