const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  
  const theaterId = new mongoose.Types.ObjectId('68f8837a541316c6ad54b79f');
  const roleId = new mongoose.Types.ObjectId('690495e034bc016a11ab5834'); // Kioas role
  
  
  // Update the role to grant access to essential pages
  const result = await mongoose.connection.db.collection('roles')
    .updateOne(
      { 
        theater: theaterId,
        'roleList._id': roleId
      },
      { 
        $set: { 
          'roleList.$[role].permissions.$[perm1].hasAccess': true,
          'roleList.$[role].updatedAt': new Date()
        }
      },
      {
        arrayFilters: [
          { 'role._id': roleId },
          { 'perm1.page': 'TheaterDashboardWithId' }
        ]
      }
    );
  
  
  // Also add access to Theater Order Interface
  const result2 = await mongoose.connection.db.collection('roles')
    .updateOne(
      { 
        theater: theaterId,
        'roleList._id': roleId
      },
      { 
        $set: { 
          'roleList.$[role].permissions.$[perm2].hasAccess': true
        }
      },
      {
        arrayFilters: [
          { 'role._id': roleId },
          { 'perm2.page': 'TheaterOrderInterface' }
        ]
      }
    );
  
  
  // Also add access to Product List
  const result3 = await mongoose.connection.db.collection('roles')
    .updateOne(
      { 
        theater: theaterId,
        'roleList._id': roleId
      },
      { 
        $set: { 
          'roleList.$[role].permissions.$[perm3].hasAccess': true
        }
      },
      {
        arrayFilters: [
          { 'role._id': roleId },
          { 'perm3.page': 'TheaterProductList' }
        ]
      }
    );
  
  
  // Verify the changes
  const rolesDoc = await mongoose.connection.db.collection('roles')
    .findOne({ theater: theaterId });
  
  const roleInfo = rolesDoc.roleList.find(r => r._id.toString() === roleId.toString());
  const accessible = roleInfo.permissions.filter(p => p.hasAccess === true);
  
  accessible.forEach((perm, index) => {
  });
  
  process.exit(0);
}).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
