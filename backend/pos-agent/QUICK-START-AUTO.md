# Quick Start - Auto-Start POS Agent

## For Theater Users (Simplest Method)

### Just Login - That's It! 🎉
1. Open the frontend website
2. Enter your username and password (and PIN if required)
3. Click Login
4. **Done!** The POS agent starts automatically

No manual setup, no commands to run, no technical knowledge needed!

---

## For Developers/Admins

### 1. Start the Backend Server
```bash
cd backend
npm start
```

The Agent Manager will initialize automatically when the server starts.

### 2. Users Login Via Frontend
When any theater user logs in, their agent starts automatically.

### 3. Check Agent Status (Optional)
```bash
# Using the API
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/api/agent-status/THEATER_ID
```

Or check the logs:
```bash
# View agent manager log
cat backend/pos-agent/agent-manager.log

# View agent activity log
cat backend/pos-agent/agent.log
```

---

## Testing the Auto-Start

### Method 1: Login via Frontend
1. Go to your frontend login page
2. Login with theater credentials
3. Agent starts automatically in background

### Method 2: Use the Test Script
```bash
cd backend/pos-agent

# Edit test-auto-start.js with your credentials
node test-auto-start.js
```

### Method 3: Use API Directly
```bash
# 1. Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"theater_username","password":"password"}'

# Response includes: "agentStatus": "starting"

# 2. Check status
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:8080/api/agent-status/THEATER_ID
```

---

## What Happens Behind the Scenes

```
User Logs In → Backend Authenticates → Agent Manager Checks
                                              ↓
                                        Agent Running?
                                         ↙         ↘
                                       Yes          No
                                        ↓            ↓
                                   Return "running"  Start New Agent
                                                     ↓
                                                Connect to Stream
                                                     ↓
                                                Monitor Orders
                                                     ↓
                                                Print Receipts
```

---

## Agent Management Commands (Optional)

### Via API

**Check Status:**
```bash
GET /api/agent-status/:theaterId
```

**Start Agent:**
```bash
POST /api/agent-status/start/:theaterId
```

**Stop Agent:**
```bash
POST /api/agent-status/stop/:theaterId
```

**Restart Agent:**
```bash
POST /api/agent-status/restart/:theaterId
```

### Via Frontend (Coming Soon)
Add these UI elements to your frontend:
- Agent status indicator (green = running, red = stopped)
- "Restart Agent" button in settings
- Agent health display

---

## Troubleshooting

### Agent Not Starting?

**Check 1: Backend is Running**
```bash
# Should see: "Agent Manager initialized"
npm start
```

**Check 2: Theater Credentials Configured**
- Theater must have username/password in database
- Check via: `/api/theaters/:id`

**Check 3: View Logs**
```bash
# Agent manager activity
tail -f backend/pos-agent/agent-manager.log

# Agent connections/printing
tail -f backend/pos-agent/agent.log
```

**Check 4: Test Manually**
```bash
cd backend/pos-agent
node test-auto-start.js
```

### Agent Status Shows "unavailable"?
- Theater credentials not set in database
- Update theater with username/password

### Agent Status Shows "error"?
- Check `agent-manager.log` for details
- Verify backend URL is correct
- Check firewall/antivirus not blocking

---

## Multiple Theaters

The system handles multiple theaters automatically:

1. Theater A user logs in → Agent A starts
2. Theater B user logs in → Agent B starts
3. Both run independently
4. Each has its own process and logs

**Super Admin View:**
```bash
GET /api/agent-status
# Returns array of all active agents
```

---

## Production Deployment

### Docker
The agent manager works with Docker - no special configuration needed.

### Cloud Deployment
Works on:
- Google Cloud Run ✅
- AWS ECS/Fargate ✅
- Azure Container Instances ✅
- Heroku ✅

### PM2 (Process Manager)
If using PM2, it manages the main server - agents are managed internally:
```bash
pm2 start ecosystem.config.js
# Agent manager starts automatically with server
```

---

## Migration from Old Manual System

### Before (Manual Setup) ❌
```bash
# Had to run for each theater
cd backend/pos-agent
node agent-service.js
# Or use: START-AGENT-HIDDEN.bat
```

### After (Automatic) ✅
```javascript
// Just login via frontend
// Everything happens automatically!
```

### Migration Steps
1. Update backend code (already done)
2. Restart backend server
3. Remove manual agent startup scripts
4. Users login normally - agents start automatically
5. Done! 🎉

---

## For End Users (Theater Staff)

### Simple Instructions

**Starting Your POS Printer Agent:**
1. Log into the website
2. That's it! Your printer agent is now active.

**If Printer Not Working:**
1. Log out
2. Log back in
3. If still not working, contact support

**Checking Status:**
- Look for "Agent Active" indicator in your dashboard
- Or ask your admin to check

---

## Support

**For Users:**
- Contact your theater administrator
- Check if you're logged in
- Try logging out and back in

**For Admins:**
- Check `/api/agent-status`
- Review logs: `agent-manager.log`
- Restart backend server if needed

**For Developers:**
- Review code: `services/agent-manager.js`
- Check routes: `routes/agent-status.js`
- Test endpoint: `pos-agent/test-auto-start.js`

---

**Ready to Use!** No configuration required - just login and the system handles everything automatically.
