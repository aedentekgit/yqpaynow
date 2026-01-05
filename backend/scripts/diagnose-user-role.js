const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  
  const theaterId = new mongoose.Types.ObjectId('68f8837a541316c6ad54b79f');
  const userRoleId = new mongoose.Types.ObjectId('6902841ab94c230e4ea91a17');
  
  // Get user
  const theaterUsersDoc = await mongoose.connection.db.collection('theaterusers')
    .findOne({ 'users.username': 'kioas' });
  
  const user = theaterUsersDoc.users.find(u => u.username === 'kioas');
  
  
  // Get all roles for this theater
  const rolesDoc = await mongoose.connection.db.collection('roles')
    .findOne({ theater: theaterId });
  
  rolesDoc.roleList.forEach((role, index) => {
    
    if (role._id.toString() === user.role.toString()) {
      
      if (role.permissions && role.permissions.length > 0) {
        const accessible = role.permissions.filter(p => p.hasAccess === true);
        
        if (accessible.length > 0) {
          accessible.forEach(p => {
          });
        } else {
        }
      } else {
      }
    }
  });
  
  // Check if user's role exists in the list
  const userRole = rolesDoc.roleList.find(r => r._id.toString() === user.role.toString());
  
  if (!userRole) {
  }
  
  process.exit(0);
}).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
