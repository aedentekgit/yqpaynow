# Install Print Packages

To enable automatic printing functionality, you need to install the following npm packages:

## Installation Command

Run this command in the `backend` directory:

```bash
npm install node-thermal-printer puppeteer
```

## What Each Package Does

### 1. `puppeteer` (v21.6.1)
- **Purpose**: Converts HTML receipt to PDF format
- **Required for**: Regular printer printing (PDF-based)
- **Size**: ~300MB (includes Chromium browser)
- **Platform**: Works on Windows, Linux, macOS

### 2. `node-thermal-printer` (v4.4.0)
- **Purpose**: Direct communication with thermal/receipt printers
- **Required for**: Thermal printer printing (network or USB)
- **Size**: ~5MB
- **Platform**: Works on Windows, Linux, macOS

### 3. `pdf-to-printer` (Already Installed)
- **Purpose**: Sends PDF files directly to Windows printers
- **Status**: ✅ Already in package.json
- **Platform**: Windows only

## Installation Time

- **puppeteer**: ~5-10 minutes (downloads Chromium)
- **node-thermal-printer**: ~30 seconds
- **Total**: ~5-10 minutes

## After Installation

1. Restart your backend server:
   ```bash
   npm start
   # or
   npm run dev
   ```

2. Test printing by confirming an order in the POS interface

## Troubleshooting

### Puppeteer Installation Issues

If puppeteer fails to install:

**Windows:**
```bash
npm install puppeteer --ignore-scripts
```

**Linux:**
```bash
# Install dependencies first
sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils

npm install puppeteer
```

### Thermal Printer Connection Issues

1. **Network Printer**: Verify IP address is correct
2. **USB Printer**: Check COM port (Windows) or device path (Linux)
3. **Test Connection**: Use printer's test print function first

## Optional: Skip Puppeteer (Windows Only)

If you only need Windows printing and want to skip puppeteer:

1. The system will attempt to use Windows print command
2. User will need to manually print from browser
3. Not recommended for production use

## Production Deployment

For production servers:

1. Install packages on server
2. Ensure printer drivers are installed
3. Set default printer in Windows
4. Test with a sample order first

