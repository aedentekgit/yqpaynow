/**
 * Base Service Class
 * Provides common database operations and utilities
 */
class BaseService {
  constructor(model) {
    this.model = model;
  }

  /**
   * Find all with pagination and filtering
   */
  async findAll(filter = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sort = { createdAt: -1 },
      select = null,
      populate = null,
      lean = true
    } = options;

    const skip = (page - 1) * limit;

    const query = this.model.find(filter);

    if (select) query.select(select);
    if (populate) query.populate(populate);
    if (sort) query.sort(sort);
    
    query.skip(skip).limit(limit);
    
    if (lean) query.lean();

    // ✅ FIX: Add timeout wrapper to prevent hanging
    // Increased timeouts for slow connections (MongoDB Atlas can be slow on first query)
    const queryTimeout = 15000; // 15 seconds (increased from 5)
    const countTimeout = 10000; // 10 seconds (increased from 3)
    
    const queryWithTimeout = Promise.race([
      query.maxTimeMS(queryTimeout).exec(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Query timeout after ${queryTimeout/1000} seconds - database may be slow or connection unstable`)), queryTimeout)
      )
    ]);
    
    const countWithTimeout = Promise.race([
      this.model.countDocuments(filter).maxTimeMS(countTimeout).exec(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Count timeout after ${countTimeout/1000} seconds - database may be slow or connection unstable`)), countTimeout)
      )
    ]);

    const [data, total] = await Promise.all([
      queryWithTimeout,
      countWithTimeout
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
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
    };
  }

  /**
   * Find one by ID
   */
  async findById(id, options = {}) {
    const {
      select = null,
      populate = null,
      lean = true
    } = options;

    const query = this.model.findById(id);

    if (select) query.select(select);
    if (populate) query.populate(populate);
    if (lean) query.lean();

    // ✅ FIX: Increased timeout for slow connections
    return query.maxTimeMS(15000);
  }

  /**
   * Find one by filter
   */
  async findOne(filter, options = {}) {
    const {
      select = null,
      populate = null,
      lean = true
    } = options;

    const query = this.model.findOne(filter);

    if (select) query.select(select);
    if (populate) query.populate(populate);
    if (lean) query.lean();

    // ✅ FIX: Increased timeout for slow connections
    return query.maxTimeMS(15000);
  }

  /**
   * Create new document
   */
  async create(data) {
    const document = new this.model(data);
    return document.save();
  }

  /**
   * Update by ID
   */
  async updateById(id, data, options = {}) {
    const {
      new: returnNew = true,
      runValidators = true
    } = options;

    return this.model.findByIdAndUpdate(
      id,
      data,
      { new: returnNew, runValidators }
    );
  }

  /**
   * Delete by ID
   */
  async deleteById(id) {
    return this.model.findByIdAndDelete(id);
  }

  /**
   * Count documents
   */
  async count(filter = {}) {
    // ✅ FIX: Increased timeout for slow connections
    return this.model.countDocuments(filter).maxTimeMS(10000);
  }

  /**
   * Check if document exists
   */
  async exists(filter) {
    return this.model.exists(filter);
  }
}

module.exports = BaseService;

