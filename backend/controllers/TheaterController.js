const BaseController = require('./BaseController');
const theaterService = require('../services/TheaterService');
const { uploadFiles, deleteFiles } = require('../utils/vpsUploadUtil');

/**
 * Theater Controller
 * Handles HTTP requests and responses for theater endpoints
 */
class TheaterController extends BaseController {
  /**
   * GET /api/theaters
   * Get all theaters with pagination and filtering
   */
  static async getAll(req, res) {
    const startTime = Date.now();
    try {
      // Check database connection
      if (!BaseController.checkDatabaseConnection()) {
        return res.status(503).json(
          BaseController.getDatabaseErrorResponse(req)
        );
      }

      const result = await theaterService.getTheaters(req.query);
      const duration = Date.now() - startTime;
      return BaseController.paginated(res, result.data, result.pagination);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [TheaterController] Get theaters error after ${duration}ms:`, error);
      return BaseController.error(res, 'Failed to fetch theaters', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/theaters/:id
   * Get a specific theater by ID
   */
  static async getById(req, res) {
    try {
      const theater = await theaterService.getTheaterById(req.params.id);

      if (!theater) {
        return BaseController.error(res, 'Theater not found', 404, {
          code: 'THEATER_NOT_FOUND'
        });
      }

      return BaseController.success(res, theater);
    } catch (error) {
      console.error('Get theater error:', error);
      if (error.name === 'CastError') {
        return BaseController.error(res, 'Invalid theater ID', 400, {
          code: 'INVALID_ID'
        });
      }
      return BaseController.error(res, 'Failed to fetch theater', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/theaters
   * Create a new theater
   */
  static async create(req, res) {
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
        website,
        gstNumber,
        fssaiNumber,
        uniqueNumber
      } = req.body;

      // Validate required fields
      if (!name || !username || !password) {
        return BaseController.error(res, 'Theater name, username, and password are required', 400);
      }

      // Check for duplicates
      if (await theaterService.usernameExists(username)) {
        return BaseController.error(res, 'Username already exists', 409, {
          code: 'USERNAME_EXISTS'
        });
      }

      if (email && await theaterService.emailExists(email)) {
        return BaseController.error(res, 'Email already exists', 409, {
          code: 'EMAIL_EXISTS'
        });
      }

      // Upload files
      let fileUrls = {};
      const sanitizedTheaterName = name.trim().replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, ' ');
      const theaterFolder = `theater list/${sanitizedTheaterName}`;

      // Handle file uploads from multer (req.files)
      if (req.files && Object.keys(req.files).length > 0) {
        try {
          const allFiles = [];
          Object.keys(req.files).forEach(fieldName => {
            req.files[fieldName].forEach(file => {
              allFiles.push({ ...file, fieldname: fieldName });
            });
          });

          const uploadedUrls = await uploadFiles(allFiles, theaterFolder);
          fileUrls = { ...fileUrls, ...uploadedUrls };
        } catch (uploadError) {
          console.error('❌ [TheaterController] File upload error:', uploadError);
          console.error('   Error stack:', uploadError.stack);
          return BaseController.error(res, 'Failed to upload files', 500, {
            message: uploadError.message
          });
        }
      }

      // Handle base64 images from req.body (frontend sends base64 strings)
      const documentFields = ['theaterPhoto', 'logo', 'aadharCard', 'panCard', 'gstCertificate', 'fssaiCertificate', 'agreementCopy'];
      const base64Files = [];

      for (const fieldName of documentFields) {
        const fieldValue = req.body[fieldName];

        // Skip if already uploaded via multer
        if (fileUrls[fieldName]) {
          continue;
        }

        // Check if base64 string
        if (fieldValue && typeof fieldValue === 'string' && fieldValue.startsWith('data:')) {
          try {
            // Parse base64 data URL
            const matches = fieldValue.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
              console.warn(`⚠️  Invalid base64 format for ${fieldName}, skipping`);
              continue;
            }

            const mimetype = matches[1];
            const base64Data = matches[2];

            // Convert base64 to buffer
            const fileBuffer = Buffer.from(base64Data, 'base64');

            // Determine file extension from mimetype
            let ext = '.jpg';
            if (mimetype.includes('png')) ext = '.png';
            else if (mimetype.includes('jpeg') || mimetype.includes('jpg')) ext = '.jpg';
            else if (mimetype.includes('gif')) ext = '.gif';
            else if (mimetype.includes('pdf')) ext = '.pdf';
            else if (mimetype.includes('webp')) ext = '.webp';

            // Generate filename
            const filename = `${fieldName}${ext}`;

            base64Files.push({
              fieldname: fieldName,
              originalname: filename,
              mimetype: mimetype,
              size: fileBuffer.length,
              buffer: fileBuffer
            });

          } catch (parseError) {
            console.error(`❌ [TheaterController] Error parsing base64 ${fieldName}:`, parseError.message);
            // Continue with other files even if one fails
          }
        }
      }

      // Upload base64 files to GCS
      if (base64Files.length > 0) {
        try {
          const uploadedUrls = await uploadFiles(base64Files, theaterFolder);
          fileUrls = { ...fileUrls, ...uploadedUrls };
        } catch (uploadError) {
          console.error('❌ [TheaterController] Base64 file upload error:', uploadError);
          console.error('   Error stack:', uploadError.stack);
          return BaseController.error(res, 'Failed to upload base64 files', 500, {
            message: uploadError.message
          });
        }
      }

      if (Object.keys(fileUrls).length === 0) {
      } else {
        Object.keys(fileUrls).forEach(key => {
        });
      }

      // Remove base64/document fields from req.body to prevent them from being saved as base64
      // Only fileUrls should be used for documents
      // Reusing documentFields array declared above (line ~158)
      documentFields.forEach(field => {
        if (req.body[field] && typeof req.body[field] === 'string' && req.body[field].startsWith('data:')) {
          delete req.body[field]; // Remove base64 string from body
        }
      });

      // Prepare theater data
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
          endDate: agreementEndDate ? new Date(agreementEndDate) : undefined
        },
        socialMedia: {
          facebook: facebook || null,
          instagram: instagram || null,
          twitter: twitter || null,
          youtube: youtube || null,
          website: website || null
        },
        gstNumber: gstNumber ? gstNumber.toUpperCase().trim() : undefined,
        fssaiNumber: fssaiNumber ? fssaiNumber.trim() : undefined,
        // uniqueNumber is auto-generated by TheaterService if not provided
        uniqueNumber: uniqueNumber ? uniqueNumber.trim() : undefined,
        settings: {
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          language: 'en'
        },
        branding: {
          primaryColor: '#6B0E9B',
          secondaryColor: '#F3F4F6'
        },
        isActive: true,
        status: 'active'
      };

      // 🔍 Enhanced logging for GST Number

      const savedTheater = await theaterService.createTheater(theaterData, fileUrls);

      // 🔍 Verify GST Number was saved

      return res.status(201).json({
        success: true,
        message: 'Theater created successfully',
        data: {
          id: savedTheater._id,
          name: savedTheater.name,
          username: savedTheater.username,
          email: savedTheater.email,
          phone: savedTheater.phone,
          gstNumber: savedTheater.gstNumber, // ✅ Include GST Number in response
          fssaiNumber: savedTheater.fssaiNumber, // ✅ Include FSSAI Number in response
          uniqueNumber: savedTheater.uniqueNumber, // ✅ Include Unique Number in response
          status: savedTheater.status,
          documents: savedTheater.documents,
          createdAt: savedTheater.createdAt
        }
      });
    } catch (error) {
      console.error('Create theater error:', error);
      if (error.code === 11000) {
        return BaseController.error(res, 'Duplicate entry', 409, {
          message: 'Username or email already exists'
        });
      }
      // Check if it's a GCS upload error
      if (error.message && error.message.includes('GCS upload failed')) {
        return BaseController.error(res, 'File upload failed', 500, {
          message: 'Failed to upload files to cloud storage. Please check your GCS configuration and try again.'
        });
      }
      return BaseController.error(res, 'Failed to create theater', 500, {
        message: error.message
      });
    }
  }

  /**
   * PUT /api/theaters/:id
   * Update a theater
   */
  static async update(req, res) {
    try {
      const theater = await theaterService.getTheaterById(req.params.id);
      if (!theater) {
        return BaseController.error(res, 'Theater not found', 404, {
          code: 'THEATER_NOT_FOUND'
        });
      }

      // Check authorization
      if (req.user.role !== 'super_admin' && req.user.theaterId?.toString() !== req.params.id) {
        return BaseController.error(res, 'Access denied', 403, {
          code: 'ACCESS_DENIED'
        });
      }

      // Upload new files and delete old ones
      let fileUrls = {};
      const theaterName = req.body.name ? req.body.name.trim() : theater.name;
      const sanitizedTheaterName = theaterName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, ' ');
      const theaterFolder = `theater list/${sanitizedTheaterName}`;

      // Handle file uploads from multer (req.files)
      if (req.files && Object.keys(req.files).length > 0) {
        try {
          const allFiles = [];
          Object.keys(req.files).forEach(fieldName => {
            req.files[fieldName].forEach(file => {
              allFiles.push({ ...file, fieldname: fieldName });
            });
          });
          const uploadedUrls = await uploadFiles(allFiles, theaterFolder);
          fileUrls = { ...fileUrls, ...uploadedUrls };
        } catch (uploadError) {
          console.error('File upload error:', uploadError);
          return BaseController.error(res, 'Failed to upload files', 500, {
            message: uploadError.message
          });
        }
      }

      // Handle base64 images from req.body (frontend sends base64 strings)
      const documentFields = ['theaterPhoto', 'logo', 'aadharCard', 'panCard', 'gstCertificate', 'fssaiCertificate', 'agreementCopy'];
      const base64Files = [];

      for (const fieldName of documentFields) {
        const fieldValue = req.body[fieldName];

        // Skip if already uploaded via multer
        if (fileUrls[fieldName]) {
          continue;
        }

        // Check if base64 string (only if it's a NEW base64 string, not an existing GCS URL)
        if (fieldValue && typeof fieldValue === 'string' && fieldValue.startsWith('data:') && !fieldValue.startsWith('https://')) {
          try {

            // Parse base64 data URL
            const matches = fieldValue.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
              console.warn(`⚠️  Invalid base64 format for ${fieldName}, skipping`);
              continue;
            }

            const mimetype = matches[1];
            const base64Data = matches[2];

            // Convert base64 to buffer
            const fileBuffer = Buffer.from(base64Data, 'base64');

            // Determine file extension from mimetype
            let ext = '.jpg';
            if (mimetype.includes('png')) ext = '.png';
            else if (mimetype.includes('jpeg') || mimetype.includes('jpg')) ext = '.jpg';
            else if (mimetype.includes('gif')) ext = '.gif';
            else if (mimetype.includes('pdf')) ext = '.pdf';
            else if (mimetype.includes('webp')) ext = '.webp';

            // Generate filename
            const filename = `${fieldName}${ext}`;

            base64Files.push({
              fieldname: fieldName,
              originalname: filename,
              mimetype: mimetype,
              size: fileBuffer.length,
              buffer: fileBuffer
            });

          } catch (parseError) {
            console.error(`❌ [TheaterController] Error parsing base64 ${fieldName}:`, parseError.message);
            // Continue with other files even if one fails
          }
        }
      }

      // Upload base64 files to GCS
      if (base64Files.length > 0) {
        try {
          const uploadedUrls = await uploadFiles(base64Files, theaterFolder);
          fileUrls = { ...fileUrls, ...uploadedUrls };
        } catch (uploadError) {
          console.error('❌ [TheaterController] Base64 file upload error:', uploadError);
          return BaseController.error(res, 'Failed to upload base64 files', 500, {
            message: uploadError.message
          });
        }
      }

      // Delete old files if new ones were uploaded
      if (Object.keys(fileUrls).length > 0) {
        try {
          const filesToDelete = [];
          if (fileUrls.theaterPhoto && theater.documents?.theaterPhoto && !theater.documents.theaterPhoto.startsWith('data:')) {
            filesToDelete.push(theater.documents.theaterPhoto);
          }
          if (fileUrls.logo && theater.documents?.logo && !theater.documents.logo.startsWith('data:')) {
            filesToDelete.push(theater.documents.logo);
          }
          if (fileUrls.aadharCard && theater.documents?.aadharCard && !theater.documents.aadharCard.startsWith('data:')) {
            filesToDelete.push(theater.documents.aadharCard);
          }
          if (fileUrls.panCard && theater.documents?.panCard && !theater.documents.panCard.startsWith('data:')) {
            filesToDelete.push(theater.documents.panCard);
          }
          if (fileUrls.gstCertificate && theater.documents?.gstCertificate && !theater.documents.gstCertificate.startsWith('data:')) {
            filesToDelete.push(theater.documents.gstCertificate);
          }
          if (fileUrls.fssaiCertificate && theater.documents?.fssaiCertificate && !theater.documents.fssaiCertificate.startsWith('data:')) {
            filesToDelete.push(theater.documents.fssaiCertificate);
          }
          if (fileUrls.agreementCopy && theater.agreementDetails?.copy && !theater.agreementDetails.copy.startsWith('data:')) {
            filesToDelete.push(theater.agreementDetails.copy);
          }

          if (filesToDelete.length > 0) {
            await deleteFiles(filesToDelete);
          }
        } catch (deleteError) {
          console.warn('⚠️  [TheaterController] Failed to delete old files (non-fatal):', deleteError.message);
          // Don't fail the update if deletion fails
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
        const Theater = require('../models/Theater');
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
      // Update GST, FSSAI, and Unique numbers
      if (req.body.gstNumber !== undefined) {
        updateData.gstNumber = req.body.gstNumber ? req.body.gstNumber.toUpperCase().trim() : null;
        console.log('🔄 [TheaterController.update] Updating GST Number:', {
          before: theater.gstNumber,
          after: updateData.gstNumber,
          fromRequest: req.body.gstNumber
        });
      }
      if (req.body.fssaiNumber !== undefined) {
        updateData.fssaiNumber = req.body.fssaiNumber ? req.body.fssaiNumber.trim() : null;
        console.log('🔄 [TheaterController.update] Updating FSSAI Number:', {
          before: theater.fssaiNumber,
          after: updateData.fssaiNumber
        });
      }
      if (req.body.uniqueNumber !== undefined) {
        updateData.uniqueNumber = req.body.uniqueNumber ? req.body.uniqueNumber.trim() : null;
        console.log('🔄 [TheaterController.update] Updating Unique Number:', {
          before: theater.uniqueNumber,
          after: updateData.uniqueNumber
        });
      }
      // ✅ FIX: Process payment gateway configuration
      if (req.body.paymentGateway) {
        // ✅ CRITICAL FIX: Merge with existing paymentGateway to preserve both channels
        // Do not replace the entire object, merge only the updated channels
        const existingPaymentGateway = theater.paymentGateway || {};
        const paymentGateway = {
          ...existingPaymentGateway, // Preserve existing config
          ...req.body.paymentGateway // Override with new config
        };

        // ✅ Process kiosk channel
        if (req.body.paymentGateway.kiosk) {
          const kioskConfig = req.body.paymentGateway.kiosk;
          const existingKioskConfig = existingPaymentGateway.kiosk || {};

          // Merge with existing kiosk config to preserve provider-specific settings
          const mergedKioskConfig = {
            ...existingKioskConfig,
            ...kioskConfig,
            // Merge provider configs individually to preserve credentials
            razorpay: {
              ...(existingKioskConfig.razorpay || {}),
              ...(kioskConfig.razorpay || {})
            },
            phonepe: {
              ...(existingKioskConfig.phonepe || {}),
              ...(kioskConfig.phonepe || {})
            },
            paytm: {
              ...(existingKioskConfig.paytm || {}),
              ...(kioskConfig.paytm || {})
            }
          };

          // Determine which provider is enabled
          let enabledProvider = 'none';
          let isKioskEnabled = false;

          if (mergedKioskConfig.razorpay?.enabled && mergedKioskConfig.razorpay?.keyId) {
            enabledProvider = 'razorpay';
            isKioskEnabled = true;
          } else if (mergedKioskConfig.phonepe?.enabled && mergedKioskConfig.phonepe?.merchantId) {
            enabledProvider = 'phonepe';
            isKioskEnabled = true;
          } else if (mergedKioskConfig.paytm?.enabled && mergedKioskConfig.paytm?.merchantId) {
            enabledProvider = 'paytm';
            isKioskEnabled = true;
          }

          // ✅ FIX: Set acceptedMethods based on provider capabilities
          // If not provided in update, use existing or set defaults based on provider
          let acceptedMethods = mergedKioskConfig.acceptedMethods || existingKioskConfig.acceptedMethods;

          // If Razorpay is enabled and acceptedMethods not explicitly set, enable supported methods
          if (isKioskEnabled && enabledProvider === 'razorpay' && !mergedKioskConfig.acceptedMethods) {
            // Razorpay supports: Card, UPI, Netbanking, Wallet
            acceptedMethods = {
              cash: true, // Always allow cash
              card: true, // Razorpay supports cards
              upi: true,  // ✅ Razorpay supports UPI
              netbanking: existingKioskConfig.acceptedMethods?.netbanking || false,
              wallet: existingKioskConfig.acceptedMethods?.wallet || false
            };
          } else if (isKioskEnabled && enabledProvider === 'phonepe' && !mergedKioskConfig.acceptedMethods) {
            // PhonePe primarily supports UPI
            acceptedMethods = {
              cash: true,
              card: existingKioskConfig.acceptedMethods?.card || false,
              upi: true,  // PhonePe supports UPI
              netbanking: false,
              wallet: false
            };
          } else if (isKioskEnabled && enabledProvider === 'paytm' && !mergedKioskConfig.acceptedMethods) {
            // Paytm supports multiple methods
            acceptedMethods = {
              cash: true,
              card: true,
              upi: true,  // Paytm supports UPI
              netbanking: true,
              wallet: true
            };
          } else if (!acceptedMethods) {
            // Default fallback
            acceptedMethods = {
              cash: true,
              card: true,
              upi: true,
              netbanking: false,
              wallet: false
            };
          }

          paymentGateway.kiosk = {
            ...mergedKioskConfig,
            enabled: isKioskEnabled,
            provider: enabledProvider,
            acceptedMethods: acceptedMethods,
            lastUpdated: new Date()
          };

          console.log(`✅ [TheaterController] Processed kiosk gateway config:`, {
            enabled: isKioskEnabled,
            provider: enabledProvider,
            razorpayEnabled: mergedKioskConfig.razorpay?.enabled,
            phonepeEnabled: mergedKioskConfig.phonepe?.enabled,
            paytmEnabled: mergedKioskConfig.paytm?.enabled,
            hasKeyId: !!mergedKioskConfig.razorpay?.keyId,
            hasMerchantId: !!mergedKioskConfig.phonepe?.merchantId || !!mergedKioskConfig.paytm?.merchantId,
            acceptedMethods: acceptedMethods,
            note: acceptedMethods.upi ? 'UPI enabled ✅' : 'UPI disabled ❌'
          });
        }

        // ✅ Process online channel
        if (req.body.paymentGateway.online) {
          const onlineConfig = req.body.paymentGateway.online;
          const existingOnlineConfig = existingPaymentGateway.online || {};

          // Merge with existing online config to preserve provider-specific settings
          const mergedOnlineConfig = {
            ...existingOnlineConfig,
            ...onlineConfig,
            // Merge provider configs individually to preserve credentials
            razorpay: {
              ...(existingOnlineConfig.razorpay || {}),
              ...(onlineConfig.razorpay || {})
            },
            phonepe: {
              ...(existingOnlineConfig.phonepe || {}),
              ...(onlineConfig.phonepe || {})
            },
            paytm: {
              ...(existingOnlineConfig.paytm || {}),
              ...(onlineConfig.paytm || {})
            }
          };

          // Determine which provider is enabled
          let enabledProvider = 'none';
          let isOnlineEnabled = false;

          if (mergedOnlineConfig.razorpay?.enabled && mergedOnlineConfig.razorpay?.keyId) {
            enabledProvider = 'razorpay';
            isOnlineEnabled = true;
          } else if (mergedOnlineConfig.phonepe?.enabled && mergedOnlineConfig.phonepe?.merchantId) {
            enabledProvider = 'phonepe';
            isOnlineEnabled = true;
          } else if (mergedOnlineConfig.paytm?.enabled && mergedOnlineConfig.paytm?.merchantId) {
            enabledProvider = 'paytm';
            isOnlineEnabled = true;
          }

          // ✅ FIX: Set acceptedMethods based on provider capabilities
          // If not provided in update, use existing or set defaults based on provider
          let acceptedMethods = mergedOnlineConfig.acceptedMethods || existingOnlineConfig.acceptedMethods;

          // If Razorpay is enabled and acceptedMethods not explicitly set, enable supported methods
          if (isOnlineEnabled && enabledProvider === 'razorpay' && !mergedOnlineConfig.acceptedMethods) {
            // Razorpay supports: Card, UPI, Netbanking, Wallet
            acceptedMethods = {
              cash: false, // Online orders typically don't use cash
              card: true,  // Razorpay supports cards
              upi: true,   // ✅ Razorpay supports UPI
              netbanking: true, // Razorpay supports netbanking
              wallet: true // Razorpay supports wallets
            };
          } else if (isOnlineEnabled && enabledProvider === 'phonepe' && !mergedOnlineConfig.acceptedMethods) {
            // PhonePe primarily supports UPI
            acceptedMethods = {
              cash: false,
              card: existingOnlineConfig.acceptedMethods?.card || false,
              upi: true,  // PhonePe supports UPI
              netbanking: false,
              wallet: false
            };
          } else if (isOnlineEnabled && enabledProvider === 'paytm' && !mergedOnlineConfig.acceptedMethods) {
            // Paytm supports multiple methods
            acceptedMethods = {
              cash: false,
              card: true,
              upi: true,  // Paytm supports UPI
              netbanking: true,
              wallet: true
            };
          } else if (!acceptedMethods) {
            // Default fallback
            acceptedMethods = {
              cash: false,
              card: true,
              upi: true,
              netbanking: true,
              wallet: true
            };
          }

          paymentGateway.online = {
            ...mergedOnlineConfig,
            enabled: isOnlineEnabled,
            provider: enabledProvider,
            acceptedMethods: acceptedMethods,
            lastUpdated: new Date()
          };

          console.log(`✅ [TheaterController] Processed online gateway config:`, {
            enabled: isOnlineEnabled,
            provider: enabledProvider,
            razorpayEnabled: mergedOnlineConfig.razorpay?.enabled,
            phonepeEnabled: mergedOnlineConfig.phonepe?.enabled,
            paytmEnabled: mergedOnlineConfig.paytm?.enabled,
            hasKeyId: !!mergedOnlineConfig.razorpay?.keyId,
            hasMerchantId: !!mergedOnlineConfig.phonepe?.merchantId || !!mergedOnlineConfig.paytm?.merchantId,
            acceptedMethods: acceptedMethods,
            note: acceptedMethods.upi ? 'UPI enabled ✅' : 'UPI disabled ❌'
          });
        }

        updateData.paymentGateway = paymentGateway;
      }

      const updatedTheater = await theaterService.updateTheater(req.params.id, updateData);

      // 🔍 Verify GST Number was updated

      return BaseController.success(res, updatedTheater, 'Theater updated successfully');
    } catch (error) {
      console.error('Update theater error:', error);
      if (error.name === 'CastError') {
        return BaseController.error(res, 'Invalid theater ID', 400, {
          code: 'INVALID_ID'
        });
      }
      return BaseController.error(res, 'Failed to update theater', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/theaters/:id
   * Delete a theater
   */
  static async delete(req, res) {
    try {
      const { theater, deletionResults } = await theaterService.deleteTheater(req.params.id);

      return BaseController.success(res, {
        message: `Theater "${theater.name}" and all related data deleted permanently`,
        summary: deletionResults.deleted,
        warnings: deletionResults.errors.length > 0 ? deletionResults.errors : undefined
      });
    } catch (error) {
      console.error('Delete theater error:', error);
      if (error.message === 'Theater not found') {
        return BaseController.error(res, 'Theater not found', 404, {
          code: 'THEATER_NOT_FOUND'
        });
      }
      if (error.name === 'CastError') {
        return BaseController.error(res, 'Invalid theater ID', 400, {
          code: 'INVALID_ID'
        });
      }
      return BaseController.error(res, 'Failed to delete theater', 500, {
        message: error.message
      });
    }
  }

  /**
   * PUT /api/theaters/:id/password
   * Update theater password
   */
  static async updatePassword(req, res) {
    try {
      const theater = await theaterService.getTheaterById(req.params.id);
      if (!theater) {
        return BaseController.error(res, 'Theater not found', 404, {
          code: 'THEATER_NOT_FOUND'
        });
      }

      // Check authorization
      if (req.user.role !== 'super_admin' && req.user.theaterId?.toString() !== req.params.id) {
        return BaseController.error(res, 'Access denied', 403, {
          code: 'ACCESS_DENIED'
        });
      }

      // Verify current password (only if not super admin)
      if (req.user.role !== 'super_admin' && req.body.currentPassword) {
        const Theater = require('../models/Theater');
        const theaterDoc = await Theater.findById(req.params.id);
        const isCurrentPasswordValid = await theaterDoc.comparePassword(req.body.currentPassword);
        if (!isCurrentPasswordValid) {
          return BaseController.error(res, 'Current password is incorrect', 400, {
            code: 'INVALID_CURRENT_PASSWORD'
          });
        }
      }

      // Update password
      const Theater = require('../models/Theater');
      const theaterDoc = await Theater.findById(req.params.id);
      theaterDoc.password = req.body.newPassword;
      await theaterDoc.save();

      return BaseController.success(res, null, 'Password updated successfully');
    } catch (error) {
      console.error('Update password error:', error);
      if (error.name === 'CastError') {
        return BaseController.error(res, 'Invalid theater ID', 400, {
          code: 'INVALID_ID'
        });
      }
      return BaseController.error(res, 'Failed to update password', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/theaters/expiring-agreements
   * Get theaters with expiring agreements
   */
  static async getExpiringAgreements(req, res) {
    try {
      const theaters = await theaterService.getExpiringAgreements(5);
      return BaseController.success(res, {
        expiringTheaters: theaters,
        count: theaters.length,
        checkDate: new Date(),
        expirationWindow: 5
      });
    } catch (error) {
      console.error('Error fetching expiring agreements:', error);
      return BaseController.error(res, 'Failed to fetch expiring agreements', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/theaters/:theaterId/agreement-status
   * Get agreement status
   */
  static async getAgreementStatus(req, res) {
    try {
      const status = await theaterService.getAgreementStatus(req.params.theaterId);
      return BaseController.success(res, status);
    } catch (error) {
      console.error('Error fetching agreement status:', error);
      if (error.message === 'Theater not found') {
        return BaseController.error(res, 'Theater not found', 404);
      }
      return BaseController.error(res, 'Failed to fetch agreement status', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/theaters/:id/dashboard
   * Get theater dashboard data
   */
  static async getDashboard(req, res) {
    try {
      const theater = await theaterService.getTheaterById(req.params.id);
      if (!theater) {
        return BaseController.error(res, 'Theater not found', 404, {
          code: 'THEATER_NOT_FOUND'
        });
      }

      // Check authorization
      if (req.user.role !== 'super_admin' && req.user.theaterId?.toString() !== req.params.id) {
        return BaseController.error(res, 'Access denied', 403, {
          code: 'ACCESS_DENIED'
        });
      }

      // Get dashboard statistics
      const Product = require('../models/Product');
      const Order = require('../models/Order');
      const mongoose = require('mongoose');

      const [
        totalProducts,
        activeProducts,
        totalOrders,
        todayOrders,
        todayRevenue
      ] = await Promise.all([
        Product.countDocuments({ theaterId: req.params.id }).maxTimeMS(15000),
        Product.countDocuments({ theaterId: req.params.id, isActive: true, status: 'active' }).maxTimeMS(15000),
        Order.countDocuments({ theaterId: req.params.id }).maxTimeMS(15000),
        Order.countDocuments({
          theaterId: req.params.id,
          createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
        }).maxTimeMS(15000),
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
        ]).maxTimeMS(15000)
      ]);

      return BaseController.success(res, {
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
      });
    } catch (error) {
      console.error('Get dashboard error:', error);
      if (error.name === 'CastError') {
        return BaseController.error(res, 'Invalid theater ID', 400, {
          code: 'INVALID_ID'
        });
      }
      return BaseController.error(res, 'Failed to fetch dashboard data', 500, {
        message: error.message
      });
    }
  }
}

module.exports = TheaterController;

