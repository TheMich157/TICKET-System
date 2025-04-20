const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const Settings = require('../models/Settings');
const Server = require('../models/Server'); // Import the Server model
const ActionLog = require('../models/ActionLog'); // Import ActionLog model

// Ensure JSON response even in case of errors
router.post('/toggle-ticket-creation', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const setting = await Settings.findOneAndUpdate(
      { key: 'allowTicketCreation' },
      { $set: { value: req.body.allowTicketCreation === 'true' } },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Ticket creation setting updated successfully', value: setting.value });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update ticket creation setting', error: err.message });
  }
});

// Add a new server
router.post('/add-server', isAuthenticated, isAdmin, async (req, res, next) => {
  try {
    const { serverId, name, ownerId, staffRoles } = req.body;

    const existingServer = await Server.findOne({ serverId });
    if (existingServer) {
      return res.status(400).json({ message: 'Server already exists.' });
    }

    const server = new Server({
      serverId,
      name,
      ownerId,
      staffRoles
    });

    await server.save();
    res.json({ message: 'Server added successfully.' });
  } catch (err) {
    next(err);
  }
});

// View audit logs
router.get('/audit-logs', isAuthenticated, isAdmin, async (req, res, next) => {
  try {
    const logs = await ActionLog.find().sort('-timestamp').limit(100);
    res.render('staff/audit_logs', {
      title: 'Audit Logs',
      logs
    });
  } catch (err) {
    next(err);
  }
});

// Route to render export CSV page
router.get('/export-csv', isAuthenticated, isAdmin, (req, res) => {
    res.render('staff/export_csv', {
        title: 'Export Tickets to CSV'
    });
});

// Route to render assign roles page
router.get('/assign-roles', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const users = await User.find();
        res.render('staff/assign_roles', {
            title: 'Assign Roles',
            users
        });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).render('error', { message: 'Failed to load users.' });
    }
});

// Route to render manage servers page
router.get('/manage-servers', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const servers = await Server.find();
        res.render('staff/manage_servers', {
            title: 'Manage Servers',
            servers
        });
    } catch (err) {
        console.error('Error fetching servers:', err);
        res.status(500).render('error', { message: 'Failed to load servers.' });
    }
});

module.exports = router;