import React, { useEffect, useState } from 'react';

// Mobile Validation Component
// Restricts access to mobile devices (smartphones/tablets) only
// Mobile Validation Component
// Restricts access to mobile devices (smartphones/tablets) only
// ✅ MODIFIED: Restriction REMOVED as per user request. Always allows access.
const MobileOnlyRoute = ({ children }) => {
    // Simply render children, bypassing all checks
    return children;
};

export default MobileOnlyRoute;
