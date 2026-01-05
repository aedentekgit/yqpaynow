/**
 * Display Stock Values for Selected Date
 * 
 * Usage: node scripts/show-date-stock.js <date> <theaterId>
 * Example: node scripts/show-date-stock.js 2025-11-02 68f8837a541316c6ad54b79f
 */

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://aedentekuiuxdesigner:Aedentek%40123%23@cluster0.vrj9qje.mongodb.net/yqpay';

async function showDateStock() {
  try {
    // Get arguments
    const dateArg = process.argv[2];
    const theaterIdArg = process.argv[3] || '68f8837a541316c6ad54b79f';

    if (!dateArg) {
      process.exit(1);
    }

    // Parse date
    const selectedDate = new Date(dateArg);
    const dateString = selectedDate.toISOString().split('T')[0];
    

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    
    const db = mongoose.connection.db;
    const theaterId = new mongoose.Types.ObjectId(theaterIdArg);

    // Get products for this theater
    const productDoc = await db.collection('productlist').findOne({
      theater: theaterId
    });

    if (!productDoc || !productDoc.productList || productDoc.productList.length === 0) {
      process.exit(0);
    }

    const products = productDoc.productList.sort((a, b) => 
      (a.productName || '').localeCompare(b.productName || '')
    );


    // Get monthly stock data for the selected date
    const selectedMonth = selectedDate.getMonth() + 1;
    const selectedYear = selectedDate.getFullYear();

    const monthlyStocks = await db.collection('monthlystocks').find({
      theaterId: theaterId,
      year: selectedYear,
      monthNumber: selectedMonth
    }).toArray();


    let sno = 1;
    let totalStockAdded = 0;
    let totalExpiredOld = 0;
    let totalCarryForward = 0;
    let totalUsed = 0;
    let totalExpired = 0;
    let totalDamage = 0;
    let totalBalance = 0;

    for (const product of products) {
      const productId = product._id.toString();
      const productName = (product.productName || product.name || 'Unknown').substring(0, 23).padEnd(23, ' ');

      // Find stock record for this product
      const stockDoc = monthlyStocks.find(s => 
        s.productId && s.productId.toString() === productId
      );

      let stockAdded = 0;
      let expiredOld = 0;
      let carryForward = 0;
      let usedStock = 0;
      let expiredStock = 0;
      let damageStock = 0;
      let balance = 0;

      if (stockDoc && stockDoc.stockDetails) {
        // Find stock detail for the selected date
        const stockDetail = stockDoc.stockDetails.find(detail => {
          const detailDate = new Date(detail.date).toISOString().split('T')[0];
          return detailDate === dateString;
        });

        if (stockDetail) {
          stockAdded = stockDetail.stockAdded || 0;
          expiredOld = stockDetail.expiredOldStock || 0;
          carryForward = stockDetail.carryForward || 0;
          usedStock = stockDetail.usedStock || 0;
          expiredStock = stockDetail.expiredStock || 0;
          damageStock = stockDetail.damageStock || 0;
          balance = stockDetail.balance || 0;

          totalStockAdded += stockAdded;
          totalExpiredOld += expiredOld;
          totalCarryForward += carryForward;
          totalUsed += usedStock;
          totalExpired += expiredStock;
          totalDamage += damageStock;
          totalBalance += balance;
        }
      }

      const snoStr = String(sno).padStart(4, ' ');
      const dateStr = dateString.substring(5).replace('-', ' '); // Format as "Nov 02"
      const monthName = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][selectedMonth];
      const day = dateString.substring(8);
      const formattedDate = `${day} ${monthName} ${selectedYear}`.padEnd(11, ' ');


      sno++;
    }



    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
showDateStock();
