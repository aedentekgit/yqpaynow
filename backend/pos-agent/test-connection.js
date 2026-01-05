#!/usr/bin/env node

/**
 * POS Agent Connection Test
 * Run this to verify your config.json is correct before starting the agent
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const configPath = path.join(__dirname, 'config.json');


// Check config file exists
if (!fs.existsSync(configPath)) {
  console.error('❌ config.json not found!');
  console.error('   Please copy config.example.json to config.json and fill your values.\n');
  process.exit(1);
}


// Load and validate config
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.error('❌ config.json is not valid JSON:', err.message);
  process.exit(1);
}

// Check backendUrl
if (!config.backendUrl) {
  console.error('❌ backendUrl is missing in config.json');
  process.exit(1);
}

// Check agents
if (!config.agents || !Array.isArray(config.agents) || config.agents.length === 0) {
  console.error('❌ No agents configured in config.json');
  process.exit(1);
}

// Test each agent
async function testAgent(agentConfig, index) {
  const label = agentConfig.label || `Agent-${index + 1}`;

  if (!agentConfig.username || !agentConfig.password) {
    console.error(`❌ [${label}] Missing username or password`);
    return false;
  }


  // Test backend connectivity
  try {
    const healthCheck = await axios.get(`${config.backendUrl}/api/auth/login`, { 
      timeout: 5000,
      validateStatus: function (status) {
        return status >= 200 && status < 500; // Accept any response (even 400/404)
      }
    });
  } catch (err) {
    console.error(`   ❌ Cannot reach backend: ${err.message}`);
    return false;
  }

  // Test login
  try {
    const loginRes = await axios.post(`${config.backendUrl}/api/auth/login`, {
      username: agentConfig.username,
      password: agentConfig.password
    }, { timeout: 10000 });

    const token = loginRes.data?.token;
    const user = loginRes.data?.user;
    let theaterId = user?.theaterId;

    if (!token) {
      console.error('   ❌ Login succeeded but no token received');
      return false;
    }

    if (!theaterId) {
      
      try {
        const theatersRes = await axios.get(`${config.backendUrl}/api/theaters`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        });
        
        const theaters = theatersRes.data?.data || theatersRes.data?.theaters || [];
        if (theaters.length > 0) {
          theaterId = theaters[0]._id || theaters[0].id;
        } else {
          console.error('   ❌ No theaters found in system');
          return false;
        }
      } catch (err) {
        console.error('   ❌ Failed to fetch theaters:', err.message);
        return false;
      }
    }


    // Test POS printer config endpoint
    try {
      const printerRes = await axios.get(`${config.backendUrl}/api/settings/pos-printer`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });
    } catch (err) {
      console.warn('   ⚠️  Could not load POS printer config:', err.response?.status || err.message);
    }

    // Test SSE endpoint
    try {
      // Just check if endpoint exists (don't wait for actual SSE)
      const testReq = axios.get(`${config.backendUrl}/api/pos-stream/${theaterId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 3000,
        responseType: 'stream'
      });

      const response = await Promise.race([
        testReq,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
      ]);

      
      // Cancel the request
      if (response && response.data) {
        response.data.destroy();
      }
    } catch (err) {
      if (err.message === 'Timeout') {
        // This is expected - SSE keeps connection open
      } else if (err.response?.status === 200) {
      } else {
        console.error('   ❌ SSE endpoint error:', err.response?.status || err.message);
        return false;
      }
    }

    return true;

  } catch (err) {
    if (err.response) {
      console.error(`   ❌ Login failed: ${err.response.status} ${err.response.statusText}`);
      console.error('      Server message:', err.response.data?.message || err.response.data);
    } else {
      console.error(`   ❌ Login failed: ${err.message}`);
    }
    return false;
  }
}

// Run tests
(async () => {
  let allPassed = true;
  for (let i = 0; i < config.agents.length; i++) {
    const passed = await testAgent(config.agents[i], i);
    if (!passed) allPassed = false;
  }

  if (allPassed) {
  } else {
    process.exit(1);
  }
})();
