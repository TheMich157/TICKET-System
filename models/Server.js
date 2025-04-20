const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema({
  serverId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  ownerId: {
    type: String,
    required: true,
    trim: true
  },
  staffRoles: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Server', serverSchema);