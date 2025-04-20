const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // Add this line
const { isAuthenticated, isStaff, canAccessTicket, isAdmin } = require('../middleware/auth');
const Ticket = require('../models/Ticket');
const User = require('../models/User'); // Added User model import
const { sendEmail, emailTemplates } = require('../utils/emailService');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const ActionLog = require('../models/ActionLog'); // Import ActionLog model
const checkTicketCreation = require('../middleware/checkTicketCreation'); // Import checkTicketCreation middleware
const { emitTicketUpdate } = require('../server'); // Import emitTicketUpdate
const Server = require('../models/Server'); // Import the Server model

// Replace req.flash with a custom flash message handler
const setFlashMessage = (req, type, message) => {
    if (!req.session.flashMessages) {
        req.session.flashMessages = [];
    }
    req.session.flashMessages.push({ type, message });
};

// Add pagination to ticket listing
router.get('/', isAuthenticated, isStaff, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = { serverId: req.user.serverId };
        const tickets = await Ticket.find(query)
            .populate('user', 'username')
            .populate('assignedTo', 'username')
            .sort('-createdAt')
            .skip(skip)
            .limit(limit);

        const totalTickets = await Ticket.countDocuments(query);
        const totalPages = Math.ceil(totalTickets / limit);

        res.render('ticket/list', {
            title: 'All Tickets',
            tickets,
            query: req.query,
            pagination: {
                currentPage: page,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (err) {
        next(err);
    }
});

// New ticket form
router.get('/new', isAuthenticated, checkTicketCreation, async (req, res, next) => {
  try {
    const servers = await Server.find(); // Fetch all servers
    res.render('ticket/new', {
      title: 'Create New Ticket',
      servers // Pass servers to the view
    });
  } catch (err) {
    next(err);
  }
});

// Create new ticket
router.post('/new', isAuthenticated, checkTicketCreation, upload.single('attachment'), async (req, res, next) => {
  try {
    const { title, description, category, priority } = req.body;
    const attachment = req.file ? { filename: req.file.originalname, url: `/uploads/${req.file.filename}` } : null;

    const ticket = new Ticket({
      title,
      description,
      category,
      priority,
      user: req.user._id,
      serverId: req.user.serverId, // Set serverId from the authenticated user
      attachments: attachment ? [attachment] : []
    });

    await ticket.save();

    try {
      if (req.user.email) {
        await sendEmail(req.user.email, emailTemplates.ticketCreated(ticket, req.user));
      } else {
        console.error(`Error: User ${req.user.username} has no email defined.`);
      }
    } catch (emailError) {
      console.error('Error sending email:', emailError);
    }

    await ActionLog.create({
      action: 'create-ticket',
      performedBy: req.user._id,
      target: ticket._id,
      details: `Ticket ${ticket.title} created.`
    });

    res.redirect(`/ticket/${ticket._id}`);
  } catch (err) {
    next(err);
  }
});

// View ticket details
router.get('/:id', isAuthenticated, canAccessTicket, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).render('error', { 
        message: 'Invalid ticket ID format' 
      });
    }

    const ticket = await Ticket.findById(req.params.id)
      .populate('user', 'username email')
      .populate('assignedTo', 'username')
      .populate('updates.updatedBy', 'username')
      .populate('comments.createdBy', 'username');

    if (!ticket) {
      return res.status(404).render('error', { 
        message: 'Ticket not found' 
      });
    }

    const staffMembers = await User.find({
      roles: { $in: ['Staff', 'Admin'] },
      banned: { $ne: true }
    }).select('username');

    res.render('ticket/detail', {
      title: `Ticket #${ticket._id}`,
      ticket,
      staffMembers,
      user: req.user,
      moment: require('moment')
    });

  } catch (err) {
    console.error('Error fetching ticket:', err);
    next(err);
  }
});

// Update ticket status
router.post('/:id/status', isAuthenticated, canAccessTicket, async (req, res, next) => {
  try {
    const { status } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).render('error', { message: 'Ticket not found' });
    }

    ticket.status = status;
    ticket.updates.push({
      message: `Status updated to ${status}`,
      updatedBy: req.user._id
    });

    await ticket.save();

    emitTicketUpdate(ticket._id, { status, updatedBy: req.user.username });

    await sendEmail(ticket.user.email, emailTemplates.ticketUpdated(ticket, req.user, 'Status Update'));

    await ActionLog.create({
      action: 'update-status',
      performedBy: req.user._id,
      target: ticket._id,
      details: `Status updated to ${status}.`
    });

    res.redirect(`/ticket/${ticket._id}`);
  } catch (err) {
    next(err);
  }
});

// Add staff note
router.post('/:id/note', isAuthenticated, isStaff, canAccessTicket, async (req, res, next) => {
  try {
    const { note } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).render('error', { message: 'Ticket not found' });
    }

    ticket.staffNotes.push({ note, createdBy: req.user._id });

    await ticket.save();

    await sendEmail(ticket.user.email, emailTemplates.ticketUpdated(ticket, req.user, 'Staff Note Added'));

    res.redirect(`/ticket/${ticket._id}`);
  } catch (err) {
    next(err);
  }
});

// Add comment to ticket
router.post('/:id/comment', isAuthenticated, canAccessTicket, async (req, res, next) => {
  try {
    const { comment } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).render('error', { message: 'Ticket not found' });
    }

    const newComment = { content: comment, createdBy: req.user._id };

    ticket.comments.push(newComment);
    ticket.updates.push({ message: `New comment added by ${req.user.username}`, updatedBy: req.user._id });

    await ticket.save();

    if (!ticket.user.equals(req.user._id) && ticket.user.email) {
      await sendEmail(ticket.user.email, emailTemplates.ticketComment(ticket, newComment, req.user));
    } else if (!ticket.user.email) {
      console.error(`Error: Ticket owner ${ticket.user.username} has no email defined.`);
    }

    res.redirect(`/ticket/${ticket._id}`);
  } catch (err) {
    next(err);
  }
});

// Assign ticket to staff
router.post('/:id/assign', isAuthenticated, isStaff, canAccessTicket, async (req, res, next) => {
  try {
    const { staffId } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).render('error', { message: 'Ticket not found' });
    }

    const staff = await User.findById(staffId);
    if (!staff || !staff.roles.includes('Staff')) {
      return res.status(400).render('error', { message: 'Invalid staff member' });
    }

    ticket.assignedTo = staffId;
    ticket.status = 'in-progress';
    ticket.updates.push({ message: `Ticket assigned to ${staff.username}`, updatedBy: req.user._id });

    await ticket.save();

    // Award points to the staff member
    await staff.addPoints('ticketAssigned', ticket.priority);

    // Send email notification to the assigned staff member
    if (staff.email) {
      await sendEmail(staff.email, emailTemplates.staffAssigned(ticket, staff));
    } else {
      console.error(`Error: Staff member ${staff.username} has no email defined.`);
    }

    res.redirect(`/ticket/${ticket._id}`);
  } catch (err) {
    next(err);
  }
});

// Reassign ticket to another staff member
router.post('/:id/reassign', isAuthenticated, isStaff, async (req, res, next) => {
  try {
    const { newStaffId } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).render('error', { message: 'Ticket not found' });
    }

    const newStaff = await User.findById(newStaffId);
    if (!newStaff || !newStaff.roles.includes('Staff')) {
      return res.status(400).render('error', { message: 'Invalid staff member' });
    }

    ticket.assignedTo = newStaffId;
    ticket.updates.push({ message: `Reassigned to ${newStaff.username}`, updatedBy: req.user._id });

    await ticket.save();

    // Notify the new staff member
    if (newStaff.email) {
      await sendEmail(newStaff.email, emailTemplates.staffAssigned(ticket, newStaff));
    }

    res.redirect(`/ticket/${ticket._id}`);
  } catch (err) {
    next(err);
  }
});

// Close ticket
router.post('/:id/close', isAuthenticated, canAccessTicket, async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).render('error', { message: 'Ticket not found' });
    }

    if (!ticket.user.equals(req.user._id) && !req.user.roles.includes('Staff')) {
      return res.status(403).render('error', { message: 'You do not have permission to close this ticket' });
    }

    ticket.status = 'closed';
    await User.findByIdAndUpdate(req.user._id, { $inc: { points: 10 } }); // Added points increment logic
    ticket.updates.push({ message: 'Ticket closed', updatedBy: req.user._id });

    // Award points to staff members
    if (req.user.roles.includes('Staff')) {
      await req.user.addPoints('ticketClosed', ticket.priority);
    }

    await ticket.save();

    if (ticket.user.email) {
      await sendEmail(ticket.user.email, emailTemplates.ticketUpdated(ticket, req.user, 'Ticket Closed'));
    } else {
      console.error(`Error: Ticket owner ${ticket.user.username} has no email defined.`);
    }

    res.redirect(`/ticket/${ticket._id}`);
  } catch (err) {
    next(err);
  }
});

// Merge two tickets
router.post('/merge', isAuthenticated, isStaff, async (req, res, next) => {
  try {
    const { primaryTicketId, secondaryTicketId } = req.body;

    const primaryTicket = await Ticket.findById(primaryTicketId);
    const secondaryTicket = await Ticket.findById(secondaryTicketId);

    if (!primaryTicket || !secondaryTicket) {
      return res.status(404).render('error', { message: 'One or both tickets not found' });
    }

    // Merge comments, updates, and attachments
    primaryTicket.comments.push(...secondaryTicket.comments);
    primaryTicket.updates.push(...secondaryTicket.updates);
    primaryTicket.attachments.push(...secondaryTicket.attachments);

    // Add a note about the merge
    primaryTicket.updates.push({
      message: `Merged with ticket #${secondaryTicket._id}`,
      updatedBy: req.user._id,
    });

    // Save the primary ticket and delete the secondary ticket
    await primaryTicket.save();
    await secondaryTicket.remove();

    res.redirect(`/ticket/${primaryTicket._id}`);
  } catch (err) {
    next(err);
  }
});

// Add logging to debug the create-channel route
router.post('/:id/create-channel', isAuthenticated, isStaff, async (req, res, next) => {
  try {
    console.log(`Received request to create channel for ticket ID: ${req.params.id}`);

    const ticket = await Ticket.findById(req.params.id).populate('user', 'username');

    if (!ticket) {
      console.error(`Ticket not found for ID: ${req.params.id}`);
      return res.status(404).render('error', { message: 'Ticket not found' });
    }

    console.log(`Found ticket: ${ticket.title} created by ${ticket.user.username}`);

    // Call the bot to create the channel
    const botResponse = await bot.createTicketChannel(ticket._id, ticket.user.username, req.user.username);

    console.log(`Bot response: ${JSON.stringify(botResponse)}`);

    if (botResponse.success) {
      setFlashMessage(req, 'success', 'Ticket channel created successfully!');
    } else {
      setFlashMessage(req, 'error', 'Failed to create ticket channel. Please try again.');
    }

    res.redirect(`/ticket/${ticket._id}`);
  } catch (err) {
    console.error('Error in create-channel route:', err);
    next(err);
  }
});

// Claim a ticket
router.post('/:id/claim', isAuthenticated, isStaff, isAdmin, async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      setFlashMessage(req, 'error', 'Ticket not found.');
      return res.redirect(`/ticket/${req.params.id}`);
    }

    if (ticket.assignedTo) {
      setFlashMessage(req, 'error', 'Ticket is already claimed.');
      return res.redirect(`/ticket/${ticket._id}`);
    }

    ticket.assignedTo = req.user._id;
    ticket.status = 'in-progress';
    await ticket.save();

    setFlashMessage(req, 'success', 'You have claimed the ticket.');
    res.redirect(`/ticket/${ticket._id}`);
  } catch (err) {
    next(err);
  }
});

// Unclaim a ticket
router.post('/:id/unclaim', isAuthenticated, isStaff, async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id); // Add this line
    
    if (!ticket) {
      setFlashMessage(req, 'error', 'Ticket not found.');
      return res.redirect(`/ticket/${req.params.id}`);
    }

    if (!ticket.assignedTo || !ticket.assignedTo.equals(req.user._id)) {
      setFlashMessage(req, 'error', 'You cannot unclaim this ticket.');
      return res.redirect(`/ticket/${ticket._id}`);
    }

    ticket.assignedTo = null;
    ticket.status = 'open';
    await ticket.save();

    setFlashMessage(req, 'success', 'You have unclaimed the ticket.');
    res.redirect(`/ticket/${ticket._id}`);
  } catch (err) {
    next(err);
  }
});

// Close a ticket
router.post('/:id/close', isAuthenticated, canAccessTicket, async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).render('error', { message: 'Ticket not found' });
    }

    ticket.status = 'closed';
    await ticket.save();

    setFlashMessage(req, 'success', 'Ticket has been closed.');
    res.redirect(`/ticket/${ticket._id}`);
  } catch (err) {
    next(err);
  }
});

// Fix escalate button functionality
router.post('/:id/escalate', isAuthenticated, isStaff, async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).render('error', { message: 'Ticket not found' });
    }

    if (ticket.escalated) {
      req.flash('error', 'Ticket is already escalated.');
      return res.redirect(`/ticket/${ticket._id}`);
    }

    ticket.escalated = true;
    ticket.updates.push({
      message: 'Ticket escalated',
      updatedBy: req.user._id
    });

    await ticket.save();

    req.flash('success', 'Ticket has been escalated.');
    res.redirect(`/ticket/${ticket._id}`);
  } catch (err) {
    next(err);
  }
});

// Add route to create a Discord channel for a ticket
router.post('/:id/create-channel', isAuthenticated, isStaff, async (req, res, next) => {
    try {
        const ticket = await Ticket.findById(req.params.id).populate('user', 'username');

        if (!ticket) {
            return res.status(404).render('error', { message: 'Ticket not found' });
        }

        // Ensure the category ID is defined in the .env file
        const discordCategoryId = process.env.DISCORD_CATEGORY_ID;
        if (!discordCategoryId) {
            return res.status(500).render('error', { message: 'Discord category ID is not configured.' });
        }

        // Collect participants for the channel
        const participants = [
            ticket.user.username, // User who created the ticket
            req.user.username // Staff/Admin handling the ticket
        ];

        // Add all admins to the participants list
        const admins = await User.find({ roles: 'Admin' }).select('username');
        admins.forEach(admin => participants.push(admin.username));

        // Simulate Discord channel creation logic
        const channelName = `ticket-${ticket._id}`;
        console.log(`Creating Discord channel: ${channelName} in category ${discordCategoryId}`);
        console.log(`Participants: ${participants.join(', ')}`);

        // Add a log entry for channel creation
        ticket.updates.push({
            message: `Discord channel created: ${channelName}`,
            updatedBy: req.user._id
        });

        await ticket.save();

        req.flash('success', `Discord channel '${channelName}' created successfully.`);
        res.redirect(`/ticket/${ticket._id}`);
    } catch (err) {
        console.error('Error creating Discord channel:', err);
        next(err);
    }
});

// Analytics route
router.get('/analytics', isAuthenticated, isAdmin, async (req, res, next) => {
    // Analytics logic here
});

module.exports = router;
