const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  // Handle mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(error => error.message);
    return res.status(400).render('error', {
      message: 'Validation Error',
      errors: messages
    });
  }

  // Handle mongoose cast errors (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).render('error', {
      message: 'Invalid ID format'
    });
  }

  // Default error
  res.status(err.status || 500).render('error', {
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong!' 
      : err.message
  });
};

module.exports = errorHandler;