const mongoose = require('mongoose');
const { sendEmail, emailTemplates } = require('../utils/emailService');

const userSchema = new mongoose.Schema({
  discordId: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true
  },
  discriminator: {
    type: String
  },
  email: {
    type: String,
    required: true
  },
  avatar: {
    type: String
  },
  roles: {
    type: [String],
    default: ['User']
  },
  banned: {
    type: Boolean,
    default: false // Default to not banned
  },
  points: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  ips: {
    type: [String], // Array of IP addresses
    default: []
  },
  serverId: {
    type: String,
    required: true
  }
});

userSchema.pre('save', async function (next) {
  if (this.isModified('roles')) {
    // Send email notification for role changes
    if (this.email) {
      await sendEmail(this.email, emailTemplates.roleChanged(this, this.roles, { username: 'System' }));
    }
  }
  next();
});

userSchema.methods.addPoints = function (activity, priority = 'medium') {
  let points = 0;

  switch (activity) {
    case 'ticketClosed':
      points += 10;
      break;
    case 'ticketAssigned':
      points += 5;
      break;
    case 'ticketEscalated':
      points += 15;
      break;
    default:
      points += 1;
  }

  if (priority === 'high') {
    points += 5;
  } else if (priority === 'low') {
    points -= 2;
  }

  this.points += points;
  return this.save();
};

module.exports = mongoose.model('User', userSchema);

