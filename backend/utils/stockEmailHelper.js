/**
 * Stock Email Helper
 * Helper functions to get email addresses from email notification endpoint
 */

const EmailNotificationArray = require('../models/EmailNotificationArray');

/**
 * Get active email addresses for a theater from email notification endpoint
 * @param {string} theaterId - Theater ID
 * @returns {Promise<Array<string>>} - Array of active email addresses
 */
async function getTheaterEmailAddresses(theaterId) {
  try {
    const emailNotificationDoc = await EmailNotificationArray.findOne({ 
      theater: theaterId 
    });

    if (!emailNotificationDoc || !emailNotificationDoc.emailNotificationList) {
      console.warn(`⚠️  No email notifications found for theater ${theaterId}`);
      return [];
    }

    // Get only active email notifications
    const activeEmails = emailNotificationDoc.emailNotificationList
      .filter(notification => notification.isActive === true)
      .map(notification => notification.emailNotification);

    if (activeEmails.length === 0) {
      console.warn(`⚠️  No active email notifications found for theater ${theaterId}`);
    }

    return activeEmails;
  } catch (error) {
    console.error(`❌ Error fetching email addresses for theater ${theaterId}:`, error);
    return [];
  }
}

/**
 * Get email addresses for multiple theaters
 * @param {Array<string>} theaterIds - Array of theater IDs
 * @returns {Promise<Object>} - Object mapping theaterId to email addresses
 */
async function getMultipleTheaterEmailAddresses(theaterIds) {
  try {
    const emailNotificationDocs = await EmailNotificationArray.find({
      theater: { $in: theaterIds }
    });

    const emailMap = {};

    emailNotificationDocs.forEach(doc => {
      const theaterId = doc.theater.toString();
      const activeEmails = doc.emailNotificationList
        .filter(notification => notification.isActive === true)
        .map(notification => notification.emailNotification);
      
      emailMap[theaterId] = activeEmails;
    });

    // Ensure all theater IDs are in the map (even if empty)
    theaterIds.forEach(id => {
      if (!emailMap[id]) {
        emailMap[id] = [];
      }
    });

    return emailMap;
  } catch (error) {
    console.error('❌ Error fetching email addresses for multiple theaters:', error);
    return {};
  }
}

module.exports = {
  getTheaterEmailAddresses,
  getMultipleTheaterEmailAddresses
};

