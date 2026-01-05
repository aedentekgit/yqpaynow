const mongoose = require('mongoose');

// Define schemas directly to avoid model conflicts
const roleOldSchema = new mongoose.Schema({
  name: String,
  description: String,
  theater: { type: mongoose.Schema.Types.ObjectId, ref: 'Theater' },
  permissions: [{
    page: String,
    pageName: String,
    hasAccess: { type: Boolean, default: false },
    route: String
  }],
  isGlobal: { type: Boolean, default: false },
  priority: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  normalizedName: String,
  isDefault: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: true },
  canEdit: { type: Boolean, default: true }
}, { timestamps: true, collection: 'roles' });

const roleNewSchema = new mongoose.Schema({
  theater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theater',
    required: true,
    unique: true
  },
  roleList: [{
    name: String,
    description: String,
    permissions: [{
      page: String,
      pageName: String,
      hasAccess: { type: Boolean, default: false },
      route: String
    }],
    isGlobal: { type: Boolean, default: false },
    priority: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    normalizedName: String,
    isDefault: { type: Boolean, default: false },
    canDelete: { type: Boolean, default: true },
    canEdit: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }],
  metadata: {
    totalRoles: { type: Number, default: 0 },
    activeRoles: { type: Number, default: 0 },
    inactiveRoles: { type: Number, default: 0 },
    defaultRoles: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  }
}, { timestamps: true, collection: 'roles' });

// Connect to MongoDB - require environment variable
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const MONGODB_URI = process.env.MONGODB_URI?.trim();
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in environment variables!');
  console.error('   Please set MONGODB_URI in backend/.env file');
  process.exit(1);
}

async function migrateRoles() {
  try {
    await mongoose.connect(MONGODB_URI);
    // Create models for migration
    const RoleOld = mongoose.model('RoleOld', roleOldSchema);
    
    // First, backup existing data by renaming collection
    const collections = await mongoose.connection.db.listCollections({ name: 'roles' }).toArray();
    let backupName = null;
    
    if (collections.length > 0) {
      backupName = `roles_backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
      await mongoose.connection.db.collection('roles').aggregate([
        { $out: backupName }
      ]).toArray();
    }

    // Read old role documents directly from the roles collection
    const oldRoles = await mongoose.connection.db.collection('roles').find({}).toArray();
    if (oldRoles.length === 0) {
      // Check if collection exists
      const collections = await mongoose.connection.db.listCollections({ name: 'roles' }).toArray();
      if (collections.length === 0) {
      } else {
      }
      return;
    }

    // Group roles by theater
    const rolesByTheater = {};
    
    oldRoles.forEach(role => {
      const theaterId = role.theater.toString();
      if (!rolesByTheater[theaterId]) {
        rolesByTheater[theaterId] = [];
      }
      rolesByTheater[theaterId].push(role);
    });

    // Create new collection with array structure
    const RoleNew = mongoose.model('RoleNew', roleNewSchema);
    
    let totalConverted = 0;
    
    for (const [theaterId, theaterRoles] of Object.entries(rolesByTheater)) {

      // Convert roles to array format
      const roleList = theaterRoles.map((role, index) => ({
        name: role.name,
        description: role.description || '',
        permissions: role.permissions || [],
        isGlobal: role.isGlobal || false,
        priority: role.priority || 1,
        isActive: role.isActive !== undefined ? role.isActive : true,
        normalizedName: role.normalizedName || role.name?.toLowerCase().trim(),
        isDefault: role.isDefault || false,
        canDelete: role.canDelete !== undefined ? role.canDelete : true,
        canEdit: role.canEdit !== undefined ? role.canEdit : true,
        sortOrder: index,
        createdAt: role.createdAt || new Date(),
        updatedAt: role.updatedAt || new Date()
      }));

      // Calculate metadata
      const totalRoles = roleList.length;
      const activeRoles = roleList.filter(role => role.isActive).length;
      const inactiveRoles = totalRoles - activeRoles;
      const defaultRoles = roleList.filter(role => role.isDefault).length;

      // Create new theater-wise document directly in roles collection
      const newRoleDoc = {
        theater: new mongoose.Types.ObjectId(theaterId),
        roleList,
        metadata: {
          totalRoles,
          activeRoles,
          inactiveRoles,
          defaultRoles,
          lastUpdated: new Date()
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Insert directly into the roles collection
      await mongoose.connection.db.collection('roles').insertOne(newRoleDoc);
      totalConverted += theaterRoles.length;
    }

    // Verify the migration
    const newCount = await mongoose.connection.db.collection('roles').countDocuments();
    const totalRolesInArrays = await mongoose.connection.db.collection('roles').aggregate([
      { $project: { totalRoles: '$metadata.totalRoles' } },
      { $group: { _id: null, total: { $sum: '$totalRoles' } } }
    ]).toArray();
    if (totalRolesInArrays[0]?.total === oldRoles.length) {
    } else {
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// Rollback function to restore original structure
async function rollbackRoles() {
  try {
    await mongoose.connect(MONGODB_URI);
    // Find the most recent backup
    const collections = await mongoose.connection.db.listCollections().toArray();
    const backupCollections = collections.filter(col => col.name.startsWith('roles_backup_'));
    
    if (backupCollections.length === 0) {
      return;
    }

    // Get the most recent backup (last one alphabetically due to timestamp format)
    const latestBackup = backupCollections.sort((a, b) => b.name.localeCompare(a.name))[0];
    // Drop current roles collection
    await mongoose.connection.db.collection('roles').drop();
    // Restore from backup
    await mongoose.connection.db.collection(latestBackup.name).aggregate([
      { $out: 'roles' }
    ]).toArray();

    const restoredCount = await mongoose.connection.db.collection('roles').countDocuments();
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// Command line interface
const command = process.argv[2];

if (command === 'migrate') {
  migrateRoles().catch(console.error);
} else if (command === 'rollback') {
  rollbackRoles().catch(console.error);
} else {
}