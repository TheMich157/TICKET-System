const User = require('../models/User'); // Ensure User model is imported
const axios = require('axios'); // For making API requests

const logIp = async (req, res, next) => {
  try {
    // Skip IP checks for authentication routes
    if (req.path.startsWith('/auth')) {
      console.log(`Skipping IP check for path: ${req.path}`);
      return next();
    }

    if (req.isAuthenticated()) {
      const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

      // Skip checks for local IP addresses
      if (ip === '::1' || ip === '127.0.0.1') {
        console.log('Skipping IP check for local IP address.');
        return next();
      }

      // Check if the IP is a proxy or VPN
      const ipInfoResponse = await axios.get(`https://ipinfo.io/${ip}?token=${process.env.IPINFO_TOKEN}`);
      const ipInfo = ipInfoResponse.data;

      console.log('IP Info:', ipInfo);

      // Store the IP in the user's database record
      if (!req.user.ips.includes(ip)) {
        req.user.ips.push(ip);
        await req.user.save();
      }

      // Log the IP details in the database (optional)
      if (ipInfo) {
        console.log(`IP logged for user ${req.user.username}: ${ip}`);
      }

      // Optionally block access if the IP is detected as a proxy or VPN
      if (ipInfo && ipInfo.bogon) {
        return res.status(403).render('error', { message: 'Access denied. Proxy or VPN detected.' });
      }

      if (ipInfo && ipInfo.org && (ipInfo.org.toLowerCase().includes('vpn') || ipInfo.org.toLowerCase().includes('proxy'))) {
        return res.status(403).render('error', { message: 'Access denied. Proxy or VPN detected.' });
      }
    }

    next();
  } catch (error) {
    console.error('Error in logIp middleware:', error);
    next();
  }
};

module.exports = logIp;