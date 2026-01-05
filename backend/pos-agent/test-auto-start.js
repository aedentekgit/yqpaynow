/**
 * Test Agent Auto-Start System
 * Run this to verify the auto-start implementation works correctly
 */

const axios = require('axios');

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const THEATER_USERNAME = 'your_theater_username'; // Replace with actual theater username
const THEATER_PASSWORD = 'your_theater_password'; // Replace with actual theater password

async function testAutoStart() {
  
  try {
    // Step 1: Login
    const loginResponse = await axios.post(`${BACKEND_URL}/api/auth/login`, {
      username: THEATER_USERNAME,
      password: THEATER_PASSWORD
    });
    
    if (!loginResponse.data.success) {
      console.error('❌ Login failed');
      return;
    }
    
    
    const token = loginResponse.data.token;
    const theaterId = loginResponse.data.user.theaterId;
    
    if (!theaterId) {
      console.error('❌ No theater ID in login response');
      return;
    }
    
    // Step 2: Wait a moment for agent to start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 3: Check agent status
    const statusResponse = await axios.get(
      `${BACKEND_URL}/api/agent-status/${theaterId}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    
    
    if (statusResponse.data.agent) {
    }
    
    if (statusResponse.data.isRunning) {
    } else {
    }
    
    // Step 4: Test manual restart (optional)
    const restartResponse = await axios.post(
      `${BACKEND_URL}/api/agent-status/restart/${theaterId}`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    
    
    // Step 5: Final status check
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const finalStatus = await axios.get(
      `${BACKEND_URL}/api/agent-status/${theaterId}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    
    
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Message:', error.response.data.error || error.response.data.message);
    } else {
      console.error('   Error:', error.message);
    }
  }
}

// Run the test
testAutoStart();
