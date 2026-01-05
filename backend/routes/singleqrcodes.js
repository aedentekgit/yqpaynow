const express = require('express');
const mongoose = require('mongoose');
const SingleQRCode = require('../models/SingleQRCode');
const Theater = require('../models/Theater');
const { authenticateToken } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');
const { generateSingleQRCode } = require('../utils/singleQRGenerator');
const { deleteFile } = require('../utils/vpsUploadUtil');

const router = express.Router();

// Test route to verify router is working
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Single QR Code routes are working!' });
});

/**
 * POST /api/single-qrcodes
 * Create a new single OR screen QR code entry
 * Handles both qrType: 'single' and qrType: 'screen'
 */
router.post('/', [
  authenticateToken,
  body('theaterId').isMongoId().withMessage('Valid theater ID is required'),
  body('qrType').isIn(['single', 'screen']).withMessage('QR type must be single or screen'),
  body('qrName').notEmpty().trim().withMessage('QR code name is required'),
  body('seatClass').notEmpty().trim().withMessage('Seat class is required'),
  body('seat').optional().trim(), // Only for screen type
  body('seats').optional().isArray(), // Array of seats for screen type batch generation
  body('logoUrl').optional().trim(),
  body('logoType').optional().isIn(['default', 'theater', 'custom', '']).withMessage('Invalid logo type')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: errors.array().map(e => e.msg).join(', '),
        details: errors.array()
      });
    }

    const { theaterId, qrType, qrName, seatClass, seat, seats, logoUrl, logoType, orientation } = req.body;

    console.log('📥 Creating QR Code:', {
      theaterId,
      qrType,
      qrName,
      seatClass,
      seat,
      seats: seats ? seats.length : 0,
      logoUrl,
      logoType,
      user: req.user?.userId
    });

    // Verify theater exists
    const theater = await Theater.findById(theaterId);
    if (!theater) {
      return res.status(404).json({
        success: false,
        error: 'Theater not found'
      });
    }

    const theaterName = theater.name || theater.theaterName || 'Unknown';

    // Validate screen type requirements
    if (qrType === 'screen' && !seat && (!seats || seats.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Seat or seats array is required for screen type QR codes'
      });
    }

    // Find or create the single document for this theater
    let singleQR = await SingleQRCode.findOne({ theater: theaterId });

    if (singleQR) {
    }

    // Determine which seats to generate
    const seatsToGenerate = qrType === 'single'
      ? [null] // Single QR doesn't need seat
      : (seats && seats.length > 0 ? seats : [seat]); // Screen type: use seats array or single seat


    if (qrType === 'single') {
      // ============ SINGLE QR CODE GENERATION ============
      // Generate single QR code
      const qrCodeResult = await generateSingleQRCode({
        theaterId,
        theaterName,
        qrName,
        seatClass,
        seat: null,
        logoUrl,
        logoType,
        orientation: orientation || 'landscape',
        userId: req.user?.userId
      });

      const qrDetailObj = {
        qrType: 'single',
        qrName: qrName,
        seatClass: seatClass,
        qrCodeUrl: qrCodeResult.qrCodeUrl,
        qrCodeData: qrCodeResult.qrCodeData,
        logoUrl: qrCodeResult.logoUrl || logoUrl || '',
        logoType: logoType || 'default',
        orientation: orientation || 'landscape',
        scanCount: 0,
        seats: [], // Empty array for single type
        metadata: {
          generatedBy: req.user?.userId,
          generatedAt: new Date(),
          version: '1.0'
        }
      };

      if (singleQR) {
        await singleQR.addQRDetail(qrDetailObj);
      } else {
        singleQR = new SingleQRCode({
          theater: theaterId,
          qrDetails: [{
            ...qrDetailObj,
            isActive: true
          }],
          isActive: true,
          metadata: {
            totalQRs: 1,
            activeQRs: 1,
            totalScans: 0,
            lastGeneratedAt: new Date()
          }
        });
        await singleQR.save();
      }

    } else {
      // ============ SCREEN QR CODE GENERATION ============
      // Check if this qrName+seatClass combination already exists in the array
      const existingScreenQR = singleQR ?
        singleQR.qrDetails.find(qr =>
          qr.qrType === 'screen' &&
          qr.qrName === qrName &&
          qr.seatClass === seatClass
        ) : null;

      // Generate QR codes for each seat
      const generatedSeats = [];
      for (const seatId of seatsToGenerate) {
        const qrCodeResult = await generateSingleQRCode({
          theaterId,
          theaterName,
          qrName,
          seatClass,
          seat: seatId,
          logoUrl,
          logoType,
          orientation: orientation || 'landscape',
          userId: req.user?.userId
        });

        generatedSeats.push({
          seat: seatId,
          qrCodeUrl: qrCodeResult.qrCodeUrl,
          qrCodeData: qrCodeResult.qrCodeData,
          logoUrl: qrCodeResult.logoUrl || logoUrl || '',
          logoType: logoType || 'default',
          orientation: orientation || 'landscape',
          scanCount: 0,
          metadata: {
            generatedBy: req.user?.userId,
            generatedAt: new Date(),
            version: '1.0'
          },
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      if (existingScreenQR) {
        // Add seats to existing screen QR entry
        existingScreenQR.seats.push(...generatedSeats);
        existingScreenQR.updatedAt = new Date();
        await singleQR.save();
      } else {
        // Create new screen QR entry
        const screenQRObj = {
          qrType: 'screen',
          qrName: qrName,
          seatClass: seatClass,
          qrCodeUrl: '', // Not used for screen type
          qrCodeData: '', // Not used for screen type
          logoUrl: '', // Not used for screen type
          logoType: 'default',
          orientation: orientation || 'landscape', // Save orientation for screen type
          scanCount: 0, // Not used for screen type
          seats: generatedSeats, // Nested array of seats
          metadata: {
            generatedBy: req.user?.userId,
            generatedAt: new Date(),
            version: '1.0'
          },
          isActive: true
        };

        if (singleQR) {
          await singleQR.addQRDetail(screenQRObj);
        } else {
          singleQR = new SingleQRCode({
            theater: theaterId,
            qrDetails: [screenQRObj],
            isActive: true,
            metadata: {
              totalQRs: generatedSeats.length,
              activeQRs: generatedSeats.length,
              totalScans: 0,
              lastGeneratedAt: new Date()
            }
          });
          await singleQR.save();
        }
      }
    }

    // Populate theater details
    await singleQR.populate('theater', 'name location');

    const totalGenerated = qrType === 'single' ? 1 : seatsToGenerate.length;

    res.status(201).json({
      success: true,
      message: qrType === 'single'
        ? 'Single QR code created successfully'
        : `${totalGenerated} Screen QR code(s) created successfully`,
      data: singleQR,
      count: totalGenerated
    });

  } catch (error) {
    console.error('❌ Create QR Code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create QR code',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/single-qrcodes
 * Get all single QR codes with optional filters
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      theaterId,
      qrName,
      seatClass,
      isActive,
      limit = 100,
      skip = 0,
      sort = '-createdAt'
    } = req.query;

    const query = {};

    if (theaterId) {
      query.theater = theaterId;
    }

    // Filter by qrName in array
    if (qrName) {
      query['qrDetails.qrName'] = new RegExp(qrName, 'i');
    }

    // Filter by seatClass in array
    if (seatClass) {
      query['qrDetails.seatClass'] = new RegExp(seatClass, 'i');
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const singleQRCodes = await SingleQRCode.find(query)
      .populate('theater', 'name location city')
      .sort(sort)
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await SingleQRCode.countDocuments(query);

    res.json({
      success: true,
      data: QRCodesCollection,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: total > (parseInt(skip) + singleQRCodes.length)
      }
    });

  } catch (error) {
    console.error('❌ Get Single QR Codes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch single QR codes',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/single-qrcodes/theater/:theaterId
 * Get all single QR codes for a specific theater
 */
router.get('/theater/:theaterId', [
  authenticateToken,
  param('theaterId').isMongoId().withMessage('Valid theater ID is required')
], async (req, res) => {
  try {
    // 🚀 CRITICAL: Prevent browser caching of QR code data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { theaterId } = req.params;
    const { isActive } = req.query;

    const singleQRCodes = await SingleQRCode.findByTheater(theaterId, {
      isActive: isActive !== undefined ? isActive === 'true' : undefined
    });

    // Flatten qrDetails array from all documents into a single array
    const flattenedQRCodes = [];

    singleQRCodes.forEach(doc => {
      if (doc.qrDetails && doc.qrDetails.length > 0) {
        doc.qrDetails.forEach(qrDetail => {
          // Transform each qrDetail to match frontend expected structure
          flattenedQRCodes.push({
            _id: qrDetail._id,
            name: qrDetail.qrName,
            qrType: qrDetail.qrType,
            seatClass: qrDetail.seatClass,
            qrImageUrl: qrDetail.qrCodeUrl, // Map qrCodeUrl to qrImageUrl
            logoUrl: qrDetail.logoUrl,
            logoType: qrDetail.logoType,
            screenName: qrDetail.screen,
            seatNumber: qrDetail.seat,
            seats: qrDetail.seats,
            isActive: qrDetail.isActive,
            scanCount: qrDetail.scanCount || 0,
            orderCount: qrDetail.orderCount || 0,
            totalRevenue: qrDetail.totalRevenue || 0,
            lastScannedAt: qrDetail.lastScannedAt,
            createdAt: qrDetail.createdAt,
            updatedAt: qrDetail.updatedAt,
            theater: doc.theater,
            parentDocId: doc._id // Keep reference to parent document
          });
        });
      }
    });


    res.json({
      success: true,
      data: {
        qrCodes: flattenedQRCodes,
        total: flattenedQRCodes.length
      }
    });

  } catch (error) {
    console.error('❌ Get Theater Single QR Codes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch theater single QR codes',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/single-qrcodes/:qrDetailId/download
 * Proxy download for QR code image (handles CORS)
 * NOTE: Must be before /:id route to avoid conflicts
 */
router.get('/:qrDetailId/download', authenticateToken, async (req, res) => {
  try {
    const { qrDetailId } = req.params;

    // Find the SingleQRCode document containing this QR detail
    const singleQR = await SingleQRCode.findOne({ 'qrDetails._id': qrDetailId });

    if (!singleQR) {
      return res.status(404).json({
        success: false,
        error: 'QR code not found'
      });
    }


    // Find the specific QR detail
    const qrDetail = singleQR.qrDetails.id(qrDetailId);

    if (!qrDetail) {
      return res.status(404).json({
        success: false,
        error: 'QR code detail not found'
      });
    }


    // Get image URL - field name is qrCodeUrl (for single type) or check seats array (for screen type)
    let imageUrl = null;

    if (qrDetail.qrType === 'single') {
      imageUrl = qrDetail.qrCodeUrl;
    } else if (qrDetail.qrType === 'screen' && qrDetail.seats && qrDetail.seats.length > 0) {
      // For screen type, use the first seat's QR code (or we could download all)
      imageUrl = qrDetail.seats[0].qrCodeUrl;
    }

    if (!imageUrl) {
      return res.status(404).json({
        success: false,
        error: 'QR code image URL not found'
      });
    }


    // Fetch image from GCS
    const https = require('https');
    const http = require('http');
    const url = require('url');

    const parsedUrl = url.parse(imageUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;


    protocol.get(imageUrl, (imageResponse) => {
      if (imageResponse.statusCode !== 200) {
        console.error('❌ GCS fetch failed:', imageResponse.statusCode);
        return res.status(imageResponse.statusCode).json({
          success: false,
          error: 'Failed to fetch image'
        });
      }

      // Set headers for download
      const filename = `${qrDetail.qrName.replace(/[^a-zA-Z0-9\s]/g, '_').replace(/\s+/g, '_')}_QR.png`;

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      // Pipe the image to response
      imageResponse.pipe(res);

    }).on('error', (error) => {
      console.error('❌ Download error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to download image',
          message: error.message
        });
      }
    });

  } catch (error) {
    console.error('❌ Download QR code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download QR code',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/single-qrcodes/:id
 * Get a specific single QR code by ID
 */
router.get('/:id', [
  authenticateToken,
  param('id').isMongoId().withMessage('Valid single QR code ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const singleQR = await SingleQRCode.findById(req.params.id)
      .populate('theater', 'name location city');

    if (!singleQR) {
      return res.status(404).json({
        success: false,
        error: 'Single QR code not found'
      });
    }

    res.json({
      success: true,
      data: singleQR
    });

  } catch (error) {
    console.error('❌ Get Single QR Code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch single QR code',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * PUT /api/single-qrcodes/:id
 * Update a single QR code document (not individual QR details)
 */
router.put('/:id', [
  authenticateToken,
  param('id').isMongoId().withMessage('Valid single QR code ID is required'),
  body('qrName').optional().trim(),
  body('seatClass').optional().trim(),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { qrName, seatClass, isActive } = req.body;

    const singleQR = await SingleQRCode.findById(req.params.id);

    if (!singleQR) {
      return res.status(404).json({
        success: false,
        error: 'Single QR code not found'
      });
    }

    // Update allowed fields
    if (qrName !== undefined) singleQR.qrName = qrName;
    if (seatClass !== undefined) singleQR.seatClass = seatClass;
    if (isActive !== undefined) singleQR.isActive = isActive;

    await singleQR.save();
    await singleQR.populate('theater', 'name location city');


    res.json({
      success: true,
      message: 'Single QR code updated successfully',
      data: singleQR
    });

  } catch (error) {
    console.error('❌ Update Single QR Code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update single QR code',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * PUT /api/single-qrcodes/:id/details/:detailId
 * Update a specific QR detail within the array
 * Now regenerates the QR code with new data and deletes old image from GCS
 */
router.put('/:id/details/:detailId', [
  authenticateToken,
  param('id').isMongoId().withMessage('Valid single QR code ID is required'),
  param('detailId').isMongoId().withMessage('Valid QR detail ID is required'),
  body('qrName').optional().trim(),
  body('seatClass').optional().trim(),
  body('seat').optional().trim(),
  body('logoUrl').optional().trim(),
  body('logoType').optional().isIn(['default', 'theater', 'custom', '']),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id, detailId } = req.params;
    const updates = req.body;

    const singleQR = await SingleQRCode.findById(id).populate('theater', 'name location city');

    if (!singleQR) {
      return res.status(404).json({
        success: false,
        error: 'Single QR code not found'
      });
    }

    // Get the existing QR detail
    const qrDetail = singleQR.qrDetails.id(detailId);

    if (!qrDetail) {
      return res.status(404).json({
        success: false,
        error: 'QR detail not found'
      });
    }

    // Check if we need to regenerate the QR code (if critical data changed)
    const needsRegeneration =
      (updates.qrName && updates.qrName !== qrDetail.qrName) ||
      (updates.seatClass && updates.seatClass !== qrDetail.seatClass) ||
      (updates.seat && updates.seat !== qrDetail.seat) ||
      (updates.logoUrl && updates.logoUrl !== qrDetail.logoUrl);

    if (needsRegeneration) {

      // Store old QR code URL for deletion
      const oldQrCodeUrl = qrDetail.qrCodeUrl;

      // Generate new QR code with updated data
      const qrData = await generateSingleQRCode({
        theaterId: singleQR.theater._id,
        theaterName: singleQR.theater.name,
        qrName: updates.qrName || qrDetail.qrName,
        seatClass: updates.seatClass || qrDetail.seatClass,
        seat: updates.seat || qrDetail.seat || null,
        logoUrl: updates.logoUrl || qrDetail.logoUrl,
        logoType: updates.logoType || qrDetail.logoType,
        orientation: updates.orientation || qrDetail.orientation || 'landscape',
        userId: req.user.id
      });

      // Update with new QR code data
      updates.qrCodeUrl = qrData.qrCodeUrl;
      updates.qrCodeData = qrData.qrCodeData;


      // Delete old QR code from GCS
      if (oldQrCodeUrl) {
        const deletedFromGCS = await deleteFile(oldQrCodeUrl);
        if (deletedFromGCS) {
        } else {
          console.warn('⚠️  Failed to delete old QR code from GCS (may not exist)');
        }
      }
    } else {
    }

    // ✅ FIX: Convert isActive to boolean properly (handles string or boolean input)
    if (updates.isActive !== undefined) {
      const isActiveValue = updates.isActive === true || updates.isActive === 'true';
      updates.isActive = isActiveValue;
      console.log('🔄 Updating QR detail isActive status:', {
        detailId,
        receivedValue: req.body.isActive,
        convertedValue: isActiveValue
      });
    }

    // Update the QR detail with all changes
    await singleQR.updateQRDetail(detailId, updates);


    res.json({
      success: true,
      message: needsRegeneration
        ? 'QR code regenerated and updated successfully'
        : 'QR detail updated successfully',
      data: singleQR
    });

  } catch (error) {
    console.error('❌ Update QR Detail error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update QR detail',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * PUT /api/single-qrcodes/:id/details/:detailId/seats/:seatId
 * PHASE 3: Update a specific seat within a screen-type QR code
 * Allows seat-wise updates for individual seat properties (seat number, active status, QR code URL)
 */
router.put('/:id/details/:detailId/seats/:seatId', [
  authenticateToken,
  param('id').isMongoId().withMessage('Valid single QR code ID is required'),
  param('detailId').isMongoId().withMessage('Valid QR detail ID is required'),
  param('seatId').isMongoId().withMessage('Valid seat ID is required'),
  body('seat').optional().isString().trim().withMessage('Seat number must be a string'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body('qrCodeUrl').optional().isString().trim().withMessage('QR code URL must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id, detailId, seatId } = req.params;
    const { seat, isActive, qrCodeUrl } = req.body;


    // Find the SingleQRCode document
    const singleQR = await SingleQRCode.findById(id);

    if (!singleQR) {
      return res.status(404).json({
        success: false,
        error: 'Single QR code document not found'
      });
    }

    // Find the specific QR detail
    const qrDetail = singleQR.qrDetails.id(detailId);

    if (!qrDetail) {
      return res.status(404).json({
        success: false,
        error: 'QR detail not found'
      });
    }

    // Verify it's a screen type with seats
    if (qrDetail.qrType !== 'screen' || !qrDetail.seats) {
      return res.status(400).json({
        success: false,
        error: 'This QR detail is not a screen type or has no seats'
      });
    }

    // Find the specific seat
    const seatIndex = qrDetail.seats.findIndex(s => s._id.toString() === seatId);

    if (seatIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Seat not found in QR detail'
      });
    }

    // Update seat properties
    if (seat !== undefined) {
      qrDetail.seats[seatIndex].seat = seat;
    }

    if (isActive !== undefined) {
      qrDetail.seats[seatIndex].isActive = isActive;
    }

    if (qrCodeUrl !== undefined) {
      qrDetail.seats[seatIndex].qrCodeUrl = qrCodeUrl;
    }

    qrDetail.seats[seatIndex].updatedAt = Date.now();

    // Save the document
    await singleQR.save();


    res.json({
      success: true,
      message: 'Seat updated successfully',
      data: {
        seat: qrDetail.seats[seatIndex],
        qrDetail: qrDetail
      }
    });

  } catch (error) {
    console.error('❌ Update seat error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update seat',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/single-qrcodes/:id/details/:detailId/seats
 * Add a new seat to an existing screen-type QR code
 */
router.post('/:id/details/:detailId/seats', [
  authenticateToken,
  param('id').isMongoId().withMessage('Valid single QR code ID is required'),
  param('detailId').isMongoId().withMessage('Valid QR detail ID is required'),
  body('seat').isString().trim().notEmpty().withMessage('Seat number is required'),
  body('qrCodeUrl').optional().isString().trim().withMessage('QR code URL must be a string'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id, detailId } = req.params;
    const { seat, qrCodeUrl, isActive = true } = req.body;


    // Find the SingleQRCode document
    const singleQR = await SingleQRCode.findById(id);

    if (!singleQR) {
      return res.status(404).json({
        success: false,
        error: 'Single QR code document not found'
      });
    }

    // Find the specific QR detail
    const qrDetail = singleQR.qrDetails.id(detailId);

    if (!qrDetail) {
      return res.status(404).json({
        success: false,
        error: 'QR detail not found'
      });
    }

    // Verify it's a screen type
    if (qrDetail.qrType !== 'screen') {
      return res.status(400).json({
        success: false,
        error: 'Can only add seats to screen-type QR codes'
      });
    }

    // Check if seat already exists
    const existingSeat = qrDetail.seats?.find(s => s.seat === seat);
    if (existingSeat) {
      return res.status(400).json({
        success: false,
        error: `Seat ${seat} already exists in this screen`
      });
    }

    // Initialize seats array if it doesn't exist
    if (!qrDetail.seats) {
      qrDetail.seats = [];
    }

    // Generate QR code for the new seat if URL not provided
    let finalQRCodeUrl = qrCodeUrl;
    let qrCodeData = '';
    let finalLogoUrl = null;
    let finalLogoType = 'theater';

    if (!finalQRCodeUrl) {
      try {
        const { generateSingleQRCode } = require('../utils/singleQRGenerator');
        const Theater = require('../models/Theater');

        // Get theater details
        const theater = await Theater.findById(singleQR.theater);

        // Determine logo type and URL
        finalLogoType = qrDetail.logoType || 'theater';
        const existingSeatsWithLogo = qrDetail.seats?.filter(s => s.logoUrl || s.logoType) || [];

        if (existingSeatsWithLogo.length > 0) {
          const referenceSeat = existingSeatsWithLogo[0];
          finalLogoUrl = referenceSeat.logoUrl;
          finalLogoType = referenceSeat.logoType || 'theater';
          console.log('📋 Using logo from existing seat:', {
            seat: referenceSeat.seat,
            logoUrl: finalLogoUrl,
            logoType: finalLogoType
          });
        } else {
          const { getQRSettings } = require('../utils/qrCodeGenerator');
          const settings = await getQRSettings(singleQR.theater, finalLogoType);
          finalLogoUrl = qrDetail.logoUrl || settings.logoUrl;
        }

        console.log('🎨 Generating QR for new seat:', {
          theaterId: singleQR.theater,
          theaterName: theater?.name,
          qrName: qrDetail.qrName,
          seatClass: qrDetail.seatClass,
          seat: seat,
          logoUrl: finalLogoUrl,
          logoType: finalLogoType
        });

        const result = await generateSingleQRCode({
          theaterId: singleQR.theater,
          theaterName: theater?.name || 'theater',
          qrName: qrDetail.qrName,
          seatClass: qrDetail.seatClass,
          seat: seat,
          logoUrl: finalLogoUrl,
          logoType: finalLogoType,
          orientation: qrDetail.orientation || 'landscape',
          userId: req.user?.id || 'system'
        });

        finalQRCodeUrl = result.qrCodeUrl;
        qrCodeData = result.qrCodeData;


      } catch (qrError) {
        console.error('❌ Failed to generate QR code:', qrError);

        // Use environment variables for base URL
        const baseUrl = process.env.BASE_URL?.trim() || process.env.FRONTEND_URL?.trim() || 'http://localhost:3000';

        qrCodeData = `${baseUrl}/menu/${singleQR.theater}?qrName=${encodeURIComponent(
          qrDetail.qrName
        )}&seat=${encodeURIComponent(seat)}&type=screen`;
      }
    } else {
      // Use environment variables for base URL
      const baseUrl = process.env.BASE_URL?.trim() || process.env.FRONTEND_URL?.trim() || 'http://localhost:3000';

      qrCodeData = `${baseUrl}/menu/${singleQR.theater}?qrName=${encodeURIComponent(
        qrDetail.qrName
      )}&seat=${encodeURIComponent(seat)}&type=screen`;
    }

    // Add new seat data
    qrDetail.seats.push({
      seat: seat,
      qrCodeUrl: finalQRCodeUrl || '',
      qrCodeData: qrCodeData,
      logoUrl: finalLogoUrl || '',
      logoType: finalLogoType || 'theater',
      orientation: qrDetail.orientation || 'landscape', // Use parent QR detail orientation
      isActive: isActive,
      scanCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });


    // Save the document
    await singleQR.save();


    // Get the newly added seat
    const newSeat = qrDetail.seats[qrDetail.seats.length - 1];

    res.json({
      success: true,
      message: `Seat ${seat} added successfully`,
      data: {
        seat: newSeat,
        qrDetail: qrDetail
      }
    });

  } catch (error) {
    console.error('❌ Add seat error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add seat',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * DELETE /api/single-qrcodes/:id/details/:detailId/seats/:seatId
 * Delete a specific seat from a screen-type QR code
 */
router.delete('/:id/details/:detailId/seats/:seatId', [
  authenticateToken,
  param('id').isMongoId().withMessage('Valid single QR code ID is required'),
  param('detailId').isMongoId().withMessage('Valid QR detail ID is required'),
  param('seatId').isMongoId().withMessage('Valid seat ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id, detailId, seatId } = req.params;


    // Find the SingleQRCode document
    const singleQR = await SingleQRCode.findById(id);

    if (!singleQR) {
      return res.status(404).json({
        success: false,
        error: 'Single QR code document not found'
      });
    }

    // Find the specific QR detail
    const qrDetail = singleQR.qrDetails.id(detailId);

    if (!qrDetail) {
      return res.status(404).json({
        success: false,
        error: 'QR detail not found'
      });
    }

    // Verify it's a screen type with seats
    if (qrDetail.qrType !== 'screen' || !qrDetail.seats) {
      return res.status(400).json({
        success: false,
        error: 'This QR detail is not a screen type or has no seats'
      });
    }

    // Find the seat index
    const seatIndex = qrDetail.seats.findIndex(s => s._id.toString() === seatId);

    if (seatIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Seat not found in QR detail'
      });
    }

    // Get seat info before deletion for logging
    const deletedSeat = qrDetail.seats[seatIndex];

    // Remove the seat from the array
    qrDetail.seats.splice(seatIndex, 1);

    // Save the document
    await singleQR.save();


    res.json({
      success: true,
      message: `Seat ${deletedSeat.seat} deleted successfully`,
      data: {
        deletedSeat: deletedSeat.seat,
        remainingSeats: qrDetail.seats.length
      }
    });

  } catch (error) {
    console.error('❌ Delete seat error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete seat',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * DELETE /api/single-qrcodes/:id
 * Delete (soft delete) a single QR code document
 */
router.delete('/:id', [
  authenticateToken,
  param('id').isMongoId().withMessage('Valid single QR code ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { permanent } = req.query;

    if (permanent === 'true') {
      // Permanent delete
      const singleQR = await SingleQRCode.findByIdAndDelete(req.params.id);

      if (!singleQR) {
        return res.status(404).json({
          success: false,
          error: 'Single QR code not found'
        });
      }


      res.json({
        success: true,
        message: 'Single QR code permanently deleted'
      });
    } else {
      // Soft delete
      const singleQR = await SingleQRCode.findById(req.params.id);

      if (!singleQR) {
        return res.status(404).json({
          success: false,
          error: 'Single QR code not found'
        });
      }

      singleQR.isActive = false;
      await singleQR.save();


      res.json({
        success: true,
        message: 'Single QR code deactivated successfully',
        data: singleQR
      });
    }

  } catch (error) {
    console.error('❌ Delete Single QR Code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete single QR code',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * DELETE /api/single-qrcodes/:id/details/:detailId
 * Delete a specific QR detail from the array
 */
router.delete('/:id/details/:detailId', [
  authenticateToken,
  param('id').isMongoId().withMessage('Valid single QR code ID is required'),
  param('detailId').isMongoId().withMessage('Valid QR detail ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id, detailId } = req.params;
    const { permanent } = req.query;

    const singleQR = await SingleQRCode.findById(id);

    if (!singleQR) {
      return res.status(404).json({
        success: false,
        error: 'Single QR code not found'
      });
    }

    // Get the QR detail before deletion to access qrCodeUrl
    const qrDetail = singleQR.qrDetails.id(detailId);

    if (!qrDetail) {
      return res.status(404).json({
        success: false,
        error: 'QR detail not found'
      });
    }

    if (permanent === 'true') {
      // Delete QR code image from Google Cloud Storage
      if (qrDetail.qrCodeUrl) {
        const deletedFromGCS = await deleteFile(qrDetail.qrCodeUrl);
        if (deletedFromGCS) {
        } else {
          console.warn('⚠️  Failed to delete QR code image from GCS (may not exist)');
        }
      }

      // Also delete seat QR codes if it's a screen type with seats array
      if (qrDetail.qrType === 'screen' && qrDetail.seats && qrDetail.seats.length > 0) {
        for (const seat of qrDetail.seats) {
          if (seat.qrCodeUrl) {
            await deleteFile(seat.qrCodeUrl);
          }
        }
      }

      // Permanently remove from array
      await singleQR.deleteQRDetail(detailId);
    } else {
      // Soft delete (deactivate) - keep the image in GCS
      await singleQR.deactivateQRDetail(detailId);
    }

    await singleQR.populate('theater', 'name location city');

    res.json({
      success: true,
      message: permanent === 'true' ? 'QR detail permanently deleted' : 'QR detail deactivated successfully',
      data: singleQR
    });

  } catch (error) {
    console.error('❌ Delete QR Detail error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete QR detail',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/single-qrcodes/:id/details/:detailId/scan
 * Record a scan for a specific QR detail
 */
router.post('/:id/details/:detailId/scan', [
  param('id').isMongoId().withMessage('Valid single QR code ID is required'),
  param('detailId').isMongoId().withMessage('Valid QR detail ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id, detailId } = req.params;

    const singleQR = await SingleQRCode.findById(id);

    if (!singleQR) {
      return res.status(404).json({
        success: false,
        error: 'Single QR code not found'
      });
    }

    await singleQR.recordScan(detailId);


    res.json({
      success: true,
      message: 'QR scan recorded successfully',
      data: {
        scanCount: singleQR.qrDetails.id(detailId).scanCount,
        totalScans: singleQR.metadata.totalScans
      }
    });

  } catch (error) {
    console.error('❌ Record QR Scan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record QR scan',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/single-qrcodes/stats/summary
 * Get summary statistics for single QR codes
 */
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const { theaterId } = req.query;

    const matchStage = theaterId ? { theater: mongoose.Types.ObjectId(theaterId) } : {};

    const stats = await SingleQRCode.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalDocuments: { $sum: 1 },
          activeDocuments: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          totalQRs: { $sum: '$metadata.totalQRs' },
          totalActiveQRs: { $sum: '$metadata.activeQRs' },
          totalScans: { $sum: '$metadata.totalScans' }
        }
      }
    ]);

    res.json({
      success: true,
      data: stats[0] || {
        totalDocuments: 0,
        activeDocuments: 0,
        totalQRs: 0,
        totalActiveQRs: 0,
        totalScans: 0
      }
    });

  } catch (error) {
    console.error('❌ Get Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/singleqrcodes/verify-qr/:qrName
 * Verify if a QR code is active by qrName
 * Public endpoint for customer QR scanning
 */
router.get('/verify-qr/:qrName', async (req, res) => {
  try {
    const { qrName } = req.params;
    const { theaterId } = req.query;


    if (!qrName) {
      return res.status(400).json({
        success: false,
        error: 'QR name is required'
      });
    }

    // Build query - Find document with matching qrName (case-insensitive and trimmed)
    // Try exact match first, then case-insensitive match
    const trimmedQrName = qrName.trim();

    let query = {
      'qrDetails.qrName': { $regex: new RegExp(`^${trimmedQrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    };

    if (theaterId) {
      query.theater = new mongoose.Types.ObjectId(theaterId);
    }

    // Find the QR code document (without isActive filter to check manually)
    let qrCodeDoc;
    try {
      qrCodeDoc = await SingleQRCode.findOne(query)
        .populate('theater', 'name fullAddress phone')
        .lean();
    } catch (err) {
      if (err.message && err.message.includes('Connection was force closed')) {
        console.warn('⚠️ Connection closed during QR verification, retrying...');
        await new Promise(resolve => setTimeout(resolve, 500));
        qrCodeDoc = await SingleQRCode.findOne(query)
          .populate('theater', 'name fullAddress phone')
          .lean();
      } else {
        throw err;
      }
    }

    // If case-insensitive search didn't work, try exact match
    if (!qrCodeDoc) {
      query = {
        'qrDetails.qrName': trimmedQrName
      };
      if (theaterId) {
        query.theater = new mongoose.Types.ObjectId(theaterId);
      }

      try {
        qrCodeDoc = await SingleQRCode.findOne(query)
          .populate('theater', 'name fullAddress phone')
          .lean();
      } catch (err) {
        if (err.message && err.message.includes('Connection was force closed')) {
          console.warn('⚠️ Connection closed during fallback QR verification, retrying...');
          await new Promise(resolve => setTimeout(resolve, 500));
          qrCodeDoc = await SingleQRCode.findOne(query)
            .populate('theater', 'name fullAddress phone')
            .lean();
        } else {
          throw err;
        }
      }
    }

    if (!qrCodeDoc) {
      // Return success: false but don't block access - allow menu to load
      return res.json({
        success: false,
        error: 'QR code not found',
        isActive: null, // null means unknown, not explicitly inactive
        message: 'QR code not found in database, but allowing access'
      });
    }

    // Find the specific QR detail and check isActive (case-insensitive match)
    const qrDetail = qrCodeDoc.qrDetails.find(detail =>
      detail.qrName && detail.qrName.trim().toLowerCase() === trimmedQrName.toLowerCase()
    );

    if (!qrDetail) {
      console.log('❌ QR Detail not found in qrDetails array:', {
        searchedQrName: trimmedQrName,
        availableQrNames: qrCodeDoc.qrDetails.map(d => d.qrName)
      });
      // Return success: false but don't block access
      return res.json({
        success: false,
        error: 'QR detail not found',
        isActive: null, // null means unknown
        message: 'QR detail not found, but allowing access'
      });
    }

    // Check if the QR detail is active
    if (!qrDetail.isActive) {
      console.log('❌ QR Detail is deactivated:', {
        qrName: qrDetail.qrName,
        isActive: qrDetail.isActive
      });
      return res.status(403).json({
        success: false,
        error: 'QR code is deactivated',
        isActive: false,
        message: 'Oops! This service is not available right now.'
      });
    }

    console.log('✅ QR Code verified successfully:', {
      qrName: qrDetail.qrName,
      isActive: qrDetail.isActive,
      qrType: qrDetail.qrType
    });

    res.json({
      success: true,
      isActive: true,
      data: {
        qrName: qrDetail.qrName,
        seatClass: qrDetail.seatClass,
        qrType: qrDetail.qrType,
        theater: qrCodeDoc.theater,
        message: 'QR code is active and valid'
      }
    });

  } catch (error) {
    console.error('❌ Verify QR error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify QR code',
      message: error.message || 'Internal server error'
    });
  }
});

module.exports = router;
