# 🚀 VPS Storage Setup Guide

This guide will help you migrate from Google Cloud Storage to VPS local storage.

## ✅ What Changed

**Before:** Files were uploaded to Google Cloud Storage (GCS)
**Now:** Files are saved directly to your VPS at `/var/www/html/uploads/`

## 📋 Prerequisites

- VPS with web server (Apache or Nginx)
- SSH or FileZilla access to VPS
- Node.js backend running on VPS

## 🛠️ Step-by-Step Setup

### Step 1: Create Upload Directory on VPS

#### Option A: Using SSH

```bash
# Connect to your VPS
ssh root@147.79.68.136

# Create uploads directory
sudo mkdir -p /var/www/html/uploads

# Create subdirectories
sudo mkdir -p /var/www/html/uploads/products
sudo mkdir -p /var/www/html/uploads/theater-documents
sudo mkdir -p /var/www/html/uploads/audio
sudo mkdir -p /var/www/html/uploads/qr-codes
sudo mkdir -p /var/www/html/uploads/printer-setup
sudo mkdir -p /var/www/html/uploads/general

# Set permissions (755 = rwxr-xr-x)
sudo chmod -R 755 /var/www/html/uploads

# Set ownership (replace 'www-data' with your Node.js user if different)
sudo chown -R www-data:www-data /var/www/html/uploads
```

#### Option B: Using FileZilla

1. Connect to VPS via FileZilla (SFTP on port 22)
2. Navigate to `/var/www/html/`
3. Right-click → Create Directory → Name it `uploads`
4. Inside `uploads`, create these folders:
   - `products`
   - `theater-documents`
   - `audio`
   - `qr-codes`
   - `printer-setup`
   - `general`
5. Right-click `uploads` → File Permissions → Set to `755`
6. Check "Recurse into subdirectories" → OK

### Step 2: Configure Backend Environment

Add these lines to your `backend/.env` file:

```env
# VPS Upload Configuration
VPS_UPLOAD_PATH=/var/www/html/uploads
VPS_BASE_URL=https://yqpaynow.com
```

**Important:** 
- Use `https://yqpaynow.com` if you have SSL configured
- Use `http://147.79.68.136` if you don't have SSL yet

### Step 3: Verify Web Server Configuration

Your web server should already serve files from `/var/www/html/`. Test by creating a test file:

```bash
# Create test file
echo "Test file" | sudo tee /var/www/html/uploads/test.txt

# Access via browser:
# https://yqpaynow.com/uploads/test.txt
# OR
# http://147.79.68.136/uploads/test.txt
```

If you can see "Test file" in your browser, you're good to go!

### Step 4: Restart Backend

```bash
# Navigate to your backend directory
cd /path/to/your/backend

# Restart your Node.js application
pm2 restart all
# OR
npm run start
```

## 🧪 Testing

### Test File Upload

1. Log in to your application
2. Go to Products → Add Product
3. Upload a product image
4. Check if the image appears correctly
5. Verify the file exists at `/var/www/html/uploads/products/...`

### Test File Access

The uploaded file should be accessible at:
```
https://yqpaynow.com/uploads/products/image-1234567890.jpg
```

## 📂 File Organization

Files will be organized as follows:

```
/var/www/html/uploads/
├── general/
│   └── images/          # General images (logos, etc.)
├── products/
│   └── {theaterId}/
│       └── {productName}/  # Product images
├── theater-documents/
│   └── {theaterId}/     # Theater documents (licenses, etc.)
├── audio/               # Audio notification files
├── printer-setup/
│   └── files/           # Printer setup executables
└── qr-codes/
    ├── single/          # Single QR codes
    └── screen/          # Screen-based QR codes
```

## 🔒 Security Notes

1. **Permissions:** Keep at `755` (owner can write, others can only read)
2. **Ownership:** Should match your Node.js process user
3. **Backups:** Set up regular backups of `/var/www/html/uploads/`
4. **Disk Space:** Monitor disk usage regularly

## 🔧 Troubleshooting

### Issue: "Permission denied" error

**Solution:**
```bash
sudo chmod -R 755 /var/www/html/uploads
sudo chown -R your-node-user:your-node-user /var/www/html/uploads
```

### Issue: Files upload but can't be accessed via browser

**Solution:**
- Check web server configuration
- Ensure `/var/www/html/` is the correct web root
- Verify firewall allows HTTP/HTTPS traffic

### Issue: "VPS storage initialization failed"

**Solution:**
- Check if `/var/www/html/uploads` exists
- Verify Node.js process has write permissions
- Check `VPS_UPLOAD_PATH` in `.env` is correct

## 📊 Advantages of VPS Storage

✅ **No external costs** - No GCS storage fees
✅ **Faster uploads** - Direct to local disk
✅ **Simpler setup** - No cloud credentials needed
✅ **Full control** - Complete access to files

## ⚠️ Important Considerations

❌ **Backup responsibility** - You must backup files yourself
❌ **Single point of failure** - If VPS goes down, files are unavailable
❌ **Disk space limits** - Monitor available space
❌ **Scaling limitations** - Harder to scale to multiple servers

## 🔄 Migration from GCS (Optional)

If you have existing files in GCS that you want to migrate:

1. Download all files from GCS bucket
2. Upload them to `/var/www/html/uploads/` maintaining folder structure
3. Update database URLs from GCS to VPS URLs

## 📞 Support

If you encounter issues:
1. Check server logs: `pm2 logs` or `journalctl -u your-service`
2. Verify permissions: `ls -la /var/www/html/uploads`
3. Test file creation: `touch /var/www/html/uploads/test.txt`

---

**Setup Date:** 2026-01-05
**Version:** 1.0
