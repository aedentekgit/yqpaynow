const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  
  const theaterId = new mongoose.Types.ObjectId('68f8837a541316c6ad54b79f');
  
  // Check all roles for this theater
  
  const allRoles = await mongoose.connection.db.collection('roles').find({}).toArray();
  
  allRoles.forEach((doc, index) => {
    
    if (doc.roleList && doc.roleList.length > 0) {
      doc.roleList.forEach((role, i) => {
      });
    }
  });
  
  // Try to find specifically for our theater
  const theaterRoles = await mongoose.connection.db.collection('roles')
    .findOne({ theater: theaterId });
  
  if (theaterRoles) {
  } else {
    
    // Try with theaterId field name
    const theaterRoles2 = await mongoose.connection.db.collection('roles')
      .findOne({ theaterId: theaterId });
    
    if (theaterRoles2) {
    }
  }
  
  process.exit(0);
}).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
