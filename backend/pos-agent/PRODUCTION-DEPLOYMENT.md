# 🚀 Production Deployment Guide - POS Auto-Print Agent

## ⚠️ Important: How It Works in Production

**YES, it WILL work in production**, but you need to understand the architecture:

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  PRODUCTION BACKEND SERVER (Cloud/Server)               │
│  - URL: https://yqpaynow.com                            │
│  - Handles orders, payments, database                   │
│  - Sends SSE events to agents                           │
└─────────────────────────────────────────────────────────┘
                        ▲
                        │ HTTPS/SSE Connection
                        │
┌─────────────────────────────────────────────────────────┐
│  POS MACHINE (Local Windows PC at Theater)              │
│  - Agent runs here (agent-service.js)                   │
│  - Printer connected here                              │
│  - Connects to production backend                       │
│  - Prints receipts locally                              │
└─────────────────────────────────────────────────────────┘
```

### Key Points:

1. ✅ **Backend can be anywhere** (cloud, server, etc.)
2. ✅ **Agent MUST run locally** on each POS machine (where printer is)
3. ✅ **Printing happens locally** on the POS machine
4. ✅ **Agent connects to remote backend** via HTTPS

---

## 📋 Production Setup Checklist

### Step 1: Deploy Backend to Production

1. Deploy your backend server to production (e.g., `https://yqpaynow.com`)
2. Ensure backend is accessible from POS machines
3. Test backend health: `https://yqpaynow.com/api/health` (if exists)

### Step 2: Configure Agent on Each POS Machine

On **each POS machine** (Windows PC with printer):

1. **Copy agent files** to POS machine:
   ```
   backend/pos-agent/
   ├── agent-service.js
   ├── config.json
   └── package.json (if needed)
   ```

2. **Update `config.json`** with production backend URL:
   ```json
   {
     "backendUrl": "https://yqpaynow.com",
     "agents": [
       {
         "label": "Theater 1 - Main Counter",
         "username": "theater1@example.com",
         "password": "your-password",
         "pin": "1234",
         "driver": "system",
         "printerName": "Your Printer Name"
       }
     ]
   }
   ```

3. **Install dependencies** (if not already installed):
   ```powershell
   cd backend/pos-agent
   npm install axios pdf-to-printer
   ```

4. **Test connection**:
   ```powershell
   node test-connection.js
   ```

### Step 3: Start Agent on POS Machine

**Option A: Manual Start**
```powershell
cd backend/pos-agent
node agent-service.js
```

**Option B: PM2 (Recommended for Production)**
```powershell
pm2 start agent-service.js --name pos-agent
pm2 save
pm2 startup  # Auto-start on Windows boot
```

**Option C: Windows Service (Most Reliable)**
- Use `install-windows-startup.bat` (run as Administrator)
- Agent will start automatically on Windows boot

---

## 🔧 Configuration Details

### Backend URL Configuration

The agent reads backend URL from:
1. **Environment variable** `BACKEND_URL` (highest priority)
2. **config.json** `backendUrl` field
3. **Default**: `http://localhost:8080`

**For Production:**
```json
{
  "backendUrl": "https://yqpaynow.com"
}
```

**Or use environment variable:**
```powershell
$env:BACKEND_URL="https://yqpaynow.com"
node agent-service.js
```

### Printer Configuration

**Windows System Printer:**
```json
{
  "driver": "system",
  "printerName": "EPSON TM-T88V"
}
```

**USB ESC/POS Printer:**
```json
{
  "driver": "usb",
  "usbVendorId": 1155,
  "usbProductId": 22304
}
```

---

## ✅ Verification Steps

### 1. Test Backend Connection
```powershell
# From POS machine, test if backend is reachable
curl https://yqpaynow.com/api/auth/login
```

### 2. Test Agent Connection
```powershell
cd backend/pos-agent
node test-connection.js
```

Expected output:
```
✅ Backend URL: https://yqpaynow.com
✅ Backend is reachable
✅ Login successful
✅ SSE connection test passed
```

### 3. Check Agent Logs
```powershell
# View agent logs
Get-Content backend/pos-agent/agent.log -Tail 50
```

Look for:
```
✅ Login successful, theaterId=xxxxx
✅ SSE connection established successfully!
```

### 4. Test Printing
1. Place a test order from POS interface
2. Check agent logs for:
   ```
   [POS Agent] Received POS order: xxxxx
   [POS Agent] PRINT SUCCESS - Order ORD-xxxxx
   ```

---

## 🐛 Common Production Issues & Solutions

### Issue 1: Agent Can't Connect to Backend

**Symptoms:**
- `Connection error: ECONNREFUSED`
- `Cannot reach backend`

**Solutions:**
1. ✅ Verify backend URL is correct: `https://yqpaynow.com`
2. ✅ Check firewall on POS machine allows HTTPS (port 443)
3. ✅ Test from browser: `https://yqpaynow.com/api/auth/login`
4. ✅ Check if backend requires VPN or special network access

### Issue 2: SSL Certificate Errors

**Symptoms:**
- `certificate verify failed`
- `UNABLE_TO_VERIFY_LEAF_SIGNATURE`

**Solutions:**
1. ✅ Ensure backend has valid SSL certificate
2. ✅ For self-signed certificates, add to Node.js trusted certificates
3. ✅ Or use `NODE_TLS_REJECT_UNAUTHORIZED=0` (NOT recommended for production)

### Issue 3: Authentication Fails

**Symptoms:**
- `401 Unauthorized`
- `Login failed`

**Solutions:**
1. ✅ Verify username/password in `config.json`
2. ✅ Check if PIN is required and set correctly
3. ✅ Ensure backend JWT_SECRET matches production
4. ✅ Check if account is active in production database

### Issue 4: SSE Connection Drops

**Symptoms:**
- Agent connects but disconnects immediately
- `Connection closed. Reconnecting...`

**Solutions:**
1. ✅ Check network stability (no firewall timeouts)
2. ✅ Verify backend supports long-lived connections
3. ✅ Check if reverse proxy (nginx) has timeout settings
4. ✅ Ensure backend doesn't close idle connections

### Issue 5: Printing Doesn't Work

**Symptoms:**
- Agent receives orders but doesn't print
- `Print failed: ...`

**Solutions:**
1. ✅ Verify printer is connected and powered on
2. ✅ Check printer name matches exactly (case-sensitive)
3. ✅ Test printer manually: Print a test page from Windows
4. ✅ Check agent logs for specific error messages
5. ✅ Verify `pdf-to-printer` package is installed

---

## 🔒 Security Considerations

### 1. Credentials Storage
- ⚠️ **Never commit `config.json` with real passwords to Git**
- ✅ Use environment variables for sensitive data:
  ```powershell
  $env:THEATER_USERNAME="user@example.com"
  $env:THEATER_PASSWORD="password"
  $env:BACKEND_URL="https://yqpaynow.com"
  ```

### 2. Network Security
- ✅ Use HTTPS for all backend connections
- ✅ Consider VPN for POS machines if needed
- ✅ Firewall should allow HTTPS (port 443) outbound

### 3. Agent Access
- ✅ Limit who can access POS machines
- ✅ Use strong passwords for theater accounts
- ✅ Enable PIN authentication if available

---

## 📊 Monitoring in Production

### Agent Status Check

Create a simple status page or API endpoint to check agent connectivity:

```javascript
// Check if agent is connected
GET /api/agent-status/:theaterId
```

### Log Monitoring

**Windows Event Viewer:**
- Check Windows logs for agent crashes
- Monitor PM2 logs if using PM2

**Agent Log File:**
```powershell
# View real-time logs
Get-Content backend/pos-agent/agent.log -Wait -Tail 20
```

### Health Checks

1. **Backend Health:**
   ```powershell
   curl https://yqpaynow.com/api/health
   ```

2. **Agent Health:**
   - Check `agent.log` for recent activity
   - Verify last connection timestamp
   - Check for error messages

---

## 🚀 Deployment Steps Summary

### For Each Theater/POS Machine:

1. ✅ **Install Node.js** (if not already installed)
2. ✅ **Copy agent files** to POS machine
3. ✅ **Configure `config.json`** with production backend URL
4. ✅ **Install dependencies**: `npm install`
5. ✅ **Test connection**: `node test-connection.js`
6. ✅ **Start agent**: `node agent-service.js` or use PM2
7. ✅ **Set up auto-start**: Use `install-windows-startup.bat`
8. ✅ **Verify printing**: Place test order

### For Backend Server:

1. ✅ **Deploy backend** to production
2. ✅ **Ensure HTTPS** is enabled
3. ✅ **Configure CORS** to allow agent connections
4. ✅ **Test SSE endpoint**: `/api/pos-stream/:theaterId`
5. ✅ **Monitor logs** for agent connections

---

## ✅ Production Checklist

- [ ] Backend deployed to production
- [ ] Backend URL accessible from POS machines
- [ ] Agent `config.json` updated with production URL
- [ ] Agent tested on each POS machine
- [ ] Printer configured correctly
- [ ] Agent auto-start configured (PM2 or Windows Service)
- [ ] Logs monitored for errors
- [ ] Test order placed and printed successfully
- [ ] Network/firewall rules configured
- [ ] SSL certificates valid
- [ ] Credentials secured (not in Git)

---

## 📞 Support

If you encounter issues:

1. Check `agent.log` for error messages
2. Run `test-connection.js` for diagnostics
3. Verify backend is accessible from POS machine
4. Check network connectivity
5. Review this guide for common issues

---

**Last Updated:** $(Get-Date)
**Status:** ✅ Production Ready

