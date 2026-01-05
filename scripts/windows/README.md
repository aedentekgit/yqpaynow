# Windows Batch Scripts

This directory contains all Windows-specific batch scripts for managing the application.

## Quick Start Scripts

- **`START-ALL.bat`** - Start both frontend and backend servers
- **`START-BACKEND.bat`** - Start only the backend server
- **`CHECK-STATUS.bat`** - Check if servers are running
- **`RESTART-ALL-WITH-AGENT.bat`** - Restart all services including POS agent

## System Management

- **`ENABLE-AUTO-START.bat`** - Enable automatic startup on Windows boot
- **`DISABLE-AUTO-START.bat`** - Disable automatic startup
- **`CREATE-SHORTCUTS.bat`** - Create desktop shortcuts
- **`MINIMIZE-SYSTEM.bat`** - Minimize all windows

## Agent Management

- **`START-AGENT-HIDDEN.bat`** - Start POS agent in hidden mode
- **`STOP-AGENT.bat`** - Stop POS agent

## Server Management

- **`start-frontend.bat`** - Start frontend development server
- **`start-backend.bat`** - Start backend server
- **`start-all.bat`** - Start all servers
- **`START-ALL-SERVERS.bat`** - Start all servers with full output
- **`RESTART-SERVERS.bat`** - Restart all servers

## Network & Deployment

- **`START-WITH-IP.bat`** - Start servers with specific IP address
- **`CONFIGURE-FIREWALL.bat`** - Configure Windows Firewall rules
- **`FIX-UI-REFRESH.bat`** - Fix UI refresh issues

## Cross-Platform Alternative

For cross-platform support, use npm scripts defined in `package.json`:

```bash
npm run start:all      # Start all servers
npm run start:frontend # Start frontend
npm run start:backend  # Start backend
```

## Notes

- All scripts should be run from the project root directory
- Some scripts require administrator privileges
- Scripts in this directory are Windows-specific and won't work on Linux/Mac

