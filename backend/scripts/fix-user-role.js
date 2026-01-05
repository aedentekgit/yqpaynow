const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  
  const theaterId = new mongoose.Types.ObjectId('68f8837a541316c6ad54b79f');
  const correctRoleId = new mongoose.Types.ObjectId('690495e034bc016a11ab5834'); // Kioas role
  
  
  const result = await mongoose.connection.db.collection('theaterusers')
    .updateOne(
      { 
        theaterId: theaterId,
        'users.username': 'kioas'
      },
      { 
        $set: { 
          'users.$.role': correctRoleId,
          'users.$.updatedAt': new Date()
        }
      }
    );
  
  
  if (result.modifiedCount > 0) {
    
    // Verify the update
    const updatedDoc = await mongoose.connection.db.collection('theaterusers')
      .findOne({ 'users.username': 'kioas' });
    
    const updatedUser = updatedDoc.users.find(u => u.username === 'kioas');
    
    // Get the role details
    const rolesDoc = await mongoose.connection.db.collection('roles')
      .findOne({ theater: theaterId });
    
    const roleInfo = rolesDoc.roleList.find(r => r._id.toString() === updatedUser.role.toString());
    
    if (roleInfo) {
      
      if (roleInfo.permissions) {
        const accessible = roleInfo.permissions.filter(p => p.hasAccess === true);
      }
    }
  } else {
  }
  
  process.exit(0);
}).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
