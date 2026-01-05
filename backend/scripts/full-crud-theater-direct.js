/**
 * Full CRUD Theater Test - Direct Database (No Authentication Required)
 * This script performs complete CRUD operations directly:
 * 1. CREATE - Create a theater with base64 documents
 * 2. READ - Read the created theater
 * 3. UPDATE - Update theater information and documents
 * 4. DELETE - Delete the theater
 * 5. VERIFY - Verify all operations and GCS uploads
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Theater = require('../models/Theater');
const { uploadFiles, deleteFiles } = require('../utils/vpsUploadUtil');
const { createCanvas } = require('canvas');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in environment variables!');
  console.error('   Please set MONGODB_URI in your .env file');
  console.error('   Expected location: backend/.env');
  process.exit(1);
}

let createdTheaterId = null;
let createdGCSUrls = {};

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
 * Convert base64 to file object (simulating TheaterController logic)
 */
function convertBase64ToFile(base64String, fieldName) {
  if (!base64String || typeof base64String !== 'string' || !base64String.startsWith('data:')) {
    return null;
  }

  // Parse base64 data URL
  const matches = base64String.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    console.warn(`⚠️  Invalid base64 format for ${fieldName}, skipping`);
    return null;
  }

  const mimetype = matches[1];
  const base64Data = matches[2];

  // Convert base64 to buffer
  const fileBuffer = Buffer.from(base64Data, 'base64');

  // Determine file extension from mimetype
  let ext = '.jpg';
  if (mimetype.includes('png')) ext = '.png';
  else if (mimetype.includes('jpeg') || mimetype.includes('jpg')) ext = '.jpg';
  else if (mimetype.includes('gif')) ext = '.gif';
  else if (mimetype.includes('pdf')) ext = '.pdf';
  else if (mimetype.includes('webp')) ext = '.webp';

  // Generate filename
  const filename = `${fieldName}${ext}`;

  return {
    fieldname: fieldName,
    originalname: filename,
    mimetype: mimetype,
    size: fileBuffer.length,
    buffer: fileBuffer
  };
}

/**
 * Step 1: CREATE - Create theater with base64 documents
 */
async function createTheater() {
  try {

    // Generate base64 images (simulating frontend)
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

    // Convert base64 to file objects (TheaterController logic)
    const files = [];
    Object.keys(base64Images).forEach(fieldName => {
      const fileObj = convertBase64ToFile(base64Images[fieldName], fieldName);
      if (fileObj) {
        files.push(fileObj);
      }
    });

    // Upload files to GCS (TheaterController logic)
    const theaterName = `Test Theater CRUD ${Date.now()}`;
    const sanitizedTheaterName = theaterName.trim().replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, ' ');
    const theaterFolder = `theater list/${sanitizedTheaterName}`;

    const fileUrls = await uploadFiles(files, theaterFolder);
    createdGCSUrls = fileUrls;

    let gcsCount = 0;
    let base64Count = 0;
    Object.keys(fileUrls).forEach(field => {
      const url = fileUrls[field];
      if (url.startsWith('https://') || url.startsWith('http://')) {
        gcsCount++;
      } else if (url.startsWith('data:')) {
        base64Count++;
      }
    });

    // Create theater in database (TheaterService logic)
    const hashedPassword = await bcrypt.hash('Test@123', 12);

    // Prepare documents object
    const documents = {
      theaterPhoto: fileUrls.theaterPhoto || null,
      logo: fileUrls.logo || null,
      aadharCard: fileUrls.aadharCard || null,
      panCard: fileUrls.panCard || null,
      gstCertificate: fileUrls.gstCertificate || null,
      fssaiCertificate: fileUrls.fssaiCertificate || null,
      agreementCopy: fileUrls.agreementCopy || null
    };

    // Prepare agreement details
    const agreementDetails = {
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      copy: fileUrls.agreementCopy || null
    };

    // Prepare branding
    const branding = {
      primaryColor: '#8B5CF6',
      secondaryColor: '#F3F4F6',
      logo: fileUrls.logo || null,
      logoUrl: fileUrls.logo || null
    };

    const theaterData = {
      name: theaterName,
      username: `test_crud_${Date.now()}`,
      password: hashedPassword,
      email: `testcrud${Date.now()}@example.com`,
      phone: '9876543210',
      address: {
        street: '123 Test Street',
        city: 'Test City',
        state: 'Test State',
        pincode: '123456'
      },
      location: {
        city: 'Test City',
        state: 'Test State',
        country: 'India'
      },
      ownerDetails: {
        name: 'Test Owner',
        contactNumber: '9876543210',
        personalAddress: 'Test Address'
      },
      agreementDetails: agreementDetails,
      socialMedia: {
        facebook: null,
        instagram: null,
        twitter: null,
        youtube: null,
        website: null
      },
      gstNumber: '29ABCDE1234F1Z5',
      fssaiNumber: '12345678901234',
      settings: {
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        language: 'en'
      },
      branding: branding,
      documents: documents,
      isActive: true,
      status: 'active'
    };

    const theater = new Theater(theaterData);
    const savedTheater = await theater.save();
    createdTheaterId = savedTheater._id;


    return savedTheater;
  } catch (error) {
    console.error('❌ Create error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    throw error;
  }
}

/**
 * Step 2: READ - Read the created theater
 */
async function readTheater() {
  try {

    const theater = await Theater.findById(createdTheaterId).lean();

    if (!theater) {
      throw new Error('Theater not found');
    }


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
          } else {
          }
        } else {
        }
      });


      if (gcsCount > 0 && base64Count === 0) {
      } else if (base64Count > 0) {
      }
    }

    return theater;
  } catch (error) {
    console.error('❌ Read error:', error.message);
    throw error;
  }
}

/**
 * Step 3: UPDATE - Update theater information
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

    // Convert base64 to files
    const files = [];
    Object.keys(newBase64Images).forEach(fieldName => {
      const fileObj = convertBase64ToFile(newBase64Images[fieldName], fieldName);
      if (fileObj) {
        files.push(fileObj);
      }
    });

    // Upload updated files to GCS
    const theater = await Theater.findById(createdTheaterId);
    const sanitizedTheaterName = theater.name.trim().replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, ' ');
    const theaterFolder = `theater list/${sanitizedTheaterName}`;

    const updatedFileUrls = await uploadFiles(files, theaterFolder);

    Object.keys(updatedFileUrls).forEach(field => {
      const url = updatedFileUrls[field];
      if (url.startsWith('https://') || url.startsWith('http://')) {
      }
    });

    // Update theater in database
    const updatedName = `Updated Test Theater ${Date.now()}`;

    // Update documents with new URLs
    if (updatedFileUrls.logo) {
      theater.documents.logo = updatedFileUrls.logo;
      theater.branding.logo = updatedFileUrls.logo;
      theater.branding.logoUrl = updatedFileUrls.logo;
    }
    if (updatedFileUrls.theaterPhoto) {
      theater.documents.theaterPhoto = updatedFileUrls.theaterPhoto;
    }

    // Update other fields
    theater.name = updatedName;
    theater.phone = '9999999999';
    theater.updatedAt = new Date();

    const updatedTheater = await theater.save();


    return updatedTheater;
  } catch (error) {
    console.error('❌ Update error:', error.message);
    throw error;
  }
}

/**
 * Step 4: DELETE - Delete the theater
 */
async function deleteTheater() {
  try {

    // Get theater to collect GCS URLs for cleanup
    const theater = await Theater.findById(createdTheaterId).lean();
    const gcsUrlsToDelete = [];

    if (theater && theater.documents) {
      Object.values(theater.documents).forEach(url => {
        if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
          gcsUrlsToDelete.push(url);
        }
      });

      if (theater.agreementDetails && theater.agreementDetails.copy &&
        (theater.agreementDetails.copy.startsWith('https://') || theater.agreementDetails.copy.startsWith('http://'))) {
        gcsUrlsToDelete.push(theater.agreementDetails.copy);
      }
    }

    // Delete theater from database
    const result = await Theater.findByIdAndDelete(createdTheaterId);

    if (result) {

      // Delete GCS files
      if (gcsUrlsToDelete.length > 0) {
        const deletedCount = await deleteFiles(gcsUrlsToDelete);
      }

      return true;
    } else {
      throw new Error('Theater not found for deletion');
    }
  } catch (error) {
    console.error('❌ Delete error:', error.message);
    throw error;
  }
}

/**
 * Step 5: VERIFY - Verify deletion
 */
async function verifyDeletion() {
  try {

    const theater = await Theater.findById(createdTheaterId);

    if (theater) {
      return false;
    } else {
      return true;
    }
  } catch (error) {
    console.error('❌ Verification error:', error.message);
    return false;
  }
}

/**
 * Main test function
 */
async function main() {
  try {

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);

    // Step 1: CREATE
    await createTheater();

    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: READ
    await readTheater();

    // Step 3: UPDATE
    await updateTheater();

    // Step 4: DELETE
    await deleteTheater();

    // Step 5: VERIFY
    const deleted = await verifyDeletion();

    // Final Summary
    console.log(deleted ? '✅ VERIFY: Success' : '⚠️  VERIFY: Failed');

    // Close connection
    await mongoose.connection.close();

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

