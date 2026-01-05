/**
 * Show Available Stock Dates
 * 
 * Usage: node scripts/list-stock-dates.js [theaterId]
 * Example: node scripts/list-stock-dates.js 68f8837a541316c6ad54b79f
 */

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://aedentekuiuxdesigner:Aedentek%40123%23@cluster0.vrj9qje.mongodb.net/yqpay';

async function listStockDates() {
  try {
    const theaterIdArg = process.argv[2] || '68f8837a541316c6ad54b79f';
    

    await mongoose.connect(MONGODB_URI);
    
    const db = mongoose.connection.db;
    const theaterId = new mongoose.Types.ObjectId(theaterIdArg);

    // Get unique dates with stock
    const stockDates = await db.collection('monthlystocks').aggregate([
      { $match: { theater: theaterId } },
      { $group: { 
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          count: { $sum: 1 },
          totalQty: { $sum: "$quantity" }
        } 
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]).toArray();

    if (stockDates.length === 0) {
      process.exit(0);
    }

    
    stockDates.forEach(dateInfo => {
      const date = dateInfo._id.padEnd(12, ' ');
      const count = String(dateInfo.count).padStart(10, ' ');
      const total = String(dateInfo.totalQty).padStart(12, ' ');
    });
    
    

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

listStockDates();
