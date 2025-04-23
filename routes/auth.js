const express = require('express');
const passport = require('passport');
const crypto = require('crypto');
const axios = require('axios'); // Added axios for IP info check
const { sendEmail, emailTemplates } = require('../utils/emailService');
const { isAuthenticated } = require('../middleware/auth'); // Import isAuthenticated middleware
const router = express.Router();
const Server = require('../models/Server');

// Login page
router.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.render('auth/login', {
    title: 'Login',
    error: req.flash('error')
  });
});

// Discord OAuth routes
router.get('/discord', passport.authenticate('discord', {
  scope: ['identify', 'email', 'guilds']
}));

router.get('/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: '/auth/login',
    failureFlash: true
  }),
  async (req, res) => {
    try {
      // Update last login time
      if (req.user) {
        req.user.lastLogin = new Date();
        await req.user.save();

        // Check if user needs to select a server
        if (!req.session.selectedServer) {
          return res.redirect('/auth/select-server');
        }

        // Redirect to the stored returnTo URL or dashboard
        const redirectTo = req.session.returnTo || '/dashboard';
        delete req.session.returnTo;
        return res.redirect(redirectTo);
      }

      // If no user object, redirect to login
      res.redirect('/auth/login');
      
    } catch (err) {
      console.error('Auth callback error:', err);
      res.redirect('/auth/login');
    }
  }
);

// Redirect to server selection if role is User or Staff
router.get('/select-server', isAuthenticated, async (req, res) => {
    try {
        const servers = await Server.find(); // Fetch supported servers
        res.render('auth/select_server', {
            title: 'Select Server',
            servers,
            user: req.user
        });
    } catch (err) {
        console.error('Error fetching servers:', err);
        res.status(500).render('error', { message: 'Failed to load servers.' });
    }
});

// Handle server selection
router.post('/select-server', isAuthenticated, async (req, res) => {
    const { serverId } = req.body;
    if (!serverId) {
        return res.status(400).render('error', { message: 'Please select a server.' });
    }

    req.session.selectedServer = serverId; // Store selected server in session
    res.redirect('/dashboard');
});

// Logout route
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.redirect('/');
    }
    res.redirect('/');
  });
});


module.exports = router;