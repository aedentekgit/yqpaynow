#!/usr/bin/env node

/**
 * Auto-Configuration Script for POS Agent
 * Automatically detects theater and configures the agent
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const readline = require('readline');

const configPath = path.join(__dirname, 'config.json');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {

  // Get backend URL
  const backendUrl = await question('Backend URL [http://localhost:8080]: ') || 'http://localhost:8080';

  // Test backend connectivity
  try {
    await axios.get(`${backendUrl}/`, { timeout: 5000 });
  } catch (err) {
    console.error('❌ Cannot reach backend:', err.message);
    console.error('\nPlease make sure the backend server is running first.');
    process.exit(1);
  }

  // Get credentials
  const username = await question('Username: ');
  const password = await question('Password: ');

  // Test login
  try {
    const loginRes = await axios.post(`${backendUrl}/api/auth/login`, {
      username,
      password
    });

    const user = loginRes.data?.user;
    const theaterId = user?.theaterId;

    if (!theaterId) {
      console.error('❌ User has no theater assigned');
      process.exit(1);
    }


    // Ask for printer type
    const printerChoice = await question('Select printer type [1]: ') || '1';

    let printerConfig = {};
    if (printerChoice === '2') {
      const printerName = await question('Printer name (e.g., "EPSON TM-T88V"): ');
      printerConfig = {
        driver: 'system',
        printerName
      };
    } else {
      printerConfig = {
        driver: 'usb'
      };
    }

    // Create config
    const config = {
      backendUrl,
      agents: [
        {
          label: user.theater?.name || 'Main POS Counter',
          username,
          password,
          ...printerConfig
        }
      ]
    };

    // Save config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Test SSE connection
    const token = loginRes.data?.token;
    try {
      const testReq = axios.get(`${backendUrl}/api/pos-stream/${theaterId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 2000,
        responseType: 'stream'
      });

      await Promise.race([
        testReq,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1500))
      ]).catch(() => {});

    } catch (err) {
    }


  } catch (err) {
    console.error('\n❌ Login failed:', err.response?.data?.message || err.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
