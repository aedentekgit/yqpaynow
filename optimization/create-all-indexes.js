/**
 * Create All Database Indexes
 * Optimize database queries for 10,000+ concurrent users
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function createAllIndexes() {
  try {
    console.log('🔧 Creating optimized indexes for all collections...\n');
    
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // ============================================
    // THEATERS COLLECTION
    // ============================================
    console.log('📊 Creating indexes for theaters...');
    const theatersCollection = db.collection('theaters');
    
    await theatersCollection.createIndex({ isActive: 1, createdAt: 1 }, { background: true });
    await theatersCollection.createIndex({ email: 1 }, { unique: true, background: true, sparse: true });
    await theatersCollection.createIndex({ username: 1 }, { unique: true, background: true, sparse: true });
    await theatersCollection.createIndex({ name: 'text', username: 'text', email: 'text' }, { background: true });
    console.log('✅ Theaters indexes created\n');

    // ============================================
    // PRODUCTS COLLECTION
    // ============================================
    console.log('📊 Creating indexes for products...');
    const productsCollection = db.collection('products');
    
    await productsCollection.createIndex({ theaterId: 1, isActive: 1 }, { background: true });
    await productsCollection.createIndex({ theaterId: 1, category: 1, isActive: 1 }, { background: true });
    await productsCollection.createIndex({ theaterId: 1, sku: 1 }, { unique: true, background: true, sparse: true });
    await productsCollection.createIndex({ name: 'text', description: 'text' }, { background: true });
    await productsCollection.createIndex({ theaterId: 1, createdAt: -1 }, { background: true });
    console.log('✅ Products indexes created\n');

    // ============================================
    // ORDERS COLLECTION
    // ============================================
    console.log('📊 Creating indexes for orders...');
    const ordersCollection = db.collection('orders');
    
    await ordersCollection.createIndex({ theaterId: 1, createdAt: -1 }, { background: true });
    await ordersCollection.createIndex({ theaterId: 1, status: 1, createdAt: -1 }, { background: true });
    await ordersCollection.createIndex({ orderNumber: 1 }, { unique: true, background: true });
    await ordersCollection.createIndex({ customerName: 1 }, { background: true });
    await ordersCollection.createIndex({ createdAt: -1 }, { background: true });
    await ordersCollection.createIndex({ 'items.product': 1 }, { background: true });
    console.log('✅ Orders indexes created\n');

    // ============================================
    // STOCK COLLECTION
    // ============================================
    console.log('📊 Creating indexes for stock...');
    const stockCollection = db.collection('stocks');
    
    await stockCollection.createIndex({ theaterId: 1, productId: 1 }, { unique: true, background: true });
    await stockCollection.createIndex({ theaterId: 1, quantity: 1 }, { background: true });
    await stockCollection.createIndex({ theaterId: 1, expiryDate: 1 }, { background: true });
    await stockCollection.createIndex({ expiryDate: 1 }, { background: true, sparse: true });
    console.log('✅ Stock indexes created\n');

    // ============================================
    // CATEGORIES COLLECTION
    // ============================================
    console.log('📊 Creating indexes for categories...');
    const categoriesCollection = db.collection('categories');
    
    await categoriesCollection.createIndex({ theaterId: 1, isActive: 1 }, { background: true });
    await categoriesCollection.createIndex({ theaterId: 1, name: 1 }, { unique: true, background: true });
    console.log('✅ Categories indexes created\n');

    // ============================================
    // QR CODES COLLECTION
    // ============================================
    console.log('📊 Creating indexes for QR codes...');
    const qrCodesCollection = db.collection('qrcodes');
    
    await qrCodesCollection.createIndex({ theaterId: 1, isActive: 1 }, { background: true });
    await qrCodesCollection.createIndex({ qrCode: 1 }, { unique: true, background: true, sparse: true });
    await qrCodesCollection.createIndex({ theaterId: 1, createdAt: -1 }, { background: true });
    console.log('✅ QR Codes indexes created\n');

    // ============================================
    // USERS COLLECTION
    // ============================================
    console.log('📊 Creating indexes for users...');
    const usersCollection = db.collection('users');
    
    await usersCollection.createIndex({ email: 1 }, { unique: true, background: true, sparse: true });
    await usersCollection.createIndex({ theaterId: 1, role: 1 }, { background: true });
    await usersCollection.createIndex({ theaterId: 1, isActive: 1 }, { background: true });
    console.log('✅ Users indexes created\n');

    console.log('========================================');
    console.log('✅ All indexes created successfully!');
    console.log('========================================\n');

    // Show index statistics
    console.log('📊 Index Statistics:\n');
    const collections = ['theaters', 'products', 'orders', 'stocks', 'categories', 'qrcodes', 'users'];
    
    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);
        const indexes = await collection.indexes();
        console.log(`${collectionName}: ${indexes.length} indexes`);
      } catch (error) {
        console.log(`${collectionName}: Error getting indexes`);
      }
    }

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
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

