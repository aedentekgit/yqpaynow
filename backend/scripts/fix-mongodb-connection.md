# 🔧 MongoDB Atlas Connection Fix Guide

## Quick Fix Steps

### Step 1: Reset Password in MongoDB Atlas
1. Go to [MongoDB Atlas Dashboard](https://cloud.mongodb.com/)
2. Navigate to: **Security** → **Database Access**
3. Find user: `yqpaynow_db_user`
4. Click **"EDIT"** button (pencil icon)
5. Click **"Edit Password"**
6. Choose one:
   - **Option A:** Click **"Autogenerate Secure Password"** (recommended - secure)
   - **Option B:** Set a simple password like: `MySecurePass123!`
7. **IMPORTANT:** Click **"Copy"** button to copy the new password
8. Click **"Update User"** to save

### Step 2: Update Your .env File
1. Open `backend/.env` file
2. Find the line: `MONGODB_URI=...`
3. Replace the password part with the NEW password you just copied
4. **Format:** `mongodb+srv://yqpaynow_db_user:MySecurePass123@cluster0.tawgn4i.mongodb.net/yqpay`
5. **Important:** 
   - No spaces in the connection string
   - If password has special characters, URL-encode them:
     - `@` → `%40`
     - `:` → `%3A`
     - `/` → `%2F`
     - `?` → `%3F`
     - `#` → `%23`
     - `[` → `%5B`
     - `]` → `%5D`
     - `%` → `%25`
6. Save the file

### Step 3: Test the Connection
Run this command:
```bash
cd backend
npm run test:mongodb
```

If you see ✅ SUCCESS, you're done!

### Step 4: Restart Your Server
```bash
cd backend
npm run dev
```

## Example Connection String

**Before (wrong):**
```
MONGODB_URI=mongodb+srv://yqpaynow_db_user:old_password@cluster0.tawgn4i.mongodb.net/yqpay
```

**After (correct):**
```
MONGODB_URI=mongodb+srv://yqpaynow_db_user:NewPassword123@cluster0.tawgn4i.mongodb.net/yqpay
```

## Common Issues

### Issue 1: Password has special characters
If your password is `p@ss:word`, encode it as `p%40ss%3Aword`

### Issue 2: IP not whitelisted
1. Go to: **Security** → **Network Access**
2. Click **"Add IP Address"**
3. Click **"Allow Access from Anywhere"** (for development)
   - OR add your specific IP address
4. Click **"Confirm"**

### Issue 3: User doesn't have permissions
Your user `yqpaynow_db_user` has `atlasAdmin@admin` role, which should work.
If not, follow these steps to set correct permissions:

#### How to Set User Permissions in MongoDB Atlas:

1. **Go to MongoDB Atlas Dashboard**
   - Navigate to: **Security** → **Database Access**
   - Or visit: https://cloud.mongodb.com/ → Your Project → Database Access

2. **Find Your User**
   - Look for `yqpaynow_db_user` in the list
   - Click the **"EDIT"** button (pencil icon) next to the user

3. **Configure Database User Privileges**
   - Scroll down to **"Database User Privileges"** section
   - You'll see **"Built-in Role"** dropdown

4. **Select the Correct Role**
   - Click the **"Built-in Role"** dropdown
   - Choose one of these options:
     - **`atlasAdmin`** (Recommended - Full admin access)
       - Gives full administrative access to all databases
       - Best for development and admin users
     - **`readWriteAnyDatabase`** (Alternative - Read/Write access)
       - Can read and write to any database
       - Good for application users
     - **`readWrite`** (Limited - Specific database only)
       - Only works on a specific database
       - Select this if you want to restrict access

5. **Set Database (if using readWrite)**
   - If you selected `readWrite`, you need to specify the database
   - In the **"Database"** field, enter: `yqpay` (or `admin` for admin database)
   - Or select from the dropdown if available

6. **Save Changes**
   - Click **"Update User"** button at the bottom
   - Wait for confirmation message

#### Recommended Configuration:
- **Built-in Role:** `atlasAdmin`
- **Database:** `admin` (automatically set with atlasAdmin)
- **Resources:** All Resources (automatically set)

#### For Your Current Setup:
Since you're using database `yqpay`, you can use:
- **Option A (Recommended):** `atlasAdmin@admin` - Works for all databases
- **Option B:** `readWriteAnyDatabase@admin` - Read/write to all databases
- **Option C:** `readWrite@yqpay` - Only access to `yqpay` database

**Note:** The `@admin` or `@yqpay` part indicates which database the role applies to. `atlasAdmin@admin` means admin role on the admin database, which gives access to all databases.

## Still Having Issues?

Run the diagnostic script:
```bash
cd backend
npm run test:mongodb
```

This will show you exactly what's wrong!

