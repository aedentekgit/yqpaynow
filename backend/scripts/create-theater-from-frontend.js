/**
 * Create Theater from Frontend (Simulating Frontend Page)
 * This script simulates creating a theater from http://localhost:3000/add-theater
 * 
 * Credentials:
 * - Username: admin@yqpaynow.com
 * - Password: admin123
 */

const path = require('path');

// Load environment variables - try multiple locations
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();

const axios = require('axios');
const FormData = require('form-data');
const mongoose = require('mongoose');
const Theater = require('../models/Theater');
const { createCanvas } = require('canvas');

const API_BASE_URL = process.env.API_BASE_URL || process.env.BACKEND_URL || 'http://localhost:8080/api';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in environment variables!');
  console.error('   Please set MONGODB_URI in your .env file');
  console.error('   Expected locations:');
  console.error('     - backend/.env');
  console.error('     - .env (project root)');
  console.error('\n   Current working directory:', process.cwd());
  console.error('   Format: MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name');
  console.error('\n   ❌ Only MongoDB Atlas (cloud) connections are allowed!');
  process.exit(1);
}

// Validate: Only MongoDB Atlas connections allowed
if (!MONGODB_URI.startsWith('mongodb+srv://')) {
  console.error('❌ Only MongoDB Atlas (cloud) connections are allowed!');
  console.error('   Connection string MUST start with: mongodb+srv://');
  console.error('   Local MongoDB connections (mongodb://) are NOT supported.');
  process.exit(1);
}

// Reject localhost connections
if (MONGODB_URI.includes('localhost') || MONGODB_URI.includes('127.0.0.1') || MONGODB_URI.includes('0.0.0.0')) {
  console.error('❌ Local MongoDB connections are NOT allowed!');
  console.error('   Please use a MongoDB Atlas connection string.');
  process.exit(1);
}

module.exports.MONGODB_URI = MONGODB_URI;

const ADMIN_USERNAME = 'admin@yqpaynow.com';
const ADMIN_PASSWORD = 'admin123';

let authToken = null;
let createdTheaterId = null;

/**
 * Generate base64 image (simulating frontend file upload)
 */
function generateBase64Image(text, width = 400, height = 300) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Purple gradient background
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#8B5CF6');
  gradient.addColorStop(1, '#6366F1');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // White header
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, 80);
  
  // Purple text on white
  ctx.fillStyle = '#8B5CF6';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, width / 2, 50);
  
  // White text on gradient
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '16px Arial';
  ctx.fillText('Uploaded to Google Cloud Storage', width / 2, 140);
  ctx.fillText(new Date().toLocaleString('en-IN'), width / 2, 170);
  ctx.fillText('Created from Frontend', width / 2, 200);
  
  const buffer = canvas.toBuffer('image/jpeg');
  const base64 = buffer.toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}

/**
 * Step 1: Login as admin
 */
async function login() {
  try {
    
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    });
    
    if (response.data.success && response.data.token) {
      authToken = response.data.token;
      return true;
    } else {
      throw new Error('Login failed: Invalid response');
    }
  } catch (error) {
    console.error('❌ Login error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n⚠️  Connection refused - Is the backend server running?');
      console.error(`   Attempted URL: ${API_BASE_URL}/auth/login`);
      console.error('   Please ensure the backend server is running on:');
      console.error('     - http://localhost:8080 (default)');
      console.error('     - http://localhost:5000 (alternative)');
      console.error('\n   Start the server with: npm start (in backend directory)');
    } else if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('   Error details:', error);
    }
    throw error;
  }
}

/**
 * Step 2: Create theater with documents (simulating frontend form submission)
 */
async function createTheater() {
  try {
    
    // Generate theater data (matching frontend form fields)
    const timestamp = Date.now();
    const theaterData = {
      name: `Frontend Theater ${timestamp}`,
      username: `frontend_theater_${timestamp}`,
      password: 'Test@123',
      email: `frontend${timestamp}@example.com`,
      phone: '9876543210',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
      ownerName: 'Frontend Owner',
      ownerContactNumber: '9876543210',
      gstNumber: '29ABCDE1234F1Z5',
      fssaiNumber: '12345678901234'
    };
    
    
    // Generate base64 images (simulating frontend file uploads)
    const documentFields = {
      theaterPhoto: 'THEATER PHOTO',
      logo: 'THEATER LOGO',
      aadharCard: 'AADHAR CARD',
      panCard: 'PAN CARD',
      gstCertificate: 'GST CERTIFICATE',
      fssaiCertificate: 'FSSAI CERTIFICATE',
      agreementCopy: 'AGREEMENT COPY'
    };
    
    const base64Images = {};
    Object.keys(documentFields).forEach(field => {
      base64Images[field] = generateBase64Image(documentFields[field]);
    });
    
    // Create FormData (matching frontend form submission)
    const formData = new FormData();
    
    // Add all form fields
    Object.keys(theaterData).forEach(key => {
      formData.append(key, theaterData[key]);
    });
    
    // Add base64 images as form fields (frontend sends them this way)
    Object.keys(base64Images).forEach(fieldName => {
      formData.append(fieldName, base64Images[fieldName]);
    });
    
    // Make API request to create theater
    
    const response = await axios.post(`${API_BASE_URL}/theaters`, formData, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        ...formData.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000 // 60 seconds timeout for large file uploads
    });
    
    if (response.data.success) {
      createdTheaterId = response.data.data.id;
      
      // Check documents in response
      if (response.data.data.documents) {
        let gcsCount = 0;
        let base64Count = 0;
        
        Object.keys(response.data.data.documents).forEach(field => {
          const url = response.data.data.documents[field];
          if (url) {
            if (url.startsWith('https://') || url.startsWith('http://')) {
              gcsCount++;
            } else if (url.startsWith('data:')) {
              base64Count++;
            }
          }
        });
        
        
        if (gcsCount > 0 && base64Count === 0) {
        } else if (base64Count > 0) {
        }
      }
      
      return createdTheaterId;
    } else {
      throw new Error('Theater creation failed: ' + JSON.stringify(response.data));
    }
  } catch (error) {
    console.error('\n❌ Create theater error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * Step 3: Verify theater in database
 */
async function verifyTheater() {
  try {
    
    const mongoUri = process.env.MONGODB_URI || MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI is not set!');
      process.exit(1);
    }
    if (!mongoUri.startsWith('mongodb+srv://')) {
      console.error('❌ Only MongoDB Atlas connections are allowed!');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    
    const theater = await Theater.findById(createdTheaterId).lean();
    
    if (!theater) {
      throw new Error('Theater not found in database');
    }
    
    
    // Verify documents
    if (theater.documents) {
      let gcsCount = 0;
      let base64Count = 0;
      let nullCount = 0;
      
      const documentFields = ['theaterPhoto', 'logo', 'aadharCard', 'panCard', 'gstCertificate', 'fssaiCertificate'];
      
      documentFields.forEach(field => {
        const url = theater.documents[field];
        if (!url) {
          nullCount++;
        } else if (url.startsWith('https://') || url.startsWith('http://')) {
          gcsCount++;
        } else if (url.startsWith('data:')) {
          base64Count++;
        } else {
        }
      });
      
      // Check agreement copy
      const agreementCopy = theater.agreementDetails?.copy;
      if (agreementCopy) {
        if (agreementCopy.startsWith('https://') || agreementCopy.startsWith('http://')) {
          gcsCount++;
        } else if (agreementCopy.startsWith('data:')) {
          base64Count++;
        }
      } else {
        nullCount++;
      }
      
      
      if (gcsCount > 0 && base64Count === 0) {
      } else if (base64Count > 0) {
      }
    }
    
    await mongoose.connection.close();
    return theater;
  } catch (error) {
    console.error('\n❌ Verification error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    
    // Step 1: Login
    await login();
    
    // Step 2: Create theater
    await createTheater();
    
    // Wait a bit for GCS upload processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 3: Verify in database
    await verifyTheater();
    
    // Final Summary
    
  } catch (error) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(70));
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    
    try {
      await mongoose.connection.close();
    } catch (closeError) {
      // Ignore
    }
    
    process.exit(1);
  }
}

// Run the test
main();

