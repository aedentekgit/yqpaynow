/**
 * Role Permission Utilities
 * Functions to check if user has access to specific pages based on role permissions
 */

/**
 * Check if user has access to a specific page based on role permissions
 * @param {Array} rolePermissions - Array of role permission objects from user context
 * @param {string} pageKey - Page identifier to check access for
 * @returns {boolean} - True if user has access, false otherwise
 */
export const hasPageAccess = (rolePermissions = [], pageKey) => {
  if (!rolePermissions || !Array.isArray(rolePermissions) || rolePermissions.length === 0) {
    return false;
  }

  // Normalize pageKey for comparison (case-insensitive)
  const normalizedPageKey = pageKey.toLowerCase();

  // Find any role permission that has access to this page
  const hasAccess = rolePermissions.some(rolePermission => {
    if (!rolePermission.permissions || !Array.isArray(rolePermission.permissions)) {
      return false;
    }

    // Check if this role has access to the specific page (case-insensitive comparison)
    return rolePermission.permissions.some(permission => {
      const permissionPage = (permission.page || '').toLowerCase();
      return permissionPage === normalizedPageKey && permission.hasAccess === true;
    });
  });

  return hasAccess;
};

/**
 * Filter navigation items based on user's role permissions
 * @param {Array} navigationItems - Array of navigation item objects
 * @param {Array} rolePermissions - Array of role permission objects from user context
 * @returns {Array} - Filtered navigation items that user has access to
 */
export const filterNavigationByPermissions = (navigationItems = [], rolePermissions = []) => {
  if (!rolePermissions || rolePermissions.length === 0) {

    return [];
  }

  const filteredItems = navigationItems.filter(item => {
    // Map sidebar item IDs to ALL possible page name formats stored in the database
    // Database can store pages in multiple formats: 'KioskOrderHistory', 'kiosk-order-history', 'TheaterDashboardWithId', etc.
    const possiblePageNames = [
      item.id, // Try the ID itself first
      item.id.toLowerCase(), // Try lowercase version
      item.id.replace(/-/g, ''), // Try without hyphens
    ];

    // Generate CamelCase variations
    const toCamelCase = (str) => {
      return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    };
    
    const toPascalCase = (str) => {
      const camel = toCamelCase(str);
      return camel.charAt(0).toUpperCase() + camel.slice(1);
    };

    // Add CamelCase and PascalCase variations
    possiblePageNames.push(toCamelCase(item.id));
    possiblePageNames.push(toPascalCase(item.id));

    // Add specific mappings for known page names
    const specificMappings = {
      'dashboard': ['Dashboard', 'TheaterDashboard', 'TheaterDashboardWithId'],
      'products': ['Products', 'TheaterProductList', 'TheaterProducts'],
      'simple-products': ['SimpleProducts', 'SimpleProductList'],
      'add-product': ['AddProduct', 'TheaterAddProduct', 'TheaterAddProductWithId'],
      'categories': ['Categories', 'TheaterCategories'],
      'product-types': ['ProductTypes', 'TheaterProductTypes'],
      'kiosk-types': ['KioskTypes', 'TheaterKioskTypes'],
      'online-pos': ['OnlinePOS', 'OnlinePOSInterface', 'POS'],
      'professional-pos': ['ProfessionalPOS', 'ProfessionalPOSInterface'],
      'offline-pos': ['OfflinePOS', 'OfflinePOSInterface'],
      'view-cart': ['ViewCart', 'Cart'],
      'order-history': ['OrderHistory', 'TheaterOrderHistory'],
      'online-order-history': ['OnlineOrderHistory'],
      'kiosk-order-history': ['KioskOrderHistory'],
      'qr-management': ['QRManagement', 'TheaterQRManagement'],
      'qr-code-names': ['QRCodeNames', 'TheaterQRCodeNames'],
      'generate-qr': ['GenerateQR', 'TheaterGenerateQR'],
      'settings': ['Settings', 'TheaterSettings', 'TheaterSettingsWithId'],
      'stock': ['Stock', 'StockManagement'],
      'orders': ['Orders', 'TheaterOrders'],
      'reports': ['Reports', 'TheaterReports'],
      'messages': ['Messages', 'TheaterMessages'],
      'banner': ['Banner', 'TheaterBanner'],
      'offers': ['Offers', 'TheaterOffers'],
      'combo-offers': ['ComboOffers', 'Combo Offers'],
      'theater-roles': ['TheaterRoles', 'Roles'],
      'theater-role-access': ['TheaterRoleAccess', 'RoleAccess'],
      'theater-users': ['TheaterUsers', 'TheaterUserManagement', 'TheaterUserManagementPage']
    };

    if (specificMappings[item.id]) {
      possiblePageNames.push(...specificMappings[item.id]);
    }

    // Check if any of the possible page names has access
    const hasAccess = possiblePageNames.some(pageName => {
      return hasPageAccess(rolePermissions, pageName);
    });

    // Previously we logged missing access here, which produced very noisy console output.
    // Now we simply return hasAccess without logging anything.
    return hasAccess;
  });


  return filteredItems;
};

/**
 * Get all accessible pages for a user
 * @param {Array} rolePermissions - Array of role permission objects from user context
 * @returns {Array} - Array of page keys that user has access to
 */
export const getUserAccessiblePages = (rolePermissions = []) => {
  const accessiblePages = [];

  rolePermissions.forEach(rolePermission => {
    if (rolePermission.permissions && Array.isArray(rolePermission.permissions)) {
      rolePermission.permissions.forEach(permission => {
        if (permission.hasAccess === true && !accessiblePages.includes(permission.page)) {
          accessiblePages.push(permission.page);
        }
      });
    }
  });


  return accessiblePages;
};