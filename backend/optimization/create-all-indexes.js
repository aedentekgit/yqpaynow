/**
 * Create All Database Indexes
 * Optimize database queries for 10,000+ concurrent users
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function createAllIndexes() {
  try {
    
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10
    });

    const db = mongoose.connection.db;

    // ============================================
    // THEATERS COLLECTION
    // ============================================
    const theatersCollection = db.collection('theaters');
    
    await theatersCollection.createIndex({ isActive: 1, createdAt: 1 }, { background: true });
    await theatersCollection.createIndex({ email: 1 }, { unique: true, background: true, sparse: true });
    await theatersCollection.createIndex({ username: 1 }, { unique: true, background: true, sparse: true });
    await theatersCollection.createIndex({ name: 'text', username: 'text', email: 'text' }, { background: true });

    // ============================================
    // PRODUCTS COLLECTION
    // ============================================
    const productsCollection = db.collection('products');
    
    await productsCollection.createIndex({ theaterId: 1, isActive: 1 }, { background: true });
    await productsCollection.createIndex({ theaterId: 1, category: 1, isActive: 1 }, { background: true });
    await productsCollection.createIndex({ theaterId: 1, sku: 1 }, { unique: true, background: true, sparse: true });
    await productsCollection.createIndex({ name: 'text', description: 'text' }, { background: true });
    await productsCollection.createIndex({ theaterId: 1, createdAt: -1 }, { background: true });

    // ============================================
    // ORDERS COLLECTION
    // ============================================
    const ordersCollection = db.collection('orders');
    
    await ordersCollection.createIndex({ theaterId: 1, createdAt: -1 }, { background: true });
    await ordersCollection.createIndex({ theaterId: 1, status: 1, createdAt: -1 }, { background: true });
    await ordersCollection.createIndex({ orderNumber: 1 }, { unique: true, background: true });
    await ordersCollection.createIndex({ customerName: 1 }, { background: true });
    await ordersCollection.createIndex({ createdAt: -1 }, { background: true });
    await ordersCollection.createIndex({ 'items.product': 1 }, { background: true });

    // ============================================
    // STOCK COLLECTION
    // ============================================
    const stockCollection = db.collection('stocks');
    
    await stockCollection.createIndex({ theaterId: 1, productId: 1 }, { unique: true, background: true });
    await stockCollection.createIndex({ theaterId: 1, quantity: 1 }, { background: true });
    await stockCollection.createIndex({ theaterId: 1, expiryDate: 1 }, { background: true });
    await stockCollection.createIndex({ expiryDate: 1 }, { background: true, sparse: true });

    // ============================================
    // CATEGORIES COLLECTION
    // ============================================
    const categoriesCollection = db.collection('categories');
    
    await categoriesCollection.createIndex({ theaterId: 1, isActive: 1 }, { background: true });
    await categoriesCollection.createIndex({ theaterId: 1, name: 1 }, { unique: true, background: true });

    // ============================================
    // QR CODES COLLECTION
    // ============================================
    const qrCodesCollection = db.collection('qrcodes');
    
    await qrCodesCollection.createIndex({ theaterId: 1, isActive: 1 }, { background: true });
    await qrCodesCollection.createIndex({ qrCode: 1 }, { unique: true, background: true, sparse: true });
    await qrCodesCollection.createIndex({ theaterId: 1, createdAt: -1 }, { background: true });

    // ============================================
    // USERS COLLECTION
    // ============================================
    const usersCollection = db.collection('users');
    
    await usersCollection.createIndex({ email: 1 }, { unique: true, background: true, sparse: true });
    await usersCollection.createIndex({ theaterId: 1, role: 1 }, { background: true });
    await usersCollection.createIndex({ theaterId: 1, isActive: 1 }, { background: true });


    // Show index statistics
    const collections = ['theaters', 'products', 'orders', 'stocks', 'categories', 'qrcodes', 'users'];
    
    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);
        const indexes = await collection.indexes();
      } catch (error) {
      }
    }

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  createAllIndexes();
}

module.exports = createAllIndexes;

