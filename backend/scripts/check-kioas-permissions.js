const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  
  const theaterId = new mongoose.Types.ObjectId('68f8837a541316c6ad54b79f');
  const roleId = new mongoose.Types.ObjectId('690495e034bc016a11ab5834'); // Kioas role
  
  // Get the role details
  const rolesDoc = await mongoose.connection.db.collection('roles')
    .findOne({ theater: theaterId });
  
  const roleInfo = rolesDoc.roleList.find(r => r._id.toString() === roleId.toString());
  
  
  if (roleInfo.permissions) {
    const accessible = roleInfo.permissions.filter(p => p.hasAccess === true);
    
    accessible.forEach((perm, index) => {
    });
    
    
    const inaccessible = roleInfo.permissions.filter(p => p.hasAccess === false);
    inaccessible.forEach((perm, index) => {
    });
  }
  
  process.exit(0);
}).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
