const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const User = require('../models/User');
const { sendEmail, emailTemplates } = require('../utils/emailService');
const crypto = require('crypto');

const scopes = ['identify', 'email', 'guilds'];

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: scopes
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user exists
      let user = await User.findOne({ discordId: profile.id });
      
      if (!user) {
        // Create new user if doesn't exist
        user = await User.create({
          discordId: profile.id,
          username: profile.username,
          discriminator: profile.discriminator,
          email: profile.email,
          avatar: profile.avatar,
          roles: ['User'] // Default role for new users
        });
      }

      // Ensure serverId is set during user creation
      if (!user.serverId) {
        user.serverId = 'default-server-id'; // Replace with logic to determine the correct serverId
      }
      await user.save();

      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;