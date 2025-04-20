const express = require('express');
const router = express.Router();
const { isAuthenticated, restrictByServer } = require('../middleware/auth');
const Ticket = require('../models/Ticket');
const User = require('../models/User'); // Import the User model

// Home page
router.get('/', (req, res) => {
  res.render('index', {
    title: 'Support Ticket System',
    user: req.user
  });
});

// Filter tickets by serverId for the dashboard
router.get('/dashboard', isAuthenticated, restrictByServer, async (req, res, next) => {
    try {
        const query = req.user.roles.includes('Admin') ? {} : { serverId: req.session.selectedServer };

        let tickets;
        if (req.user.roles.includes('Staff') || req.user.roles.includes('Admin')) {
            tickets = await Ticket.find(query)
                .populate('user', 'username')
                .sort('-createdAt');
        } else {
            tickets = await Ticket.find({ ...query, user: req.user._id })
                .sort('-createdAt');
        }

        const stats = {
            total: tickets.length,
            open: tickets.filter(t => t.status === 'open').length,
            inProgress: tickets.filter(t => t.status === 'in-progress').length,
            closed: tickets.filter(t => t.status === 'closed').length
        };

        const leaderboard = await User.find({ roles: 'Staff', serverId: req.session.selectedServer })
            .sort('-points')
            .limit(10)
            .select('username points');

        res.render('dashboard', {
            title: 'Dashboard',
            tickets,
            stats,
            user: req.user,
            leaderboard
        });
    } catch (err) {
        next(err);
    }
});

// Staff dashboard
router.get('/staff', isAuthenticated, async (req, res, next) => {
  if (!req.user.roles.includes('Staff') && !req.user.roles.includes('Admin')) {
    return res.status(403).render('error', {
      message: 'Access denied. Staff privileges required.'
    });
  }

  try {
    const openTickets = await Ticket.find({ status: 'open' })
      .populate('user', 'username')
      .sort('-createdAt');

    const inProgressTickets = await Ticket.find({ status: 'in-progress' })
      .populate('user', 'username')
      .sort('-updatedAt');

    res.render('staff/dashboard', {
      title: 'Staff Dashboard',
      openTickets,
      inProgressTickets
    });
  } catch (err) {
    next(err);
  }
});

// Terms of Service page
router.get('/tos', (req, res) => {
    res.render('tos', {
        title: 'Terms of Service'
    });
});

// Privacy Policy page
router.get('/privacy', (req, res) => {
    res.render('privacy', {
        title: 'Privacy Policy'
    });
});

module.exports = router;