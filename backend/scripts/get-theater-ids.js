/**
 * Get Theater IDs for Testing
 * 
 * This script fetches theater IDs from the database to use in the test script
 * 
 * Run with: node backend/scripts/get-theater-ids.js
 */

const mongoose = require('mongoose');

async function getTheaterIds() {
    try {

        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/yqpaynow';
        await mongoose.connect(mongoUri);

        // Get Theater model
        const Theater = mongoose.model('Theater', new mongoose.Schema({}, { strict: false }), 'theaters');

        // Fetch first 5 active theaters
        const theaters = await Theater.find({ isActive: true })
            .limit(5)
            .select('_id name location.city')
            .lean();

        if (theaters.length === 0) {
            return;
        }


        theaters.forEach((theater, index) => {
        });

        theaters.forEach((theater, index) => {
            const comma = index < theaters.length - 1 ? ',' : '';
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        await mongoose.disconnect();
    }
}

getTheaterIds()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });
