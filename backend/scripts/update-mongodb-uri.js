/**
 * Helper script to update MONGODB_URI in .env file
 * Usage: node scripts/update-mongodb-uri.js <new_password>
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// URL encode special characters in password
function encodePassword(password) {
  return encodeURIComponent(password);
}

// Get new password from command line or prompt
const newPassword = process.argv[2];

if (newPassword) {
  updateConnectionString(newPassword);
} else {
  rl.question('🔐 Enter the NEW password from MongoDB Atlas: ', (password) => {
    updateConnectionString(password);
    rl.close();
  });
}

function updateConnectionString(newPassword) {
  const envPath = path.join(__dirname, '..', '.env');
  
  // Check if .env file exists
  if (!fs.existsSync(envPath)) {
    console.error('❌ Error: .env file not found at:', envPath);
    console.error('   Please create backend/.env file first');
    process.exit(1);
  }

  // Read .env file
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Connection string template
  const username = 'yqpaynow_db_user';
  const cluster = 'cluster0.tawgn4i.mongodb.net';
  const database = 'yqpay';
  
  // Encode password if it contains special characters
  const encodedPassword = encodePassword(newPassword);
  
  // Build new connection string
  const newConnectionString = `mongodb+srv://${username}:${encodedPassword}@${cluster}/${database}`;
  
  // Check if MONGODB_URI exists in .env
  if (envContent.includes('MONGODB_URI=')) {
    // Replace existing MONGODB_URI
    const regex = /MONGODB_URI=.*/;
    envContent = envContent.replace(regex, `MONGODB_URI=${newConnectionString}`);
  } else {
    // Add new MONGODB_URI
    envContent += `\nMONGODB_URI=${newConnectionString}\n`;
  }
  
  // Write back to .env file
  fs.writeFileSync(envPath, envContent, 'utf8');
  
  
  if (newPassword !== encodedPassword) {
  }
}

