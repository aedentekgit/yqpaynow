# POS Auto-Print Troubleshooting Guide

## 🔴 CRITICAL FIX APPLIED

**Issue Found:** The `broadcastPosEvent` function was not properly exported from `posStream.js`, causing it to be undefined when imported in services.

**Fix Applied:** Updated `backend/routes/posStream.js` to properly export both the router and the `broadcastPosEvent` function.

---

## 📋 Pre-Flight Checklist

Before testing auto-print, verify:

### 1. Backend Server
```bash
cd backend
node server.js
```

✅ Look for these logs:
```
✅ Connected to MongoDB successfully
🌐 QR Code Base URL: http://your-domain
Server is running on port 8080
```

### 2. POS Agent Configuration
```bash
cd backend/pos-agent
cat config.json  # On Windows: type config.json
```

✅ Verify:
- `backendUrl` points to your backend (e.g., `http://localhost:8080` or cluster URL)
- `agents` array has at least one entry with valid `username` and `password`
- Credentials match a user account in your database

### 3. Start POS Agent
```bash
cd backend/pos-agent
node agent.js
```

✅ Expected output:
```
[POS Agent] [Your Label] Logging in as username...
[POS Agent] [Your Label] Login OK, theaterId=xxxxx
[POS Agent] [Your Label] Connecting to POS stream: http://localhost:8080/api/pos-stream/xxxxx
[POS Agent] [Your Label] ✅ SSE connection established successfully!
```

---

## 🧪 Testing Auto-Print

### Test 1: POS Cash Order (should auto-print immediately)

1. Open POS interface (OnlinePOSInterface.jsx)
2. Add items to cart
3. Select "Cash" as payment method
4. Place order

**Expected Backend Logs:**
```
🔔 [OrderService] Triggering POS notification for order ORD-xxxxx
[POS-SSE] 🔔 Broadcasting event to theater xxxxx: { type: 'pos_order', event: 'created', orderId: 'xxxxx' }
[POS-SSE] ✅ Found 1 connected agent(s) for theater xxxxx
[POS-SSE] ✅ Event sent to agent 1/1
✅ [OrderService] Broadcast complete: 1 agent(s) notified
```

**Expected Agent Logs:**
```
[POS Agent] [Your Label] 📨 Received SSE message: {"type":"pos_order","event":"created","orderId":"xxxxx"}
[POS Agent] [Your Label] POS order event: { type: 'pos_order', event: 'created', orderId: 'xxxxx' }
[POS Agent] [Your Label] Printing order: ORD-xxxxx
[POS Agent] [Your Label] ESC/POS print sent over USB
```

### Test 2: QR/Online Order (should auto-print after payment)

1. Scan QR code or use online ordering
2. Add items, proceed to checkout
3. Complete payment (Razorpay, etc.)

**Expected Backend Logs (on payment):**
```
🔔 [PaymentService] Payment verified, checking if POS notification needed
✅ [PaymentService] Triggering POS notification for paid online order
[POS-SSE] 🔔 Broadcasting event to theater xxxxx: { type: 'pos_order', event: 'paid', orderId: 'xxxxx' }
✅ [PaymentService] Broadcast complete: 1 agent(s) notified
```

**Expected Agent Logs:**
```
[POS Agent] [Your Label] 📨 Received SSE message: {"type":"pos_order","event":"paid","orderId":"xxxxx"}
[POS Agent] [Your Label] POS order event: { type: 'pos_order', event: 'paid', orderId: 'xxxxx' }
[POS Agent] [Your Label] Printing order: ORD-xxxxx
```

---

## 🔍 Common Issues & Solutions

### Issue 1: "No connected agents for theater"
**Symptom:** Backend shows `⚠️ No connected agents for theater xxxxx`

**Solutions:**
1. Verify POS agent is running (`node agent.js`)
2. Check agent logs for connection errors
3. Verify `theaterId` matches between agent login and order
4. Check if firewall is blocking SSE connection

### Issue 2: Agent not receiving events
**Symptom:** Backend shows events sent, but agent doesn't log them

**Solutions:**
1. Check SSE connection state in agent logs
2. Look for "Connection status: OPEN"
3. Restart the agent
4. Check if backend URL is correct in `config.json`

### Issue 3: Print not happening
**Symptom:** Agent receives event but doesn't print

**Solutions:**
1. **USB Driver:** Check if `escpos-usb` is installed
   ```bash
   cd backend/pos-agent
   npm install escpos escpos-usb
   ```

2. **Printer connected:** Verify USB printer is connected
   ```bash
   # On Linux/Mac
   lsusb
   
   # On Windows, check Device Manager
   ```

3. **Vendor/Product IDs:** If using USB, verify IDs in config.json
   - Leave empty to auto-detect first ESC/POS printer
   - Or specify exact IDs for your printer model

4. **System Printer:** If using `driver: 'system'`:
   - Verify printer name matches exactly (case-sensitive)
   - Test print from Windows: `notepad > Print`

### Issue 4: "Login failed" or 401 errors
**Symptom:** Agent can't connect, shows authentication errors

**Solutions:**
1. Verify credentials in `config.json`
2. Check if user exists in database
3. Verify user has `theaterId` assigned
4. Check backend `/api/auth/login` endpoint is working

### Issue 5: Events sent but `broadcastPosEvent` is undefined
**Symptom:** Backend crashes with "broadcastPosEvent is not a function"

**Solution:** ✅ **FIXED** - This was the root cause! The export syntax has been corrected.

---

## 📊 Debug Commands

### Check active SSE connections
Add to your code temporarily:
```javascript
// In posStream.js after line 83
console.log('Active theater connections:', Array.from(theaterConnections.keys()));
```

### Test SSE connection manually
```bash
# Replace TOKEN and THEATER_ID with real values
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Accept: text/event-stream" \
     http://localhost:8080/api/pos-stream/YOUR_THEATER_ID
```

Should see:
```
data: {"type":"connected","theaterId":"YOUR_THEATER_ID"}
```

### Check MongoDB for orders
```javascript
// In MongoDB shell or Compass
db.theaterorders.findOne({ theater: ObjectId("YOUR_THEATER_ID") })
```

---

## 🚀 Production Deployment Checklist

1. **Backend Server:**
   - ✅ `MONGODB_URI` is set correctly
   - ✅ `PORT` is configured (default 8080)
   - ✅ Server is accessible from POS machines
   - ✅ CORS allows POS machine IPs

2. **POS Agent (on each POS machine):**
   - ✅ `config.json` created from `config.example.json`
   - ✅ `backendUrl` points to production server
   - ✅ Credentials are for the correct theater
   - ✅ Printer is connected and configured
   - ✅ Agent runs on system startup (use PM2, systemd, or Windows Service)

3. **Network:**
   - ✅ POS machines can reach backend server
   - ✅ No firewall blocking SSE connections
   - ✅ Stable network connection (SSE requires persistent connection)

4. **Run Agent as Service (recommended):**
   ```bash
   # Using PM2
   cd backend/pos-agent
   pm2 start agent.js --name "pos-agent-theater1"
   pm2 save
   pm2 startup
   ```

---

## 📞 Need Help?

If auto-print still doesn't work after following this guide:

1. **Collect logs:**
   - Backend server logs (full output)
   - POS agent logs (full output)
   - Network trace if possible

2. **Check versions:**
   ```bash
   node --version  # Should be 16+ or 18+
   npm list escpos escpos-usb pdf-to-printer eventsource axios
   ```

3. **Verify the fix was applied:**
   - Check `backend/routes/posStream.js` line 106-109
   - Should see both `module.exports` and `exports.broadcastPosEvent`

---

## ✅ Success Criteria

You'll know auto-print is working when:
- ✅ POS agent connects without errors
- ✅ Backend shows "X agent(s) notified" for each order
- ✅ Agent logs "Printing order: ORD-xxxxx"
- ✅ Physical receipt prints automatically
- ✅ No browser print dialogs appear
