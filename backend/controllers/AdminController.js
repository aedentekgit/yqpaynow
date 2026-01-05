const BaseController = require('./BaseController');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Admin Controller
 * Manages super admin credentials in the admins collection
 */
class AdminController extends BaseController {
  /**
   * GET /api/admins
   * Get all admins with pagination and search
   */
  static async getAll(req, res) {
    try {
      // Only super_admin can access admin management
      // ✅ FIX: Case-insensitive role check
      const userType = req.user?.userType || req.user?.role;
      const normalizedUserType = userType ? userType.toLowerCase() : '';
      if (normalizedUserType !== 'super_admin') {
        return BaseController.error(res, 'Access denied. Only super admins can manage admin credentials.', 403);
      }
      const { page = 1, limit = 10, search = '', isActive } = req.query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Build query
      const query = {};
      
      // Search filter
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }

      // Status filter - handle both string and boolean values
      if (isActive !== undefined && isActive !== null && isActive !== '') {
        // Convert string 'true'/'false' to boolean, or use boolean directly
        if (typeof isActive === 'string') {
          query.isActive = isActive.toLowerCase() === 'true' || isActive === '1';
        } else {
          query.isActive = Boolean(isActive);
        }
      }

      const db = mongoose.connection.db;
      const adminsCollection = db.collection('admins');

      // Get total count
      const totalItems = await adminsCollection.countDocuments(query);

      // Get admins (exclude password field)
      const admins = await adminsCollection
        .find(query, { projection: { password: 0 } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray();

      // Calculate pagination
      const totalPages = Math.ceil(totalItems / limitNum);

      return BaseController.paginated(res, {
        items: admins,
        admins: admins // Alias for compatibility
      }, {
        current: pageNum,
        limit: limitNum,
        total: totalItems,
        totalItems: totalItems,
        pages: totalPages,
        totalPages: totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }, 'Admins fetched successfully');
    } catch (error) {
      console.error('Get admins error:', error);
      return BaseController.error(res, 'Failed to fetch admins', 500, {
        message: error.message
      });
    }
  }

  /**
   * GET /api/admins/:id
   * Get single admin by ID
   */
  static async getById(req, res) {
    try {
      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return BaseController.error(res, 'Invalid admin ID', 400);
      }

      const db = mongoose.connection.db;
      const adminsCollection = db.collection('admins');

      const admin = await adminsCollection.findOne(
        { _id: new mongoose.Types.ObjectId(id) },
        { projection: { password: 0 } }
      );

      if (!admin) {
        return BaseController.error(res, 'Admin not found', 404);
      }

      return BaseController.success(res, admin, 'Admin fetched successfully');
    } catch (error) {
      console.error('Get admin by ID error:', error);
      return BaseController.error(res, 'Failed to fetch admin', 500, {
        message: error.message
      });
    }
  }

  /**
   * POST /api/admins
   * Create new admin
   */
  static async create(req, res) {
    try {
      // Only super_admin can create admins
      // ✅ FIX: Case-insensitive role check
      const userType = req.user?.userType || req.user?.role;
      const normalizedUserType = userType ? userType.toLowerCase() : '';
      if (normalizedUserType !== 'super_admin') {
        return BaseController.error(res, 'Access denied. Only super admins can create admin credentials.', 403);
      }
      const { name, email, password, phone, role = 'super_admin', isActive = true } = req.body;

      // Validation
      if (!name || !email || !password) {
        return BaseController.error(res, 'Name, email, and password are required', 400);
      }

      if (password.length < 6) {
        return BaseController.error(res, 'Password must be at least 6 characters', 400);
      }

      const db = mongoose.connection.db;
      const adminsCollection = db.collection('admins');

      // Check if email already exists
      const existingAdmin = await adminsCollection.findOne({ email: email.toLowerCase().trim() });
      if (existingAdmin) {
        return BaseController.error(res, 'Admin with this email already exists', 400);
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create admin document
      const newAdmin = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        phone: phone ? phone.trim() : null,
        role: role,
        isActive: isActive,
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0
      };

      const result = await adminsCollection.insertOne(newAdmin);

      // Get created admin (without password)
      const createdAdmin = await adminsCollection.findOne(
        { _id: result.insertedId },
        { projection: { password: 0 } }
      );

      return res.status(201).json({
        success: true,
        message: 'Admin created successfully',
        data: createdAdmin
      });
    } catch (error) {
      console.error('Create admin error:', error);
      if (error.code === 11000) {
        return BaseController.error(res, 'Admin with this email already exists', 400);
      }
      return BaseController.error(res, 'Failed to create admin', 500, {
        message: error.message
      });
    }
  }

  /**
   * PUT /api/admins/:id
   * Update admin
   */
  static async update(req, res) {
    try {
      // Only super_admin can update admins
      // ✅ FIX: Case-insensitive role check
      const userType = req.user?.userType || req.user?.role;
      const normalizedUserType = userType ? userType.toLowerCase() : '';
      if (normalizedUserType !== 'super_admin') {
        return BaseController.error(res, 'Access denied. Only super admins can update admin credentials.', 403);
      }
      const { id } = req.params;
      const { name, email, password, phone, role, isActive } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return BaseController.error(res, 'Invalid admin ID', 400);
      }

      const db = mongoose.connection.db;
      const adminsCollection = db.collection('admins');

      // Check if admin exists
      const existingAdmin = await adminsCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
      if (!existingAdmin) {
        return BaseController.error(res, 'Admin not found', 404);
      }

      // Build update object
      const updateData = {
        updatedAt: new Date()
      };

      if (name !== undefined) updateData.name = name.trim();
      if (email !== undefined) {
        // Check if new email already exists (and is not the current admin)
        const emailExists = await adminsCollection.findOne({
          email: email.toLowerCase().trim(),
          _id: { $ne: new mongoose.Types.ObjectId(id) }
        });
        if (emailExists) {
          return BaseController.error(res, 'Admin with this email already exists', 400);
        }
        updateData.email = email.toLowerCase().trim();
      }
      if (phone !== undefined) updateData.phone = phone ? phone.trim() : null;
      if (role !== undefined) updateData.role = role;
      if (isActive !== undefined) updateData.isActive = isActive;

      // Update password if provided
      if (password) {
        if (password.length < 6) {
          return BaseController.error(res, 'Password must be at least 6 characters', 400);
        }
        updateData.password = await bcrypt.hash(password, 10);
      }

      // Update admin
      await adminsCollection.updateOne(
        { _id: new mongoose.Types.ObjectId(id) },
        { $set: updateData }
      );

      // Get updated admin (without password)
      const updatedAdmin = await adminsCollection.findOne(
        { _id: new mongoose.Types.ObjectId(id) },
        { projection: { password: 0 } }
      );

      return BaseController.success(res, updatedAdmin, 'Admin updated successfully');
    } catch (error) {
      console.error('Update admin error:', error);
      if (error.code === 11000) {
        return BaseController.error(res, 'Admin with this email already exists', 400);
      }
      return BaseController.error(res, 'Failed to update admin', 500, {
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/admins/:id
   * Delete admin
   */
  static async delete(req, res) {
    try {
      // Only super_admin can delete admins
      // ✅ FIX: Case-insensitive role check
      const userType = req.user?.userType || req.user?.role;
      const normalizedUserType = userType ? userType.toLowerCase() : '';
      if (normalizedUserType !== 'super_admin') {
        return BaseController.error(res, 'Access denied. Only super admins can delete admin credentials.', 403);
      }
      const { id } = req.params;
      const { permanent = 'false' } = req.query;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return BaseController.error(res, 'Invalid admin ID', 400);
      }

      const db = mongoose.connection.db;
      const adminsCollection = db.collection('admins');

      // Check if admin exists
      const admin = await adminsCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
      if (!admin) {
        return BaseController.error(res, 'Admin not found', 404);
      }

      if (permanent === 'true') {
        // Permanent delete
        await adminsCollection.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
      } else {
        // Soft delete (set isActive to false)
        await adminsCollection.updateOne(
          { _id: new mongoose.Types.ObjectId(id) },
          { $set: { isActive: false, updatedAt: new Date() } }
        );
      }

      return BaseController.success(res, null, 'Admin deleted successfully');
    } catch (error) {
      console.error('Delete admin error:', error);
      return BaseController.error(res, 'Failed to delete admin', 500, {
        message: error.message
      });
    }
  }
}

module.exports = AdminController;

