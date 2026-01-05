#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

// Configuration based on your Google Cloud project
const config = {
  projectId: 'fit-galaxy-472209-s4',
  bucketName: 'theater-canteen-storage',
  region: 'us-central1',
  keyFilename: './config/gcs-service-account.json'
};

class TheaterCanteenGCSSetup {
  constructor() {
    this.config = config;
    this.keyPath = path.join(__dirname, this.config.keyFilename);
  }

  async checkPrerequisites() {
    console.log('🔍 Checking prerequisites...\n');
    
    // Check if key file exists
    try {
      await fs.promises.access(this.keyPath);
      console.log('✅ Service account key file found');
    } catch (error) {
      console.log('❌ Service account key file not found');
      console.log(`   Expected location: ${this.keyPath}`);
      console.log('   Please download your service account key from Google Cloud Console');
      console.log('   and save it as gcs-service-account.json in the config folder\n');
      return false;
    }

    // Validate JSON structure
    try {
      const keyData = JSON.parse(await fs.promises.readFile(this.keyPath, 'utf8'));
      if (keyData.type === 'service_account' && keyData.project_id) {
        console.log('✅ Service account key file is valid');
        console.log(`   Project ID in key: ${keyData.project_id}`);
        
        if (keyData.project_id !== this.config.projectId) {
          console.log(`⚠️  Warning: Project ID mismatch!`);
          console.log(`   Key file project: ${keyData.project_id}`);
          console.log(`   Expected project: ${this.config.projectId}`);
        }
      } else {
        console.log('❌ Invalid service account key file format');
        return false;
      }
    } catch (error) {
      console.log('❌ Failed to parse service account key file');
      console.log(`   Error: ${error.message}`);
      return false;
    }

    return true;
  }

  async setupGoogleCloudStorage() {
    console.log('\n🚀 Setting up Google Cloud Storage...\n');
    
    try {
      // Initialize storage client
      const storage = new Storage({
        projectId: this.config.projectId,
        keyFilename: this.keyPath
      });

      // Test authentication
      console.log('🔐 Testing authentication...');
      await storage.getProjectId();
      console.log('✅ Authentication successful');

      // Check/create bucket
      console.log('\n🪣 Setting up storage bucket...');
      const bucket = storage.bucket(this.config.bucketName);
      const [exists] = await bucket.exists();

      if (!exists) {
        console.log(`   Creating bucket: ${this.config.bucketName}`);
        const [newBucket] = await storage.createBucket(this.config.bucketName, {
          location: this.config.region,
          storageClass: 'STANDARD',
          uniformBucketLevelAccess: true
        });
        console.log(`✅ Bucket created: ${newBucket.name}`);
      } else {
        console.log(`✅ Bucket exists: ${this.config.bucketName}`);
      }

      // Test bucket operations
      console.log('\n🧪 Testing bucket operations...');
      
      // Upload test file
      const testFileName = 'setup-test.txt';
      const testContent = `Theater Canteen Setup Test\nTimestamp: ${new Date().toISOString()}\nProject: ${this.config.projectId}`;
      
      console.log('   Uploading test file...');
      const file = bucket.file(testFileName);
      await file.save(testContent, {
        metadata: {
          contentType: 'text/plain',
          metadata: {
            purpose: 'setup-test',
            createdBy: 'theater-canteen-setup'
          }
        }
      });
      console.log('✅ File upload successful');

      // Download test file
      console.log('   Downloading test file...');
      const [contents] = await file.download();
      console.log('✅ File download successful');

      // Delete test file
      console.log('   Cleaning up test file...');
      await file.delete();
      console.log('✅ File deletion successful');

      // Create folder structure
      console.log('\n📁 Creating folder structure...');
      const folders = [
        'menu-images/beverages/',
        'menu-images/snacks/',
        'menu-images/meals/',
        'user-uploads/profile-pictures/',
        'user-uploads/order-receipts/',
        'qr-codes/table-qr/',
        'qr-codes/menu-qr/',
        'system-backups/database/',
        'system-backups/configs/'
      ];

      for (const folder of folders) {
        const placeholderFile = bucket.file(`${folder}.gitkeep`);
        await placeholderFile.save('', {
          metadata: {
            contentType: 'text/plain',
            metadata: {
              purpose: 'folder-placeholder'
            }
          }
        });
        console.log(`   ✅ Created: ${folder}`);
      }

      console.log('\n🎉 Google Cloud Storage setup completed successfully!');
      
      // Display configuration summary
      console.log('\n📋 Configuration Summary:');
      console.log('='`50`);
      console.log(`Project ID: ${this.config.projectId}`);
      console.log(`Bucket Name: ${this.config.bucketName}`);
      console.log(`Region: ${this.config.region}`);
      console.log(`Key File: ${this.config.keyFilename}`);
      console.log('\n🔗 Next Steps:');
      console.log('1. Open Theater Canteen Settings: http://localhost:3001/settings');
      console.log('2. Go to Google Cloud Storage tab');
      console.log('3. Enter the configuration details above');
      console.log('4. Click "Test Connection" to verify');

      return true;

    } catch (error) {
      console.error('\n❌ Setup failed:', error.message);
      
      if (error.code === 403) {
        console.log('\n💡 Possible solutions:');
        console.log('- Check if Cloud Storage API is enabled');
        console.log('- Verify service account has Storage Admin role');
        console.log('- Ensure billing is enabled for the project');
      } else if (error.code === 409) {
        console.log('\n💡 Bucket name might be taken globally');
        console.log('- Try a different bucket name');
        console.log('- Add random suffix to make it unique');
      }
      
      return false;
    }
  }

  async run() {
    console.log('🎭 Theater Canteen - Google Cloud Storage Setup');
    console.log('='`50`);
    
    const prerequisitesOk = await this.checkPrerequisites();
    if (!prerequisitesOk) {
      console.log('\n❌ Prerequisites check failed. Please fix the issues above.');
      process.exit(1);
    }

    const setupSuccess = await this.setupGoogleCloudStorage();
    if (setupSuccess) {
      console.log('\n✅ Setup completed successfully!');
      process.exit(0);
    } else {
      console.log('\n❌ Setup failed. Please check the errors above.');
      process.exit(1);
    }
  }
}

// Run the setup if this script is executed directly
if (require.main === module) {
  const setup = new TheaterCanteenGCSSetup();
  setup.run().catch(console.error);
}

module.exports = TheaterCanteenGCSSetup;