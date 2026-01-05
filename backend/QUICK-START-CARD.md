# ⚡ YQPay Auto-Print - QUICK START CARD

## 🎯 START AUTO-PRINT (Choose ONE)

### 1️⃣ EASIEST - Just Double-Click:
```
📁 d:\1\backend\START-HERE.bat
```
**That's it! Everything runs automatically!** ✨

### 2️⃣ Create Desktop Shortcut:
```
Double-click: create-desktop-shortcut.bat
Then use the desktop shortcut forever!
```

### 3️⃣ Production (Background with PM2):
```powershell
cd d:\1\backend
start-autoprint.bat
```

---

## ✅ HOW TO KNOW IT'S WORKING

You'll see:
```
[POS Agent] Login OK, theaterId=xxxxx
[POS Agent] ✅ SSE connection established successfully!
```

Then when orders come in:
```
[POS Agent] 📨 Received SSE message
[POS Agent] Printing order: ORD-xxxxx
[POS Agent] ESC/POS print sent over USB
```

**Physical receipt prints automatically!** 🖨️

---

## 🔧 IF SOMETHING'S WRONG

### Backend Not Running?
```powershell
cd d:\1\backend
node server.js
```
Wait for: `🚀 YQPayNow Server running on 0.0.0.0:8080`

### Agent Not Connecting?
```powershell
cd d:\1\backend\pos-agent
node test-connection.js
```
This tests everything and tells you what's wrong.

### Need to Change Settings?
Edit: `d:\1\backend\pos-agent\config.json`
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

---

## 📋 USEFUL COMMANDS

| Command | What It Does |
|---------|--------------|
| `START-HERE.bat` | Start everything (easiest!) |
| `quick-start.bat` | Start in foreground |
| `start-autoprint.bat` | Start in background (PM2) |
| `stop-autoprint.bat` | Stop everything |
| `npm run autoprint:logs` | View logs |
| `npm run autoprint:configure` | Interactive setup |

---

## 🎬 WHAT PRINTS AUTOMATICALLY

✅ **POS Cash Orders** → Prints immediately when placed  
✅ **QR Code Orders** → Prints after customer pays  
✅ **Online Orders** → Prints after payment confirmed  
❌ **Browser Print Dialogs** → Completely disabled!

---

## 💡 PRO TIPS

1. **First Time?** Just double-click `START-HERE.bat`
2. **Want Desktop Icon?** Run `create-desktop-shortcut.bat`
3. **Running 24/7?** Use `start-autoprint.bat` with PM2
4. **Multiple Printers?** Add more agents in `config.json`
5. **Auto-Start on Boot?** Run `install-windows-startup.bat` as Admin

---

## 🆘 EMERGENCY FIXES

### Nothing Works?
```powershell
# Stop everything
taskkill /F /IM node.exe

# Start fresh
cd d:\1\backend
START-HERE.bat
```

### Printer Not Found?
- USB: Make sure printer is powered on and connected
- Check: Device Manager → Ports (COM & LPT) or Printers
- For system printer: Match name exactly in config.json

### 401 Error?
```powershell
# Just restart the agent
pm2 restart pos-agent

# Or close and reopen START-HERE.bat
```

---

## 📚 MORE HELP

- **Full Guide:** `AUTOPRINT-GUIDE.md`
- **Troubleshooting:** `TROUBLESHOOTING.md`
- **Technical Details:** `FIX-SUMMARY.md`
- **This File:** `QUICK-START-CARD.md`

---

## ✨ YOU'RE DONE!

**Just double-click `START-HERE.bat` and orders will print automatically!**

That's all you need to know! 🎉

---

*Last Updated: November 16, 2025*  
*Status: ✅ Fully Automatic - Zero Manual Intervention*
