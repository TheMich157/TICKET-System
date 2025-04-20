const mongoose = require('mongoose');
const Server = require('../models/Server'); // Adjusted path to ensure correct resolution

// Use environment variable for database connection
const dbUri = process.env.MONGO_URI;

mongoose.connect(dbUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to the database');
}).catch(err => {
  console.error('Database connection error:', err);
});

// Sample server data
const servers = [
  { serverId: '0', name: 'Server One', ownerId: '1203636286834081852', staffRoles: ['Admin', 'Staff'] },
  { serverId: '2', name: 'Server Two', ownerId: '67890', staffRoles: ['Admin', 'Staff'] },
  { serverId: '3', name: 'Server Three', ownerId: '54321', staffRoles: ['Admin', 'Staff'] }
];

// Populate the Server collection
const populateServers = async () => {
  try {
    await Server.deleteMany(); // Clear existing data
    await Server.insertMany(servers); // Insert sample data
    console.log('Server collection populated successfully');
    mongoose.connection.close();
  } catch (err) {
    console.error('Error populating server collection:', err);
    mongoose.connection.close();
  }
};

populateServers();