/**
 * POS Agent Manager Service
 * Automatically manages and monitors POS agents for theaters
 * Agents are spawned when users login and kept alive automatically
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

class AgentManager {
  constructor() {
    // Store active agents: Map<theaterId, {process, label, theaterId, username, lastHeartbeat}>
    this.activeAgents = new Map();
    
    // Store pending agent starts to prevent duplicates
    this.pendingStarts = new Set();
    
    // Agent monitoring interval
    this.monitorInterval = null;
    
    // Config path
    this.configPath = path.join(__dirname, '..', 'pos-agent', 'config.json');
    this.logPath = path.join(__dirname, '..', 'pos-agent', 'agent-manager.log');
    
    this.log('=== Agent Manager Initialized ===');
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    try {
      fs.appendFileSync(this.logPath, logMessage);
    } catch (err) {
      console.error('Log write error:', err.message);
    }
  }

  /**
   * Start monitoring agents (called on server startup)
   */
  startMonitoring() {
    if (this.monitorInterval) {
      return; // Already monitoring
    }

    this.log('Starting agent monitor...');
    
    // Check agents every 30 seconds
    this.monitorInterval = setInterval(() => {
      this.checkAgents();
    }, 30000);

    this.log('Agent monitor started (30s interval)');
  }

  /**
   * Stop monitoring (cleanup on server shutdown)
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      this.log('Agent monitor stopped');
    }
  }

  /**
   * Check health of all active agents
   */
  checkAgents() {
    const now = Date.now();
    const staleTimeout = 120000; // 2 minutes

    this.activeAgents.forEach((agent, theaterId) => {
      const timeSinceHeartbeat = now - agent.lastHeartbeat;
      
      if (timeSinceHeartbeat > staleTimeout) {
        this.log(`⚠️ Agent for theater ${theaterId} (${agent.label}) appears stale. Restarting...`);
        this.stopAgent(theaterId);
        
        // Auto-restart if we have credentials
        if (agent.username && agent.password) {
          setTimeout(() => {
            this.startAgent(agent.username, agent.password, theaterId, agent.theaterName);
          }, 5000);
        }
      }
    });
  }

  /**
   * Start a POS agent for a specific theater
   * @param {string} username - Theater username
   * @param {string} password - Theater password
   * @param {string} theaterId - Theater ID
   * @param {string} theaterName - Theater name (for logging)
   * @param {string} pin - User PIN (optional, for PIN-required users)
   * @returns {Promise<boolean>} - Success status
   */
  async startAgent(username, password, theaterId, theaterName = null, pin = null) {
    try {
      const label = theaterName || `Theater-${theaterId}`;
      
      // Check if already running
      if (this.activeAgents.has(theaterId)) {
        this.log(`Agent for ${label} already running - skipping`);
        return true;
      }

      // Check if start is pending
      if (this.pendingStarts.has(theaterId)) {
        this.log(`Agent start for ${label} already pending - skipping`);
        return true;
      }

      this.log(`🚀 Starting agent for ${label} (${theaterId})...`);
      this.pendingStarts.add(theaterId);

      // Update config.json with theater credentials
      // Don't await - make it non-blocking, continue even if config update fails
      this.updateAgentConfig(username, password, theaterId, label, pin).catch(err => {
        this.log(`⚠️ Config update failed but continuing agent start: ${err.message}`);
      });

      // Spawn the agent process
      const agentScriptPath = path.join(__dirname, '..', 'pos-agent', 'agent-service.js');
      
      const agentProcess = spawn('node', [agentScriptPath], {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: path.join(__dirname, '..', 'pos-agent'),
        env: {
          ...process.env,
          THEATER_ID: theaterId,
          THEATER_USERNAME: username,
          THEATER_PASSWORD: password,
          THEATER_PIN: pin || '1234'  // Default PIN if not provided
        }
      });

      // Store agent info
      this.activeAgents.set(theaterId, {
        process: agentProcess,
        label,
        theaterId,
        username,
        password,
        theaterName,
        startedAt: Date.now(),
        lastHeartbeat: Date.now(),
        pid: agentProcess.pid
      });

      // Remove from pending after a short delay
      setTimeout(() => {
        this.pendingStarts.delete(theaterId);
      }, 3000);

      // Handle process events
      agentProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          this.log(`[${label}] ${output}`);
          // Update heartbeat on any output
          const agent = this.activeAgents.get(theaterId);
          if (agent) {
            agent.lastHeartbeat = Date.now();
          }
        }
      });

      agentProcess.stderr.on('data', (data) => {
        this.log(`[${label}] ERROR: ${data.toString().trim()}`);
      });

      agentProcess.on('exit', (code) => {
        this.log(`[${label}] Agent exited with code ${code}`);
        this.activeAgents.delete(theaterId);
        this.pendingStarts.delete(theaterId);
        
        // Auto-restart on unexpected exit (except code 0)
        if (code !== 0) {
          this.log(`[${label}] Auto-restarting in 10 seconds...`);
          setTimeout(() => {
            this.startAgent(username, password, theaterId, theaterName);
          }, 10000);
        }
      });

      agentProcess.on('error', (err) => {
        this.log(`[${label}] Process error: ${err.message}`);
        this.activeAgents.delete(theaterId);
        this.pendingStarts.delete(theaterId);
      });

      this.log(`✅ Agent started successfully for ${label} (PID: ${agentProcess.pid})`);
      return true;

    } catch (err) {
      this.log(`❌ Failed to start agent: ${err.message}`);
      this.pendingStarts.delete(theaterId);
      return false;
    }
  }

  /**
   * Stop a POS agent for a specific theater
   * @param {string} theaterId - Theater ID
   * @returns {boolean} - Success status
   */
  stopAgent(theaterId) {
    const agent = this.activeAgents.get(theaterId);
    
    if (!agent) {
      this.log(`No agent found for theater ${theaterId}`);
      return false;
    }

    try {
      this.log(`Stopping agent for ${agent.label} (PID: ${agent.pid})...`);
      
      // Kill the process
      agent.process.kill('SIGTERM');
      
      // Remove from active agents
      this.activeAgents.delete(theaterId);
      
      this.log(`✅ Agent stopped for ${agent.label}`);
      return true;
      
    } catch (err) {
      this.log(`❌ Error stopping agent: ${err.message}`);
      return false;
    }
  }

  /**
   * Check if an agent is running for a theater
   * @param {string} theaterId - Theater ID
   * @returns {boolean}
   */
  isAgentRunning(theaterId) {
    return this.activeAgents.has(theaterId);
  }

  /**
   * Get status of all active agents
   * @returns {Array}
   */
  getAgentStatuses() {
    const statuses = [];
    
    this.activeAgents.forEach((agent, theaterId) => {
      statuses.push({
        theaterId,
        label: agent.label,
        theaterName: agent.theaterName,
        pid: agent.pid,
        startedAt: agent.startedAt,
        uptime: Date.now() - agent.startedAt,
        lastHeartbeat: agent.lastHeartbeat,
        isHealthy: (Date.now() - agent.lastHeartbeat) < 120000 // 2 minutes
      });
    });
    
    return statuses;
  }

  /**
   * Stop all agents (cleanup)
   */
  stopAllAgents() {
    this.log('Stopping all agents...');
    
    this.activeAgents.forEach((agent, theaterId) => {
      this.stopAgent(theaterId);
    });
    
    this.stopMonitoring();
    this.log('All agents stopped');
  }

  /**
   * Update agent config file
   */
  async updateAgentConfig(username, password, theaterId, label, pin = null) {
    try {
      let config = {
        backendUrl: process.env.BACKEND_URL || 'http://localhost:8080',
        agents: []
      };

      // Read existing config if it exists
      if (fs.existsSync(this.configPath)) {
        try {
          const existingConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
          config = { ...config, ...existingConfig };
        } catch (parseError) {
          this.log(`⚠️ Failed to parse existing config, using defaults: ${parseError.message}`);
          // Continue with default config
        }
      }

      // Ensure agents array exists
      if (!Array.isArray(config.agents)) {
        config.agents = [];
      }

      // Check if this theater already exists in config
      const existingIndex = config.agents.findIndex(a => a.theaterId === theaterId);
      
      const agentConfig = {
        username,
        password,
        theaterId,
        label,
        enabled: true
      };
      
      // Add PIN if provided
      if (pin) {
        agentConfig.pin = pin;
      }

      if (existingIndex >= 0) {
        // Update existing
        config.agents[existingIndex] = agentConfig;
      } else {
        // Add new
        config.agents.push(agentConfig);
      }

      // Write config with error handling
      try {
        // Ensure directory exists
        const configDir = path.dirname(this.configPath);
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
        this.log(`Config updated for ${label}`);
      } catch (writeError) {
        this.log(`⚠️ Failed to write agent config: ${writeError.message}`);
        // Don't throw - config write failure shouldn't prevent agent start
        // The agent can still run without the config file
      }
      
    } catch (err) {
      this.log(`❌ Failed to update agent config: ${err.message}`);
      this.log(`❌ Config error stack: ${err.stack}`);
      // Don't throw - return false instead to indicate failure but not crash
      return false;
    }
    
    return true;
  }
}

// Create singleton instance
const agentManager = new AgentManager();

// Cleanup on process exit
process.on('SIGTERM', () => {
  agentManager.stopAllAgents();
  process.exit(0);
});

process.on('SIGINT', () => {
  agentManager.stopAllAgents();
  process.exit(0);
});

module.exports = agentManager;
