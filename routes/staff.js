const express = require('express');
const router = express.Router();
const { isAuthenticated, isStaff, canViewStaffDashboard, canManageTickets, isAdmin } = require('../middleware/auth');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { sendEmail, emailTemplates } = require('../utils/emailService');
const ActionLog = require('../models/ActionLog'); // Import ActionLog model

// Filter tickets by serverId for staff
router.get('/dashboard', isAuthenticated, canViewStaffDashboard, async (req, res, next) => {
    try {
        const query = req.user.roles.includes('Admin') ? {} : { serverId: req.user.serverId };

        const openTickets = await Ticket.find({ ...query, status: 'open' })
            .populate('user', 'username email')
            .populate('assignedTo', 'username')
            .sort('-createdAt');

        const inProgressTickets = await Ticket.find({ ...query, status: 'in-progress' })
            .populate('user', 'username email')
            .populate('assignedTo', 'username')
            .sort('-updatedAt');

        // Include Admins in the leaderboard query
        const leaderboard = await User.find({ roles: { $in: ['Staff', 'Admin'] }, serverId: req.user.serverId })
            .sort('-points')
            .limit(10)
            .select('username points roles');

        const stats = {
            open: await Ticket.countDocuments({ ...query, status: 'open' }),
            inProgress: await Ticket.countDocuments({ ...query, status: 'in-progress' }),
            closed: await Ticket.countDocuments({ ...query, status: 'closed' }),
            highPriority: await Ticket.countDocuments({ ...query, priority: 'high', status: { $ne: 'closed' } }),
            unassigned: await Ticket.countDocuments({ ...query, assignedTo: null, status: { $ne: 'closed' } }),
        };

        res.render('staff/dashboard', {
            title: 'Staff Dashboard',
            openTickets,
            inProgressTickets,
            leaderboard,
            stats,
            query: req.query,
            currentUser: req.user
        });
    } catch (err) {
        next(err);
    }
});

// Update ticket details
router.post('/ticket/:id/update', isAuthenticated, canManageTickets, async (req, res, next) => {
    try {
        const { priority, category, assignedTo, status, note } = req.body;
        const ticket = await Ticket.findById(req.params.id).populate('user', 'email username');

        if (!ticket) {
            return res.status(404).render('error', { message: 'Ticket not found' });
        }

        const updates = [];

        if (priority && priority !== ticket.priority) {
            updates.push(`Priority changed from ${ticket.priority} to ${priority}`);
            ticket.priority = priority;
        }

        
        if (category && category !== ticket.category) {
            updates.push(`Category changed from ${ticket.category} to ${category}`);
            ticket.category = category;
        }

        if (status && status !== ticket.status) {
            updates.push(`Status changed from ${ticket.status} to ${status}`);
            ticket.status = status;
        }

        if (assignedTo) {
            const newAssignee = await User.findById(assignedTo);
            if (newAssignee) {
                updates.push(`Ticket assigned to ${newAssignee.username}`);
                ticket.assignedTo = assignedTo;

                // Send email to the assigned staff member
                if (newAssignee.email) {
                    await sendEmail(newAssignee.email, emailTemplates.staffAssigned(ticket, newAssignee));
                } else {
                    console.error(`Error: Assigned staff member ${newAssignee.username} has no email defined.`);
                }

                // Award points to the new assignee
                await newAssignee.addPoints('ticketAssigned', ticket.priority);
            }
        }

        if (note) {
            ticket.staffNotes.push({
                note,
                createdBy: req.user._id
            });
            updates.push('Staff note added');
        }

        if (updates.length > 0) {
            ticket.updates.push({
                message: updates.join(', '),
                updatedBy: req.user._id
            });

            await ticket.save();

            // Notify the ticket owner about the updates
            await sendEmail(ticket.user.email, emailTemplates.ticketUpdated(ticket, req.user, updates.join(', ')));

            // Log the action
            await ActionLog.create({
                action: 'update-ticket',
                performedBy: req.user._id,
                target: ticket._id,
                details: updates.join(', ')
            });
        }

        res.redirect(`/ticket/${ticket._id}`);
    } catch (err) {
        next(err);
    }
});

// Escalate a ticket
router.post('/ticket/:id/escalate', isAuthenticated, isStaff, async (req, res, next) => {
    try {
        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).render('error', { message: 'Ticket not found' });
        }

        ticket.escalated = true;
        ticket.priority = 'high';
        ticket.updates.push({
            message: 'Ticket escalated to high priority',
            updatedBy: req.user._id
        });

        await ticket.save();

        // Log the action
        await ActionLog.create({
            action: 'escalate-ticket',
            performedBy: req.user._id,
            target: ticket._id,
            details: 'Ticket escalated to high priority.'
        });

        // Award points to the staff member who escalated the ticket
        await req.user.addPoints('ticketEscalated', ticket.priority);

        res.redirect(`/ticket/${ticket._id}`);
    } catch (err) {
        next(err);
    }
});

// Get staff statistics
router.get('/stats', isAuthenticated, canViewStaffDashboard, async (req, res, next) => {
    try {
        const stats = {
            totalTickets: await Ticket.countDocuments(),
            openTickets: await Ticket.countDocuments({ status: 'open' }),
            inProgressTickets: await Ticket.countDocuments({ status: 'in-progress' }),
            closedTickets: await Ticket.countDocuments({ status: 'closed' }),
            highPriorityTickets: await Ticket.countDocuments({ priority: 'high' }),
            unassignedTickets: await Ticket.countDocuments({ assignedTo: null }),
            averageResponseTime: '2 hours', // You can implement actual calculation
            resolutionRate: '85%' // You can implement actual calculation
        };

        res.json(stats);
    } catch (err) {
        next(err);
    }
});

// View detailed analytics
router.get('/analytics', isAuthenticated, isAdmin, async (req, res, next) => {
    try {
        const stats = {
            totalTickets: await Ticket.countDocuments(),
            openTickets: await Ticket.countDocuments({ status: 'open' }),
            closedTickets: await Ticket.countDocuments({ status: 'closed' }),
            highPriorityTickets: await Ticket.countDocuments({ priority: 'high' }),
            escalatedTickets: await Ticket.countDocuments({ escalated: true }),
        };

        res.render('staff/analytics', { stats });
    } catch (err) {
        next(err);
    }
});

// Ban a user by Discord ID
router.post('/ban', isAuthenticated, isAdmin, async (req, res, next) => {
    try {
        const { discordId } = req.body;
        const user = await User.findOne({ discordId });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        user.banned = true;
        await user.save();

        // Send ban notification email
        if (user.email) {
            await sendEmail(user.email, emailTemplates.userBanned(user));
        } else {
            console.error(`Error: User ${user.username} has no email defined.`);
        }

        res.json({ message: `User ${user.username} has been banned.` });
    } catch (err) {
        next(err);
    }
});

// Unban a user by Discord ID
router.post('/unban', isAuthenticated, isAdmin, async (req, res, next) => {
    try {
        const { discordId } = req.body;
        const user = await User.findOne({ discordId });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        user.banned = false;
        await user.save();

        // Send unban notification email
        if (user.email) {
            await sendEmail(user.email, emailTemplates.userUnbanned(user));
        } else {
            console.error(`Error: User ${user.username} has no email defined.`);
        }

        res.json({ message: `User ${user.username} has been unbanned.` });
    } catch (err) {
        next(err);
    }
});

router.get('/ban', isAuthenticated, isAdmin, (req, res) => {
    res.render('staff/ban', { title: 'Ban/Unban User' });
});

// Leaderboard
router.get('/leaderboard', isAuthenticated, canViewStaffDashboard, async (req, res, next) => {
    try {
        const leaderboard = await User.find({ roles: { $in: ['Staff', 'Admin'] } })
            .sort('-points')
            .limit(10)
            .select('username points roles');

        res.render('staff/leaderboard', { leaderboard });
    } catch (err) {
        next(err);
    }
});

// Send manual email
router.post('/email/manual', isAuthenticated, isAdmin, async (req, res, next) => {
    try {
        const { to, subject, content } = req.body;
        await sendEmail(to, emailTemplates.manualEmail(subject, content));
        res.json({ message: 'Email sent successfully!' });
    } catch (err) {
        next(err);
    }
});

// Admin Dashboard
router.get('/admin-dashboard', isAuthenticated, isAdmin, async (req, res, next) => {
    try {
        const users = await User.find().select('username roles');
        res.render('staff/admin_dashboard', { title: 'Admin Dashboard', users });
    } catch (err) {
        next(err);
    }
});

// Assign Role
router.post('/assign-role', isAuthenticated, isAdmin, async (req, res, next) => {
    try {
        const { userId, role } = req.body;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).render('error', { message: 'User not found' });
        }

        if (!['User', 'Staff', 'Admin'].includes(role)) {
            return res.status(400).render('error', { message: 'Invalid role' });
        }

        user.roles = [role];
        await user.save();

        req.flash('success', `Role updated successfully for ${user.username}`);
        res.redirect('/staff/admin-dashboard');
    } catch (err) {
        next(err);
    }
});

module.exports = router;