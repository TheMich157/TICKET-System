const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { Parser } = require('json2csv'); // Import json2csv for CSV export

router.get('/analytics', isAuthenticated, isAdmin, async (req, res, next) => {
    const stats = {
        totalTickets: await Ticket.countDocuments(),
        openTickets: await Ticket.countDocuments({ status: 'open' }),
        closedTickets: await Ticket.countDocuments({ status: 'closed' }),
        highPriorityTickets: await Ticket.countDocuments({ priority: 'high' })
    };

    res.render('reports/analytics', { stats });
});

// Export tickets to CSV
router.get('/export-tickets', isAuthenticated, isAdmin, async (req, res, next) => {
    try {
        const tickets = await Ticket.find({ serverId: req.user.serverId })
            .populate('user', 'username')
            .populate('assignedTo', 'username');

        const fields = ['_id', 'title', 'status', 'priority', 'category', 'user.username', 'assignedTo.username', 'createdAt'];
        const opts = { fields };
        const parser = new Parser(opts);
        const csv = parser.parse(tickets);

        res.header('Content-Type', 'text/csv');
        res.attachment('tickets.csv');
        res.send(csv);
    } catch (err) {
        next(err);
    }
});

module.exports = router;