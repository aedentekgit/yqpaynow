const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  
  // Find user
  const theaterUsersDoc = await mongoose.connection.db.collection('theaterusers')
    .findOne({ 'users.username': 'kioas' });
  
  if (theaterUsersDoc) {
    const user = theaterUsersDoc.users.find(u => u.username === 'kioas');
    
    
    // Find role details
    if (user.role) {
      const rolesDoc = await mongoose.connection.db.collection('roles')
        .findOne({ 
          theater: theaterUsersDoc.theaterId,
          'roleList._id': user.role
        });
      
      if (rolesDoc && rolesDoc.roleList) {
        const roleInfo = rolesDoc.roleList.find(r => r._id.toString() === user.role.toString());
        
        if (roleInfo) {
          
          if (roleInfo.permissions && roleInfo.permissions.length > 0) {
            
            const accessiblePages = roleInfo.permissions.filter(p => p.hasAccess === true);
            
            if (accessiblePages.length > 0) {
              accessiblePages.forEach((perm, index) => {
              });
            } else {
            }
            
            roleInfo.permissions.forEach((perm, index) => {
            });
          } else {
          }
        } else {
        }
      } else {
      }
    } else {
    }
  }
  
  process.exit(0);
}).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
