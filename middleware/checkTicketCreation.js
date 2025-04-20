const Settings = require('../models/Settings'); // Ensure the Settings model exists

const checkTicketCreation = async (req, res, next) => {
  try {
    const setting = await Settings.findOne({ key: 'allowTicketCreation' });
    if (setting && setting.value === false) {
      return res.status(403).render('error', {
        message: 'We are not accepting new tickets at the moment. Please try again later.'
      });
    }
    next();
  } catch (err) {
    console.error('Error checking ticket creation status:', err);
    next(err);
  }
};

module.exports = checkTicketCreation;