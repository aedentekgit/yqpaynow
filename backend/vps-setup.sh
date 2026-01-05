#!/bin/bash

# --- YQPayNow VPS Setup Script ---
# This script automates the backend setup on Hostinger VPS

echo "🚀 Starting YQPayNow Backend Setup..."

# 1. Update and Install Node.js if missing
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 2. Install PM2 if missing
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    sudo npm install pm2 -g
fi

# 3. Setup Upload Directories
echo "📁 Setting up /var/www/html/uploads..."
sudo mkdir -p /var/www/html/uploads
sudo mkdir -p /var/www/html/uploads/products
sudo mkdir -p /var/www/html/uploads/theater-documents
sudo mkdir -p /var/www/html/uploads/qr-codes
sudo mkdir -p /var/www/html/uploads/general/images

# 4. Set Permissions
echo "🔐 Setting Directory Permissions..."
sudo chown -R $USER:$USER /var/www/html/uploads
sudo chmod -R 755 /var/www/html/uploads

# 5. Start the Application
echo "♻️  Starting App with PM2..."
cd /var/www/backend || exit
npm install
pm2 delete yqpay-backend 2>/dev/null
pm2 start ecosystem.config.json
pm2 save

echo "✅ Deployment Complete! Backend is now running and saving files to VPS disk."
