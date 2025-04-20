# Discord Ticket Support System

A comprehensive ticket support system with Discord authentication, role-based access control, and email notifications.

## Features

### Authentication & Authorization
- Discord OAuth2 integration for user authentication
- Role-based access control (User, Staff, Admin)
- Secure session management
- Permission-based feature access

### Ticket Management
- Create, view, and manage support tickets
- Multiple ticket categories (Technical, Billing, General, Feature Request)
- Priority levels (Low, Medium, High)
- Status tracking (Open, In Progress, Closed)
- Staff assignment system
- Comment system with staff and user responses
- Private staff notes
- Ticket history and updates tracking

### Staff Dashboard
- Comprehensive overview of ticket statistics
- Advanced filtering and search capabilities
- Quick access to high-priority tickets
- Staff assignment management
- Recent activity tracking
- Performance metrics

### Email Notifications
- Ticket creation confirmation
- Status update notifications
- Comment notifications
- Staff assignment alerts
- High-priority ticket alerts
- Role change notifications

### User Interface
- Modern, responsive design using Tailwind CSS
- Intuitive navigation
- Real-time updates
- Mobile-friendly layout
- Accessible design patterns

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd ticket-support
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with the following configuration:
```env
PORT=8000
NODE_ENV=development
MONGODB_URI=your_mongodb_uri
SESSION_SECRET=your_session_secret

# Discord OAuth2 Configuration
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=http://localhost:8000/auth/discord/callback

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_specific_password
SMTP_FROM=Ticket Support <your_email@gmail.com>
```

4. Set up your Discord application:
- Go to the [Discord Developer Portal](https://discord.com/developers/applications)
- Create a new application
- Set up OAuth2 with the redirect URL
- Copy the Client ID and Client Secret to your `.env` file

5. Start the server:
```bash
npm start
```

## Role System

### User Roles
- **User**: Basic access to create and manage their own tickets
- **Staff**: Access to staff dashboard, ticket management, and assignment capabilities
- **Admin**: Full system access including user management and role assignment

### Permissions
- View Tickets: All users (own tickets), Staff/Admin (all tickets)
- Create Tickets: All users
- Manage Tickets: Staff and Admin
- Assign Tickets: Staff and Admin
- Close Tickets: Ticket owner, Staff, and Admin
- View Staff Dashboard: Staff and Admin
- Manage Users: Admin only
- Manage Roles: Admin only

## Email Notifications

The system includes comprehensive email notifications for:
- Ticket creation
- Status updates
- New comments
- Staff assignments
- High-priority tickets
- Role changes

To enable email notifications, configure the SMTP settings in your `.env` file.

## Development

### Project Structure
```
ticket-support/
├── config/           # Configuration files
├── middleware/       # Custom middleware
├── models/          # Database models
├── public/          # Static assets
├── routes/          # Route handlers
├── utils/           # Utility functions
├── views/           # EJS templates
└── server.js        # Application entry point
```

### Technologies Used
- Node.js & Express
- MongoDB & Mongoose
- EJS Templates
- Tailwind CSS
- Discord OAuth2
- Nodemailer
- Passport.js

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.