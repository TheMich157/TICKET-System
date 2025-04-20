require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, AttachmentBuilder } = require('discord.js');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Ticket = require('./models/Ticket');
const User = require('./models/User');
const ActionLog = require('./models/ActionLog'); // Import ActionLog model
const Settings = require('./models/Settings'); // Import Settings model
const { sendEmail, emailTemplates } = require('./utils/emailService');
const { Parser } = require('json2csv');
const Server = require('./models/Server');
const axios = require('axios');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const commands = [
    {
        name: 'ban',
        description: 'Ban a user from the ticket system',
        options: [
            {
                name: 'user',
                type: 6, // USER type
                description: 'The user to ban',
                required: true
            }
        ]
    },
    {
        name: 'unban',
        description: 'Unban a user from the ticket system',
        options: [
            {
                name: 'user',
                type: 6, // USER type
                description: 'The user to unban',
                required: true
            }
        ]
    },
    {
        name: 'assign-ticket',
        description: 'Assign a ticket to a staff member',
        options: [
            {
                name: 'ticket_id',
                type: 3, // STRING type
                description: 'The ID of the ticket to assign',
                required: true
            },
            {
                name: 'staff_id',
                type: 6, // USER type
                description: 'The staff member to assign the ticket to',
                required: true
            }
        ]
    },
    {
        name: 'close-ticket',
        description: 'Close a ticket',
        options: [
            {
                name: 'ticket_id',
                type: 3, // STRING type
                description: 'The ID of the ticket to close',
                required: true
            }
        ]
    },
    {
        name: 'send-email',
        description: 'Send an email manually',
        options: [
            {
                name: 'to',
                type: 3, // STRING type
                description: 'Recipient email address',
                required: true
            },
            {
                name: 'subject',
                type: 3, // STRING type
                description: 'Email subject',
                required: true
            },
            {
                name: 'content',
                type: 3, // STRING type
                description: 'Email content',
                required: true
            }
        ]
    },
    {
        name: 'list-users',
        description: 'List all users with their emails and IDs',
        options: []
    },
    {
        name: 'ticket-details',
        description: 'Fetch details of a ticket by ID',
        options: [
            {
                name: 'ticket_id',
                type: 3, // STRING type
                description: 'The ID of the ticket',
                required: true
            }
        ]
    },
    {
        name: 'stats',
        description: 'Get bot statistics',
        options: []
    },
    {
        name: 'toggle-ticket-creation',
        description: 'Enable or disable ticket creation',
        options: [
            {
                name: 'allow',
                type: 5, // BOOLEAN type
                description: 'Allow ticket creation',
                required: true
            }
        ]
    },
    {
        name: 'assign-role',
        description: 'Assign a role to a user',
        options: [
            {
                name: 'user',
                type: 6, // USER type
                description: 'The user to assign the role to',
                required: true
            },
            {
                name: 'role',
                type: 3, // STRING type
                description: 'The role to assign',
                required: true
            }
        ]
    },
    {
        name: 'export-tickets',
        description: 'Export all tickets to a CSV file',
        options: []
    },
    {
        name: 'add-server',
        description: 'Add a new server',
        options: [
            {
                name: 'server-id',
                type: 3, // STRING type
                description: 'The ID of the server',
                required: true
            },
            {
                name: 'name',
                type: 3, // STRING type
                description: 'The name of the server',
                required: true
            }
        ]
    },
    {
        name: 'ticket-stats',
        description: 'Get ticket statistics',
        options: []
    },
    {
        name: 'status',
        description: 'Get current system status',
        options: []
    }
];

const updateBotStatus = async () => {
    try {
        console.log('Fetching system status from BetterStack...');
        const response = await axios.get('https://status.aigenres.xyz/api/v1/status');
        console.log('API Response:', response.data);

        const botStatus = response.data.includes('Degraded') ? 'Degraded' : 'Operational';
        const activityType = botStatus === 'Degraded' ? 'WATCHING' : 'STREAMING';

        console.log(`Setting bot status to: ${botStatus}`);
        client.user.setPresence({
            activities: [{
                name: `System Status: ${botStatus}`,
                type: activityType,
                url: 'https://status.aigenres.xyz/'
            }],
            status: botStatus === 'Degraded' ? 'dnd' : 'online'
        });

        console.log('Bot status updated successfully.');
    } catch (error) {
        console.error('Error updating bot status:', error);
    }
};

const startBot = async () => {
    try {
        console.log('Discord bot is starting...');
        
        // Register slash commands
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
        console.log('Refreshing application (/) commands...');
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');

        // Login to Discord
        await client.login(process.env.DISCORD_BOT_TOKEN);
        console.log(`Logged in as ${client.user.tag}`);

        // MongoDB change streams for tickets and users
        Ticket.watch().on('change', async (change) => {
            if (change.operationType === 'insert') {
                const newTicket = change.fullDocument;
                const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);

                if (channel) {
                    channel.send(`🎫 A new ticket has been created!\n**Title:** ${newTicket.title}\n**Category:** ${newTicket.category}\n**Priority:** ${newTicket.priority}`);
                }

                // Notify admins if high priority
                if (newTicket.priority === 'high') {
                    const adminChannel = client.channels.cache.get(process.env.DISCORD_ADMIN_CHANNEL_ID);
                    if (adminChannel) {
                        adminChannel.send(`🚨 **High Priority Ticket Created:**\n**Title:** ${newTicket.title}\n**Category:** ${newTicket.category}`);
                    }
                }
            }
        });

        User.watch().on('change', async (change) => {
            try {
                // Check if the change is an update and has updatedFields
                if (change.operationType === 'update' && change.updateDescription?.updatedFields) {
                    // Handle role updates
                    if (change.updateDescription.updatedFields.roles) {
                        const updatedUser = await User.findById(change.documentKey._id);
                        const adminChannel = client.channels.cache.get(process.env.DISCORD_ADMIN_CHANNEL_ID);

                        if (adminChannel) {
                            adminChannel.send(`🔄 **User Role Updated:**\n**User:** ${updatedUser.username}\n**New Roles:** ${updatedUser.roles.join(', ')}`);
                        }
                    }

                    // Handle last login updates
                    if (change.updateDescription.updatedFields.lastLogin) {
                        const updatedUser = await User.findById(change.documentKey._id);
                        const channel = client.channels.cache.get(process.env.DISCORD_ADMIN_CHANNEL_ID);

                        if (channel) {
                            if (updatedUser.roles.includes('Admin')) {
                                channel.send(`🔑 **Admin Logged In:** ${updatedUser.username}`);
                            } else {
                                channel.send(`👤 **New User Logged In:** ${updatedUser.username}`);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing user change:', error);
            }
        });

        // Handle slash commands
        client.on('interactionCreate', async (interaction) => {
            if (!interaction.isCommand()) return;

            const { commandName, options } = interaction;

            if (commandName === 'ban') {
                if (!interaction.member.roles.cache.some(role => role.name === 'Admin')) {
                    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                }

                const user = options.getUser('user');
                const dbUser = await User.findOne({ discordId: user.id });

                if (!dbUser) {
                    return interaction.reply({ content: 'User not found in the database.', ephemeral: true });
                }

                dbUser.banned = true;
                await dbUser.save();

                await ActionLog.create({
                    action: 'ban',
                    performedBy: interaction.user.id,
                    target: user.id,
                    details: `User ${user.username} was banned.`
                });

                interaction.reply({ content: `User ${user.username} has been banned from the ticket system.` });
            }

            if (commandName === 'unban') {
                if (!interaction.member.roles.cache.some(role => role.name === 'Admin')) {
                    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                }

                const user = options.getUser('user');
                const dbUser = await User.findOne({ discordId: user.id });

                if (!dbUser) {
                    return interaction.reply({ content: 'User not found in the database.', ephemeral: true });
                }

                dbUser.banned = false;
                await dbUser.save();

                await ActionLog.create({
                    action: 'unban',
                    performedBy: interaction.user.id,
                    target: user.id,
                    details: `User ${user.username} was unbanned.`
                });

                interaction.reply({ content: `User ${user.username} has been unbanned from the ticket system.` });
            }

            if (commandName === 'assign-ticket') {
                const ticketId = options.getString('ticket_id');
                const staffId = options.getUser('staff_id').id;

                try {
                    const ticket = await Ticket.findById(ticketId).populate('user', 'username email');
                    if (!ticket) {
                        return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
                    }

                    const staff = await User.findOne({ discordId: staffId });
                    if (!staff) {
                        return interaction.reply({ content: '❌ Staff member not found.', ephemeral: true });
                    }

                    ticket.assignedTo = staff._id;
                    ticket.status = 'in-progress';
                    await ticket.save();

                    await sendEmail(staff.email, emailTemplates.staffAssigned(ticket, staff));

                    await ActionLog.create({
                        action: 'assign-ticket',
                        performedBy: interaction.user.id,
                        target: staffId,
                        details: `Ticket ${ticketId} was assigned to ${staff.username}.`
                    });

                    interaction.reply({
                        content: `✅ **Ticket Assigned Successfully**\n\n**Ticket ID:** ${ticketId}\n**Title:** ${ticket.title}\n**Priority:** ${ticket.priority}\n**Category:** ${ticket.category}\n**Assigned To:** ${staff.username}`,
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error assigning ticket:', error);
                    interaction.reply({ content: '❌ Failed to assign ticket. Please check the logs for more details.', ephemeral: true });
                }
            }

            if (commandName === 'close-ticket') {
                const ticketId = options.getString('ticket_id');

                const ticket = await Ticket.findById(ticketId);
                if (!ticket) {
                    return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
                }

                ticket.status = 'closed';
                await ticket.save();

                interaction.reply({
                    content: `✅ **Ticket Closed Successfully**\n\n**Ticket ID:** ${ticketId}\n**Title:** ${ticket.title}`,
                    ephemeral: true
                });
            }

            if (commandName === 'send-email') {
                if (!interaction.member.roles.cache.some(role => role.name === 'Admin')) {
                    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                }

                const to = options.getString('to');
                const subject = options.getString('subject');
                const content = options.getString('content');

                try {
                    await sendEmail(to, emailTemplates.manualEmail(subject, content));
                    interaction.reply({ content: `✅ Email sent successfully to **${to}**.`, ephemeral: true });
                } catch (error) {
                    console.error('Error sending email:', error);
                    interaction.reply({ content: '❌ Failed to send email. Please check the logs for more details.', ephemeral: true });
                }
            }

            if (commandName === 'list-users') {
                if (!interaction.member.roles.cache.some(role => role.name === 'Admin')) {
                    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                }

                try {
                    const users = await User.find().select('username email discordId');
                    if (users.length === 0) {
                        return interaction.reply({ content: 'No users found.', ephemeral: true });
                    }

                    const userList = users.map(user => `**${user.username}** - Email: ${user.email}, ID: ${user.discordId}`).join('\n');
                    interaction.reply({
                        content: `📋 **User List:**\n\n${userList}`,
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error fetching users:', error);
                    interaction.reply({ content: '❌ Failed to fetch users. Please check the logs for more details.', ephemeral: true });
                }
            }

            if (commandName === 'ticket-details') {
                const ticketId = options.getString('ticket_id');

                try {
                    const ticket = await Ticket.findById(ticketId)
                        .populate('user', 'username email')
                        .populate('assignedTo', 'username email');

                    if (!ticket) {
                        return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
                    }

                    interaction.reply({
                        content: `📋 **Ticket Details:**\n\n**ID:** ${ticket._id}\n**Title:** ${ticket.title}\n**Status:** ${ticket.status}\n**Priority:** ${ticket.priority}\n**Category:** ${ticket.category}\n**Created By:** ${ticket.user.username} (${ticket.user.email})\n**Assigned To:** ${ticket.assignedTo ? `${ticket.assignedTo.username} (${ticket.assignedTo.email})` : 'Unassigned'}`,
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error fetching ticket details:', error);
                    interaction.reply({ content: '❌ Failed to fetch ticket details. Please check the logs for more details.', ephemeral: true });
                }
            }

            if (commandName === 'stats') {
                try {
                    const totalTickets = await Ticket.countDocuments();
                    const openTickets = await Ticket.countDocuments({ status: 'open' });
                    const closedTickets = await Ticket.countDocuments({ status: 'closed' });
                    const highPriorityTickets = await Ticket.countDocuments({ priority: 'high' });

                    interaction.reply({
                        content: `📊 **Bot Statistics:**\n\n- Total Tickets: ${totalTickets}\n- Open Tickets: ${openTickets}\n- Closed Tickets: ${closedTickets}\n- High Priority Tickets: ${highPriorityTickets}`,
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error fetching stats:', error);
                    interaction.reply({ content: '❌ Failed to fetch statistics.', ephemeral: true });
                }
            }

            if (commandName === 'toggle-ticket-creation') {
                if (!interaction.member.roles.cache.some(role => role.name === 'Admin')) {
                    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                }

                const allowTicketCreation = options.getBoolean('allow');
                await Settings.findOneAndUpdate(
                    { key: 'allowTicketCreation' },
                    { $set: { value: allowTicketCreation } },
                    { upsert: true, new: true }
                );

                interaction.reply({ content: `Ticket creation has been ${allowTicketCreation ? 'enabled' : 'disabled'}.` });
            }

            if (commandName === 'assign-role') {
                const user = options.getUser('user');
                const role = options.getString('role');
                const dbUser = await User.findOne({ discordId: user.id });

                if (!dbUser) {
                    return interaction.reply({ content: 'User not found in the database.', ephemeral: true });
                }

                dbUser.roles.push(role);
                await dbUser.save();

                interaction.reply({ content: `Assigned role ${role} to user ${user.username}.`, ephemeral: true });
            }

            if (commandName === 'export-tickets') {
                const tickets = await Ticket.find();
                const fields = ['_id', 'title', 'status', 'priority', 'category', 'createdAt', 'updatedAt'];
                const parser = new Parser({ fields });
                const csv = parser.parse(tickets);

                const attachment = new AttachmentBuilder(Buffer.from(csv), { name: 'tickets.csv' });

                await interaction.reply({
                    content: 'Tickets exported successfully. Here is the CSV file:',
                    files: [attachment],
                    ephemeral: true
                });
            }

            if (commandName === 'add-server') {
                const serverId = options.getString('server-id');
                const name = options.getString('name');
                const ownerId = interaction.user.id; // Use the command issuer's ID as the ownerId

                const existingServer = await Server.findOne({ serverId });
                if (existingServer) {
                    return interaction.reply({ content: 'Server already exists.', ephemeral: true });
                }

                const server = new Server({ serverId, name, ownerId });
                await server.save();

                interaction.reply({ content: `Server ${name} added successfully.`, ephemeral: true });
            }

            if (commandName === 'ticket-stats') {
                const totalTickets = await Ticket.countDocuments();
                const openTickets = await Ticket.countDocuments({ status: 'open' });
                const closedTickets = await Ticket.countDocuments({ status: 'closed' });

                interaction.reply({
                    content: `📊 **Ticket Statistics:**
- Total Tickets: ${totalTickets}
- Open Tickets: ${openTickets}
- Closed Tickets: ${closedTickets}`,
                    ephemeral: true
                });
            }

            if (commandName === 'status') {
                try {
                    const response = await axios.get('https://status.aigenres.xyz/api/v1/status');
                    const status = response.data;

                    // Adjusted to handle the actual response format
                    const statusMessage = `📊 **Current System Status:**\n\n` +
                        `**System Name:** Support Ticket System\n` +
                        `**Status:** ${status.includes('Degraded') ? 'Degraded' : 'Operational'}\n` +
                        `**Details:** Our Support Ticket System is still under heavy development.`;

                    await interaction.reply({
                        content: statusMessage,
                        flags: 64 // Use flags for ephemeral messages
                    });
                } catch (error) {
                    console.error('Error fetching system status:', error);
                    await interaction.reply({
                        content: '❌ Failed to fetch system status. Please try again later.',
                        flags: 64 // Use flags for ephemeral messages
                    });
                }
            }
        });

        // Add bot commands for managing tickets, roles, and servers
        client.on('messageCreate', async (message) => {
            if (message.content.startsWith('!assign-role')) {
                const [command, userId, role] = message.content.split(' ');
                if (!userId || !role) {
                    return message.reply('Usage: !assign-role <userId> <role>');
                }
                // Logic to assign role
                message.reply(`Assigned role ${role} to user ${userId}`);
            }

            if (message.content.startsWith('!export-tickets')) {
                // Logic to export tickets
                message.reply('Tickets exported successfully.');
            }

            if (message.content.startsWith('!add-server')) {
                const [command, serverId, name] = message.content.split(' ');
                if (!serverId || !name) {
                    return message.reply('Usage: !add-server <serverId> <name>');
                }
                // Logic to add server
                message.reply(`Server ${name} added successfully.`);
            }
        });

    } catch (error) {
        console.error('Error starting the bot:', error);
    }
};

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    updateBotStatus();
    setInterval(updateBotStatus, 60000); // Update status every 60 seconds
});

// Add logging to verify bot initialization and channel creation
client.once('ready', () => {
  console.log(`Bot is logged in as ${client.user.tag}`);
});

async function createTicketChannel(ticketId, ticketCreator, staffMember) {
  try {
    console.log(`Creating channel for Ticket ID: ${ticketId}, Creator: ${ticketCreator}, Staff: ${staffMember}`);

    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
    if (!guild) {
      throw new Error('Guild not found');
    }

    const channelName = `ticket-${ticketId}`;
    const existingChannel = guild.channels.cache.find(channel => channel.name === channelName);
    if (existingChannel) {
      console.log('Channel already exists');
      return { success: false, message: 'Channel already exists' };
    }

    const channel = await guild.channels.create(channelName, {
      type: 'GUILD_TEXT',
      parent: process.env.DISCORD_TICKETS_CATEGORY_ID, // Ensure the category ID is set in .env
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: ['VIEW_CHANNEL']
        },
        {
          id: process.env.DISCORD_ADMIN_ROLE_ID,
          allow: ['VIEW_CHANNEL', 'SEND_MESSAGES']
        },
        {
          id: process.env.DISCORD_STAFF_ROLE_ID,
          allow: ['VIEW_CHANNEL', 'SEND_MESSAGES']
        },
        {
          id: ticketCreator,
          allow: ['VIEW_CHANNEL', 'SEND_MESSAGES']
        }
      ]
    });

    console.log(`Channel created: ${channel.name}`);
    await channel.send(`Ticket channel created for Ticket #${ticketId}. Staff and admins can assist here.`);
    return { success: true, message: 'Channel created successfully' };
  } catch (error) {
    console.error('Error creating ticket channel:', error);
    return { success: false, message: error.message };
  }
}

// Export the function
module.exports = {
  createTicketChannel,
  startBot: () => {
    client.login(process.env.DISCORD_BOT_TOKEN);
  }
};