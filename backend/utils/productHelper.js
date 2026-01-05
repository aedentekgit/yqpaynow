const mongoose = require('mongoose');

/**
 * Helper function to get a product from either:
 * 1. NEW array structure (productList array in theater container)
 * 2. OLD individual document structure (backward compatibility)
 */
async function getProductById(productId, theaterId = null) {
  try {
    const db = mongoose.connection.db;
    const productObjectId = new mongoose.Types.ObjectId(productId);
    
    // Try NEW array structure first (if theaterId is provided)
    if (theaterId) {
      const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
      const productContainer = await db.collection('productlist').findOne({
        theater: theaterObjectId,
        productList: { $exists: true }
      });
      
      if (productContainer && productContainer.productList) {
        const product = productContainer.productList.find(
          p => String(p._id) === String(productId)
        );
        
        if (product) {
          return product;
        }
      }
    }
    
    // Fallback to OLD individual document structure
    const Product = require('../models/Product');
    const product = await Product.findById(productObjectId).lean();
    
    if (product) {
      return product;
    }
    return null;
    
  } catch (error) {
    console.error('Error fetching product:', error);
    throw error;
  }
}

/**
 * Helper function to update product stock in the correct structure
 */
async function updateProductStock(productId, theaterId, stockUpdate) {
  try {
    const db = mongoose.connection.db;
    const productObjectId = new mongoose.Types.ObjectId(productId);
    const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
    
    // Try NEW array structure first
    const productContainer = await db.collection('productlist').findOne({
      theater: theaterObjectId,
      productList: { $exists: true }
    });
    
    if (productContainer && productContainer.productList) {
      // Update within the array
      const result = await db.collection('productlist').updateOne(
        {
          theater: theaterObjectId,
          'productList._id': productObjectId
        },
        {
          $set: {
            'productList.$.inventory.currentStock': stockUpdate.currentStock || stockUpdate['inventory.currentStock'],
            'productList.$.updatedAt': new Date()
          }
        }
      );
      
      if (result.modifiedCount > 0) {
        return true;
      }
    }
    
    // Fallback to OLD individual document structure
    const Product = require('../models/Product');
    const updateData = {};
    
    if (stockUpdate.currentStock !== undefined) {
      updateData['inventory.currentStock'] = stockUpdate.currentStock;
    } else if (stockUpdate['inventory.currentStock'] !== undefined) {
      updateData['inventory.currentStock'] = stockUpdate['inventory.currentStock'];
    }
    
    const result = await Product.findByIdAndUpdate(
      productObjectId,
      { $set: updateData },
      { new: true }
    );
    
    if (result) {
      return true;
    }
    return false;
    
  } catch (error) {
    console.error('Error updating product stock:', error);
    throw error;
  }
}

module.exports = {
  getProductById,
  updateProductStock
};
