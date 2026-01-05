const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Theater = require('../models/Theater');
const Settings = require('../models/Settings');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/uploadMiddleware');
const { uploadFiles, deleteFiles } = require('../utils/gcsUploadUtil');
const roleService = require('../services/roleService');
const mongoose = require('mongoose');

const router = express.Router();

/**
 * GET /api/theaters
 * Get all theaters with pagination and filtering
 */
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('q').optional().isLength({ min: 1 })
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'Database connection not available',
        data: [],
        pagination: {
          current: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 10,
          total: 0,
          totalItems: 0,
          pages: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        }
      });
    }

    // Parse query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, q, isActive } = req.query;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { username: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { 'address.city': { $regex: q, $options: 'i' } }
      ];
    }

    // Execute queries
    const [theaters, total] = await Promise.all([
      Theater.find()
        .select('-password')
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Theater.countDocuments(filter),
    ]);

    // Build response
    const totalPages = Math.ceil(total / limit);
    res.json({
      success: true,
      data: theaters || [],
      pagination: {
        current: page,
        limit,
        total,
        totalItems: total,
        pages: totalPages,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get theaters error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch theaters',
      message: error.message,
      data: [],
      pagination: {
        current: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 10,
        total: 0,
        totalItems: 0,
        pages: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      }
    });
  }
});

/**
 * GET /api/theaters/expiring-agreements
 * Get theaters with agreements expiring within 5 days
 * NOTE: Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get('/expiring-agreements', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const fiveDaysFromNow = new Date(now);
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
    
    const expiringTheaters = await Theater.find({
      'agreementDetails.endDate': {
        $gte: now,
        $lte: fiveDaysFromNow
      },
      isActive: true
    })
    .select('name _id agreementDetails.endDate ownerDetails.contactNumber')
    .lean();

    const theatersWithDays = expiringTheaters.map(theater => {
      const endDate = new Date(theater.agreementDetails.endDate);
      const daysUntilExpiration = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      
      return {
        theaterId: theater._id,
        theaterName: theater.name,
        endDate: theater.agreementDetails.endDate,
        daysUntilExpiration,
        contactNumber: theater.ownerDetails?.contactNumber || null
      };
    });

    res.json({
      success: true,
      data: {
        expiringTheaters: theatersWithDays,
        count: theatersWithDays.length,
        checkDate: now,
        expirationWindow: 5
      }
    });
  } catch (error) {
    console.error('Error fetching expiring agreements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch expiring agreements',
      message: error.message
    });
  }
});

/**
 * GET /api/theaters/:id/dashboard
 * Get theater dashboard data
 * NOTE: Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get('/:id/dashboard', authenticateToken, async (req, res) => {
  try {
    const theater = await Theater.findById(req.params.id).select('-password');
    if (!theater) {
      return res.status(404).json({
        success: false,
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    // Check authorization
    if (req.user.role !== 'super_admin' && req.user.theaterId?.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // Get dashboard statistics
    const Product = require('../models/Product');
    const Order = require('../models/Order');
    
    const [
      totalProducts,
      activeProducts,
      totalOrders,
      todayOrders,
      todayRevenue
    ] = await Promise.all([
      Product.countDocuments({ theaterId: req.params.id }),
      Product.countDocuments({ theaterId: req.params.id, isActive: true, status: 'active' }),
      Order.countDocuments({ theaterId: req.params.id }),
      Order.countDocuments({ 
        theaterId: req.params.id,
        createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
      }),
      Order.aggregate([
        {
          $match: {
            theaterId: new mongoose.Types.ObjectId(req.params.id),
            createdAt: { $gte: new Date().setHours(0, 0, 0, 0) },
            'payment.status': 'paid'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$pricing.total' }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      data: {
        theater: {
          id: theater._id,
          name: theater.name,
          status: theater.status,
          isActive: theater.isActive
        },
        stats: {
          products: {
            total: totalProducts,
            active: activeProducts
          },
          orders: {
            total: totalOrders,
            today: todayOrders
          },
          revenue: {
            today: todayRevenue.length > 0 ? todayRevenue[0].total : 0,
            currency: theater.settings?.currency || 'INR'
          }
        }
      }
    });

  } catch (error) {
    console.error('Get dashboard error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid theater ID',
        code: 'INVALID_ID'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
      message: error.message
    });
  }
});

/**
 * GET /api/theaters/:theaterId/agreement-status
 * Get agreement expiration status for a specific theater
 * NOTE: Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get('/:theaterId/agreement-status', authenticateToken, async (req, res) => {
  try {
    const theater = await Theater.findById(req.params.theaterId)
      .select('name agreementDetails.endDate isActive')
      .lean();

    if (!theater) {
      return res.status(404).json({
        success: false,
        error: 'Theater not found'
      });
    }

    if (!theater.agreementDetails?.endDate) {
      return res.json({
        success: true,
        data: {
          hasAgreement: false,
          isExpiring: false,
          daysUntilExpiration: null
        }
      });
    }

    const now = new Date();
    const endDate = new Date(theater.agreementDetails.endDate);
    const daysUntilExpiration = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    const isExpiring = daysUntilExpiration <= 5 && daysUntilExpiration >= 0;
    const isExpired = daysUntilExpiration < 0;

    res.json({
      success: true,
      data: {
        hasAgreement: true,
        isExpiring,
        isExpired,
        daysUntilExpiration: isExpired ? 0 : daysUntilExpiration,
        endDate: theater.agreementDetails.endDate
      }
    });
  } catch (error) {
    console.error('Error fetching agreement status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agreement status',
      message: error.message
    });
  }
});

/**
 * GET /api/theaters/:id
 * Get a specific theater by ID
 * NOTE: This must be defined AFTER all specific routes to avoid conflicts
 */
router.get('/:id', async (req, res) => {
  try {
    const theater = await Theater.findById(req.params.id)
      .select('-password -__v')
      .lean();

    if (!theater) {
      return res.status(404).json({
        success: false,
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: theater
    });

  } catch (error) {
    console.error('Get theater error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid theater ID',
        code: 'INVALID_ID'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to fetch theater',
      message: error.message
    });
  }
});

/**
 * POST /api/theaters
 * Create a new theater with file uploads
 */
router.post('/', 
  authenticateToken,
  requireRole(['super_admin']),
  upload.fields([
    { name: 'theaterPhoto', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
    { name: 'aadharCard', maxCount: 1 },
    { name: 'panCard', maxCount: 1 },
    { name: 'gstCertificate', maxCount: 1 },
    { name: 'fssaiCertificate', maxCount: 1 },
    { name: 'agreementCopy', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const {
        name,
        username,
        password,
        email,
        phone,
        address,
        street,
        city,
        state,
        pincode,
        ownerName,
        ownerContactNumber,
        personalAddress,
        ownerPersonalAddress,
        agreementStartDate,
        agreementEndDate,
        facebook,
        instagram,
        twitter,
        youtube,
        website
      } = req.body;

      // Validate required fields
      if (!name || !username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Theater name, username, and password are required'
        });
      }

      // Check for duplicates
      const existingTheater = await Theater.findOne({ username: username.toLowerCase() });
      if (existingTheater) {
        return res.status(409).json({
          success: false,
          error: 'Username already exists',
          code: 'USERNAME_EXISTS'
        });
      }

      if (email) {
        const existingEmail = await Theater.findOne({ email: email.toLowerCase() });
        if (existingEmail) {
          return res.status(409).json({
            success: false,
            error: 'Email already exists',
            code: 'EMAIL_EXISTS'
          });
        }
      }

      // Upload files
      let fileUrls = {};
      if (req.files && Object.keys(req.files).length > 0) {
        try {
          const sanitizedTheaterName = name.trim().replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, ' ');
          const theaterFolder = `theater list/${sanitizedTheaterName}`;
          const allFiles = [];
          Object.keys(req.files).forEach(fieldName => {
            req.files[fieldName].forEach(file => {
              allFiles.push({ ...file, fieldname: fieldName });
            });
          });
          fileUrls = await uploadFiles(allFiles, theaterFolder);
        } catch (uploadError) {
          console.error('File upload error:', uploadError);
          return res.status(500).json({
            success: false,
            error: 'Failed to upload files',
            message: uploadError.message
          });
        }
      }

      // Create theater
      const theaterData = {
        name: name.trim(),
        username: username.toLowerCase().trim(),
        password,
        email: email ? email.toLowerCase().trim() : undefined,
        phone: phone || undefined,
        address: {
          street: address || street || '',
          city: city || '',
          state: state || '',
          pincode: pincode || ''
        },
        location: {
          city: city || '',
          state: state || '',
          country: 'India'
        },
        ownerDetails: {
          name: ownerName || '',
          contactNumber: ownerContactNumber || '',
          personalAddress: personalAddress || ownerPersonalAddress || ''
        },
        agreementDetails: {
          startDate: agreementStartDate ? new Date(agreementStartDate) : undefined,
          endDate: agreementEndDate ? new Date(agreementEndDate) : undefined,
          copy: fileUrls.agreementCopy || null
        },
        documents: {
          theaterPhoto: fileUrls.theaterPhoto || null,
          logo: fileUrls.logo || null,
          aadharCard: fileUrls.aadharCard || null,
          panCard: fileUrls.panCard || null,
          gstCertificate: fileUrls.gstCertificate || null,
          fssaiCertificate: fileUrls.fssaiCertificate || null,
          agreementCopy: fileUrls.agreementCopy || null
        },
        socialMedia: {
          facebook: facebook || null,
          instagram: instagram || null,
          twitter: twitter || null,
          youtube: youtube || null,
          website: website || null
        },
        settings: {
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          language: 'en'
        },
        branding: {
          primaryColor: '#6B0E9B',
          secondaryColor: '#F3F4F6',
          logo: fileUrls.logo || null,
          logoUrl: fileUrls.logo || null
        },
        isActive: true,
        status: 'active'
      };

      const theater = new Theater(theaterData);
      const savedTheater = await theater.save();

      // Initialize defaults (non-blocking)
      Promise.all([
        Settings.initializeDefaults(savedTheater._id).catch(err => console.warn('Settings init failed:', err.message)),
        roleService.createDefaultTheaterAdminRole(savedTheater._id, savedTheater.name).catch(err => console.warn('Role creation failed:', err.message)),
        roleService.createDefaultKioskRole(savedTheater._id, savedTheater.name).catch(err => console.warn('Kiosk role creation failed:', err.message))
      ]);

      res.status(201).json({
        success: true,
        message: 'Theater created successfully',
        data: {
          id: savedTheater._id,
          name: savedTheater.name,
          username: savedTheater.username,
          email: savedTheater.email,
          phone: savedTheater.phone,
          status: savedTheater.status,
          documents: savedTheater.documents,
          createdAt: savedTheater.createdAt
        }
      });

    } catch (error) {
      console.error('Create theater error:', error);
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          error: 'Duplicate entry',
          message: 'Username or email already exists'
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to create theater',
        message: error.message
      });
    }
  });

/**
 * PUT /api/theaters/:id
 * Update a theater with optional file uploads
 */
router.put('/:id',
  authenticateToken,
  upload.fields([
    { name: 'theaterPhoto', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
    { name: 'aadharCard', maxCount: 1 },
    { name: 'panCard', maxCount: 1 },
    { name: 'gstCertificate', maxCount: 1 },
    { name: 'fssaiCertificate', maxCount: 1 },
    { name: 'agreementCopy', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const theater = await Theater.findById(req.params.id);
      if (!theater) {
        return res.status(404).json({
          success: false,
          error: 'Theater not found',
          code: 'THEATER_NOT_FOUND'
        });
      }

      // Check authorization
      if (req.user.role !== 'super_admin' && req.user.theaterId?.toString() !== req.params.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          code: 'ACCESS_DENIED'
        });
      }

      // Upload new files and delete old ones
      let fileUrls = {};
      if (req.files && Object.keys(req.files).length > 0) {
        try {
          const theaterName = req.body.name ? req.body.name.trim() : theater.name;
          const sanitizedTheaterName = theaterName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, ' ');
          const theaterFolder = `theater list/${sanitizedTheaterName}`;
          const allFiles = [];
          Object.keys(req.files).forEach(fieldName => {
            req.files[fieldName].forEach(file => {
              allFiles.push({ ...file, fieldname: fieldName });
            });
          });
          fileUrls = await uploadFiles(allFiles, theaterFolder);

          // Delete old files
          const filesToDelete = [];
          if (fileUrls.theaterPhoto && theater.documents?.theaterPhoto) filesToDelete.push(theater.documents.theaterPhoto);
          if (fileUrls.logo && theater.documents?.logo) filesToDelete.push(theater.documents.logo);
          if (fileUrls.aadharCard && theater.documents?.aadharCard) filesToDelete.push(theater.documents.aadharCard);
          if (fileUrls.panCard && theater.documents?.panCard) filesToDelete.push(theater.documents.panCard);
          if (fileUrls.gstCertificate && theater.documents?.gstCertificate) filesToDelete.push(theater.documents.gstCertificate);
          if (fileUrls.fssaiCertificate && theater.documents?.fssaiCertificate) filesToDelete.push(theater.documents.fssaiCertificate);
          if (fileUrls.agreementCopy && theater.agreementDetails?.copy) filesToDelete.push(theater.agreementDetails.copy);

          if (filesToDelete.length > 0) {
            await deleteFiles(filesToDelete);
          }
        } catch (uploadError) {
          console.error('File upload error:', uploadError);
          return res.status(500).json({
            success: false,
            error: 'Failed to upload files',
            message: uploadError.message
          });
        }
      }

      // Build update data
      const updateData = {};
      if (req.body.name) updateData.name = req.body.name.trim();
      if (req.body.email) updateData.email = req.body.email.toLowerCase().trim();
      if (req.body.phone) updateData.phone = req.body.phone;
      if (req.body.isActive !== undefined) {
        const isActiveValue = req.body.isActive === true || req.body.isActive === 'true';
        updateData.isActive = isActiveValue;
        
        // Update QR codes when theater status changes
        if (isActiveValue === false) {
          await Theater.updateOne(
            { _id: req.params.id },
            { $set: { 'qrCodes.$[].isActive': false } }
          ).catch(err => console.warn('QR deactivation failed:', err.message));
        } else if (isActiveValue === true) {
          await Theater.updateOne(
            { _id: req.params.id },
            { $set: { 'qrCodes.$[].isActive': true } }
          ).catch(err => console.warn('QR reactivation failed:', err.message));
        }
      }
      if (req.body.address || req.body.city || req.body.state || req.body.pincode) {
        updateData.address = {
          street: req.body.address || theater.address?.street || '',
          city: req.body.city || theater.address?.city || '',
          state: req.body.state || theater.address?.state || '',
          pincode: req.body.pincode || theater.address?.pincode || ''
        };
      }
      if (req.body.city || req.body.state) {
        updateData.location = {
          city: req.body.city || theater.location?.city || '',
          state: req.body.state || theater.location?.state || ''
        };
      }
      if (req.body.ownerName || req.body.ownerContactNumber || req.body.personalAddress) {
        updateData.ownerDetails = {
          name: req.body.ownerName || theater.ownerDetails?.name || '',
          contactNumber: req.body.ownerContactNumber || theater.ownerDetails?.contactNumber || '',
          personalAddress: req.body.personalAddress || theater.ownerDetails?.personalAddress || ''
        };
      }
      if (req.body.agreementStartDate || req.body.agreementEndDate || fileUrls.agreementCopy) {
        updateData.agreementDetails = {
          startDate: req.body.agreementStartDate ? new Date(req.body.agreementStartDate) : theater.agreementDetails?.startDate,
          endDate: req.body.agreementEndDate ? new Date(req.body.agreementEndDate) : theater.agreementDetails?.endDate,
          copy: fileUrls.agreementCopy || theater.agreementDetails?.copy || null
        };
      }
      if (Object.keys(fileUrls).length > 0) {
        updateData.documents = {
          theaterPhoto: fileUrls.theaterPhoto || theater.documents?.theaterPhoto || null,
          logo: fileUrls.logo || theater.documents?.logo || null,
          aadharCard: fileUrls.aadharCard || theater.documents?.aadharCard || null,
          panCard: fileUrls.panCard || theater.documents?.panCard || null,
          gstCertificate: fileUrls.gstCertificate || theater.documents?.gstCertificate || null,
          fssaiCertificate: fileUrls.fssaiCertificate || theater.documents?.fssaiCertificate || null,
          agreementCopy: fileUrls.agreementCopy || theater.documents?.agreementCopy || null
        };
        if (fileUrls.logo) {
          updateData.branding = {
            ...theater.branding,
            logo: fileUrls.logo
          };
        }
      }
      if (req.body.facebook || req.body.instagram || req.body.twitter || req.body.youtube || req.body.website) {
        updateData.socialMedia = {
          facebook: req.body.facebook || theater.socialMedia?.facebook || null,
          instagram: req.body.instagram || theater.socialMedia?.instagram || null,
          twitter: req.body.twitter || theater.socialMedia?.twitter || null,
          youtube: req.body.youtube || theater.socialMedia?.youtube || null,
          website: req.body.website || theater.socialMedia?.website || null
        };
      }
      if (req.body.paymentGateway) {
        updateData.paymentGateway = {
          ...req.body.paymentGateway,
          lastUpdated: new Date()
        };
      }

      // Update theater
      const updatedTheater = await Theater.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      res.json({
        success: true,
        message: 'Theater updated successfully',
        data: updatedTheater
      });

    } catch (error) {
      console.error('Update theater error:', error);
      if (error.name === 'CastError') {
        return res.status(400).json({
          success: false,
          error: 'Invalid theater ID',
          code: 'INVALID_ID'
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to update theater',
        message: error.message
      });
    }
  });

/**
 * DELETE /api/theaters/:id
 * Permanently delete a theater and all related data (CASCADE DELETE)
 */
router.delete('/:id',
  authenticateToken,
  requireRole(['super_admin']),
  async (req, res) => {
    try {
      const theaterId = req.params.id;
      const theater = await Theater.findById(theaterId);
      
      if (!theater) {
        return res.status(404).json({
          success: false,
          error: 'Theater not found',
          code: 'THEATER_NOT_FOUND'
        });
      }

      const deletionResults = { deleted: {}, errors: [] };

      // Delete related data
      try {
        const TheaterUserArray = require('../models/Theater');
        const usersDoc = await TheaterUserArray.findOne({ theaterId });
        if (usersDoc) {
          await TheaterUserArray.deleteOne({ theaterId });
          deletionResults.deleted.users = usersDoc.users.length;
        }
      } catch (error) {
        deletionResults.errors.push({ type: 'users', error: error.message });
      }

      try {
        const RoleArray = require('../models/RoleArray');
        const rolesDoc = await RoleArray.findOne({ theaterId });
        if (rolesDoc) {
          await RoleArray.deleteOne({ theaterId });
          deletionResults.deleted.roles = rolesDoc.roles.length;
        }
      } catch (error) {
        deletionResults.errors.push({ type: 'roles', error: error.message });
      }

      try {
        const ProductList = require('../models/ProductList');
        const products = await ProductList.find({ theater: theaterId });
        await ProductList.deleteMany({ theater: theaterId });
        deletionResults.deleted.products = products.length;
      } catch (error) {
        deletionResults.errors.push({ type: 'products', error: error.message });
      }

      try {
        const TheaterOrder = require('../models/TheaterOrder');
        const orders = await TheaterOrder.find({ theater: theaterId });
        await TheaterOrder.deleteMany({ theater: theaterId });
        deletionResults.deleted.orders = orders.length;
      } catch (error) {
        deletionResults.errors.push({ type: 'orders', error: error.message });
      }

      try {
        const QRCodeName = require('../models/QRCodeName');
        const qrCodes = await QRCodeName.find({ theater: theaterId });
        await QRCodeName.deleteMany({ theater: theaterId });
        deletionResults.deleted.qrCodes = qrCodes.length;
      } catch (error) {
        deletionResults.errors.push({ type: 'qrCodes', error: error.message });
      }

      try {
        const Setting = require('../models/Setting');
        await Setting.deleteOne({ theater: theaterId });
        deletionResults.deleted.settings = 1;
      } catch (error) {
        deletionResults.errors.push({ type: 'settings', error: error.message });
      }

      // Delete files
      const filesToDelete = [];
      if (theater.documents?.theaterPhoto) filesToDelete.push(theater.documents.theaterPhoto);
      if (theater.documents?.logo) filesToDelete.push(theater.documents.logo);
      if (theater.documents?.aadharCard) filesToDelete.push(theater.documents.aadharCard);
      if (theater.documents?.panCard) filesToDelete.push(theater.documents.panCard);
      if (theater.documents?.gstCertificate) filesToDelete.push(theater.documents.gstCertificate);
      if (theater.documents?.fssaiCertificate) filesToDelete.push(theater.documents.fssaiCertificate);
      if (theater.agreementDetails?.copy) filesToDelete.push(theater.agreementDetails.copy);

      if (filesToDelete.length > 0) {
        try {
          await deleteFiles(filesToDelete);
          deletionResults.deleted.files = filesToDelete.length;
        } catch (error) {
          deletionResults.errors.push({ type: 'files', error: error.message });
        }
      }

      // Delete theater
      await Theater.findByIdAndDelete(theaterId);
      deletionResults.deleted.theater = true;

      res.json({
        success: true,
        message: `Theater "${theater.name}" and all related data deleted permanently`,
        summary: deletionResults.deleted,
        warnings: deletionResults.errors.length > 0 ? deletionResults.errors : undefined
      });

    } catch (error) {
      console.error('Delete theater error:', error);
      if (error.name === 'CastError') {
        return res.status(400).json({
          success: false,
          error: 'Invalid theater ID',
          code: 'INVALID_ID'
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to delete theater',
        message: error.message
      });
    }
  });

/**
 * PUT /api/theaters/:id/password
 * Update theater password
 */
router.put('/:id/password', [
  authenticateToken,
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
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

    const theater = await Theater.findById(req.params.id);
    if (!theater) {
      return res.status(404).json({
        success: false,
        error: 'Theater not found',
        code: 'THEATER_NOT_FOUND'
      });
    }

    // Check authorization
    if (req.user.role !== 'super_admin' && req.user.theaterId?.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // Verify current password (only if not super admin)
    if (req.user.role !== 'super_admin' && req.body.currentPassword) {
      const isCurrentPasswordValid = await theater.comparePassword(req.body.currentPassword);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          error: 'Current password is incorrect',
          code: 'INVALID_CURRENT_PASSWORD'
        });
      }
    }

    // Update password
    theater.password = req.body.newPassword;
    await theater.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Update password error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid theater ID',
        code: 'INVALID_ID'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to update password',
      message: error.message
    });
  }
});

module.exports = router;
