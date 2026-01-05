const mongoose = require('mongoose');
const TheaterUserModel = require('../models/Theater');
const TheaterUserArray = require('../models/TheaterUserArray');
const Theater = require('../models/Theater');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
class TheaterUserMigration {
  constructor() {
    this.backupDir = path.join(__dirname, '../backups');
    this.logFile = path.join(__dirname, '../logs/migration.log');
    this.stats = {
      totalUsers: 0,
      migratedUsers: 0,
      failedUsers: 0,
      totalTheaters: 0,
      processedTheaters: 0,
      startTime: null,
      endTime: null
    };
  }

  /**
   * Log migration events
   */
  async log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    try {
      await fs.appendFile(this.logFile, logEntry);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Create backup of current theater users
   */
  async createBackup() {
    try {
      await this.log('Starting backup creation...');

      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });

      // Get all theater users
      const allUsers = await TheaterUserModel.find({}).lean();
      
      const backupData = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        totalUsers: allUsers.length,
        users: allUsers
      };

      const backupFileName = `theater_users_backup_${Date.now()}.json`;
      const backupPath = path.join(this.backupDir, backupFileName);

      await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
      
      await this.log(`✅ Backup created: ${backupFileName} (${allUsers.length} users)`);
      return backupPath;

    } catch (error) {
      await this.log(`❌ Backup creation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Verify database connectivity and models
   */
  async verifySetup() {
    try {
      await this.log('Verifying database setup...');

      // Check MongoDB connection
      if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB connection not established');
      }

      // Verify collections exist
      const collections = await mongoose.connection.db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);

      const requiredCollections = ['theaterusers', 'theaters'];
      for (const collection of requiredCollections) {
        if (!collectionNames.includes(collection)) {
          await this.log(`⚠️ Collection '${collection}' not found`, 'warn');
        }
      }

      // Count existing data
      const userCount = await TheaterUserModel.countDocuments();
      const theaterCount = await Theater.countDocuments();

      await this.log(`Found ${userCount} theater users across ${theaterCount} theaters`);
      
      this.stats.totalUsers = userCount;
      this.stats.totalTheaters = theaterCount;

      return true;

    } catch (error) {
      await this.log(`❌ Setup verification failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Migrate users for a specific theater
   */
  async migrateTheaterUsers(theaterId) {
    try {
      await this.log(`Processing theater: ${theaterId}`);

      // Get all users for this theater
      const theaterUsers = await TheaterUserModel.find({ theater: theaterId }).lean();
      
      if (theaterUsers.length === 0) {
        await this.log(`No users found for theater ${theaterId}`);
        return { success: true, migratedCount: 0 };
      }

      // Find or create theater user array document
      let usersDoc = await TheaterUserArray.findOne({ theater: theaterId });
      
      if (!usersDoc) {
        usersDoc = new TheaterUserArray({
          theater: theaterId,
          userList: [],
          metadata: {
            totalUsers: 0,
            activeUsers: 0,
            lastUpdated: new Date(),
            createdBy: 'migration-script'
          }
        });
      }

      let migratedCount = 0;

      for (const user of theaterUsers) {
        try {
          // Check if user already exists in array
          const existingUser = usersDoc.userList.find(u => u.username === user.username || u.email === user.email);
          
          if (existingUser) {
            await this.log(`User ${user.username} already exists in array, skipping`);
            continue;
          }

          // Add user to array
          const newUser = {
            username: user.username,
            email: user.email,
            password: user.password,
            fullName: user.fullName || user.username,
            phoneNumber: user.phoneNumber || '',
            role: user.role || null,
            permissions: user.permissions || {},
            isActive: user.isActive !== false,
            isEmailVerified: user.isEmailVerified || false,
            profileImage: user.profileImage || null,
            lastLogin: user.lastLogin || null,
            createdAt: user.createdAt || new Date(),
            updatedAt: user.updatedAt || new Date(),
            createdBy: user.createdBy || 'migration'
          };

          usersDoc.userList.push(newUser);
          migratedCount++;
          this.stats.migratedUsers++;

          await this.log(`✅ Migrated user: ${user.username}`);

        } catch (userError) {
          await this.log(`❌ Failed to migrate user ${user.username}: ${userError.message}`, 'error');
          this.stats.failedUsers++;
        }
      }

      // Update metadata
      usersDoc.metadata.totalUsers = usersDoc.userList.length;
      usersDoc.metadata.activeUsers = usersDoc.userList.filter(u => u.isActive).length;
      usersDoc.metadata.lastUpdated = new Date();

      // Save the document
      await usersDoc.save();
      
      await this.log(`✅ Theater ${theaterId} migration completed: ${migratedCount} users migrated`);
      this.stats.processedTheaters++;

      return { success: true, migratedCount };

    } catch (error) {
      await this.log(`❌ Theater ${theaterId} migration failed: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Run full migration process
   */
  async migrate(options = {}) {
    const {
      createBackup = true,
      dryRun = false,
      specificTheaterId = null
    } = options;

    this.stats.startTime = new Date();

    try {
      await this.log('🚀 Starting theater user migration...');
      
      // Setup verification
      await this.verifySetup();

      // Create backup
      let backupPath = null;
      if (createBackup && !dryRun) {
        backupPath = await this.createBackup();
      }

      // Get theaters to process
      let theaterIds;
      if (specificTheaterId) {
        theaterIds = [specificTheaterId];
      } else {
        const theaters = await Theater.find({}, '_id').lean();
        theaterIds = theaters.map(t => t._id.toString());
      }

      await this.log(`Processing ${theaterIds.length} theaters...`);

      // Process each theater
      for (const theaterId of theaterIds) {
        if (dryRun) {
          await this.log(`[DRY RUN] Would process theater: ${theaterId}`);
          continue;
        }

        await this.migrateTheaterUsers(theaterId);
      }

      this.stats.endTime = new Date();
      const duration = this.stats.endTime - this.stats.startTime;

      await this.log('📊 Migration Summary:');
      await this.log(`   Total Users: ${this.stats.totalUsers}`);
      await this.log(`   Migrated Users: ${this.stats.migratedUsers}`);
      await this.log(`   Failed Users: ${this.stats.failedUsers}`);
      await this.log(`   Processed Theaters: ${this.stats.processedTheaters}/${this.stats.totalTheaters}`);
      await this.log(`   Duration: ${Math.round(duration / 1000)}s`);
      
      if (backupPath) {
        await this.log(`   Backup: ${backupPath}`);
      }

      const success = this.stats.failedUsers === 0;
      await this.log(success ? '✅ Migration completed successfully!' : '⚠️ Migration completed with errors');

      return {
        success,
        stats: this.stats,
        backupPath
      };

    } catch (error) {
      await this.log(`❌ Migration failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Rollback migration using backup
   */
  async rollback(backupPath) {
    try {
      await this.log(`🔄 Starting rollback from: ${backupPath}`);

      // Read backup file
      const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));
      
      await this.log(`Backup contains ${backupData.totalUsers} users`);

      // Clear existing array documents
      await TheaterUserArray.deleteMany({});
      await this.log('Cleared existing theater user arrays');

      // Restore individual documents
      if (backupData.users && backupData.users.length > 0) {
        await TheaterUserModel.insertMany(backupData.users);
        await this.log(`✅ Restored ${backupData.users.length} individual user documents`);
      }

      await this.log('✅ Rollback completed successfully');

    } catch (error) {
      await this.log(`❌ Rollback failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Verify migration integrity
   */
  async verifyMigration() {
    try {
      await this.log('🔍 Verifying migration integrity...');

      const originalCount = await TheaterUserModel.countDocuments();
      const migratedArrays = await TheaterUserArray.find({});
      
      let totalMigratedUsers = 0;
      for (const array of migratedArrays) {
        totalMigratedUsers += array.userList.length;
      }

      await this.log(`Original users: ${originalCount}`);
      await this.log(`Migrated users: ${totalMigratedUsers}`);
      
      const integrityCheck = originalCount === totalMigratedUsers;
      
      if (integrityCheck) {
        await this.log('✅ Migration integrity verified');
      } else {
        await this.log('❌ Migration integrity check failed', 'error');
      }

      return {
        originalCount,
        migratedCount: totalMigratedUsers,
        integrityCheck
      };

    } catch (error) {
      await this.log(`❌ Verification failed: ${error.message}`, 'error');
      throw error;
    }
  }
}

// CLI execution
if (require.main === module) {
  const migration = new TheaterUserMigration();
  
  const command = process.argv[2];
  const options = {};

  // Parse command line arguments
  if (process.argv.includes('--dry-run')) options.dryRun = true;
  if (process.argv.includes('--no-backup')) options.createBackup = false;
  
  const theaterIdIndex = process.argv.indexOf('--theater');
  if (theaterIdIndex !== -1 && process.argv[theaterIdIndex + 1]) {
    options.specificTheaterId = process.argv[theaterIdIndex + 1];
  }

  async function run() {
    try {
      // Connect to MongoDB - require environment variable
      if (!mongoose.connection.readyState) {
        const MONGODB_URI = process.env.MONGODB_URI?.trim();
        if (!MONGODB_URI) {
          console.error('❌ MONGODB_URI is not set in environment variables!');
          console.error('   Please set MONGODB_URI in backend/.env file');
          process.exit(1);
        }
        await mongoose.connect(MONGODB_URI, {
          serverSelectionTimeoutMS: 30000,
          socketTimeoutMS: 120000,
          connectTimeoutMS: 30000,
        });
      }

      switch (command) {
        case 'migrate':
          await migration.migrate(options);
          break;
          
        case 'verify':
          await migration.verifyMigration();
          break;
          
        case 'rollback':
          const backupPath = process.argv[3];
          if (!backupPath) {
            console.error('Please provide backup file path');
            process.exit(1);
          }
          await migration.rollback(backupPath);
          break;
          
        default:
          process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
  }

  run();
}

module.exports = TheaterUserMigration;