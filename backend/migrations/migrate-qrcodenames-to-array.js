const mongoose = require('mongoose');

// Define schemas directly to avoid model conflicts
const qrCodeNameOldSchema = new mongoose.Schema({
  qrName: String,
  seatClass: String,
  description: String,
  isActive: { type: Boolean, default: true },
  theater: { type: mongoose.Schema.Types.ObjectId, ref: 'Theater' }
}, { timestamps: true, collection: 'qrcodenames' });

const qrCodeNameNewSchema = new mongoose.Schema({
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: true,
    unique: true
  },
  qrNameList: [{
    qrName: String,
    seatClass: String,
    description: String,
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }],
  metadata: {
    totalQRNames: { type: Number, default: 0 },
    activeQRNames: { type: Number, default: 0 },
    inactiveQRNames: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  }
}, { timestamps: true, collection: 'qrcodenames' });

// Connect to MongoDB - require environment variable
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const MONGODB_URI = process.env.MONGODB_URI?.trim();
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in environment variables!');
  console.error('   Please set MONGODB_URI in backend/.env file');
  process.exit(1);
}

async function migrateQRCodeNames() {
  try {
    await mongoose.connect(MONGODB_URI);
    // Create models for migration
    const QRCodeNameOld = mongoose.model('QRCodeNameOld', qrCodeNameOldSchema);
    
    // First, backup existing data by renaming collection
    const collections = await mongoose.connection.db.listCollections({ name: 'qrcodenames' }).toArray();
    if (collections.length > 0) {
      await mongoose.connection.db.collection('qrcodenames').rename('qrcodenames_backup_' + Date.now());
    }

    // Create new collection with array structure
    const QRCodeNameNew = mongoose.model('QRCodeNameNew', qrCodeNameNewSchema);

    // Get all existing QR code names from backup
    const backupCollections = await mongoose.connection.db.listCollections().toArray();
    const backupCollection = backupCollections.find(col => col.name.startsWith('qrcodenames_backup_'));
    
    if (!backupCollection) {
      return;
    }

    const oldQRNames = await mongoose.connection.db.collection(backupCollection.name).find({}).toArray();
    // Group by theater
    const theaterGroups = {};
    oldQRNames.forEach(qrName => {
      const theaterId = qrName.theater ? qrName.theater.toString() : 'global';
      if (!theaterGroups[theaterId]) {
        theaterGroups[theaterId] = [];
      }
      theaterGroups[theaterId].push(qrName);
    });

    let migratedCount = 0;
    let errorCount = 0;

    // Process each theater group
    for (const [theaterId, qrNames] of Object.entries(theaterGroups)) {
      try {
        // Skip global QR names (no theater assigned)
        if (theaterId === 'global') {

          continue;
        }

        // Create new array-based document
        const qrNameList = qrNames.map(qr => ({
          qrName: qr.qrName,
          seatClass: qr.seatClass,
          description: qr.description || '',
          isActive: qr.isActive !== false, // Default to true if undefined
          sortOrder: 0,
          createdAt: qr.createdAt || new Date(),
          updatedAt: qr.updatedAt || new Date()
        }));

        const newDoc = new QRCodeNameNew({
          theater: new mongoose.Types.ObjectId(theaterId),
          qrNameList: qrNameList,
          metadata: {
            totalQRNames: qrNameList.length,
            activeQRNames: qrNameList.filter(qr => qr.isActive).length,
            inactiveQRNames: qrNameList.filter(qr => !qr.isActive).length,
            lastUpdated: new Date()
          }
        });

        await newDoc.save();
        migratedCount += qrNames.length;
        // List the migrated QR names
        qrNameList.forEach((qr, index) => {

        });

      } catch (error) {
        errorCount++;
        console.error(`❌ Error processing theater ${theaterId}:`, error.message);
      }
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateQRCodeNames();
}

module.exports = { migrateQRCodeNames };