const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs').promises;
const { createCanvas, loadImage, registerFont } = require('canvas');
const axios = require('axios');
const ScreenQRCode = require('../models/ScreenQRCode');
const Theater = require('../models/Theater');
const Settings = require('../models/Settings');
const { uploadFile } = require('./vpsUploadUtil');

/**
 * QR Code Generator Utility
 * Generates QR codes with centered logos and custom colors
 */

/**
 * Generate full QR Code card with design elements
 * @param {string} data - QR code data
 * @param {object} options - Generation options
 * @returns {Promise<Buffer>} - Card image buffer
 */
async function generateQRCodeCard(data, options = {}) {
  const orientation = options.orientation || 'portrait';
  const theaterName = options.theaterName || '';
  const qrSize = 300; // Reduced from 500 to 300 for better proportions

  // Get QR background image from settings
  const qrBackgroundUrl = await getQRBackgroundUrl();
  let qrBackgroundBuffer = null;
  if (qrBackgroundUrl) {
    try {
      qrBackgroundBuffer = await fetchLogo(qrBackgroundUrl);
      if (qrBackgroundBuffer) {
      }
    } catch (err) {
      console.warn('⚠️ Failed to load QR background image:', err.message);
    }
  }

  // Generate QR code first
  const qrOptions = {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    quality: 0.95,
    margin: 2,
    width: qrSize,
    color: {
      dark: options.darkColor || '#000000',
      light: options.lightColor || '#FFFFFF'
    }
  };

  const qrBuffer = await QRCode.toBuffer(data, qrOptions);
  const qrImage = await loadImage(qrBuffer);

  // Add logo to QR if available
  const qrCanvas = createCanvas(qrSize, qrSize);
  const qrCtx = qrCanvas.getContext('2d');
  qrCtx.drawImage(qrImage, 0, 0);

  if (options.logoBuffer) {
    try {
      const logo = await loadImage(options.logoBuffer);
      const logoSize = qrSize * 0.30; // 30% of QR size
      const centerX = qrSize / 2;
      const centerY = qrSize / 2;
      const x = centerX - (logoSize / 2);
      const y = centerY - (logoSize / 2);

      // White background circle for logo
      const bgRadius = logoSize * 0.72;
      qrCtx.fillStyle = '#FFFFFF';
      qrCtx.beginPath();
      qrCtx.arc(centerX, centerY, bgRadius, 0, Math.PI * 2);
      qrCtx.fill();

      // Draw logo in perfect circular clip
      qrCtx.save();
      // Use exact radius for perfect circle (slightly smaller than background for border effect)
      const clipRadius = logoSize / 2 - 1;
      qrCtx.beginPath();
      qrCtx.arc(centerX, centerY, clipRadius, 0, Math.PI * 2, false);
      qrCtx.closePath();
      qrCtx.clip();
      qrCtx.drawImage(logo, x, y, logoSize, logoSize);
      qrCtx.restore();
    } catch (err) {
      console.warn('Logo overlay failed:', err.message);
    }
  }

  // Create full card based on orientation
  let cardWidth, cardHeight;
  if (orientation === 'landscape') {
    cardWidth = 700; // Landscape dimensions
    cardHeight = 350;
  } else {
    cardWidth = 560; // Portrait dimensions (280px * 2 for high quality)
    cardHeight = 730; // Adjusted height for proper proportions
  }

  const canvas = createCanvas(cardWidth, cardHeight);
  const ctx = canvas.getContext('2d');

  // White background with rounded corners effect
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cardWidth, cardHeight);

  if (orientation === 'portrait') {
    // Portrait layout - Clean professional design
    const padding = 40;
    const qrX = (cardWidth - qrSize) / 2;
    const qrY = 50; // Space from top (reduced from 80px)

    // Draw QR code
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    // Check if we have a custom QR background image from settings
    if (qrBackgroundBuffer) {
      try {
        // Draw the custom background image below QR code
        const bgImage = await loadImage(qrBackgroundBuffer);
        const bgWidth = qrSize; // Match QR code width
        const bgHeight = (bgImage.height / bgImage.width) * bgWidth;
        const bgX = (cardWidth - bgWidth) / 2;
        const bgY = qrY + qrSize + 15; // Reduced gap from 30px
        ctx.drawImage(bgImage, bgX, bgY, bgWidth, bgHeight);

        // Theater name at bottom (if space allows)
        if (theaterName) {
          ctx.font = '500 22px Arial';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#000000';
          ctx.fillText(theaterName, cardWidth / 2, cardHeight - 35);
        }
      } catch (err) {
        console.warn('Failed to draw QR background image, using default:', err.message);
        // Fall through to default icons
      }
    } else {
      // Default layout with text and food icons
      // "ORDER YOUR FOOD HERE" text - Below QR code
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 38px Arial';
      ctx.textAlign = 'center';
      const textStartY = qrY + qrSize + 30; // Reduced gap from 60px
      ctx.fillText('ORDER YOUR', cardWidth / 2, textStartY);
      ctx.fillText('FOOD HERE', cardWidth / 2, textStartY + 45);

      // Food icons - Draw SVG-style icons
      const iconY = textStartY + 70; // Reduced gap from 110px
      const iconSpacing = 50;
      const startX = cardWidth / 2 - iconSpacing;

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Fries icon (left)
      const friesX = startX;
      ctx.beginPath();
      ctx.moveTo(friesX - 12, iconY - 8);
      ctx.lineTo(friesX - 12, iconY + 15);
      ctx.moveTo(friesX, iconY - 15);
      ctx.lineTo(friesX, iconY + 15);
      ctx.moveTo(friesX + 12, iconY - 10);
      ctx.lineTo(friesX + 12, iconY + 15);
      ctx.moveTo(friesX - 15, iconY + 15);
      ctx.lineTo(friesX + 15, iconY + 15);
      ctx.stroke();

      // Burger icon (center)
      const burgerX = startX + iconSpacing;
      ctx.beginPath();
      ctx.ellipse(burgerX, iconY - 12, 16, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(burgerX - 16, iconY - 5, 32, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(burgerX - 16, iconY + 5, 32, 10);
      ctx.stroke();
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(burgerX - 8, iconY - 9, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(burgerX + 8, iconY - 9, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Drink icon (right)
      const drinkX = startX + iconSpacing * 2;
      ctx.beginPath();
      ctx.moveTo(drinkX - 8, iconY - 15);
      ctx.lineTo(drinkX + 8, iconY - 15);
      ctx.lineTo(drinkX + 6, iconY + 15);
      ctx.lineTo(drinkX - 6, iconY + 15);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(drinkX - 4, iconY - 18, 8, 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(drinkX - 8, iconY - 5);
      ctx.lineTo(drinkX + 8, iconY - 5);
      ctx.stroke();

      // "Scan | Order | Pay" text
      ctx.font = '600 26px Arial';
      ctx.fillStyle = '#000000';
      ctx.fillText('Scan | Order | Pay', cardWidth / 2, iconY + 60);

      // Theater name at bottom
      if (theaterName) {
        ctx.font = '500 22px Arial';
        ctx.fillText(theaterName, cardWidth / 2, cardHeight - 35);
      }
    }

  } else {
    // Landscape layout
    const padding = 30;
    const qrX = padding + 20;
    const qrY = (cardHeight - qrSize) / 2;

    // Draw QR code on left
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    // Right side content
    const contentX = qrX + qrSize + 60;
    const contentCenterY = cardHeight / 2;
    const textX = contentX + 80;

    // Check if we have a custom QR background image from settings
    if (qrBackgroundBuffer) {
      try {
        // Draw the custom background image on the right side
        const bgImage = await loadImage(qrBackgroundBuffer);
        const maxBgHeight = qrSize; // Match QR code height
        const bgHeight = Math.min(maxBgHeight, bgImage.height);
        const bgWidth = (bgImage.width / bgImage.height) * bgHeight;
        const bgX = contentX;
        const bgY = (cardHeight - bgHeight) / 2;
        ctx.drawImage(bgImage, bgX, bgY, bgWidth, bgHeight);

        // Theater name at bottom
        if (theaterName) {
          ctx.font = '500 20px Arial';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#000000';
          ctx.fillText(theaterName, cardWidth / 2, cardHeight - 20);
        }
      } catch (err) {
        console.warn('Failed to draw QR background image in landscape, using default:', err.message);
        // Fall through to default icons
      }
    } else {
      // Default layout with text and food icons
      // "ORDER YOUR FOOD HERE" text
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('ORDER YOUR', textX, contentCenterY - 40);
      ctx.fillText('FOOD HERE', textX, contentCenterY);

      // Food icons - Draw SVG-style icons
      const iconY = contentCenterY + 50;
      const iconSize = 30;
      const iconSpacing = 45;

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Fries icon
      const friesX = textX - iconSpacing;
      ctx.beginPath();
      ctx.moveTo(friesX - 10, iconY);
      ctx.lineTo(friesX - 10, iconY + 12);
      ctx.moveTo(friesX, iconY - 5);
      ctx.lineTo(friesX, iconY + 12);
      ctx.moveTo(friesX + 10, iconY - 2);
      ctx.lineTo(friesX + 10, iconY + 12);
      ctx.moveTo(friesX - 12, iconY + 12);
      ctx.lineTo(friesX + 12, iconY + 12);
      ctx.stroke();

      // Burger icon
      const burgerX = textX;
      ctx.beginPath();
      ctx.ellipse(burgerX, iconY - 8, 14, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(burgerX - 14, iconY - 2, 28, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(burgerX - 14, iconY + 6, 28, 8);
      ctx.stroke();

      // Drink icon
      const drinkX = textX + iconSpacing;
      ctx.beginPath();
      ctx.moveTo(drinkX - 7, iconY - 10);
      ctx.lineTo(drinkX + 7, iconY - 10);
      ctx.lineTo(drinkX + 5, iconY + 12);
      ctx.lineTo(drinkX - 5, iconY + 12);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(drinkX - 3, iconY - 13, 6, 3);
      ctx.stroke();

      // "Scan | Order | Pay" text
      ctx.font = '600 24px Arial';
      ctx.fillText('Scan | Order | Pay', textX, iconY + 70);

      // Theater name at bottom
      if (theaterName) {
        ctx.font = '500 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(theaterName, cardWidth / 2, cardHeight - 20);
      }
    }
  }

  return canvas.toBuffer('image/png');
}

/**
 * Fetch logo from URL or local path
 * @param {string} logoUrl - Logo URL or path
 * @returns {Promise<Buffer>} - Logo image buffer
 */
async function fetchLogo(logoUrl) {
  try {
    if (!logoUrl) return null;

    // Check if it's a URL
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      const response = await axios.get(logoUrl, {
        responseType: 'arraybuffer',
        timeout: 5000
      });
      return Buffer.from(response.data);
    }

    // Check if it's a local file
    const localPath = logoUrl.startsWith('/')
      ? path.join(__dirname, '../uploads', logoUrl)
      : path.join(__dirname, '..', logoUrl);

    const exists = await fs.access(localPath).then(() => true).catch(() => false);
    if (exists) {
      return await fs.readFile(localPath);
    }

    return null;
  } catch (error) {
    console.warn('Failed to fetch logo:', error.message);
    return null;
  }
}

/**
 * Get QR background image URL from settings (Super Admin -> Settings -> General -> QR Background Image)
 * @returns {Promise<string>} QR Background URL
 */
async function getQRBackgroundUrl() {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    if (!db) {
      console.warn('⚠️ MongoDB not connected for QR background URL fetch');
      return '';
    }

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
    console.error('⚠️ Error fetching QR background URL:', error.message);
    return '';
  }
}

/**
 * Get settings for QR code generation
 * @param {string} theaterId - Theater ID
 * @param {string} logoType - 'default' or 'theater'
 * @returns {Promise<object>} - Settings object with logo, color, and background
 */
async function getQRSettings(theaterId, logoType = 'default') {
  try {
    let logoUrl = null;
    let primaryColor = '#000000'; // Default color - BLACK for QR codes
    let qrBackgroundUrl = '';

    // Get QR background URL from settings
    qrBackgroundUrl = await getQRBackgroundUrl();

    if (logoType === 'theater' && theaterId) {
      // Get theater-specific logo
      const theater = await Theater.findById(theaterId);
      if (theater) {
        logoUrl = theater.logoUrl;
        // Always use black for QR codes regardless of theater branding
        primaryColor = '#000000';
      }
    } else {
      // Get default logo from general settings
      const qrImageSetting = await Settings.findOne({
        category: 'general',
        key: 'qrCodeImage'
      });

      if (qrImageSetting && qrImageSetting.value) {
        logoUrl = qrImageSetting.value;
      }

      // Always use black for QR codes
      primaryColor = '#000000';
    }

    return { logoUrl, primaryColor, qrBackgroundUrl };
  } catch (error) {
    console.warn('Failed to get QR settings:', error.message);
    return { logoUrl: null, primaryColor: '#000000', qrBackgroundUrl: '' };
  }
}

/**
 * Generate QR Code with centered logo and full card design
 * @param {string} data - The data to encode in QR code
 * @param {object} options - QR code generation options
 * @returns {Promise<Buffer>} - QR code image buffer
 */
async function generateQRCodeImage(data, options = {}) {
  try {
    const orientation = options.orientation || 'portrait';
    const theaterName = options.theaterName || '';

    // For full card design
    if (options.includeCard) {
      return await generateQRCodeCard(data, options);
    }

    // Original simple QR code generation
    const qrOptions = {
      errorCorrectionLevel: 'H', // High error correction for logo overlay
      type: 'image/png',
      quality: 0.95,
      margin: options.margin || 2,
      width: options.width || 500,
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#FFFFFF'
      }
    };

    // Generate QR code as buffer
    const qrBuffer = await QRCode.toBuffer(data, qrOptions);

    // If no logo, return the plain QR code
    if (!options.logoBuffer) {
      return qrBuffer;
    }

    // Create canvas to overlay logo
    const qrImage = await loadImage(qrBuffer);
    const canvas = createCanvas(qrImage.width, qrImage.height);
    const ctx = canvas.getContext('2d');

    // Draw QR code
    ctx.drawImage(qrImage, 0, 0);

    // Load and draw logo in center
    try {
      const logo = await loadImage(options.logoBuffer);

      // Calculate logo size (30% of QR code size)
      const logoSize = Math.min(qrImage.width, qrImage.height) * 0.30;

      // Calculate exact center position
      const centerX = qrImage.width / 2;
      const centerY = qrImage.height / 2;
      const x = centerX - (logoSize / 2);
      const y = centerY - (logoSize / 2);

      // Draw white background circle for logo (perfectly centered)
      const bgRadius = logoSize / 2 + 10;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(centerX, centerY, bgRadius, 0, Math.PI * 2);
      ctx.fill();

      // Draw logo in perfect circular clip (round shape)
      ctx.save();
      const clipRadius = logoSize / 2 - 1; // Perfect circle matching logo size
      ctx.beginPath();
      ctx.arc(centerX, centerY, clipRadius, 0, Math.PI * 2, false);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(logo, x, y, logoSize, logoSize);
      ctx.restore();

    } catch (logoError) {
      console.warn('Failed to overlay logo:', logoError.message);
    }

    // Return canvas as buffer
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('QR code generation error:', error);
    throw new Error(`Failed to generate QR code image: ${error.message}`);
  }
}


/**
 * Upload QR Code to Storage
 * @param {Buffer} buffer - Image buffer
 * @param {string} filename - File name
 * @param {string} folder - Storage folder path
 * @returns {Promise<string>} - Public URL of uploaded file
 */
async function uploadQRCode(buffer, filename, folder) {
  try {
    // Upload to GCS or save locally
    const url = await uploadFile(buffer, filename, folder, 'image/png');
    return url;
  } catch (error) {
    console.error('QR code upload error:', error);

    // Fallback: Save locally if GCS fails
    try {
      const uploadsDir = path.join(__dirname, '../uploads/qr-codes', folder);
      await fs.mkdir(uploadsDir, { recursive: true });

      const filePath = path.join(uploadsDir, filename);
      await fs.writeFile(filePath, buffer);

      const localUrl = `/uploads/qr-codes/${folder}/${filename}`;
      return localUrl;
    } catch (localError) {
      console.error('Local save failed:', localError);
      throw new Error('Failed to save QR code');
    }
  }
}

/**
 * Generate Single QR Code
 * @param {object} params - Generation parameters
 * @returns {Promise<object>} - Generated QR code info
 */
async function generateSingleQRCode({
  theaterId,
  theaterName,
  qrName,
  seatClass,
  logoUrl,
  logoType,
  userId,
  baseUrl = process.env.FRONTEND_URL || 'https://yqpay-78918378061.us-central1.run.app'
}) {
  try {
    // Get QR settings (logo and color)
    const settings = await getQRSettings(theaterId, logoType);
    const finalLogoUrl = logoUrl || settings.logoUrl;
    const primaryColor = settings.primaryColor;
    // Fetch logo if available
    const logoBuffer = finalLogoUrl ? await fetchLogo(finalLogoUrl) : null;
    if (logoBuffer) {
    }

    // Create QR code data (URL that will be embedded in QR)
    const qrCodeData = `${baseUrl}/menu/${theaterId}?qrName=${encodeURIComponent(qrName)}&type=single`;

    // Generate QR code image with logo and full card design
    const imageBuffer = await generateQRCodeImage(qrCodeData, {
      width: 500,
      margin: 2,
      darkColor: primaryColor, // Always black (#000000) for standard QR codes
      lightColor: '#FFFFFF',
      logoBuffer: logoBuffer,
      includeCard: true, // Generate full card design
      orientation: 'portrait', // Default to portrait
      theaterName: theaterName
    });

    // Generate filename
    const timestamp = Date.now();
    const sanitizedName = qrName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const sanitizedTheater = (theaterName || 'theater').replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `${sanitizedName}_${timestamp}.png`;

    // Upload to storage with correct folder structure: qr-codes/single/{theater_name}/
    const folder = `qr-codes/single/${sanitizedTheater}`;
    const qrCodeUrl = await uploadQRCode(imageBuffer, filename, folder);

    // Save to database
    const screenQRCode = new ScreenQRCode({
      theater: theaterId,
      qrType: 'single',
      qrName: qrName,
      seatClass: seatClass || qrName,
      seat: null,
      qrCodeUrl: qrCodeUrl,
      qrCodeData: qrCodeData,
      logoUrl: finalLogoUrl || '',
      logoType: logoType || 'default',
      isActive: true,
      metadata: {
        totalSeats: 1,
        fileSize: imageBuffer.length,
        primaryColor: primaryColor,
        hasLogo: !!logoBuffer
      },
      createdBy: userId
    });

    await screenQRCode.save();
    return {
      success: true,
      qrCode: screenQRCode,
      count: 1
    };
  } catch (error) {
    console.error('❌ Single QR code generation failed:', error);
    throw error;
  }
}

/**
 * Generate Screen QR Codes (multiple seats)
 * @param {object} params - Generation parameters
 * @returns {Promise<object>} - Generated QR codes info
 */
async function generateScreenQRCodes({
  theaterId,
  theaterName,
  qrName,
  seatClass,
  selectedSeats,
  logoUrl,
  logoType,
  userId,
  baseUrl = process.env.FRONTEND_URL || 'https://yqpay-78918378061.us-central1.run.app'
}) {
  try {
    if (!selectedSeats || selectedSeats.length === 0) {
      throw new Error('No seats selected for screen QR code generation');
    }

    // Get QR settings (logo and color)
    const settings = await getQRSettings(theaterId, logoType);
    const finalLogoUrl = logoUrl || settings.logoUrl;
    const primaryColor = settings.primaryColor;
    // Fetch logo if available (reuse for all QR codes)
    const logoBuffer = finalLogoUrl ? await fetchLogo(finalLogoUrl) : null;
    if (logoBuffer) {
    }

    // Generate batch ID for grouping
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const generatedQRCodes = [];
    const sanitizedTheater = (theaterName || 'theater').replace(/[^a-zA-Z0-9-_]/g, '_');
    const sanitizedName = qrName.replace(/[^a-zA-Z0-9-_]/g, '_');

    // Calculate seat range
    const sortedSeats = [...selectedSeats].sort();
    const seatRange = `${sortedSeats[0]}-${sortedSeats[sortedSeats.length - 1]}`;

    // Generate QR code for each seat
    for (const seat of selectedSeats) {
      try {
        // Create QR code data (URL with seat info)
        const qrCodeData = `${baseUrl}/menu/${theaterId}?qrName=${encodeURIComponent(qrName)}&seat=${encodeURIComponent(seat)}&type=screen`;

        // Generate QR code image with logo and full card design
        const imageBuffer = await generateQRCodeImage(qrCodeData, {
          width: 500,
          margin: 2,
          darkColor: primaryColor, // Always black (#000000) for standard QR codes
          lightColor: '#FFFFFF',
          logoBuffer: logoBuffer,
          includeCard: true, // Generate full card design
          orientation: 'portrait', // Default to portrait
          theaterName: `${theaterName} - ${seat}`
        });

        // Generate filename
        const timestamp = Date.now();
        const sanitizedSeat = seat.replace(/[^a-zA-Z0-9-_]/g, '_');
        const filename = `${sanitizedSeat}_${timestamp}.png`;

        // Upload to storage with correct folder structure: qr-codes/screen/{theater_name}/{qr_name}/
        const folder = `qr-codes/screen/${sanitizedTheater}/${sanitizedName}`;
        const qrCodeUrl = await uploadQRCode(imageBuffer, filename, folder);

        // Save to database
        const screenQRCode = new ScreenQRCode({
          theater: theaterId,
          qrType: 'screen',
          qrName: qrName,
          seatClass: seatClass || qrName,
          seat: seat,
          qrCodeUrl: qrCodeUrl,
          qrCodeData: qrCodeData,
          logoUrl: finalLogoUrl || '',
          logoType: logoType || 'default',
          isActive: true,
          metadata: {
            batchId: batchId,
            seatRange: seatRange,
            totalSeats: selectedSeats.length,
            fileSize: imageBuffer.length,
            primaryColor: primaryColor,
            hasLogo: !!logoBuffer
          },
          createdBy: userId
        });

        await screenQRCode.save();
        generatedQRCodes.push(screenQRCode);
      } catch (seatError) {
        console.error(`❌ Failed to generate QR for seat ${seat}:`, seatError);
        // Continue with other seats even if one fails
      }
    }
    return {
      success: true,
      qrCodes: generatedQRCodes,
      count: generatedQRCodes.length,
      batchId: batchId,
      failedSeats: selectedSeats.length - generatedQRCodes.length
    };
  } catch (error) {
    console.error('❌ Screen QR code generation failed:', error);
    throw error;
  }
}

/**
 * Main QR Code Generation Function
 * @param {object} params - Generation parameters from frontend
 * @returns {Promise<object>} - Result with generated QR codes
 */
async function generateQRCodes(params) {
  try {
    const { theaterId, qrType, name, seatClass, selectedSeats, logoUrl, logoType, userId } = params;

    // Validate theater exists
    const theater = await Theater.findById(theaterId);
    if (!theater) {
      throw new Error('Theater not found');
    }

    const theaterName = theater.name || theater.theaterName || 'theater';

    // Generate based on type
    if (qrType === 'single') {
      return await generateSingleQRCode({
        theaterId,
        theaterName,
        qrName: name,
        seatClass,
        logoUrl,
        logoType,
        userId
      });
    } else if (qrType === 'screen') {
      return await generateScreenQRCodes({
        theaterId,
        theaterName,
        qrName: name,
        seatClass,
        selectedSeats,
        logoUrl,
        logoType,
        userId
      });
    } else {
      throw new Error(`Invalid QR type: ${qrType}`);
    }
  } catch (error) {
    console.error('❌ QR code generation error:', error);
    throw error;
  }
}

module.exports = {
  generateQRCodes,
  generateSingleQRCode,
  generateScreenQRCodes,
  generateQRCodeImage,
  getQRSettings,
  fetchLogo
};
