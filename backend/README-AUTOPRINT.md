# 🎯 FULLY AUTOMATED POS AUTO-PRINT - READY TO USE!

## ✅ WHAT'S BEEN DONE

I've created a **completely automated** POS auto-print system for you with:

### 1. **Core Fix Applied** ✅
- Fixed the critical `broadcastPosEvent` export bug in `posStream.js`
- Enhanced logging throughout the system
- Auto-theater selection for super admin accounts

### 2. **Automation Scripts Created** ✅

| Script | Purpose | Best For |
|--------|---------|----------|
| `quick-start.bat` | Simple one-click startup | Testing, Development |
| `start-autoprint.bat` | Production startup with PM2 | 24/7 Operation |
| `stop-autoprint.bat` | Stop all services | Maintenance |
| `install-windows-startup.bat` | Auto-start on boot | Production Deployment |
| `pos-agent/auto-configure.js` | Interactive setup wizard | First-time setup |
| `pos-agent/test-connection.js` | Diagnostic tool | Troubleshooting |

### 3. **NPM Commands** ✅
```bash
npm run autoprint:configure   # Interactive setup
npm run autoprint:start       # Start everything
npm run autoprint:stop        # Stop everything
npm run autoprint:restart     # Restart everything
npm run autoprint:logs        # View logs
```

---

## 🚀 HOW TO USE (3 STEPS)

### **Option A: Super Simple (Just Double-Click)**

1. Make sure backend is running OR double-click `quick-start.bat`
2. Orders will auto-print immediately!
3. That's it! ✨

### **Option B: Production Setup (Runs 24/7 in Background)**

#### **Step 1: First-Time Setup**
```powershell
cd d:\1\backend
npm run autoprint:configure
```
This interactive wizard will:
- Test backend connection
- Verify your credentials  
- Detect your theater
- Configure printer settings
- Create `config.json` automatically

#### **Step 2: Start Everything**
Double-click `start-autoprint.bat`

OR:
```powershell
npm run autoprint:start
```

#### **Step 3: Verify It's Working**
```powershell
npm run autoprint:logs
```

Look for:
```
[POS Agent] Login OK, theaterId=xxxxx
[POS Agent] ✅ SSE connection established successfully!
```

---

## 📋 CONFIGURATION FILE

The agent uses `d:\1\backend\pos-agent\config.json`:

```json
{
  "backendUrl": "http://localhost:8080",
  "agents": [
    {
      "label": "Main POS Counter",
      "username": "admin@yqpaynow.com",
      "password": "admin123"
    }
  ]
}
```

For multiple theaters/printers, add more agents:
```json
{
  "backendUrl": "http://localhost:8080",
  "agents": [
    {
      "label": "Theater 1 - Counter A",
      "username": "theater1@example.com",
      "password": "pass123"
    },
    {
      "label": "Theater 2 - Counter B",
      "username": "theater2@example.com",
      "password": "pass456",
      "driver": "system",
      "printerName": "EPSON TM-T88V"
    }
  ]
}
```

---

## 🔧 PRINTER CONFIGURATION

### **USB ESC/POS Printer (Default - Auto-Detect)**
```json
{
  "driver": "usb"
}
```
Agent will auto-detect the first ESC/POS printer.

### **USB ESC/POS with Specific IDs**
```json
{
  "driver": "usb",
  "usbVendorId": 1155,
  "usbProductId": 22304
}
```

### **Windows System Printer**
```json
{
  "driver": "system",
  "printerName": "EPSON TM-T88V"
}
```
Name must match exactly (check Windows Devices & Printers).

---

## 🎬 HOW IT WORKS

1. **Backend Server** starts on port 8080
2. **POS Agent** logs in and connects via SSE
3. **Auto-prints when:**
   - POS cash order placed → Prints immediately ⚡
   - QR/Online order paid → Prints after payment ⚡
4. **No browser dialogs!** Everything happens automatically in background

---

## 🔍 MONITORING

### View Real-Time Logs:
```powershell
npm run autoprint:logs
```

### Check Service Status:
```powershell
pm2 status
```

### Interactive Dashboard:
```powershell
pm2 monit
```

---

## 🛠️ TROUBLESHOOTING

### **Backend Not Starting?**
```powershell
# Check if port 8080 is in use
netstat -ano | findstr :8080

# Kill the process if needed
taskkill /F /PID <PID>

# Start backend
cd d:\1\backend
node server.js
```

### **Agent Can't Connect?**
```powershell
# Run diagnostic
cd d:\1\backend\pos-agent
node test-connection.js
```

Common fixes:
- ✅ Backend must be running first
- ✅ Check credentials in `config.json`
- ✅ Verify MongoDB is running
- ✅ Check firewall isn't blocking port 8080

### **Not Printing?**
1. Check printer is powered on and connected
2. For USB: Ensure driver is installed (`npm install escpos escpos-usb`)
3. For system: Verify printer name matches exactly
4. Check agent logs for errors: `pm2 logs pos-agent`

### **401 Authentication Error?**
- Token might have expired
- Restart the agent: `pm2 restart pos-agent`
- Check username/password in config.json

---

## 🔄 IMPORTANT COMMANDS

```powershell
# Start everything
npm run autoprint:start

# Stop everything  
npm run autoprint:stop

# Restart after config changes
npm run autoprint:restart

# View logs
npm run autoprint:logs

# Check status
pm2 status

# Configure from scratch
npm run autoprint:configure
```

---

## ⚡ WINDOWS BOOT AUTO-START

To make it start automatically when Windows boots:

```powershell
# Run as Administrator
.\install-windows-startup.bat
```

To remove auto-start:
```powershell
# Run as Administrator
.\uninstall-windows-startup.bat
```

---

## ✨ FEATURES

✅ **Fully Automatic** - Zero manual intervention  
✅ **Auto-Restart** - Recovers from crashes  
✅ **Background Running** - Doesn't block terminals  
✅ **Multi-Theater** - Support multiple locations  
✅ **USB & System Printers** - Works with both  
✅ **Comprehensive Logging** - Easy debugging  
✅ **Boot on Startup** - Optional Windows auto-start  
✅ **Super Admin Support** - Auto-selects theater  

---

## 📊 SYSTEM STATUS INDICATORS

### ✅ Everything Working:
```
[POS Agent] Login OK, theaterId=xxxxx
[POS Agent] ✅ SSE connection established successfully!
[POS Agent] 📨 Received SSE message: ...
[POS Agent] Printing order: ORD-xxxxx
[POS Agent] ESC/POS print sent over USB
```

### ❌ Issues:
```
❌ Cannot reach backend           → Start backend first
❌ Login failed                    → Check credentials
❌ No connected agents             → Agent not running
❌ EventSource is not a constructor → Fixed in latest code
❌ 401 Unauthorized                → Token expired, restart agent
```

---

## 🎉 YOU'RE ALL SET!

Just run:
```powershell
cd d:\1\backend
.\quick-start.bat
```

Or for production:
```powershell
.\start-autoprint.bat
```

**Orders will now print automatically!** 🖨️✨

For detailed help, see:
- `AUTOPRINT-GUIDE.md` - Full user guide
- `TROUBLESHOOTING.md` - Common issues & solutions
- `FIX-SUMMARY.md` - Technical details about the fix
