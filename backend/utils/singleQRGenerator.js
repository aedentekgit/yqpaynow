const QRCode = require('qrcode');
const { uploadFile } = require('./vpsUploadUtil');
const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const mongoose = require('mongoose');
const os = require('os');

/**
 * Fetch logo from URL or local path
 * @param {string} logoUrl - Logo URL or path
 * @returns {Promise<Buffer>} - Logo image buffer
 */
async function fetchLogo(logoUrl) {
  try {
    if (!logoUrl) {
      return null;
    }


    // Handle data URLs (base64 encoded images)
    if (logoUrl.startsWith('data:image/')) {
      try {
        // Extract the base64 data from the data URL
        const base64Data = logoUrl.split(',')[1];
        if (!base64Data) {
          throw new Error('Invalid data URL format');
        }

        const buffer = Buffer.from(base64Data, 'base64');
        return buffer;
      } catch (error) {
        console.error(`❌ Failed to process data URL: ${error.message}`);
        return null;
      }
    }

    // Handle URL (http/https)
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      const response = await axios.get(logoUrl, {
        responseType: 'arraybuffer',
        timeout: 15000, // Increased timeout
        headers: {
          'User-Agent': 'YQPayNow-QR-Generator/1.0'
        }
      });
      return Buffer.from(response.data);
    }

    // Handle Google Cloud Storage URLs (gs://)
    if (logoUrl.startsWith('gs://')) {
      // Convert gs:// URL to https:// public URL
      const publicUrl = logoUrl.replace('gs://yqpaynow-theater-qr-codes/', 'https://storage.googleapis.com/yqpaynow-theater-qr-codes/');

      const response = await axios.get(publicUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent': 'YQPayNow-QR-Generator/1.0'
        }
      });
      return Buffer.from(response.data);
    }

    // Handle relative paths (e.g., /images/logo.jpg)
    if (logoUrl.startsWith('/')) {

      // Convert relative path to full URL using frontend base URL from env
      const baseUrl = process.env.BASE_URL?.trim() || process.env.FRONTEND_URL?.trim() || 'http://localhost:3000';

      const fullUrl = `${baseUrl}${logoUrl}`;

      const response = await axios.get(fullUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent': 'YQPayNow-QR-Generator/1.0'
        }
      });
      return Buffer.from(response.data);
    }

    // Handle local file path
    const localPath = logoUrl.startsWith('/')
      ? path.join(__dirname, '../uploads', logoUrl)
      : path.join(__dirname, '..', logoUrl);

    const fileBuffer = await fs.readFile(localPath);
    return fileBuffer;

  } catch (error) {
    console.error('❌ Failed to fetch logo:', {
      logoUrl,
      errorMessage: error.message,
      errorCode: error.code,
      errorStatus: error.response?.status,
      errorStatusText: error.response?.statusText
    });
    return null;
  }
}

/**
 * Overlay logo on QR code center
 * @param {Buffer} qrBuffer - QR code image buffer
 * @param {Buffer} logoBuffer - Logo image buffer
 * @returns {Promise<Buffer>} - QR code with logo overlay
 */
/**
 * Add full QR code structure with text, icons, and layout
 * @param {Buffer} qrBuffer - QR code image buffer
 * @param {string} topText - Text to display above QR (ORDER YOUR FOOD HERE)
 * @param {string} bottomText - Text to display below QR (QR code name/seat)
 * @param {string} scanText - Text to display (Scan | Order | Pay)
 * @param {string} theaterInfo - Theater information text
 * @param {string} orientation - 'landscape' or 'portrait'
 * @returns {Promise<Buffer>} - QR code with full structure
 */
async function addTextToQR(qrBuffer, topText, bottomText, scanText = 'Scan | Order | Pay', theaterInfo = '', orientation = 'portrait', theaterName = '') {
  try {
    // Load QR code image
    const qrImage = await loadImage(qrBuffer);

    // ✅ Match frontend preview exactly: 280px wide for portrait, 150x150px QR code
    const cardPadding = 8; // Match frontend: padding: '8px'
    const qrSize = 150; // Match frontend: 150x150px
    const cardWidth = 280; // Match frontend: width: '280px'

    // Calculate dimensions based on orientation
    let canvasWidth, canvasHeight;
    let qrX, qrY;
    let imageX, imageY;
    let textY, scanTextY, theaterNameY;
    let theaterNameTopY; // For landscape theater name at top
    let separatorY; // For landscape separator line
    let contentPadding; // For landscape content padding
    let bottomSectionHeight; // For landscape bottom section

    if (orientation === 'portrait') {
      // ✅ Portrait layout - Match frontend exactly
      canvasWidth = cardWidth; // 280px

      // Theater name at top (moved from bottom)
      const theaterNameHeight = 25;
      const theaterNameTopY = cardPadding + 2; // 2px from top (reduced from 4px)

      // QR Code: 150x150px, centered, below theater name
      qrX = (canvasWidth - qrSize) / 2; // Centered
      qrY = theaterNameTopY + theaterNameHeight + 4; // Below theater name with 4px gap (reduced from 8px)

      // Food icons image: 150x150px, centered, 2px top/bottom, 20px left/right padding
      imageX = (canvasWidth - qrSize) / 2; // Centered
      imageY = qrY + qrSize + 3 + 1; // Below QR code (3px bottom padding + 1px top padding) (reduced from 6+2)

      // "ORDER YOUR FOOD HERE" text - between QR and image (if needed)
      textY = qrY + qrSize + 3; // Right after QR code (reduced from 6px)

      // "Scan | Order | Pay" text - below image
      scanTextY = imageY + qrSize + 4; // Below image (reduced from 8px)

      // Screen/Seat info at bottom (reduced gap)
      const screenSeatHeight = 25;
      const screenSeatY = scanTextY + 4; // Reduced gap to 4px (was 8px)
      canvasHeight = screenSeatY + screenSeatHeight + cardPadding; // Total height with screen/seat at bottom
    } else {
      // ✅ Landscape layout - Match frontend preview exactly
      // Landscape: Theater name at top center, QR code on left, food icons image on right, screen details at bottom center
      const qrPadding = 20; // Gap between QR and content (match frontend: gap: '20px')
      contentPadding = 16; // Match frontend: padding: '16px 16px 30px'
      const imageWidth = 150; // Food icons image width (150x150px)
      const topSectionHeight = 35; // Space for theater name at top
      bottomSectionHeight = 30; // Space for screen/seat info at bottom

      // Calculate dimensions - match frontend landscape card
      // Width: padding + QR (150) + gap (20) + image (150) + padding
      canvasWidth = contentPadding + qrSize + qrPadding + imageWidth + contentPadding;
      // Height: padding top + theater name + QR/image height + space + screen/seat + padding bottom
      // Reduced gap from 20 to 8 for tighter spacing
      canvasHeight = contentPadding + topSectionHeight + qrSize + 8 + bottomSectionHeight + 16; // Reduced gap and bottom padding

      // Theater name at top center
      theaterNameTopY = contentPadding + 8; // Top padding + small gap

      // QR Code on left (below theater name)
      qrX = contentPadding;
      qrY = contentPadding + topSectionHeight + 4; // Below theater name with small gap

      // Food icons image on right (aligned with QR code top)
      imageX = qrX + qrSize + qrPadding;
      imageY = qrY; // Aligned with QR code top

      // Text positions (for fallback if image doesn't load)
      textY = qrY + 20;
      scanTextY = imageY + qrSize + 20;

      // Screen/seat info at bottom center
      theaterNameY = canvasHeight - 30 - bottomSectionHeight; // Position for screen/seat info
    }

    // Create canvas
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // ✅ White background with rounded corners (20px for portrait, 12px for landscape, matching frontend)
    ctx.fillStyle = '#FFFFFF';
    if (orientation === 'portrait') {
      // Draw rounded rectangle for portrait (20px radius)
      const radius = 20;
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(canvasWidth - radius, 0);
      ctx.quadraticCurveTo(canvasWidth, 0, canvasWidth, radius);
      ctx.lineTo(canvasWidth, canvasHeight - radius);
      ctx.quadraticCurveTo(canvasWidth, canvasHeight, canvasWidth - radius, canvasHeight);
      ctx.lineTo(radius, canvasHeight);
      ctx.quadraticCurveTo(0, canvasHeight, 0, canvasHeight - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      // Draw rounded rectangle for landscape (12px radius, matching frontend)
      const radius = 12;
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(canvasWidth - radius, 0);
      ctx.quadraticCurveTo(canvasWidth, 0, canvasWidth, radius);
      ctx.lineTo(canvasWidth, canvasHeight - radius);
      ctx.quadraticCurveTo(canvasWidth, canvasHeight, canvasWidth - radius, canvasHeight);
      ctx.lineTo(radius, canvasHeight);
      ctx.quadraticCurveTo(0, canvasHeight, 0, canvasHeight - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
      ctx.fill();
    }

    // ✅ Draw theater name at top (portrait) or bottom (landscape)
    if (theaterName) {
      ctx.fillStyle = '#000000';
      ctx.textBaseline = 'top';

      if (orientation === 'portrait') {
        // Portrait: Theater name at top (normal size, centered)
        ctx.font = '500 14px Arial'; // Match frontend
        ctx.textAlign = 'center';
        ctx.fillText(theaterName, canvasWidth / 2, cardPadding + 4);
      } else {
        // Landscape: Theater name at top center (bold, larger size, centered)
        ctx.font = 'bold 22px Arial'; // Bold and larger size
        ctx.textAlign = 'center';
        ctx.fillText(theaterName, canvasWidth / 2, theaterNameTopY);
      }
    }

    // Draw QR code (150x150px)
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    // ✅ Load and draw scan image (150x150px) - First try settings, then local paths
    // Note: The scan image may already contain "ORDER YOUR FOOD HERE" and "Scan | Order | Pay" text
    let scanImageLoaded = false;

    // First, try to get QR background image from settings
    const qrBackgroundUrl = await getQRBackgroundUrl();
    if (qrBackgroundUrl) {
      try {
        const backgroundBuffer = await fetchLogo(qrBackgroundUrl); // Reuse fetchLogo for URL fetching
        if (backgroundBuffer) {
          const scanImage = await loadImage(backgroundBuffer);
          const imageSize = 150; // Match frontend: 150x150px
          const imageWidth = (scanImage.width / scanImage.height) * imageSize;
          const finalImageX = orientation === 'portrait'
            ? (canvasWidth - imageWidth) / 2 // Centered for portrait
            : imageX; // Left-aligned for landscape (on right side of QR)

          const finalImageY = orientation === 'portrait'
            ? imageY
            : imageY; // Aligned with QR code top in landscape

          ctx.drawImage(scanImage, finalImageX, finalImageY, imageWidth, imageSize);
          scanImageLoaded = true;
        }
      } catch (error) {
        console.error('❌ Failed to load QR background from settings:', error.message);
        // Fall through to try local paths
      }
    }

    // Fallback to local scan image paths if settings image not available
    if (!scanImageLoaded) {
      const scanImagePaths = [
        path.join(__dirname, '../../frontend/public/images/scan/scan-order-pay.webp'),
        path.join(__dirname, '../../frontend/public/images/scan/scan-order-pay.png'),
        path.join(__dirname, '../../frontend/public/images/scan/scan-order-pay.jpg'),
        path.join(__dirname, '../../frontend/public/images/scan/scan.webp'),
        path.join(__dirname, '../../frontend/public/images/scan/scan.png'),
        path.join(__dirname, '../../frontend/public/images/scan/scan.jpg'),
        path.join(__dirname, '../../frontend/public/images/scan.png')
      ];

      for (const scanImagePath of scanImagePaths) {
        try {
          if (await fs.access(scanImagePath).then(() => true).catch(() => false)) {
            const scanImage = await loadImage(scanImagePath);
            const imageSize = 150; // Match frontend: 150x150px
            const imageWidth = (scanImage.width / scanImage.height) * imageSize;
            const finalImageX = orientation === 'portrait'
              ? (canvasWidth - imageWidth) / 2 // Centered for portrait
              : imageX; // Left-aligned for landscape (on right side of QR)

            const finalImageY = orientation === 'portrait'
              ? imageY
              : imageY; // Aligned with QR code top in landscape

            ctx.drawImage(scanImage, finalImageX, finalImageY, imageWidth, imageSize);
            scanImageLoaded = true;
            break;
          }
        } catch (error) {
          // Try next path
          continue;
        }
      }
    }

    // ✅ Only draw text if scan image didn't load (fallback)
    // The scan image likely already contains "ORDER YOUR FOOD HERE" and "Scan | Order | Pay" text
    if (!scanImageLoaded) {
      if (orientation === 'portrait') {
        // Portrait fallback text - FIXED: Use smaller font and break into lines to prevent cutoff
        if (topText) {
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 18px Arial'; // ✅ Reduced from 24px to 18px
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          // ✅ CRITICAL FIX: Break text into two lines to fit in 280px canvas width
          // "ORDER YOUR" on first line, "FOOD HERE" on second line
          const line1 = 'ORDER YOUR';
          const line2 = 'FOOD HERE';
          const lineHeight = 22; // Line height for spacing

          ctx.fillText(line1, canvasWidth / 2, textY);
          ctx.fillText(line2, canvasWidth / 2, textY + lineHeight);
        }

        if (scanText) {
          ctx.fillStyle = '#000000';
          ctx.font = '600 14px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          // ✅ Adjust Y position to account for two-line text above
          ctx.fillText(scanText, canvasWidth / 2, scanTextY + 22);
        }
      } else {
        // Landscape fallback text (on right side) - FIXED: Reduce font size
        if (topText) {
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 16px Arial'; // ✅ Reduced from 20px to 16px
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';

          // ✅ Break into two lines for landscape too
          const line1 = 'ORDER YOUR';
          const line2 = 'FOOD HERE';
          const lineHeight = 20;

          ctx.fillText(line1, imageX, textY);
          ctx.fillText(line2, imageX, textY + lineHeight);
        }

        if (scanText) {
          ctx.fillStyle = '#000000';
          ctx.font = '600 14px Arial';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          // ✅ Adjust Y position
          ctx.fillText(scanText, imageX, scanTextY + 20);
        }
      }
    }

    // ✅ Draw screen/seat info at bottom (only screen & seat number, not theater name)
    if (orientation === 'portrait' || orientation === 'landscape') {
      // Extract screen/seat info from theaterInfo (contains qrName and seatClass)
      // theaterInfo format: "Screen - 1 | Screen - 1 | A1" or "Screen - 1 | Screen - 1"
      // We want to show: "Screen - 1 | A1" (qrName | seat) or just "Screen - 1" (qrName)
      let screenSeatText = '';

      if (theaterInfo) {
        // theaterInfo contains: qrName | seatClass | seat (for screen) or qrName | seatClass (for single)
        const parts = theaterInfo.split('|').map(p => p.trim()).filter(p => p); // Remove empty parts
        if (parts.length > 0) {
          // First part is always the QR name (e.g., "Screen - 1")
          const qrName = parts[0];
          // Last part might be seat (if it's a single letter+number like "A1")
          const lastPart = parts[parts.length - 1];
          const isSeat = /^[A-Z]\d+$/.test(lastPart); // Matches pattern like "A1", "B5", etc.

          if (isSeat && parts.length > 1) {
            // Show: "Screen - 1 | A1" (qrName | seat)
            screenSeatText = `${qrName} | ${lastPart}`;
          } else if (parts.length > 1 && parts[0] !== parts[1]) {
            // If qrName and seatClass are different, show both
            screenSeatText = `${parts[0]} | ${parts[1]}`;
          } else {
            // Show: "Screen - 1" (just the QR name, avoid duplicates)
            screenSeatText = qrName;
          }
        }
      } else if (bottomText) {
        // Fallback: use bottomText which is already formatted correctly
        screenSeatText = bottomText;
      }

      if (screenSeatText) {
        if (orientation === 'portrait') {
          // Portrait: Screen/seat at bottom with border (reduced gap)
          ctx.strokeStyle = '#F3F4F6';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const borderY = scanTextY + 10; // Reduced gap from 18 to 10
          ctx.moveTo(0, borderY);
          ctx.lineTo(canvasWidth, borderY);
          ctx.stroke();

          ctx.fillStyle = '#000000';
          ctx.font = '500 14px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(screenSeatText, canvasWidth / 2, borderY + 6); // Reduced gap from 22 to borderY + 6
        } else {
          // Landscape: Screen/seat at bottom center (centered, below separator)
          // Draw separator line first - positioned closer to content
          const separatorY = canvasHeight - bottomSectionHeight - 4;
          ctx.strokeStyle = '#F3F4F6';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, separatorY);
          ctx.lineTo(canvasWidth, separatorY);
          ctx.stroke();

          // Draw screen/seat info below separator (centered) - reduced gap
          ctx.fillStyle = '#000000';
          ctx.font = '500 16px Arial'; // Slightly smaller than theater name but readable
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const screenSeatY = separatorY + 4; // Reduced gap from 8px to 4px
          ctx.fillText(screenSeatText, canvasWidth / 2, screenSeatY);
        }
      }
    }

    // Return canvas as buffer
    return canvas.toBuffer('image/png');

  } catch (error) {
    console.error('❌ Add text to QR error:', error);
    // Return original QR code if text addition fails
    return qrBuffer;
  }
}

async function overlayLogoOnQR(qrBuffer, logoBuffer) {
  try {
    // Load QR code image
    const qrImage = await loadImage(qrBuffer);
    const canvas = createCanvas(qrImage.width, qrImage.height);
    const ctx = canvas.getContext('2d');

    // Draw QR code
    ctx.drawImage(qrImage, 0, 0);

    // Load logo
    const logo = await loadImage(logoBuffer);

    // Calculate logo size (30% of QR code size for better visibility and centering)
    // Use square dimensions to ensure perfect circle
    const logoSize = Math.min(qrImage.width, qrImage.height) * 0.30;

    // Center the logo (use square dimensions)
    const x = (qrImage.width - logoSize) / 2;
    const y = (qrImage.height - logoSize) / 2;
    const centerX = qrImage.width / 2;
    const centerY = qrImage.height / 2;

    // Draw white background circle for logo
    const backgroundRadius = logoSize / 2 + 8;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      backgroundRadius,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Save context state
    ctx.save();

    // Create perfect circular clipping path for logo (slightly smaller than background for border effect)
    const clipRadius = logoSize / 2 - 1; // Perfect circle matching logo size
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      clipRadius,
      0,
      Math.PI * 2,
      false // Counter-clockwise doesn't matter for full circle
    );
    ctx.closePath();
    ctx.clip();

    // Draw logo centered within the circular clip area
    // Ensure logo is perfectly centered for circular shape
    ctx.drawImage(logo, x, y, logoSize, logoSize);

    // Restore context
    ctx.restore();


    // Return canvas as buffer
    return canvas.toBuffer('image/png');

  } catch (error) {
    console.error('❌ Logo overlay error:', error);
    // Return original QR code if overlay fails
    return qrBuffer;
  }
}

/**
 * Get super admin primary color from settings
 * @returns {Promise<string>} Primary color hex code
 */
async function getSuperAdminPrimaryColor() {
  try {
    // Always return black for QR codes
    return '#000000';

    // Old code that fetched from database (disabled):
    // const db = mongoose.connection.db;
    // const settingsDoc = await db.collection('settings').findOne({ type: 'general' });
    // if (settingsDoc && settingsDoc.generalConfig && settingsDoc.generalConfig.primaryColor) {
    //   return settingsDoc.generalConfig.primaryColor;
    // }
  } catch (error) {
    console.error('⚠️  Error fetching primary color, using black:', error.message);
    return '#000000';
  }
}

/**
 * Get application name from settings
 * @returns {Promise<string>} Application name
 */
async function getApplicationName() {
  try {
    const db = mongoose.connection.db;
    const settingsDoc = await db.collection('settings').findOne({ type: 'general' });

    if (settingsDoc && settingsDoc.generalConfig && settingsDoc.generalConfig.applicationName) {
      return settingsDoc.generalConfig.applicationName;
    }

    // Fallback to default
    return 'SCAN THIS QR';
  } catch (error) {
    console.error('⚠️  Error fetching application name, using default:', error.message);
    return 'SCAN THIS QR';
  }
}

/**
 * Get default logo URL from settings (Super Admin -> Settings -> General -> Application Logo)
 * @returns {Promise<string>} Default logo URL
 */
async function getDefaultLogoUrl() {
  try {
    const db = mongoose.connection.db;
    const settingsDoc = await db.collection('settings').findOne({ type: 'general' });

    if (settingsDoc && settingsDoc.generalConfig && settingsDoc.generalConfig.logoUrl) {
      return settingsDoc.generalConfig.logoUrl;
    }

    // Try finding with _systemSettings flag (newer format)
    const systemSettingsDoc = await db.collection('settings').findOne({ _systemSettings: true });
    if (systemSettingsDoc && systemSettingsDoc.generalConfig && systemSettingsDoc.generalConfig.logoUrl) {
      return systemSettingsDoc.generalConfig.logoUrl;
    }

    // Fallback to empty string if no default logo configured
    return '';
  } catch (error) {
    console.error('⚠️ Error fetching default logo URL, using empty string:', error.message);
    return '';
  }
}

/**
 * Get QR background image URL from settings (Super Admin -> Settings -> General -> QR Background Image)
 * @returns {Promise<string>} QR Background URL
 */
async function getQRBackgroundUrl() {
  try {
    const db = mongoose.connection.db;

    // Try finding with _systemSettings flag (newer format)
    let settingsDoc = await db.collection('settings').findOne({ _systemSettings: true });

    if (!settingsDoc) {
      // Fallback to old format
      settingsDoc = await db.collection('settings').findOne({ type: 'general' });
    }

    if (settingsDoc && settingsDoc.generalConfig && settingsDoc.generalConfig.qrBackgroundUrl) {
      return settingsDoc.generalConfig.qrBackgroundUrl;
    }

    // Fallback to empty string if no QR background configured
    return '';
  } catch (error) {
    console.error('⚠️ Error fetching QR background URL, using empty string:', error.message);
    return '';
  }
}

/**
 * Generate a single or screen QR code and upload to Google Cloud Storage
 * @param {Object} params - Generation parameters
 * @param {string} params.theaterId - Theater ID
 * @param {string} params.theaterName - Theater name for GCS path
 * @param {string} params.qrName - QR code name
 * @param {string} params.seatClass - Seat class
 * @param {string} params.seat - Seat identifier (only for screen type)
 * @param {string} params.logoUrl - Optional logo URL
 * @param {string} params.logoType - Logo type (default, theater, custom)
 * @param {string} params.userId - User ID generating the QR
 * @returns {Promise<Object>} Generated QR code details
 */
async function generateSingleQRCode({
  theaterId,
  theaterName,
  qrName,
  seatClass,
  seat = null,
  logoUrl = '',
  logoType = 'default',
  orientation = 'landscape',
  userId
}) {
  try {
    // Handle default logo URL fetching
    let finalLogoUrl = logoUrl;
    if (logoType === 'default' && !logoUrl) {
      finalLogoUrl = await getDefaultLogoUrl();
    }

    const qrTypeLabel = seat ? 'Screen' : 'Single';
    console.log(`🎨 Generating ${qrTypeLabel} QR Code:`, {
      theaterId,
      qrName,
      seatClass,
      seat,
      logoUrl: logoUrl,
      finalLogoUrl: finalLogoUrl,
      logoType
    });

    // Get super admin primary color for QR code
    const primaryColor = await getSuperAdminPrimaryColor();

    // Generate unique QR code data URL
    const timestamp = Date.now();
    const seatPart = seat ? `_${seat}` : '';
    const uniqueId = `${theaterId}_${qrName}_${seatClass}${seatPart}_${timestamp}`.replace(/\s+/g, '_');

    // Use environment variables for base URL
    const baseUrl = process.env.BASE_URL?.trim() || process.env.FRONTEND_URL?.trim() || 'http://localhost:3000';


    const typeParam = seat ? 'screen' : 'single';
    const seatParam = seat ? `&seat=${encodeURIComponent(seat)}` : '';
    const qrCodeData = `${baseUrl}/menu/${theaterId}?qrName=${encodeURIComponent(qrName)}&type=${typeParam}${seatParam}`;

    // ✅ QR code options - Match frontend preview: 150x150px
    const qrOptions = {
      errorCorrectionLevel: 'H', // High error correction for logo overlay
      type: 'image/png',
      quality: 1,
      margin: 2,
      width: 150, // ✅ Match frontend preview: 150x150px (was 512)
      color: {
        dark: primaryColor, // Use super admin's primary color
        light: '#FFFFFF'
      }
    };

    // Generate base QR code as buffer
    let qrCodeBuffer = await QRCode.toBuffer(qrCodeData, qrOptions);

    // Fetch and overlay logo if provided
    if (finalLogoUrl) {
      const logoBuffer = await fetchLogo(finalLogoUrl);

      if (logoBuffer) {
        qrCodeBuffer = await overlayLogoOnQR(qrCodeBuffer, logoBuffer);
      } else {
      }
    } else {
    }

    // Get application name and add full structure to QR code
    const applicationName = await getApplicationName();
    const bottomText = seat ? `${qrName} | ${seat}` : qrName;
    const theaterInfoText = seat
      ? `${qrName} | ${seatClass} | ${seat}`
      : `${qrName} | ${seatClass}`;
    qrCodeBuffer = await addTextToQR(qrCodeBuffer, 'ORDER YOUR FOOD HERE', bottomText, 'Scan | Order | Pay', theaterInfoText, orientation, theaterName);

    // Upload to Google Cloud Storage
    const gcsPath = await uploadToGCS(qrCodeBuffer, {
      theaterId,
      theaterName,
      qrName,
      seatClass,
      seat,
      timestamp
    });

    console.log(`✅ ${qrTypeLabel} QR Code generated:`, {
      qrCodeData: qrCodeData.substring(0, 100) + '...',
      gcsPath
    });

    return {
      qrCodeUrl: gcsPath,
      qrCodeData: qrCodeData,
      logoUrl: finalLogoUrl,
      logoType,
      uniqueId
    };

  } catch (error) {
    console.error('❌ Generate QR Code error:', error);
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
}

/**
 * Upload QR code image to Google Cloud Storage
 * @param {Buffer} buffer - QR code image buffer
 * @param {Object} metadata - File metadata
 * @returns {Promise<string>} GCS file URL
 */
async function uploadToGCS(buffer, metadata) {
  try {
    // Sanitize names for file paths
    const sanitizedTheater = metadata.theaterName ? metadata.theaterName.replace(/[^a-zA-Z0-9\-_]/g, '_') : metadata.theaterId;
    const sanitizedQRName = metadata.qrName.replace(/[^a-zA-Z0-9\-_]/g, '_');
    const sanitizedSeatClass = metadata.seatClass.replace(/[^a-zA-Z0-9\-_]/g, '_');

    // Create filename and folder structure matching existing pattern
    let folder, filename;

    if (metadata.seat) {
      // Screen QR: qr-codes/screen/{theater_name}/{qr_name}/
      folder = `qr-codes/screen/${sanitizedTheater}/${sanitizedQRName}`;
      const seatPart = metadata.seat.replace(/[^a-zA-Z0-9\-_]/g, '_');
      filename = `${sanitizedQRName}_${sanitizedSeatClass}_${seatPart}_${metadata.timestamp}.png`;
    } else {
      // Single QR: qr-codes/single/{theater_name}/
      folder = `qr-codes/single/${sanitizedTheater}`;
      filename = `${sanitizedQRName}_${sanitizedSeatClass}_${metadata.timestamp}.png`;
    }

    // Use the working GCS upload utility (loads credentials from MongoDB)
    const gcsUrl = await uploadFile(buffer, filename, folder, 'image/png');

    return gcsUrl;

  } catch (error) {
    console.error('❌ GCS Upload error:', error);

    // Fallback: save to local filesystem if GCS fails
    return await saveToLocalFilesystem(buffer, metadata);
  }
}

/**
 * Fallback: Save QR code to local filesystem
 * @param {Buffer} buffer - QR code image buffer
 * @param {Object} metadata - File metadata
 * @returns {Promise<string>} Local file URL
 */
async function saveToLocalFilesystem(buffer, metadata) {
  try {
    const sanitizedTheater = metadata.theaterName ? metadata.theaterName.replace(/[^a-zA-Z0-9\-_]/g, '_') : metadata.theaterId;
    const sanitizedQRName = metadata.qrName.replace(/[^a-zA-Z0-9\-_]/g, '_');
    const sanitizedSeatClass = metadata.seatClass.replace(/[^a-zA-Z0-9\-_]/g, '_');

    let uploadsDir, filename;

    if (metadata.seat) {
      // Screen QR: uploads/qr-codes/screen/{theater_name}/{qr_name}/
      uploadsDir = path.join(__dirname, '../uploads/qr-codes/screen', sanitizedTheater, sanitizedQRName);
      const seatPart = metadata.seat.replace(/[^a-zA-Z0-9\-_]/g, '_');
      filename = `${sanitizedQRName}_${sanitizedSeatClass}_${seatPart}_${metadata.timestamp}.png`;
    } else {
      // Single QR: uploads/qr-codes/single/{theater_name}/
      uploadsDir = path.join(__dirname, '../uploads/qr-codes/single', sanitizedTheater);
      filename = `${sanitizedQRName}_${sanitizedSeatClass}_${metadata.timestamp}.png`;
    }

    // Create directory if it doesn't exist
    await fs.mkdir(uploadsDir, { recursive: true });

    const filepath = path.join(uploadsDir, filename);

    // Write buffer to file
    await fs.writeFile(filepath, buffer);

    // Return relative URL
    const qrType = metadata.seat ? 'screen' : 'single';
    const relativeUrl = metadata.seat
      ? `/uploads/qr-codes/${qrType}/${sanitizedTheater}/${sanitizedQRName}/${filename}`
      : `/uploads/qr-codes/${qrType}/${sanitizedTheater}/${filename}`;


    return relativeUrl;

  } catch (error) {
    console.error('❌ Local filesystem save error:', error);
    throw new Error(`Failed to save QR code: ${error.message}`);
  }
}

/**
 * Generate multiple single QR codes in batch
 * @param {Array} qrConfigs - Array of QR code configurations
 * @returns {Promise<Array>} Array of generated QR code details
 */
async function generateBatchSingleQRCodes(qrConfigs) {
  try {

    const results = [];
    const errors = [];

    for (const config of qrConfigs) {
      try {
        const result = await generateSingleQRCode(config);
        results.push({
          success: true,
          ...result
        });
      } catch (error) {
        errors.push({
          success: false,
          config,
          error: error.message
        });
      }
    }


    return {
      successful: results,
      failed: errors,
      totalGenerated: results.length,
      totalFailed: errors.length
    };

  } catch (error) {
    console.error('❌ Batch generation error:', error);
    throw error;
  }
}

module.exports = {
  generateSingleQRCode,
  generateBatchSingleQRCodes,
  uploadToGCS,
  saveToLocalFilesystem,
  getDefaultLogoUrl
};
