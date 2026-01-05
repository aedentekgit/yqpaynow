const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  
  const theaterId = new mongoose.Types.ObjectId('68f8837a541316c6ad54b79f');
  const roleId = new mongoose.Types.ObjectId('690495e034bc016a11ab5834'); // Kioas role
  
  
  // Define the routes for each page
  const pageRoutes = {
    'TheaterDashboardWithId': '/theater-dashboard/:theaterId',
    'TheaterOrderInterface': '/theater-order/:theaterId',
    'TheaterProductList': '/theater-products/:theaterId',
    'KioskProductList': '/kiosk-products/:theaterId',
    'KioskCart': '/kiosk-cart/:theaterId',
    'KioskCheckout': '/kiosk-checkout/:theaterId',
    'KioskPayment': '/kiosk-payment/:theaterId',
    'KioskViewCart': '/kiosk-view-cart/:theaterId'
  };
  
  // Get current role
  const rolesDoc = await mongoose.connection.db.collection('roles')
    .findOne({ theater: theaterId });
  
  const roleInfo = rolesDoc.roleList.find(r => r._id.toString() === roleId.toString());
  
  // Update each permission with its route
  const updatedPermissions = roleInfo.permissions.map(perm => {
    if (pageRoutes[perm.page]) {
      return {
        ...perm,
        route: pageRoutes[perm.page]
      };
    }
    return perm;
  });
  
  // Update the role with new permissions
  const result = await mongoose.connection.db.collection('roles')
    .updateOne(
      { 
        theater: theaterId,
        'roleList._id': roleId
      },
      { 
        $set: { 
          'roleList.$[role].permissions': updatedPermissions,
          'roleList.$[role].updatedAt': new Date()
        }
      },
      {
        arrayFilters: [
          { 'role._id': roleId }
        ]
      }
    );
  
  
  // Verify the changes
  const updatedRolesDoc = await mongoose.connection.db.collection('roles')
    .findOne({ theater: theaterId });
  
  const updatedRoleInfo = updatedRolesDoc.roleList.find(r => r._id.toString() === roleId.toString());
  const accessible = updatedRoleInfo.permissions.filter(p => p.hasAccess === true);
  
  accessible.forEach((perm, index) => {
  });
  
  const withRoutes = accessible.filter(p => p.route && p.route.trim() !== '');
  
  process.exit(0);
}).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
