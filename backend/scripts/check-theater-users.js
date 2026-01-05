const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  
  // Find all theater users
  const allTheaterUsers = await mongoose.connection.db.collection('theaterusers').find({}).toArray();
  
  
  allTheaterUsers.forEach((doc, index) => {
    
    if (doc.users && doc.users.length > 0) {
      doc.users.forEach((user, userIndex) => {
      });
    }
  });
  
  process.exit(0);
}).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
