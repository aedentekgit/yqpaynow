# Auto-Start POS Agent System

## Overview
The POS Agent now **automatically starts when theater users log in** through the frontend. This eliminates the need for manual agent startup for each theater.

## How It Works

### 1. **User Login Triggers Agent**
When a theater user logs in through the frontend login page:
- The backend authenticates the user
- After successful login, the system automatically checks if a POS agent is running for that theater
- If no agent is running, it starts one automatically in the background
- The agent connects to the theater's order stream and begins monitoring for print jobs

### 2. **Agent Management Service**
The `agent-manager.js` service handles all agent lifecycle operations:
- **Automatic startup** when users login
- **Health monitoring** - checks agents every 30 seconds
- **Auto-restart** on unexpected failures
- **Clean shutdown** when the server stops

### 3. **No Manual Configuration Required**
- Theater credentials are automatically retrieved from the database
- Each theater gets its own dedicated agent process
- Agents run in the background without user intervention

## API Endpoints

### Check Agent Status
```bash
GET /api/agent-status/:theaterId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "theaterId": "507f1f77bcf86cd799439011",
  "isRunning": true,
  "agent": {
    "theaterId": "507f1f77bcf86cd799439011",
    "label": "Cinema Hall 1",
    "theaterName": "Cinema Hall 1",
    "pid": 12345,
    "startedAt": 1637251200000,
    "uptime": 3600000,
    "lastHeartbeat": 1637254800000,
    "isHealthy": true
  }
}
```

### Get All Agents (Super Admin Only)
```bash
GET /api/agent-status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "agents": [
    {
      "theaterId": "507f1f77bcf86cd799439011",
      "label": "Cinema Hall 1",
      "theaterName": "Cinema Hall 1",
      "pid": 12345,
      "startedAt": 1637251200000,
      "uptime": 3600000,
      "lastHeartbeat": 1637254800000,
      "isHealthy": true
    }
  ],
  "totalAgents": 1
}
```

### Manually Start Agent
```bash
POST /api/agent-status/start/:theaterId
Authorization: Bearer <token>
```

### Manually Stop Agent
```bash
POST /api/agent-status/stop/:theaterId
Authorization: Bearer <token>
```

### Restart Agent
```bash
POST /api/agent-status/restart/:theaterId
Authorization: Bearer <token>
```

## Frontend Integration

### Login Response includes Agent Status
After successful login, the response includes the agent status:

```json
{
  "success": true,
  "token": "...",
  "user": { ... },
  "agentStatus": "starting" // or "running", "unavailable", "error"
}
```

### Agent Status Values
- **`starting`** - Agent is being initialized
- **`running`** - Agent is already active
- **`unavailable`** - Theater credentials not configured
- **`error`** - Failed to start agent (login still successful)

### Display Agent Status in Frontend
You can show the agent status to users:

```javascript
// After login
if (loginResponse.agentStatus === 'starting') {
  showNotification('POS Agent is starting...');
} else if (loginResponse.agentStatus === 'running') {
  showNotification('POS Agent is active');
} else if (loginResponse.agentStatus === 'unavailable') {
  showWarning('POS Agent unavailable - contact support');
}
```

### Check Agent Status Anytime
```javascript
const checkAgentStatus = async (theaterId) => {
  const response = await fetch(`/api/agent-status/${theaterId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  return data;
};
```

## Architecture

```
Frontend Login
     ↓
Backend Auth (/api/auth/login or /api/auth/validate-pin)
     ↓
Agent Manager Service
     ↓
Spawn Agent Process (agent-service.js)
     ↓
Connect to Order Stream (/api/pos-stream/:theaterId)
     ↓
Listen for Orders & Print
```

## Agent Lifecycle

### On User Login
1. User enters credentials in frontend
2. Backend validates credentials
3. Backend checks if agent is running
4. If not running, spawns new agent process
5. Agent connects to theater's order stream
6. Agent begins monitoring for print jobs

### Health Monitoring
- Agent sends output (heartbeat) regularly
- Manager monitors last heartbeat time
- If no heartbeat for 2 minutes, agent is restarted
- Automatic recovery from crashes

### On Process Exit
- Agents auto-restart on unexpected exit
- Clean exit (code 0) does not trigger restart
- Manager logs all exit events

## Configuration

### Environment Variables (Optional)
You can override settings with environment variables:

```bash
# In .env or system environment
BACKEND_URL=http://localhost:8080
THEATER_USERNAME=theater_username
THEATER_PASSWORD=theater_password
THEATER_ID=507f1f77bcf86cd799439011
```

### Config File (config.json)
Auto-generated when agents start. Located at: `backend/pos-agent/config.json`

```json
{
  "backendUrl": "http://localhost:8080",
  "agents": [
    {
      "username": "theater_username",
      "password": "theater_password",
      "theaterId": "507f1f77bcf86cd799439011",
      "label": "Cinema Hall 1",
      "enabled": true
    }
  ]
}
```

## Logs

### Agent Manager Log
Location: `backend/pos-agent/agent-manager.log`

Contains:
- Agent start/stop events
- Health check results
- Error messages
- Restart attempts

### Individual Agent Logs
Location: `backend/pos-agent/agent.log`

Contains:
- Connection status
- Order processing
- Print job results
- SSE stream events

## Security

### Authentication
- Agents use theater credentials from database
- Token-based authentication for API endpoints
- Users can only manage their own theater's agent
- Super admins can manage all agents

### Permissions
- Theater users: View and manage own agent
- Theater admins: View and manage own agent  
- Super admins: View and manage all agents

## Troubleshooting

### Agent Not Starting
1. Check theater credentials are configured in database
2. Check agent-manager.log for errors
3. Verify backend URL is correct
4. Ensure no firewall blocking local connections

### Agent Keeps Restarting
1. Check agent.log for connection errors
2. Verify backend is running and accessible
3. Check theater credentials are valid
4. Ensure database connection is stable

### Multiple Agents for Same Theater
- System prevents duplicate agents
- If detected, stop older agent first
- Check agent-manager.log for conflicts

### Print Jobs Not Working
1. Verify agent is running (check status API)
2. Check printer configuration in settings
3. Review agent.log for print errors
4. Ensure pdf-to-printer is installed correctly

## Benefits

### For Theater Owners
- ✅ No manual setup required
- ✅ Automatic startup on login
- ✅ Self-healing (auto-restart)
- ✅ No technical knowledge needed

### For Admins
- ✅ Centralized agent management
- ✅ Monitor all theaters from one place
- ✅ Easy troubleshooting via logs
- ✅ API for integration

### For Developers
- ✅ Clean architecture
- ✅ Scalable to hundreds of theaters
- ✅ Process isolation per theater
- ✅ Comprehensive logging

## Scaling Considerations

### Current Implementation
- One agent process per theater
- Agents run on same machine as backend
- Suitable for small to medium deployments (< 50 theaters)

### For Large Scale (100+ theaters)
Consider:
- Running agents on separate worker machines
- Using message queue (RabbitMQ/Redis) instead of SSE
- Implementing agent pooling
- Load balancing across multiple agent servers

## Migration from Manual Setup

### Old Way (Manual)
```bash
# Had to run this for each theater
node pos-agent/agent-service.js
# Or use batch files
START-AGENT-HIDDEN.bat
```

### New Way (Automatic)
```javascript
// Just login via frontend
// Agent starts automatically
// No manual steps needed!
```

## Support

For issues or questions:
1. Check logs: `agent-manager.log` and `agent.log`
2. Verify agent status via API
3. Review this README
4. Contact development team

---

**Last Updated:** November 17, 2025
**Version:** 2.0 (Auto-Start Implementation)
