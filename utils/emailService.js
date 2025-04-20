const nodemailer = require('nodemailer');

// Create reusable transporter with error handling
const createTransporter = () => {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error('Email service not configured. Missing SMTP_USER or SMTP_PASS.');
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === 'true', // Use TLS if true
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        tls: {
            rejectUnauthorized: process.env.SMTP_IGNORE_TLS !== 'true' // Allow self-signed certificates if set to true
        }
    });
};

const emailTemplates = {
    // Ticket creation notification
    ticketCreated: (ticket, user) => ({
        subject: `Ticket #${ticket._id} Created`,
        html: `
            <h2>New Ticket Created</h2>
            <p>Your ticket has been created successfully.</p>
            <h3>Ticket Details:</h3>
            <ul>
                <li><strong>Title:</strong> ${ticket.title}</li>
                <li><strong>Status:</strong> ${ticket.status}</li>
                <li><strong>Priority:</strong> ${ticket.priority}</li>
                <li><strong>Category:</strong> ${ticket.category}</li>
            </ul>
            <p>We'll notify you when there are updates to your ticket.</p>
        `
    }),

    // Staff assignment notification
    staffAssigned: (ticket, staff) => ({
        subject: `New Ticket Assignment - #${ticket._id}`,
        html: `
            <h2>New Ticket Assigned</h2>
            <p>A new ticket has been assigned to you.</p>
            <h3>Ticket Details:</h3>
            <ul>
                <li><strong>Title:</strong> ${ticket.title}</li>
                <li><strong>Priority:</strong> ${ticket.priority}</li>
                <li><strong>Category:</strong> ${ticket.category}</li>
                <li><strong>Created By:</strong> ${ticket.user.username}</li>
            </ul>
            <p>Please review and handle this ticket at your earliest convenience.</p>
        `
    }),

    // Status update notification
    ticketUpdated: (ticket, updatedBy, updateType) => ({
        subject: `Ticket #${ticket._id} Updated`,
        html: `
            <h2>Ticket Updated</h2>
            <p>Your ticket has been updated by ${updatedBy.username}.</p>
            <h3>Update Details:</h3>
            <ul>
                <li><strong>Update Type:</strong> ${updateType}</li>
                <li><strong>New Status:</strong> ${ticket.status}</li>
                <li><strong>Assigned To:</strong> ${ticket.assignedTo ? ticket.assignedTo.username : 'Unassigned'}</li>
            </ul>
            <p>View your ticket for more details.</p>
        `
    }),

    // New comment notification
    ticketComment: (ticket, comment, author) => ({
        subject: `New Comment on Ticket #${ticket._id}`,
        html: `
            <h2>New Comment Added</h2>
            <p>A new comment has been added to your ticket.</p>
            <h3>Comment Details:</h3>
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 10px 0;">
                <p>${comment.content}</p>
                <p style="color: #6b7280; font-size: 0.875rem;">
                    By ${author.username} ${author.roles.includes('Staff') ? '(Staff)' : ''}
                    at ${new Date(comment.createdAt).toLocaleString()}
                </p>
            </div>
            <p>View your ticket for more details.</p>
        `
    }),

    // Role change notification
    roleChanged: (user, newRoles, changedBy) => ({
        subject: 'Your Account Roles Have Been Updated',
        html: `
            <h2>Account Role Update</h2>
            <p>Your account roles have been updated by ${changedBy.username}.</p>
            <h3>New Roles:</h3>
            <ul>
                ${newRoles.map(role => `<li>${role}</li>`).join('')}
            </ul>
            <p>If you believe this change was made in error, please contact an administrator.</p>
        `
    }),

    // High priority ticket notification
    highPriorityTicket: (ticket, staff) => ({
        subject: `High Priority Ticket #${ticket._id} Requires Attention`,
        html: `
            <h2>High Priority Ticket Alert</h2>
            <p>A high priority ticket requires immediate attention.</p>
            <h3>Ticket Details:</h3>
            <ul>
                <li><strong>Title:</strong> ${ticket.title}</li>
                <li><strong>Category:</strong> ${ticket.category}</li>
                <li><strong>Created By:</strong> ${ticket.user.username}</li>
                <li><strong>Created At:</strong> ${new Date(ticket.createdAt).toLocaleString()}</li>
            </ul>
            <p>Please review this ticket as soon as possible.</p>
        `
    }),

    // Manual email template
    manualEmail: (subject, content) => ({
        subject,
        html: `
            <h2>${subject}</h2>
            <p>${content}</p>
        `
    }),

    // User banned notification
    userBanned: (user) => ({
        subject: 'Account Banned',
        html: `
            <h2>Account Banned</h2>
            <p>Dear ${user.username},</p>
            <p>Your account has been banned from using the Support Ticket System due to a violation of our terms of service.</p>
            <p>If you believe this was a mistake, please contact support.</p>
        `
    }),

    // User unbanned notification
    userUnbanned: (user) => ({
        subject: 'Account Unbanned',
        html: `
            <h2>Account Unbanned</h2>
            <p>Dear ${user.username},</p>
            <p>Your account has been unbanned and you can now access the Support Ticket System again.</p>
            <p>If you have any questions, please contact support.</p>
        `
    })
};

const sendEmail = async (to, template) => {
    try {
        // Validate recipient email
        if (!to || typeof to !== 'string' || !to.trim()) {
            console.error('Error sending email: No recipients defined');
            return;
        }

        const transporter = createTransporter();

        // If email service is not configured, log and return
        if (!transporter) {
            console.error('Email transporter is not configured.');
            return;
        }

        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Ticket Support" <support@example.com>',
            to,
            subject: template.subject,
            html: template.html
        });

        console.log(`Email sent successfully to ${to}`);
    } catch (error) {
        console.error('Error sending email:', error.message);
        console.error('Stack Trace:', error.stack);
    }
};

// Notify all staff members about a high priority ticket
const notifyStaffOfHighPriority = async (ticket, staffList) => {
    for (const staff of staffList) {
        if (staff.email) {
            await sendEmail(
                staff.email,
                emailTemplates.highPriorityTicket(ticket, staff)
            );
        } else {
            console.error(`Error: Staff member ${staff.username} has no email defined.`);
        }
    }
};

module.exports = {
    sendEmail,
    emailTemplates,
    notifyStaffOfHighPriority
};
