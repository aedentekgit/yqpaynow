/**
 * Agent Status API Routes
 * Provides endpoints to check, start, and stop POS agents
 */

const express = require('express');
const router = express.Router();
const agentManager = require('../services/agent-manager');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');

/**
 * GET /api/agent-status
 * Get status of all active agents (admin only)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userType = req.user.userType || req.user.role;
    
    // Only super admins can see all agents
    if (userType !== 'super_admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only super admins can view all agent statuses'
      });
    }

    const statuses = agentManager.getAgentStatuses();
    
    res.json({
      success: true,
      agents: statuses,
      totalAgents: statuses.length
    });

  } catch (error) {
    console.error('Error getting agent statuses:', error);
    res.status(500).json({
      error: 'Failed to get agent statuses',
      message: error.message
    });
  }
});

/**
 * GET /api/agent-status/:theaterId
 * Get status of agent for a specific theater
 */
router.get('/:theaterId', authenticateToken, async (req, res) => {
  try {
    const { theaterId } = req.params;
    const userType = req.user.userType || req.user.role;
    const userTheaterId = req.user.theaterId;

    // Users can only check their own theater's agent
    if (userType !== 'super_admin' && String(userTheaterId) !== String(theaterId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only check your own theater\'s agent status'
      });
    }

    const isRunning = agentManager.isAgentRunning(theaterId);
    const statuses = agentManager.getAgentStatuses();
    const agentInfo = statuses.find(s => s.theaterId === theaterId);

    res.json({
      success: true,
      theaterId,
      isRunning,
      agent: agentInfo || null
    });

  } catch (error) {
    console.error('Error getting agent status:', error);
    res.status(500).json({
      error: 'Failed to get agent status',
      message: error.message
    });
  }
});

/**
 * POST /api/agent-status/start/:theaterId
 * Manually start agent for a specific theater
 */
router.post('/start/:theaterId', authenticateToken, async (req, res) => {
  try {
    const { theaterId } = req.params;
    const userType = req.user.userType || req.user.role;
    const userTheaterId = req.user.theaterId;

    // Users can only start their own theater's agent
    if (userType !== 'super_admin' && String(userTheaterId) !== String(theaterId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only start your own theater\'s agent'
      });
    }

    // Check if already running
    if (agentManager.isAgentRunning(theaterId)) {
      return res.json({
        success: true,
        message: 'Agent is already running',
        status: 'running'
      });
    }

    // Get theater credentials
    const theater = await mongoose.connection.db.collection('theaters')
      .findOne({ _id: new mongoose.Types.ObjectId(theaterId) });

    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found'
      });
    }

    // Use the logged-in user's credentials (from JWT token)
    const username = req.user.username;
    
    // Note: We don't have the plaintext password here since user is already authenticated
    // For manual start via API, we need to use theater's stored credentials
    // This is a limitation - ideally user would provide their password again for manual start
    if (!theater.username || !theater.password) {
      return res.status(400).json({
        error: 'Theater credentials not configured',
        message: 'Cannot start agent without theater username and password'
      });
    }

    // Start the agent with theater credentials (fallback)
    // Note: Using stored credentials for convenience. For enhanced security, 
    // consider requiring user to re-enter password for manual agent start.
    const started = await agentManager.startAgent(
      theater.username,
      theater.password,
      theaterId,
      theater.name
    );

    if (started) {
      res.json({
        success: true,
        message: 'Agent started successfully',
        status: 'started',
        theaterId
      });
    } else {
      res.status(500).json({
        error: 'Failed to start agent',
        message: 'Agent process could not be started'
      });
    }

  } catch (error) {
    console.error('Error starting agent:', error);
    res.status(500).json({
      error: 'Failed to start agent',
      message: error.message
    });
  }
});

/**
 * POST /api/agent-status/stop/:theaterId
 * Manually stop agent for a specific theater
 */
router.post('/stop/:theaterId', authenticateToken, async (req, res) => {
  try {
    const { theaterId } = req.params;
    const userType = req.user.userType || req.user.role;
    const userTheaterId = req.user.theaterId;

    // Users can only stop their own theater's agent
    if (userType !== 'super_admin' && String(userTheaterId) !== String(theaterId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only stop your own theater\'s agent'
      });
    }

    // Check if running
    if (!agentManager.isAgentRunning(theaterId)) {
      return res.json({
        success: true,
        message: 'Agent is not running',
        status: 'stopped'
      });
    }

    // Stop the agent
    const stopped = agentManager.stopAgent(theaterId);

    if (stopped) {
      res.json({
        success: true,
        message: 'Agent stopped successfully',
        status: 'stopped',
        theaterId
      });
    } else {
      res.status(500).json({
        error: 'Failed to stop agent',
        message: 'Agent process could not be stopped'
      });
    }

  } catch (error) {
    console.error('Error stopping agent:', error);
    res.status(500).json({
      error: 'Failed to stop agent',
      message: error.message
    });
  }
});

/**
 * POST /api/agent-status/restart/:theaterId
 * Restart agent for a specific theater
 */
router.post('/restart/:theaterId', authenticateToken, async (req, res) => {
  try {
    const { theaterId } = req.params;
    const userType = req.user.userType || req.user.role;
    const userTheaterId = req.user.theaterId;

    // Users can only restart their own theater's agent
    if (userType !== 'super_admin' && String(userTheaterId) !== String(theaterId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only restart your own theater\'s agent'
      });
    }

    // Get theater credentials
    const theater = await mongoose.connection.db.collection('theaters')
      .findOne({ _id: new mongoose.Types.ObjectId(theaterId) });

    if (!theater) {
      return res.status(404).json({
        error: 'Theater not found'
      });
    }

    if (!theater.username || !theater.password) {
      return res.status(400).json({
        error: 'Theater credentials not configured',
        message: 'Cannot restart agent without theater username and password'
      });
    }

    // Stop if running
    if (agentManager.isAgentRunning(theaterId)) {
      agentManager.stopAgent(theaterId);
      // Wait a bit before restarting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Start the agent
    const started = await agentManager.startAgent(
      theater.username,
      theater.password,
      theaterId,
      theater.name
    );

    if (started) {
      res.json({
        success: true,
        message: 'Agent restarted successfully',
        status: 'restarted',
        theaterId
      });
    } else {
      res.status(500).json({
        error: 'Failed to restart agent',
        message: 'Agent process could not be restarted'
      });
    }

  } catch (error) {
    console.error('Error restarting agent:', error);
    res.status(500).json({
      error: 'Failed to restart agent',
      message: error.message
    });
  }
});

module.exports = router;
