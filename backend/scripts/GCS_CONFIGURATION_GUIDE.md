# Google Cloud Storage (GCS) Configuration Guide

## Overview

This guide explains how to configure Google Cloud Storage for theater document uploads. Once configured, all theater documents (theaterPhoto, logo, aadharCard, panCard, gstCertificate, fssaiCertificate, agreementCopy) will be uploaded to Google Cloud Storage instead of using base64 data URLs.

## Current Status

✅ **Code is ready** - All GCS upload logic is implemented and working  
⚠️ **GCS not configured** - Currently using mock mode (base64 data URLs)  
✅ **Frontend updated** - Settings page now supports JSON key file upload

## How to Configure GCS

### Step 1: Get Google Cloud Service Account Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **IAM & Admin** → **Service Accounts**
4. Create a new service account (or use existing)
5. Grant the service account **Storage Admin** role (or **Storage Object Admin** for more limited access)
6. Click on the service account → **Keys** tab
7. Click **Add Key** → **Create new key**
8. Choose **JSON** format
9. Download the JSON key file

### Step 2: Create GCS Bucket

1. In Google Cloud Console, navigate to **Cloud Storage** → **Buckets**
2. Click **Create Bucket**
3. Configure:
   - **Name**: `theater-canteen-uploads` (or your preferred name)
   - **Location**: Choose region (e.g., `us-central1`)
   - **Storage class**: Standard (default)
   - **Access control**: Uniform (recommended)
   - **Protection**: Soft delete (optional)
4. Click **Create**

### Step 3: Configure in Application

1. **Open Settings Page**:
   - Navigate to `/settings` in your application
   - Click on **Google Cloud Storage** tab

2. **Upload Service Account Key**:
   - Click **Choose File** next to "Service Account Key File"
   - Select the downloaded JSON key file
   - The system will automatically parse and extract:
     - Project ID (from `project_id` field)
     - Client Email (from `client_email` field)
     - Private Key (from `private_key` field)

3. **Fill Required Fields**:
   - **Project ID**: Should auto-fill from JSON, or enter manually
   - **Bucket Name**: `theater-canteen-uploads` (or your bucket name)
   - **Region**: Select the region where your bucket is located

4. **Save Configuration**:
   - Click **Save Configuration**
   - Check server logs for confirmation:
     ```
     ✅ [SettingsService] Extracted credentials from key file
     ✅ [SettingsController] GCS client re-initialized after config update
     ✅ GCS client initialized successfully
     ✅ Bucket verified: exists and accessible
     ```

### Step 4: Verify Configuration

1. **Check Server Logs**:
   - Look for: `✅ GCS client initialized successfully`
   - Look for: `✅ Bucket verified: exists and accessible`

2. **Test Upload**:
   - Create a new theater with documents
   - Check server logs for:
     ```
     📤 [GCS] Uploading file: theater list/...
     ✅ [GCS] File uploaded successfully
     ✅ [GCS] Signed URL generated
     ```
   - Check Google Cloud Console to see files in bucket

3. **Verify in Database**:
   - Run verification script:
     ```bash
     cd backend
     node scripts/verify-theater-documents.js
     ```
   - Documents should show as GCS URLs (not base64)

## File Structure in GCS

After configuration, documents will be organized as:

```
theater-canteen-uploads/
  └── theater list/
      └── [Theater Name]/
          ├── theaterPhoto-[timestamp].png
          ├── logo-[timestamp].png
          ├── aadharCard-[timestamp].pdf
          ├── panCard-[timestamp].pdf
          ├── gstCertificate-[timestamp].pdf
          ├── fssaiCertificate-[timestamp].pdf
          └── agreementCopy-[timestamp].pdf
```

## Troubleshooting

### Issue: "GCS credentials incomplete"

**Solution**:
- Make sure you uploaded the JSON key file in Settings
- Check that the JSON file contains `client_email` and `private_key`
- Verify Project ID and Bucket Name are filled

### Issue: "Bucket does not exist or is not accessible"

**Solution**:
- Verify bucket name is correct (case-sensitive)
- Check bucket exists in Google Cloud Console
- Verify service account has Storage Admin or Storage Object Admin role
- Check bucket permissions in Google Cloud Console

### Issue: "Permission denied (403)"

**Solution**:
- Ensure service account has proper IAM roles:
  - `roles/storage.admin` OR
  - `roles/storage.objectAdmin`
- Check bucket IAM permissions
- Verify service account email matches the one in JSON key file

### Issue: Documents still showing as base64

**Possible Causes**:
1. GCS not configured yet - upload JSON key file in Settings
2. GCS initialization failed - check server logs for errors
3. Mock mode enabled - check `GCS_MOCK_MODE` environment variable is not `true`

**Solution**:
- Configure GCS in Settings page
- Check server logs for initialization errors
- Remove or set `GCS_MOCK_MODE=false` in environment

## What Was Fixed

### Backend Changes:

1. **GCS Upload Utility** (`backend/utils/gcsUploadUtil.js`):
   - ✅ Updated to read GCS config from new `_systemSettings: true` format
   - ✅ Enhanced credentials extraction (supports nested or flat structure)
   - ✅ Added comprehensive logging for debugging
   - ✅ Added automatic re-initialization (checks every 5 minutes)
   - ✅ Added bucket verification
   - ✅ Improved error messages with helpful hints
   - ✅ Added `resetGCSClient()` function

2. **Settings Service** (`backend/services/SettingsService.js`):
   - ✅ Supports both `keyFilename` (file path) and `credentials` object
   - ✅ Automatically extracts credentials from JSON key file if path provided
   - ✅ Enhanced logging for config updates

3. **Settings Controller** (`backend/controllers/SettingsController.js`):
   - ✅ Forces GCS client re-initialization after config update
   - ✅ Enhanced logging for config updates

### Frontend Changes:

1. **Settings Page** (`frontend/src/pages/Settings.jsx`):
   - ✅ Changed from text input (file path) to file upload
   - ✅ Automatically parses JSON key file
   - ✅ Extracts `client_email` and `private_key` from JSON
   - ✅ Auto-fills Project ID from JSON file
   - ✅ Shows confirmation when credentials loaded

## Testing After Configuration

Once GCS is configured:

1. **Create a new theater** with documents
2. **Check server logs** - should show:
   - `✅ GCS client initialized successfully`
   - `📤 [GCS] Uploading file: ...`
   - `✅ [GCS] File uploaded successfully`
   - GCS URLs (not base64)

3. **Verify in Google Cloud Console**:
   - Open Cloud Storage → Buckets → `theater-canteen-uploads`
   - Navigate to `theater list/[Theater Name]/`
   - See uploaded files

4. **Verify in Database**:
   - Run: `node scripts/verify-theater-documents.js`
   - Documents should show GCS URLs (starting with `https://storage.googleapis.com`)

## Environment Variables

- `GCS_MOCK_MODE=true` - Forces mock mode (base64 URLs) even if GCS is configured
- `GCS_MOCK_MODE=false` or not set - Uses GCS when configured

## Next Steps

1. **Configure GCS** using the Settings page (upload JSON key file)
2. **Create a test theater** with documents
3. **Verify files** appear in Google Cloud Storage bucket
4. **Verify documents** saved with GCS URLs in database

---

**Status**: ✅ Code is ready, GCS configuration needed for production use

