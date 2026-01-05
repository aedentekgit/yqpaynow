# 🚀 Fully Automated POS Auto-Print System

## ⚡ Quick Start (Easiest - Just Double-Click!)

### Windows:
1. **Double-click** `quick-start.bat`
2. That's it! ✅

This will:
- ✅ Automatically start the backend server
- ✅ Automatically start the POS agent
- ✅ Auto-print all orders immediately

---

## 🔧 Production Setup (Runs in Background with PM2)

### Step 1: Auto-Configure (One-Time Setup)
```bash
npm run autoprint:configure
```

**OR** manually create `pos-agent/config.json`:
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

### Step 2: Start Everything Automatically
```bash
npm run autoprint:start
```

**OR** double-click `start-autoprint.bat`

### Useful Commands:
```bash
npm run autoprint:stop      # Stop all services
npm run autoprint:restart   # Restart all services
npm run autoprint:logs      # View live logs
```

---

## 📋 What Each Script Does

### `quick-start.bat` (Simple)
- **Best for:** Testing, development
- Starts backend + POS agent in foreground
- Press Ctrl+C to stop
- No PM2 required

### `start-autoprint.bat` (Production)
- **Best for:** Production, running 24/7
- Uses PM2 for process management
- Auto-restart on crashes
- Runs in background
- Auto-start on Windows boot

### `auto-configure.js` (Setup Helper)
- Interactive setup wizard
- Automatically detects your theater
- Tests all connections
- Creates config.json for you

---

## 🎯 How It Works

1. **Backend Server** starts on port 8080
2. **POS Agent** connects to backend via SSE (Server-Sent Events)
3. When orders are placed:
   - **POS cash orders** → Auto-print immediately ⚡
   - **QR/Online orders** → Auto-print after payment ⚡
4. No browser dialogs, no manual clicks!

---

## 🔍 Monitoring

### View Real-Time Logs:
```bash
npm run autoprint:logs
```

### Check Status:
```bash
pm2 status
```

### Monitor in Dashboard:
```bash
pm2 monit
```

---

## 🛠️ Troubleshooting

### Agent Not Connecting?
1. Make sure backend is running: `http://localhost:8080`
2. Check credentials in `pos-agent/config.json`
3. Run diagnostic: `node pos-agent/test-connection.js`

### Not Printing?
1. Check printer is connected (USB or system printer)
2. For USB: Driver auto-detects ESC/POS printers
3. For system: Verify printer name matches exactly
4. Check agent logs for errors

### Backend Won't Start?
1. Check if MongoDB is running
2. Check if port 8080 is available
3. View logs: `pm2 logs yqpay-backend`

---

## 📊 File Structure

```
backend/
├── server.js                    # Main backend server
├── pos-agent/
│   ├── agent.js                 # POS printing agent
│   ├── config.json              # Your configuration
│   ├── config.example.json      # Template
│   ├── auto-configure.js        # Auto-setup wizard
│   ├── test-connection.js       # Connection tester
│   ├── TROUBLESHOOTING.md       # Detailed help
│   └── FIX-SUMMARY.md          # Technical details
├── ecosystem.config.json        # PM2 configuration
├── quick-start.bat             # Simple startup
├── start-autoprint.bat         # Production startup
└── stop-autoprint.bat          # Stop services
```

---

## ✨ Features

✅ **Zero Manual Intervention** - Orders print automatically
✅ **Auto-Restart** - Crashes are handled automatically
✅ **Background Running** - Doesn't block your terminal
✅ **Multi-Theater Support** - Configure multiple agents
✅ **USB & System Printers** - Works with both types
✅ **Comprehensive Logging** - Debug issues easily
✅ **Boot on Startup** - Start with Windows (optional)

---

## 🎉 You're All Set!

**Just run:** `quick-start.bat` or `npm run autoprint:start`

Orders will now print automatically! 🖨️✨
