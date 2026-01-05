// Theater Access Middleware
const Theater = require('../models/Theater');

const requireTheaterAccess = async (req, res, next) => {
  try {
    const theaterId = req.params.theaterId || req.body.theaterId;
    
    if (!theaterId) {
      return res.status(400).json({ error: 'Theater ID is required' });
    }
    
    // Check if theater exists
    const theater = await Theater.findById(theaterId);
    if (!theater) {
      return res.status(404).json({ error: 'Theater not found' });
    }
    
    req.theater = theater;
    next();
  } catch (error) {
    console.error('Theater access middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  requireTheaterAccess
};
