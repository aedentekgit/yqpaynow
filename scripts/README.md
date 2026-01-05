# Scripts Directory

This folder contains all executable scripts for managing the YQPayNow application.

## 📁 Folder Structure

### `windows/` - Windows Scripts
Scripts for Windows environments (.bat and .ps1 files)

#### Server Management
- **START-ALL-SERVERS.bat** - Starts both frontend and backend servers
- **start-all.bat** - Alternative server starter
- **start-backend.bat** - Start backend server only
- **start-frontend.bat** - Start frontend server only
- **START-WITH-IP.bat** - Start servers with network IP for mobile access
- **RESTART-SERVERS.bat** - Restart all running servers

#### Deployment & Configuration
- **deploy-to-cloud-run.ps1** - PowerShell script to deploy to Google Cloud Run
- **CONFIGURE-FIREWALL.bat** - Configure Windows Firewall rules
- **FIX-UI-REFRESH.bat** - Fix UI refresh issues

### Root Scripts
- **deploy-to-cloud-run.sh** - Shell script for deploying to Google Cloud Run (Linux/Mac)
- **setup-gcs.js** - Setup Google Cloud Storage

## 🚀 Quick Start

### Windows Users
```batch
# Start all servers
START-ALL-SERVERS.bat

# Start with mobile/network access
START-WITH-IP.bat

# Restart servers
RESTART-SERVERS.bat
```

### Linux/Mac Users
```bash
# Deploy to Cloud Run
./deploy-to-cloud-run.sh
```

## 📝 Notes
- All server start scripts should be run from the project root
- Deployment scripts require proper Google Cloud credentials
- Network scripts may require firewall permissions
