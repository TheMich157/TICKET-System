// filepath: c:\Users\pokem\ticket\ticket-support copy\routes\test.js
const express = require('express');
const router = express.Router();
const { sendEmail, emailTemplates } = require('../utils/emailService');

// Test email route
router.get('/email', async (req, res) => {
    try {
        const testEmail = 'test@example.com';
        await sendEmail(testEmail, emailTemplates.manualEmail(
            'Test Email',
            'This is a test email from the Support Ticket System.'
        ));
        res.send('Test email sent successfully.');
    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).send('Failed to send test email.');
    }
});

module.exports = router;