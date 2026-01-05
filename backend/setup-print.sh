#!/bin/bash

echo "========================================"
echo "Print System Setup Script"
echo "========================================"
echo ""

echo "[1/3] Installing required packages..."
echo "This may take 5-10 minutes (puppeteer downloads Chromium)"
echo ""

npm install node-thermal-printer@^4.4.0 puppeteer@^21.6.1 --save

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Installation failed!"
    echo "Please check the error messages above."
    exit 1
fi

echo ""
echo "[2/3] Creating temp directory for print files..."
mkdir -p temp
echo "✅ Temp directory created"

echo ""
echo "[3/3] Verifying installation..."
npm list node-thermal-printer puppeteer pdf-to-printer

echo ""
echo "========================================"
echo "✅ Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Restart your backend server: npm start"
echo "2. Test printing by confirming an order in POS"
echo ""

