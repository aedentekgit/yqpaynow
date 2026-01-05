/**
 * Script to add Product Cancel page to page access system for all theaters
 * 
 * Usage: node backend/scripts/add-product-cancel-page-access.js [theaterId]
 * 
 * If theaterId is provided, adds page only to that theater
 * If no theaterId is provided, adds page to all theaters
 */

const mongoose = require('mongoose');
const PageAccessArray = require('../models/PageAccessArray');
const config = require('../config');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(config.mongodb.uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Add Product Cancel page to page access
const addProductCancelPage = async (theaterId = null) => {
  try {
    await connectDB();

    const pageData = {
      page: 'ProductCancel',
      pageName: 'ProductCancel',
      displayName: 'Product Cancel',
      route: `/product-cancel/:theaterId`,
      category: 'orders',
      description: 'Product cancellation page for theater users to cancel orders by order ID',
      icon: 'orders',
      requiredRoles: ['theater_admin', 'theater_staff'],
      requiredPermissions: ['ProductCancel'],
      showInMenu: true,
      showInSidebar: true,
      menuOrder: 50,
      isActive: true,
      isBeta: false,
      requiresSubscription: false,
      tags: ['orders', 'cancellation', 'theater']
    };

    if (theaterId) {
      // Add to specific theater
      if (!mongoose.Types.ObjectId.isValid(theaterId)) {
        console.error('❌ Invalid theater ID format');
        process.exit(1);
      }

      const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
      let pageAccessDoc = await PageAccessArray.findOrCreateByTheater(theaterObjectId);
      
      try {
        await pageAccessDoc.addPage(pageData);
      } catch (error) {
        if (error.message.includes('already exists')) {
        } else {
          throw error;
        }
      }
    } else {
      // Add to all theaters
      const Theater = require('../models/Theater');
      const theaters = await Theater.find({}).lean();
      
      
      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      for (const theater of theaters) {
        try {
          const theaterObjectId = new mongoose.Types.ObjectId(theater._id);
          let pageAccessDoc = await PageAccessArray.findOrCreateByTheater(theaterObjectId);
          
          try {
            await pageAccessDoc.addPage(pageData);
            successCount++;
          } catch (error) {
            if (error.message.includes('already exists')) {
              skipCount++;
            } else {
              throw error;
            }
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Error adding to theater ${theater.name || theater._id}:`, error.message);
        }
      }

    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Get theaterId from command line arguments
const theaterId = process.argv[2] || null;

if (theaterId) {
} else {
}

addProductCancelPage(theaterId);

