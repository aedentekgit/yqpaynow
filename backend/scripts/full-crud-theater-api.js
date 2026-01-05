/**
 * Full CRUD Theater Test via API (Simulating Frontend)
 * This script performs complete CRUD operations:
 * 1. CREATE - Create a theater with base64 documents via API
 * 2. READ - Read the created theater
 * 3. UPDATE - Update theater information and documents
 * 4. DELETE - Delete the theater and verify cleanup
 * 
 * Usage:
 *   ADMIN_USERNAME=your_username ADMIN_PASSWORD=your_password node backend/scripts/full-crud-theater-api.js
 */

require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const mongoose = require('mongoose');
const { createCanvas } = require('canvas');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in environment variables!');
  console.error('   Please set MONGODB_URI in your .env file');
  console.error('   Expected location: backend/.env');
  process.exit(1);
}
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin111';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin111';

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
  ctx.fillText('GCS Upload Test', width / 2, 140);
  ctx.fillText(new Date().toLocaleString('en-IN'), width / 2, 170);
  ctx.fillText('Uploaded to Google Cloud Storage', width / 2, 200);
  
  const buffer = canvas.toBuffer('image/jpeg');
  const base64 = buffer.toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}

/**
 * Step 1: Login
 */
async function login() {
  try {
    
    const credentials = [
      { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      { username: 'admin', password: 'admin123' },
      { username: 'superadmin', password: 'admin' },
      { username: 'admin', password: 'admin' }
    ];
    
    for (const cred of credentials) {
      try {
        const response = await axios.post(`${API_BASE_URL}/auth/login`, {
          username: cred.username,
          password: cred.password
        });
        
        if (response.data.success && response.data.token) {
          authToken = response.data.token;
          return true;
        }
      } catch (err) {
        continue;
      }
    }
    
    throw new Error('Failed to login with any credentials');
  } catch (error) {
    console.error('❌ Login error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    throw error;
  }
}

/**
 * Step 2: CREATE - Create theater with base64 documents
 */
async function createTheater() {
  try {
    
    // Generate base64 images (simulating frontend)
    const base64Images = {
      theaterPhoto: generateBase64Image('THEATER PHOTO'),
      logo: generateBase64Image('THEATER LOGO'),
      aadharCard: generateBase64Image('AADHAR CARD'),
      panCard: generateBase64Image('PAN CARD'),
      gstCertificate: generateBase64Image('GST CERTIFICATE'),
      fssaiCertificate: generateBase64Image('FSSAI CERTIFICATE'),
      agreementCopy: generateBase64Image('AGREEMENT COPY')
    };
    
    Object.keys(base64Images).forEach(field => {
    });
    
    // Create FormData (frontend sends FormData with base64 in fields)
    const formData = new FormData();
    
    // Basic theater information
    const theaterName = `Test Theater CRUD ${Date.now()}`;
    formData.append('name', theaterName);
    formData.append('username', `test_crud_${Date.now()}`);
    formData.append('password', 'Test@123');
    formData.append('email', `testcrud${Date.now()}@example.com`);
    formData.append('phone', '9876543210');
    formData.append('city', 'Test City');
    formData.append('state', 'Test State');
    formData.append('pincode', '123456');
    formData.append('ownerName', 'Test Owner');
    formData.append('ownerContactNumber', '9876543210');
    formData.append('gstNumber', '29ABCDE1234F1Z5');
    formData.append('fssaiNumber', '12345678901234');
    
    // Add base64 images as form fields (frontend sends them this way)
    Object.keys(base64Images).forEach(fieldName => {
      formData.append(fieldName, base64Images[fieldName]);
    });
    
    
    // Make API request
    const response = await axios.post(`${API_BASE_URL}/theaters`, formData, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        ...formData.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    if (response.data.success) {
      createdTheaterId = response.data.data.id;
      
      // Check documents
      if (response.data.data.documents) {
        Object.keys(response.data.data.documents).forEach(field => {
          const url = response.data.data.documents[field];
          if (url) {
            if (url.startsWith('https://') || url.startsWith('http://')) {
            } else if (url.startsWith('data:')) {
            }
          }
        });
      }
      
      return createdTheaterId;
    } else {
      throw new Error('Theater creation failed: ' + JSON.stringify(response.data));
    }
  } catch (error) {
    console.error('❌ Create error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * Step 3: READ - Read the created theater
 */
async function readTheater() {
  try {
    
    const response = await axios.get(`${API_BASE_URL}/theaters/${createdTheaterId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (response.data.success) {
      const theater = response.data.data;
      
      // Verify documents
      if (theater.documents) {
        let gcsCount = 0;
        let base64Count = 0;
        
        Object.keys(theater.documents).forEach(field => {
          const url = theater.documents[field];
          if (url) {
            if (url.startsWith('https://') || url.startsWith('http://')) {
              gcsCount++;
            } else if (url.startsWith('data:')) {
              base64Count++;
            }
          }
        });
        
      }
      
      return theater;
    } else {
      throw new Error('Theater read failed: ' + JSON.stringify(response.data));
    }
  } catch (error) {
    console.error('❌ Read error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', error.response.data);
    }
    throw error;
  }
}

/**
 * Step 4: UPDATE - Update theater information
 */
async function updateTheater() {
  try {
    
    // Generate new base64 images for update
    const newBase64Images = {
      logo: generateBase64Image('UPDATED LOGO'),
      theaterPhoto: generateBase64Image('UPDATED THEATER PHOTO')
    };
    
    Object.keys(newBase64Images).forEach(field => {
    });
    
    // Create FormData for update
    const formData = new FormData();
    
    // Update theater name
    const updatedName = `Updated Test Theater ${Date.now()}`;
    formData.append('name', updatedName);
    formData.append('phone', '9999999999');
    
    // Add updated base64 images
    Object.keys(newBase64Images).forEach(fieldName => {
      formData.append(fieldName, newBase64Images[fieldName]);
    });
    
    const response = await axios.put(`${API_BASE_URL}/theaters/${createdTheaterId}`, formData, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        ...formData.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    if (response.data.success) {
      
      // Check updated documents
      if (response.data.data.documents) {
        Object.keys(response.data.data.documents).forEach(field => {
          const url = response.data.data.documents[field];
          if (url) {
            if (url.startsWith('https://') || url.startsWith('http://')) {
            } else if (url.startsWith('data:')) {
            }
          }
        });
      }
      
      return response.data.data;
    } else {
      throw new Error('Theater update failed: ' + JSON.stringify(response.data));
    }
  } catch (error) {
    console.error('❌ Update error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', error.response.data);
    }
    throw error;
  }
}

/**
 * Step 5: DELETE - Delete the theater
 */
async function deleteTheater() {
  try {
    
    const response = await axios.delete(`${API_BASE_URL}/theaters/${createdTheaterId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (response.data.success) {
      return true;
    } else {
      throw new Error('Theater deletion failed: ' + JSON.stringify(response.data));
    }
  } catch (error) {
    console.error('❌ Delete error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', error.response.data);
    }
    throw error;
  }
}

/**
 * Step 6: Verify deletion in database
 */
async function verifyDeletion() {
  try {
    
    await mongoose.connect(MONGODB_URI);
    
    const Theater = mongoose.connection.db.collection('theaters');
    const theater = await Theater.findOne({ _id: new mongoose.Types.ObjectId(createdTheaterId) });
    
    if (theater) {
      return false;
    } else {
      return true;
    }
  } catch (error) {
    console.error('❌ Verification error:', error.message);
    return false;
  } finally {
    await mongoose.connection.close();
  }
}

/**
 * Main test function
 */
async function main() {
  try {
    
    // Step 1: Login
    await login();
    
    // Step 2: CREATE
    await createTheater();
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 3: READ
    await readTheater();
    
    // Step 4: UPDATE
    await updateTheater();
    
    // Step 5: DELETE
    await deleteTheater();
    
    // Step 6: VERIFY
    const deleted = await verifyDeletion();
    
    // Final Summary
    
    if (!deleted) {
      process.exit(1);
    }
    
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

