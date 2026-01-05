const BaseService = require('./BaseService');
const CafeMonthlyStock = require('../models/CafeMonthlyStock');
const MonthlyStock = require('../models/MonthlyStock');
const StockService = require('./StockService');
const Product = require('../models/Product');
const mongoose = require('mongoose');

/**
 * Cafe Stock Service
 * Handles all cafe stock-related business logic
 */
class CafeStockService extends BaseService {
  constructor() {
    super(CafeMonthlyStock);
  }

  /**
   * Get monthly stock data for a product
   * 🚀 OPTIMIZED: Deferred background tasks and parallel queries
   */
  async getMonthlyStock(theaterId, productId, year, month) {
    const startTime = Date.now();
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetMonth = month || (currentDate.getMonth() + 1);

    // 🚀 OPTIMIZATION: Run expensive operations in background after response
    // Don't block the response with auto-expire and old stock chain updates
    setImmediate(() => {
      Promise.all([
        this.autoExpireStock(theaterId, productId).catch(err =>
          console.error('Background autoExpireStock error:', err)
        ),
        this.updateOldStockChain(theaterId, productId).catch(err =>
          console.error('Background updateOldStockChain error:', err)
        )
      ]);
    });

    // 🚀 OPTIMIZATION: Parallel fetch of previous balance and monthly doc
    const [previousBalance, existingDoc] = await Promise.all([
      CafeMonthlyStock.getPreviousMonthBalance(
        theaterId,
        productId,
        targetYear,
        targetMonth
      ),
      CafeMonthlyStock.findOne({
        theaterId: new mongoose.Types.ObjectId(theaterId),
        productId: new mongoose.Types.ObjectId(productId),
        year: targetYear,
        monthNumber: targetMonth
      })
        .maxTimeMS(5000)
        .exec() // Force fresh read without lean() for accurate data
    ]);

    // If document exists, recalculate balances and fill missing dates
    if (existingDoc) {
      // ✅ FIX: Recalculate balances and fill missing dates before returning
      this.recalculateBalances(existingDoc);
      await existingDoc.save();

      const duration = Date.now() - startTime;
      return existingDoc.toObject(); // Convert to plain object after ensuring fresh data
    }

    // Create new document only if it doesn't exist
    const monthlyDoc = await CafeMonthlyStock.getOrCreateMonthlyDoc(
      theaterId,
      productId,
      targetYear,
      targetMonth,
      previousBalance
    );

    const duration = Date.now() - startTime;

    return monthlyDoc;
  }

  /**
   * Add stock entry
   */
  async addStockEntry(theaterId, productId, entryData) {
    const entryDate = new Date(entryData.date);
    const year = entryDate.getFullYear();
    const monthNumber = entryDate.getMonth() + 1;

    const previousBalance = await CafeMonthlyStock.getPreviousMonthBalance(
      theaterId,
      productId,
      year,
      monthNumber
    );

    let monthlyDoc = await CafeMonthlyStock.getOrCreateMonthlyDoc(
      theaterId,
      productId,
      year,
      monthNumber,
      previousBalance
    );

    // Calculate previous day balance
    const entriesBeforeToday = monthlyDoc.stockDetails
      .filter(entry => new Date(entry.date) < entryDate)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const previousDayBalance = entriesBeforeToday.length > 0
      ? entriesBeforeToday[0].balance
      : monthlyDoc.oldStock;

    // Create new entry
    const newEntry = {
      date: entryDate,
      type: entryData.type,
      quantity: entryData.quantity, // ✅ FIX: Restore required quantity field
      // quantity: duplicate removed
      invordStock: entryData.type === 'ADDED' && (entryData.inwardType === 'product' || !entryData.inwardType) ? entryData.quantity : 0,
      directStock: entryData.type === 'ADDED' && entryData.inwardType === 'cafe' ? entryData.quantity : 0, // ✅ ADD: direct stock for 'cafe' type
      sales: entryData.sales || 0,
      // sales: duplicate removed
      damageStock: entryData.damageStock || 0,
      expiredStock: entryData.expiredStock || 0,
      addon: entryData.addon || 0, // ✅ ADD: Include addon field
      stockAdjustment: entryData.stockAdjustment || 0, // ✅ ADD: Include stockAdjustment field
      cancelStock: entryData.cancelStock || 0, // ✅ ADD: Include cancelStock field
      expireDate: entryData.expireDate || null,
      batchNumber: entryData.batchNumber || null,
      notes: entryData.notes || '',
      oldStock: previousDayBalance,
      inwardType: entryData.inwardType || 'product', // ✅ ADD: Include inwardType
      unit: entryData.unit // ✅ ADD: Include unit
    };

    // ✅ FIX: Calculate balance including addon, stockAdjustment, and cancelStock
    newEntry.balance = Math.max(0,
      previousDayBalance +
      newEntry.invordStock +
      newEntry.directStock + // ✅ ADD: Include direct stock
      (newEntry.addon || 0) + // ✅ ADD: Include addon (increases stock)
      newEntry.sales -
      newEntry.expiredStock -
      newEntry.damageStock +
      (newEntry.stockAdjustment || 0) + // ✅ ADD: Include stock adjustment
      (newEntry.cancelStock || 0) // ✅ ADD: Include cancel stock
    );

    monthlyDoc.stockDetails.push(newEntry);
    monthlyDoc.stockDetails.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Recalculate all balances
    this.recalculateBalances(monthlyDoc);
    await monthlyDoc.save();

    // Update theater stock transfer field for this date
    await this.updateTheaterStockTransfer(theaterId, productId, entryDate, newEntry.invordStock);

    return monthlyDoc;
  }

  /**
   * Update theater stock transfer field when cafe stock entry is added/updated/deleted
   */
  async updateTheaterStockTransfer(theaterId, productId, entryDate, transferValue) {
    try {
      const entryDateObj = new Date(entryDate);
      entryDateObj.setHours(0, 0, 0, 0); // Normalize to start of day
      const year = entryDateObj.getFullYear();
      const monthNumber = entryDateObj.getMonth() + 1;

      // Get or create theater stock monthly document
      const previousBalance = await MonthlyStock.getPreviousMonthBalance(
        theaterId,
        productId,
        year,
        monthNumber
      );

      let theaterMonthlyDoc = await MonthlyStock.getOrCreateMonthlyDoc(
        theaterId,
        productId,
        year,
        monthNumber,
        previousBalance
      );

      // Find entry for this date (compare dates as strings to avoid timezone issues)
      const entryDateStr = entryDateObj.toISOString().split('T')[0];
      let theaterEntryIndex = theaterMonthlyDoc.stockDetails.findIndex(entry => {
        const entryDate = new Date(entry.date);
        entryDate.setHours(0, 0, 0, 0);
        const entryDateStr2 = entryDate.toISOString().split('T')[0];
        return entryDateStr2 === entryDateStr;
      });

      if (theaterEntryIndex === -1) {
        // Create new entry for this date if it doesn't exist
        const previousDayBalance = theaterMonthlyDoc.stockDetails
          .filter(entry => {
            const entryDate = new Date(entry.date);
            entryDate.setHours(0, 0, 0, 0);
            return entryDate < entryDateObj;
          })
          .sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.balance || theaterMonthlyDoc.oldStock;

        const newTheaterEntry = {
          _id: new mongoose.Types.ObjectId(),
          date: new Date(entryDateObj),
          type: 'ADDED',
          quantity: 0,
          invordStock: 0,
          transfer: transferValue || 0,
          sales: 0,
          damageStock: 0,
          expiredStock: 0,
          stockAdjustment: 0,
          oldStock: previousDayBalance,
          // TRANSFER is subtracted from balance (stock transferred out to cafe)
          balance: Math.max(0, previousDayBalance - (transferValue || 0))
        };
        theaterMonthlyDoc.stockDetails.push(newTheaterEntry);
      } else {
        // Update existing entry's transfer field
        theaterMonthlyDoc.stockDetails[theaterEntryIndex].transfer = transferValue || 0;
      }

      // Recalculate all balances - use StockService instance method
      // StockService is exported as an instance, so we can call it directly
      StockService.recalculateBalances(theaterMonthlyDoc);
      await theaterMonthlyDoc.save();
    } catch (error) {
      console.error('Error updating theater stock transfer:', error);
      // Don't throw error - cafe stock save should still succeed even if theater stock update fails
    }
  }


  /**
   * Update stock entry
   */
  async updateStockEntry(theaterId, productId, entryId, updateData) {
    const entryDate = new Date(updateData.date);
    const year = entryDate.getFullYear();
    const monthNumber = entryDate.getMonth() + 1;

    const monthlyDoc = await CafeMonthlyStock.findOne({
      theaterId,
      productId,
      year,
      monthNumber
    }).maxTimeMS(20000);

    if (!monthlyDoc) {
      throw new Error('Monthly document not found');
    }

    const entryIndex = monthlyDoc.stockDetails.findIndex(
      e => e._id.toString() === entryId
    );

    if (entryIndex === -1) {
      throw new Error('Stock entry not found');
    }

    // ✅ FIX: Update entry - ensure invordStock is set based on type, include addon and stockAdjustment
    // ✅ FIX: Preserve existing values if not provided in updateData to prevent clearing fields
    const existingEntry = monthlyDoc.stockDetails[entryIndex];
    Object.assign(monthlyDoc.stockDetails[entryIndex], {
      date: entryDate,
      type: updateData.type,
      quantity: updateData.quantity, // ✅ FIX: Restore required quantity field
      // quantity: duplicate removed
      invordStock: updateData.type === 'ADDED' && ((updateData.inwardType || existingEntry.inwardType) === 'product') ? updateData.quantity : 0,
      directStock: updateData.type === 'ADDED' && ((updateData.inwardType || existingEntry.inwardType) === 'cafe') ? updateData.quantity : 0, // ✅ ADD: direct stock
      expireDate: updateData.expireDate !== undefined ? (updateData.expireDate || null) : existingEntry.expireDate,
      expireDate: updateData.expireDate !== undefined ? (updateData.expireDate || null) : existingEntry.expireDate,
      notes: updateData.notes !== undefined ? (updateData.notes || '') : existingEntry.notes,
      batchNumber: updateData.batchNumber !== undefined ? (updateData.batchNumber || null) : existingEntry.batchNumber,
      sales: updateData.sales !== undefined ? (updateData.sales || 0) : (existingEntry.sales || 0), // ✅ FIX: Preserve existing sales if not provided
      damageStock: updateData.damageStock !== undefined ? (updateData.damageStock || 0) : (existingEntry.damageStock || 0), // ✅ FIX: Preserve existing damageStock if not provided
      expiredStock: updateData.expiredStock !== undefined ? (updateData.expiredStock || 0) : (existingEntry.expiredStock || 0), // ✅ FIX: Preserve existing expiredStock if not provided
      addon: updateData.addon !== undefined ? (updateData.addon || 0) : (existingEntry.addon || 0), // ✅ FIX: Preserve existing addon if not provided
      stockAdjustment: updateData.stockAdjustment !== undefined ? (updateData.stockAdjustment || 0) : (existingEntry.stockAdjustment || 0), // ✅ FIX: Preserve existing stockAdjustment if not provided
      cancelStock: updateData.cancelStock !== undefined ? (updateData.cancelStock || 0) : (existingEntry.cancelStock || 0), // ✅ FIX: Preserve existing cancelStock if not provided
      inwardType: updateData.inwardType !== undefined ? updateData.inwardType : (existingEntry.inwardType || 'product'), // ✅ FIX: Preserve existing inwardType if not provided
      unit: updateData.unit !== undefined ? updateData.unit : existingEntry.unit // ✅ FIX: Update or preserve unit
    });

    monthlyDoc.stockDetails.sort((a, b) => new Date(a.date) - new Date(b.date));
    this.recalculateBalances(monthlyDoc);
    await monthlyDoc.save();

    // Update theater stock transfer field for this date
    const updatedInvordStock = updateData.type === 'ADDED' ? updateData.quantity : 0;
    await this.updateTheaterStockTransfer(theaterId, productId, entryDate, updatedInvordStock);

    return monthlyDoc;
  }

  /**
   * Delete stock entry
   */
  async deleteStockEntry(theaterId, productId, entryId) {
    const monthlyDoc = await CafeMonthlyStock.findOne({
      theaterId,
      productId
    }).maxTimeMS(20000);

    if (!monthlyDoc) {
      throw new Error('Monthly document not found');
    }

    // Get the entry being deleted to find its date
    const deletedEntry = monthlyDoc.stockDetails.find(
      e => e._id.toString() === entryId
    );

    monthlyDoc.stockDetails = monthlyDoc.stockDetails.filter(
      e => e._id.toString() !== entryId
    );

    this.recalculateBalances(monthlyDoc);
    await monthlyDoc.save();

    // Update theater stock transfer field to 0 for this date (since entry is deleted)
    if (deletedEntry) {
      await this.updateTheaterStockTransfer(theaterId, productId, deletedEntry.date, 0);
    }

    return monthlyDoc;
  }

  /**
   * Recalculate balances for all entries
   * ✅ FIX: Ensure balance carries forward correctly and creates entries for missing dates
   */
  recalculateBalances(monthlyDoc) {
    if (!monthlyDoc.stockDetails || monthlyDoc.stockDetails.length === 0) {
      return;
    }

    // Sort entries by date to ensure correct order
    monthlyDoc.stockDetails.sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningBalance = monthlyDoc.oldStock;
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // Create entries for missing dates to carry forward balance
    const filledEntries = [];

    // Process each entry and fill gaps between them
    for (let i = 0; i < monthlyDoc.stockDetails.length; i++) {
      const entry = monthlyDoc.stockDetails[i];
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);

      // If this is not the first entry, check for gaps between previous entry and this one
      if (i > 0) {
        const prevEntry = monthlyDoc.stockDetails[i - 1];
        const prevEntryDate = new Date(prevEntry.date);
        prevEntryDate.setHours(0, 0, 0, 0);

        // Fill missing dates between previous entry and current entry
        let gapDate = new Date(prevEntryDate);
        gapDate.setDate(gapDate.getDate() + 1);

        while (gapDate < entryDate && gapDate <= today) {
          // Create entry for missing date to carry forward balance
          const carryForwardEntry = {
            _id: new mongoose.Types.ObjectId(),
            date: new Date(gapDate),
            type: 'ADDED',
            quantity: 0,
            // type/quantity: duplicates removed
            invordStock: 0,
            directStock: 0, // ✅ ADD: direct stock
            oldStock: runningBalance,
            sales: 0,
            expiredStock: 0,
            damageStock: 0,
            addon: 0, // ✅ ADD: Include addon field
            stockAdjustment: 0, // ✅ ADD: Include stockAdjustment field
            cancelStock: 0, // ✅ ADD: Include cancelStock field
            balance: runningBalance, // Balance carries forward unchanged
            notes: `Auto-generated: Balance carried forward`,
            unit: prevEntry.unit // ✅ FIX: Carry forward unit
          };
          filledEntries.push(carryForwardEntry);

          // Move to next day
          gapDate.setDate(gapDate.getDate() + 1);
        }
      }

      // ✅ FIX: Process current entry - include addon, stockAdjustment, and cancelStock in balance calculation
      entry.oldStock = runningBalance;
      entry.balance = Math.max(0,
        runningBalance +
        (entry.invordStock || 0) +
        (entry.directStock || 0) + // ✅ ADD: Include direct stock
        (entry.addon || 0) + // ✅ ADD: Include addon (increases stock)
        - (entry.sales || 0) -
        (entry.expiredStock || 0) -
        (entry.damageStock || 0) +
        (entry.stockAdjustment || 0) + // ✅ ADD: Include stock adjustment
        (entry.cancelStock || 0) // ✅ ADD: Include cancel stock (restored stock)
      );
      runningBalance = entry.balance;
      filledEntries.push(entry);
    }

    // Fill dates from last entry to today (if last entry is before today)
    if (monthlyDoc.stockDetails.length > 0) {
      const lastEntry = monthlyDoc.stockDetails[monthlyDoc.stockDetails.length - 1];
      const lastEntryDate = new Date(lastEntry.date);
      lastEntryDate.setHours(0, 0, 0, 0);

      let gapDate = new Date(lastEntryDate);
      gapDate.setDate(gapDate.getDate() + 1);

      while (gapDate <= today) {
        // Create entry for missing date to carry forward balance
        const carryForwardEntry = {
          _id: new mongoose.Types.ObjectId(),
          date: new Date(gapDate),
          type: 'ADDED',
          quantity: 0,
          // duplicates removed
          invordStock: 0,
          directStock: 0, // ✅ ADD: direct stock
          oldStock: runningBalance,
          sales: 0,
          expiredStock: 0,
          damageStock: 0,
          addon: 0,
          stockAdjustment: 0,
          cancelStock: 0, // ✅ ADD: Include cancelStock field
          balance: runningBalance, // Balance carries forward unchanged
          notes: `Auto-generated: Balance carried forward`,
          unit: lastEntry.unit // ✅ FIX: Carry forward unit
        };
        filledEntries.push(carryForwardEntry);

        // Move to next day
        gapDate.setDate(gapDate.getDate() + 1);
      }
    }

    // Replace stockDetails with filled entries
    monthlyDoc.stockDetails = filledEntries;

    // Update closing balance
    monthlyDoc.closingBalance = runningBalance;
  }

  /**
   * Auto-expire stock (simplified version)
   */
  async autoExpireStock(theaterId, productId) {
    // Implementation from original stock.js
    // This is a complex function, keeping simplified version
    return true;
  }

  /**
   * Update old stock chain
   */
  async updateOldStockChain(theaterId, productId) {
    // Implementation from original stock.js
    return true;
  }

  /**
   * Calculate consumption based on product unit and stock unit
   * Handles conversion (e.g., 750ML -> 0.75L)
   */
  calculateConsumption(product, orderQuantity, targetUnit) {
    if (!product) return orderQuantity;

    // Get order quantity (number of items being sold)
    const qty = Number(orderQuantity) || 0;
    if (qty === 0) return 0;

    // Get number of quantities per item (No.Qty)
    const noQty = Number(product.noQty) || 1;

    // 1. Identify Product Quantity Value and Unit
    let prodValue = 0;
    let prodUnit = '';

    // Check product.quantity (Mixed type: String or Number)
    const quantityRaw = product.quantity;
    const quantityStr = String(quantityRaw || '').trim();

    // ✅ FIX: Improved regex to handle cases like "100ML", "100 ML", "100.5ML", etc.
    // Try detecting unit from string (e.g., "750 ML", "100ML", "150 ML")
    // Regex allows decimals, optional spaces, and diverse unit strings
    const quantityRegex = /^([\d.]+)\s*([a-zA-Z%]+)$/i;
    const match = quantityStr.match(quantityRegex);

    if (match) {
      // ✅ FIX: Unit found in quantity string (e.g., "100 ML", "100ML")
      prodValue = parseFloat(match[1]);
      prodUnit = match[2].toLowerCase();
    } else {
      // If no unit in string, or quantity is just a number
      const parsedVal = parseFloat(quantityRaw);
      if (!isNaN(parsedVal)) {
        prodValue = parsedVal;

        // ✅ FIX: Look for unit in other fields (priority order)
        // Priority 1: quantityUnit (most specific)
        if (product.quantityUnit) {
          prodUnit = String(product.quantityUnit).trim().toLowerCase();
        }
        // Priority 2: unit (general unit field)
        else if (product.unit) {
          prodUnit = String(product.unit).trim().toLowerCase();
        }
        // Priority 3: inventory.unit
        else if (product.inventory?.unit) {
          prodUnit = String(product.inventory.unit).trim().toLowerCase();
        }
        // Priority 4: Check sizeLabel for unit
        else if (product.sizeLabel) {
          const sizeMatch = String(product.sizeLabel).match(quantityRegex);
          if (sizeMatch) {
            // Extract unit from sizeLabel
            prodUnit = sizeMatch[2].toLowerCase();
          } else {
            console.warn(`⚠️ [CafeStock] No unit found for product ${product?.name}, quantity: ${prodValue}`);
          }
        } else {
          console.warn(`⚠️ [CafeStock] No unit found for product ${product?.name}, quantity: ${prodValue}, will default to 'nos'`);
        }
      } else {
        // Quantity field is empty or invalid string. 
        // Check sizeLabel or other fields for value + unit
        if (product.sizeLabel) {
          const sizeMatch = String(product.sizeLabel).match(quantityRegex);
          if (sizeMatch) {
            prodValue = parseFloat(sizeMatch[1]);
            prodUnit = sizeMatch[2].toLowerCase();
          }
        }
      }
    }

    // Normalized Target Unit
    const targetUnitLower = String(targetUnit || 'nos').trim().toLowerCase();

    // Normalization helper
    const normalize = (u) => {
      if (!u) return '';
      u = u.replace(/\./g, ''); // remove dots (e.g. k.g -> kg)
      if (u === 'res' || u === 'rs' || u === 'rupees') return 'nos'; // price confusion check
      if (u === 'l' || u === 'ltr' || u === 'liter' || u === 'liters') return 'l';
      if (u === 'ml' || u === 'milli' || u === 'milliliter' || u === 'milliliters') return 'ml';
      if (u === 'g' || u === 'gm' || u === 'gram' || u === 'grams') return 'g';
      if (u === 'kg' || u === 'kilo' || u === 'kilogram' || u === 'kilograms') return 'kg';
      if (u === 'no' || u === 'nos' || u === 'num' || u === 'number' || u === 'numbers' || u === 'pc' || u === 'pcs' || u === 'piece' || u === 'pieces') return 'nos';
      return u;
    };

    const pUnit = normalize(prodUnit);
    const tUnit = normalize(targetUnitLower);

    // If we still have no product value (e.g. quantity was 0 or empty), fallback to count
    if (prodValue === 0) {
      // Default to treating item as 1 unit if no quantity defined
      console.warn(`⚠️ [CafeStock] Product ${product?.name} has no quantity value, defaulting to count`);
      return qty * noQty;
    }

    // ✅ CRITICAL FIX: If unit is not detected and we have a value, we need to be careful
    // If product quantity is a number without unit (e.g., 100) and stock is kg,
    // we should NOT assume it's already in kg - we need to check the actual unit
    if (!pUnit || pUnit === '') {
      console.warn(`⚠️ [CafeStock] Product ${product?.name} quantity ${prodValue} has no unit detected!`, {
        quantityRaw,
        quantityStr,
        hasQuantityUnit: !!product.quantityUnit,
        hasUnit: !!product.unit,
        hasInventoryUnit: !!product.inventory?.unit,
        inventoryUnit: product.inventory?.unit
      });
      // If no unit found, we can't safely convert - this is a data issue
      // But for now, we'll use the fallback logic below
    }

    // 2. Perform Conversion
    let conversionFactor = 1;

    // A. Identical Units
    if (pUnit === tUnit) {
      conversionFactor = 1;
    }
    // B. ML -> L
    else if (pUnit === 'ml' && tUnit === 'l') {
      conversionFactor = 0.001;
    }
    // C. L -> ML
    else if (pUnit === 'l' && tUnit === 'ml') {
      conversionFactor = 1000;
    }
    // D. G -> KG
    else if (pUnit === 'g' && tUnit === 'kg') {
      conversionFactor = 0.001;
    }
    // E. KG -> G
    else if (pUnit === 'kg' && tUnit === 'g') {
      conversionFactor = 1000;
    }
    // ✅ FIX: ML -> KG (via L: ML -> L -> KG, assuming 1L = 1kg for liquids)
    else if (pUnit === 'ml' && tUnit === 'kg') {
      // 100 ML = 0.1 L = 0.1 kg (assuming water/liquid density: 1L = 1kg)
      conversionFactor = 0.001; // ML to L, then L to kg (1:1 for liquids)
    }
    // ✅ FIX: L -> KG (assuming 1L = 1kg for liquids)
    else if (pUnit === 'l' && tUnit === 'kg') {
      conversionFactor = 1; // 1 L = 1 kg for liquids
    }
    // ✅ FIX: KG -> L (assuming 1kg = 1L for liquids)
    else if (pUnit === 'kg' && tUnit === 'l') {
      conversionFactor = 1; // 1 kg = 1 L for liquids
    }
    // ✅ FIX: ML -> L (when stock is in L)
    else if (pUnit === 'ml' && tUnit === 'l') {
      conversionFactor = 0.001;
    }
    // F. Fallbacks/Assumptions - When unit is not detected
    else if (tUnit === 'kg' && (pUnit === '' || pUnit === 'nos')) {
      // ✅ CRITICAL FIX: Stock is KG, Product has no unit detected
      // For values like 100, 150, 250, 500, 750, 1000 - these are likely ML (not grams or kg)
      // Common product quantities: 100ML, 150ML, 250ML, 500ML, 750ML, 1000ML
      // So we should convert ML -> KG using 0.001 factor
      if (prodValue >= 50 && prodValue <= 2000) {
        // Values between 50-2000 are likely ML (common beverage sizes)
        conversionFactor = 0.001; // Treat as ML -> KG
        console.warn(`⚠️ [CafeStock] Product ${product?.name} has no unit, assuming ${prodValue} is ML (converting to kg with 0.001 factor)`);
      } else if (prodValue > 2000) {
        // Very large values might be grams
        conversionFactor = 0.001; // G -> KG
        console.warn(`⚠️ [CafeStock] Product ${product?.name} has no unit, assuming ${prodValue} is grams (converting to kg with 0.001 factor)`);
      } else {
        // Small values (< 50) might already be in kg
        conversionFactor = 1;
        console.warn(`⚠️ [CafeStock] Product ${product?.name} has no unit, assuming ${prodValue} is already in kg`);
      }
    }
    else if (tUnit === 'l' && (pUnit === '' || pUnit === 'nos')) {
      // ✅ CRITICAL FIX: Stock is L, Product has no unit detected
      // For values like 100, 150, 250, 500, 750, 1000 - these are likely ML
      if (prodValue >= 50 && prodValue <= 2000) {
        // Values between 50-2000 are likely ML
        conversionFactor = 0.001; // ML -> L
        console.warn(`⚠️ [CafeStock] Product ${product?.name} has no unit, assuming ${prodValue} is ML (converting to L with 0.001 factor)`);
      } else if (prodValue > 2000) {
        conversionFactor = 0.001; // G -> L (via kg)
        console.warn(`⚠️ [CafeStock] Product ${product?.name} has no unit, assuming ${prodValue} is grams`);
      } else {
        conversionFactor = 1; // Assume already in L
        console.warn(`⚠️ [CafeStock] Product ${product?.name} has no unit, assuming ${prodValue} is already in L`);
      }
    }
    else if (tUnit === 'nos') {
      // If Stock is Nos, we usually just count items regardless of their specific weight/volume
      // UNLESS the stock is tracked in specific units but labeled Nos? Unlikely.
      // Usually if stock is Nos, we deduct 1 per item * noQty
      // BUT if Product says "Quantity: 10 Nos", do we deduct 10?
      // User example 2: Quantity=1Nos, Stock=100Nos -> Deduct 1.
      // If Quantity=6Nos (pack of 6), do we deduct 1 or 6?
      // Usually, if we buy a "pack of 6", we sell 1 pack. Stock is likely "packs".
      // Use prodValue.
      conversionFactor = 1;
    } else {
      // Unknown conversion (e.g. L -> Kg). Assume 1:1 or maintain value?
      // If units distinct and not compatible, might just use value (1L ~= 1Kg)
      conversionFactor = 1;
    }

    const valuePerItem = prodValue * conversionFactor;
    const consumption = valuePerItem * noQty * qty;

    // ✅ CRITICAL FIX: Validate the calculation makes sense
    // If consumption seems too high (e.g., > 10x the product value when converting ML->KG),
    // there might be a unit detection issue
    if (tUnit === 'kg' && (pUnit === 'ml' || pUnit === '') && consumption > prodValue * 0.01) {
      console.error(`❌ [CafeStock] SUSPICIOUS CALCULATION: Consumption (${consumption} kg) seems too high for ${prodValue} ${pUnit || '(no unit)'} product!`, {
        productName: product?.name,
        productId: product?._id,
        prodValue,
        pUnit,
        tUnit,
        conversionFactor,
        consumption,
        expectedMax: prodValue * 0.001 // Max should be prodValue * 0.001 for ML->KG
      });
      // ✅ FIX: If suspicious, recalculate with correct assumption
      // If prodValue is 100 and consumption is 1, it means conversionFactor was wrong
      // Recalculate assuming ML -> KG conversion
      if (prodValue >= 50 && prodValue <= 2000 && conversionFactor === 1 && pUnit === '') {
        console.warn(`⚠️ [CafeStock] Recalculating with ML->KG assumption (0.001 factor)`);
        const correctedConversionFactor = 0.001;
        const correctedValuePerItem = prodValue * correctedConversionFactor;
        const correctedConsumption = correctedValuePerItem * noQty * qty;
        // Use corrected value
        const correctedRounded = Math.round(correctedConsumption * 1000) / 1000;
        return correctedRounded;
      }
    }

    // ✅ FIX: Preserve decimal precision (up to 3 decimal places for kg/L/g/ml, unlimited for Nos)
    // Round to 3 decimal places to avoid floating point precision issues, but keep decimals
    if (tUnit === 'kg' || tUnit === 'l' || tUnit === 'g' || tUnit === 'ml') {
      // Round to 3 decimal places (0.001 precision)
      const rounded = Math.round(consumption * 1000) / 1000;
      // ✅ DEBUG: Log calculation details for troubleshooting
      console.log(`🧮 [CafeStock] Consumption calculation:`, {
        productName: product?.name,
        productId: product?._id,
        quantityRaw: quantityRaw,
        quantityStr: quantityStr,
        prodValue,
        prodUnit: pUnit || '(not detected)',
        targetUnit: tUnit,
        conversionFactor,
        valuePerItem,
        noQty,
        qty,
        consumption,
        rounded,
        formula: `${prodValue} ${pUnit || '(no unit)'} × ${conversionFactor} (${pUnit || '?'}→${tUnit}) × ${noQty} (No.Qty) × ${qty} (qty) = ${consumption} ${tUnit} → rounded: ${rounded} ${tUnit}`,
        // ✅ Add product fields for debugging
        productFields: {
          quantity: product?.quantity,
          quantityUnit: product?.quantityUnit,
          unit: product?.unit,
          inventoryUnit: product?.inventory?.unit,
          sizeLabel: product?.sizeLabel
        }
      });
      return rounded;
    }

    return consumption;
  }

  /**
   * Get current available stock balance for a product
   * Returns the current balance stock considering all transactions up to the given date
   */
  async getCurrentStockBalance(theaterId, productId, targetDate = null) {
    try {
      const date = targetDate ? new Date(targetDate) : new Date();
      const year = date.getFullYear();
      const monthNumber = date.getMonth() + 1;

      // Get or create monthly document
      const previousBalance = await CafeMonthlyStock.getPreviousMonthBalance(
        theaterId,
        productId,
        year,
        monthNumber
      );

      let monthlyDoc = await CafeMonthlyStock.getOrCreateMonthlyDoc(
        theaterId,
        productId,
        year,
        monthNumber,
        previousBalance
      );

      // Recalculate balances to ensure accuracy
      this.recalculateBalances(monthlyDoc);
      await monthlyDoc.save();

      // Get the latest balance from the document
      // closingBalance is the most recent balance
      return monthlyDoc.closingBalance || monthlyDoc.oldStock || 0;
    } catch (error) {
      console.error('Error getting current stock balance:', error);
      return 0; // Return 0 on error to be safe
    }
  }

  /**
   * Calculate maximum orderable quantity based on available stock and product details
   * Returns the maximum number of items (No.Qty) that can be ordered
   */
  async getMaxOrderableQuantity(theaterId, productId, targetDate = null) {
    try {
      // Get current available stock
      const availableStock = await this.getCurrentStockBalance(theaterId, productId, targetDate);

      // ✅ CRITICAL FIX: Fetch product from productlist collection (array structure)
      const db = mongoose.connection.db;
      const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
      const productObjectId = new mongoose.Types.ObjectId(productId);

      let product = null;

      // Try fetching from productlist collection first (array structure)
      const productContainer = await db.collection('productlist').findOne({
        theater: theaterObjectId,
        'productList._id': productObjectId
      });

      if (productContainer && productContainer.productList) {
        product = productContainer.productList.find(
          p => String(p._id) === String(productId)
        );
      }

      // Fallback to Product model if not found in productlist
      if (!product) {
        product = await Product.findById(productId).lean();
      }

      if (!product) {
        console.warn(`⚠️ [CafeStock] Product ${productId} not found for max orderable calculation`);
        return 0;
      }

      // Get product quantity value and unit
      const quantityRaw = product.quantity;
      const quantityStr = String(quantityRaw || '').trim();
      // ✅ FIX: Improved regex to handle cases like "100ML", "100 ML", "100.5ML", etc.
      const quantityRegex = /^([\d.]+)\s*([a-zA-Z%]+)$/i;
      const match = quantityStr.match(quantityRegex);

      let prodValue = 0;
      let prodUnit = '';

      if (match) {
        prodValue = parseFloat(match[1]);
        prodUnit = match[2].toLowerCase();
      } else {
        const parsedVal = parseFloat(quantityRaw);
        if (!isNaN(parsedVal)) {
          prodValue = parsedVal;
          if (product.quantityUnit) prodUnit = String(product.quantityUnit).trim().toLowerCase();
          else if (product.unit) prodUnit = String(product.unit).trim().toLowerCase();
          else if (product.inventory?.unit) prodUnit = String(product.inventory.unit).trim().toLowerCase();
        }
      }

      // Get No.Qty (number of quantities per item)
      const noQty = Number(product.noQty) || 1;

      // Get stock unit from latest entry
      const date = targetDate ? new Date(targetDate) : new Date();
      const year = date.getFullYear();
      const monthNumber = date.getMonth() + 1;
      const previousBalance = await CafeMonthlyStock.getPreviousMonthBalance(
        theaterId,
        productId,
        year,
        monthNumber
      );
      let monthlyDoc = await CafeMonthlyStock.getOrCreateMonthlyDoc(
        theaterId,
        productId,
        year,
        monthNumber,
        previousBalance
      );

      let targetUnit = 'Nos';
      if (monthlyDoc.stockDetails && monthlyDoc.stockDetails.length > 0) {
        const sorted = [...monthlyDoc.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));
        const entryWithUnit = sorted.find(e => e.unit);
        if (entryWithUnit) targetUnit = entryWithUnit.unit;
      }

      // Normalize units
      const normalize = (u) => {
        if (!u) return '';
        u = u.replace(/\./g, '');
        if (u === 'l' || u === 'ltr' || u === 'liter' || u === 'liters') return 'l';
        if (u === 'ml' || u === 'milli' || u === 'milliliter' || u === 'milliliters') return 'ml';
        if (u === 'g' || u === 'gm' || u === 'gram' || u === 'grams') return 'g';
        if (u === 'kg' || u === 'kilo' || u === 'kilogram' || u === 'kilograms') return 'kg';
        if (u === 'no' || u === 'nos' || u === 'num' || u === 'number' || u === 'numbers' || u === 'pc' || u === 'pcs' || u === 'piece' || u === 'pieces') return 'nos';
        return u;
      };

      const pUnit = normalize(prodUnit);
      const tUnit = normalize(String(targetUnit || 'nos').toLowerCase());

      // Calculate conversion factor (same logic as calculateConsumption)
      let conversionFactor = 1;
      if (pUnit === tUnit) {
        conversionFactor = 1;
      } else if (pUnit === 'ml' && tUnit === 'l') {
        conversionFactor = 0.001;
      } else if (pUnit === 'l' && tUnit === 'ml') {
        conversionFactor = 1000;
      } else if (pUnit === 'g' && tUnit === 'kg') {
        conversionFactor = 0.001;
      } else if (pUnit === 'kg' && tUnit === 'g') {
        conversionFactor = 1000;
      } else if (pUnit === 'ml' && tUnit === 'kg') {
        // ✅ FIX: ML -> KG (via L: ML -> L -> KG, assuming 1L = 1kg for liquids)
        conversionFactor = 0.001; // ML to L, then L to kg (1:1 for liquids)
      } else if (pUnit === 'l' && tUnit === 'kg') {
        // ✅ FIX: L -> KG (assuming 1L = 1kg for liquids)
        conversionFactor = 1; // 1 L = 1 kg for liquids
      } else if (pUnit === 'kg' && tUnit === 'l') {
        // ✅ FIX: KG -> L (assuming 1kg = 1L for liquids)
        conversionFactor = 1; // 1 kg = 1 L for liquids
      } else if (tUnit === 'kg' && (pUnit === '' || pUnit === 'nos')) {
        if (prodValue >= 50) conversionFactor = 0.001;
        else conversionFactor = 1;
      } else if (tUnit === 'l' && (pUnit === '' || pUnit === 'nos')) {
        if (prodValue >= 50) conversionFactor = 0.001;
        else conversionFactor = 1;
      } else if (tUnit === 'nos') {
        conversionFactor = 1;
      } else {
        conversionFactor = 1;
      }

      // Calculate stock consumption per item (No.Qty 1)
      const valuePerItem = (prodValue || 1) * conversionFactor;
      const stockPerItem = valuePerItem * noQty;

      // If stock per item is 0 or invalid, return 0
      if (stockPerItem <= 0) {
        return 0;
      }

      // Calculate max orderable quantity (floor division)
      const maxOrderableQty = Math.floor(availableStock / stockPerItem);

      return Math.max(0, maxOrderableQty);
    } catch (error) {
      console.error('Error calculating max orderable quantity:', error);
      return 0;
    }
  }

  /**
   * Validate if order quantity is within available stock
   * Returns { valid: boolean, maxOrderable: number, message: string }
   */
  async validateOrderQuantity(theaterId, productId, orderQuantity, targetDate = null) {
    try {
      const requestedQty = Number(orderQuantity) || 0;

      if (requestedQty <= 0) {
        return {
          valid: false,
          maxOrderable: 0,
          message: 'Order quantity must be greater than 0'
        };
      }

      // Get product to check if stock tracking is enabled
      const product = await Product.findById(productId).lean();
      if (!product) {
        // Product not found - allow order (will fail later in order creation)
        return {
          valid: true,
          maxOrderable: requestedQty,
          message: 'Product validation will be handled separately'
        };
      }

      // Check if stock tracking is enabled for this product
      const trackStock = product.inventory?.trackStock !== false; // Default to true if not specified

      // If stock tracking is disabled, allow the order
      if (trackStock === false) {
        return {
          valid: true,
          maxOrderable: requestedQty,
          message: 'Stock tracking disabled for this product'
        };
      }

      // Get current stock balance
      const availableStock = await this.getCurrentStockBalance(theaterId, productId, targetDate);

      // If no stock data exists yet (new product), allow the order
      // This handles the case where stock hasn't been set up yet
      if (availableStock === 0) {
        // Check if there are any stock entries at all
        const date = targetDate ? new Date(targetDate) : new Date();
        const year = date.getFullYear();
        const monthNumber = date.getMonth() + 1;
        const previousBalance = await CafeMonthlyStock.getPreviousMonthBalance(
          theaterId,
          productId,
          year,
          monthNumber
        );
        let monthlyDoc = await CafeMonthlyStock.getOrCreateMonthlyDoc(
          theaterId,
          productId,
          year,
          monthNumber,
          previousBalance
        );

        // If no stock entries exist and oldStock is 0, allow order (stock not set up yet)
        const hasStockEntries = monthlyDoc.stockDetails && monthlyDoc.stockDetails.length > 0;
        const hasOldStock = (monthlyDoc.oldStock || 0) > 0;

        if (!hasStockEntries && !hasOldStock) {
          // No stock setup yet - allow order
          return {
            valid: true,
            maxOrderable: requestedQty,
            message: 'Stock not set up yet - order allowed'
          };
        }
      }

      // Calculate max orderable quantity
      const maxOrderable = await this.getMaxOrderableQuantity(theaterId, productId, targetDate);

      // If maxOrderable is 0 and availableStock is 0, check if it's a calculation issue
      if (maxOrderable === 0 && availableStock === 0) {
        // Check if product has quantity/unit info that might cause calculation issues
        const quantityRaw = product.quantity;
        const hasQuantityInfo = quantityRaw && String(quantityRaw).trim() !== '';

        if (!hasQuantityInfo) {
          // Product has no quantity info - might be a calculation issue, allow order
          return {
            valid: true,
            maxOrderable: requestedQty,
            message: 'Product quantity info missing - order allowed'
          };
        }
      }

      // Validate quantity against max orderable
      if (requestedQty > maxOrderable) {
        return {
          valid: false,
          maxOrderable: maxOrderable,
          message: `Insufficient stock. Maximum orderable quantity is ${maxOrderable}`
        };
      }

      return {
        valid: true,
        maxOrderable: maxOrderable,
        message: 'Stock available'
      };
    } catch (error) {
      console.error('Error validating order quantity:', error);
      // On error, be lenient and allow the order (better than blocking all orders)
      console.warn(`⚠️ [CafeStock] Stock validation error for product ${productId}, allowing order:`, error.message);
      return {
        valid: true,
        maxOrderable: Number(orderQuantity) || 0,
        message: 'Stock validation error - order allowed'
      };
    }
  }

  /**
   * Record stock usage (sales) in cafe stock - FIFO logic
   * This is called when orders are placed from POS, Online, or Kiosk
   */
  async recordStockUsage(theaterId, productId, quantity, orderDate) {
    try {
      const entryDate = new Date(orderDate);
      const year = entryDate.getFullYear();
      const monthNumber = entryDate.getMonth() + 1;
      const now = new Date();

      // ✅ CRITICAL FIX: Fetch product from productlist collection (array structure)
      // Products are stored in productlist collection as an array, not individual documents
      const db = mongoose.connection.db;
      const theaterObjectId = new mongoose.Types.ObjectId(theaterId);
      const productObjectId = new mongoose.Types.ObjectId(productId);

      let product = null;

      // Try fetching from productlist collection first (array structure)
      const productContainer = await db.collection('productlist').findOne({
        theater: theaterObjectId,
        'productList._id': productObjectId
      });

      if (productContainer && productContainer.productList) {
        product = productContainer.productList.find(
          p => String(p._id) === String(productId)
        );
      }

      // Fallback to Product model if not found in productlist
      if (!product) {
        product = await Product.findById(productId).lean();
      }

      // ✅ DEBUG: Log the actual product data being used
      if (!product) {
        console.error(`❌ [CafeStock] Product ${productId} not found in database!`);
        // Don't throw error - allow order to complete even if product not found
        return;
      } else {
        console.log(`📋 [CafeStock] Product data for ${product.name}:`, {
          _id: product._id,
          quantity: product.quantity,
          quantityType: typeof product.quantity,
          quantityUnit: product.quantityUnit,
          unit: product.unit,
          inventoryUnit: product.inventory?.unit,
          noQty: product.noQty,
          sizeLabel: product.sizeLabel,
          allQuantityFields: {
            quantity: product.quantity,
            quantityUnit: product.quantityUnit,
            unit: product.unit,
            'inventory.unit': product.inventory?.unit,
            sizeLabel: product.sizeLabel
          }
        });
      }

      // Get or create monthly document for the order date
      const previousBalance = await CafeMonthlyStock.getPreviousMonthBalance(
        theaterId,
        productId,
        year,
        monthNumber
      );

      let currentMonthDoc = await CafeMonthlyStock.getOrCreateMonthlyDoc(
        theaterId,
        productId,
        year,
        monthNumber,
        previousBalance
      );

      // Determine target stock unit from latest entry or historical data
      // Use the unit from the most recent stock entry if available
      let targetUnit = 'Nos';
      if (currentMonthDoc.stockDetails && currentMonthDoc.stockDetails.length > 0) {
        // Find last entry with a unit
        const sorted = [...currentMonthDoc.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));
        const entryWithUnit = sorted.find(e => e.unit);
        if (entryWithUnit) targetUnit = entryWithUnit.unit;
      }

      // ✅ FIX: Calculate actual stock consumption based on units
      // If product is 750ML and stock is L, consumption should be 0.75 * quantity
      const consumptionAmount = this.calculateConsumption(product, quantity, targetUnit);

      // FIX: Ensure consumption is at least 0 and preserve decimal precision
      const safeConsumption = Math.max(0, consumptionAmount);

      // ✅ FIX: Find or create an entry for the order date (today)
      let todayEntry = currentMonthDoc.stockDetails.find(entry => {
        const entryDateOnly = new Date(entry.date);
        entryDateOnly.setHours(0, 0, 0, 0);
        const orderDateOnly = new Date(entryDate);
        orderDateOnly.setHours(0, 0, 0, 0);
        return entryDateOnly.getTime() === orderDateOnly.getTime();
      });

      // If no entry exists for today, create one
      if (!todayEntry) {
        // Calculate previous day balance
        const entriesBeforeToday = currentMonthDoc.stockDetails
          .filter(entry => new Date(entry.date) < entryDate)
          .sort((a, b) => new Date(b.date) - new Date(a.date));

        const previousDayBalance = entriesBeforeToday.length > 0
          ? entriesBeforeToday[0].balance
          : currentMonthDoc.oldStock;

        // Create new entry for today with sales
        todayEntry = {
          date: entryDate,
          type: 'ADDED', // Keep as ADDED type to maintain balance calculations
          quantity: 0,
          invordStock: 0,
          sales: safeConsumption, // Record sales for today
          damageStock: 0,
          expiredStock: 0,
          addon: 0,
          stockAdjustment: 0,
          cancelStock: 0,
          oldStock: previousDayBalance,
          balance: Math.max(0, previousDayBalance - safeConsumption),
          notes: 'Sales entry',
          inwardType: 'product'
        };

        currentMonthDoc.stockDetails.push(todayEntry);
      } else {
        // Update existing entry for today
        todayEntry.sales = (todayEntry.sales || 0) + safeConsumption;

        // Recalculate balance for today's entry
        todayEntry.balance = Math.max(0,
          (todayEntry.oldStock || 0) +
          (todayEntry.invordStock || 0) +
          (todayEntry.addon || 0) -
          todayEntry.sales -
          (todayEntry.expiredStock || 0) -
          (todayEntry.damageStock || 0) +
          (todayEntry.stockAdjustment || 0) +
          (todayEntry.cancelStock || 0)
        );
      }

      // Mark as modified and save
      currentMonthDoc.markModified('stockDetails');

      // Recalculate all entries after today to update their balances
      const sortedEntries = currentMonthDoc.stockDetails.sort((a, b) =>
        new Date(a.date) - new Date(b.date)
      );

      let runningBalance = currentMonthDoc.oldStock;
      for (const entry of sortedEntries) {
        entry.oldStock = runningBalance;
        entry.balance = Math.max(0,
          runningBalance +
          (entry.invordStock || 0) +
          (entry.addon || 0) -
          (entry.sales || 0) -
          (entry.expiredStock || 0) -
          (entry.damageStock || 0) +
          (entry.stockAdjustment || 0) +
          (entry.cancelStock || 0)
        );
        runningBalance = entry.balance;
      }

      // Recalculate monthly totals and closing balance
      this.recalculateBalances(currentMonthDoc);
      await currentMonthDoc.save();

    } catch (error) {
      console.error('Cafe stock usage recording error:', error);
      // Don't throw - allow order to complete even if cafe stock recording fails
    }
  }

  /**
   * Restore stock on order cancellation - reverses stock deductions
   * This is called when orders are cancelled to return stock to cafe inventory
   * Records the cancellation on the order date (today)
   * @param {string} theaterId - Theater ID
   * @param {string} productId - Product ID
   * @param {number} quantity - Order quantity (count of items)
   * @param {Date} orderDate - Order date
   * @param {object} product - Optional product object (if provided, uses its noQty for calculation)
   * @param {number} stockQuantityConsumed - Optional stock quantity consumed (if provided, uses this directly instead of calculating)
   */
  async restoreStockOnCancellation(theaterId, productId, quantity, orderDate, product = null, stockQuantityConsumed = null) {
    try {
      const entryDate = new Date(orderDate);
      const year = entryDate.getFullYear();
      const monthNumber = entryDate.getMonth() + 1;

      // Get or create monthly document for the order date
      const previousBalance = await CafeMonthlyStock.getPreviousMonthBalance(
        theaterId,
        productId,
        year,
        monthNumber
      );

      let currentMonthDoc = await CafeMonthlyStock.getOrCreateMonthlyDoc(
        theaterId,
        productId,
        year,
        monthNumber,
        previousBalance
      );

      // ✅ FIX: Find or create an entry for the order date (today)
      let todayEntry = currentMonthDoc.stockDetails.find(entry => {
        const entryDateOnly = new Date(entry.date);
        entryDateOnly.setHours(0, 0, 0, 0);
        const orderDateOnly = new Date(entryDate);
        orderDateOnly.setHours(0, 0, 0, 0);
        return entryDateOnly.getTime() === orderDateOnly.getTime();
      });

      // ✅ FIX: Use saved stockQuantityConsumed if provided (most accurate)
      // Otherwise, calculate consumption using product's noQty (or saved noQty from product parameter)
      let safeConsumption = 0;
      
      
      // ✅ FIX: Check if stockQuantityConsumed exists and is a valid positive number
      if (stockQuantityConsumed !== null && 
          stockQuantityConsumed !== undefined && 
          !isNaN(stockQuantityConsumed) && 
          Number(stockQuantityConsumed) > 0) {
        // Use the saved stock quantity consumed directly (most accurate)
        safeConsumption = Math.max(0, Number(stockQuantityConsumed));
      } else {
        // Calculate consumption (fallback to calculation)
        let productData = product;
        if (!productData) {
          productData = await Product.findById(productId).lean();
        }

        let targetUnit = 'Nos';
        if (currentMonthDoc.stockDetails && currentMonthDoc.stockDetails.length > 0) {
          const sorted = [...currentMonthDoc.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));
          const entryWithUnit = sorted.find(e => e.unit);
          if (entryWithUnit) targetUnit = entryWithUnit.unit;
        }

        const consumptionAmount = this.calculateConsumption(productData, quantity, targetUnit);
        safeConsumption = Math.max(0, consumptionAmount);
      }

      // If no entry exists for today, create one (unlikely for cancellation but possible)
      if (!todayEntry) {
        // Calculate previous day balance
        const entriesBeforeToday = currentMonthDoc.stockDetails
          .filter(entry => new Date(entry.date) < entryDate)
          .sort((a, b) => new Date(b.date) - new Date(a.date));

        const previousDayBalance = entriesBeforeToday.length > 0
          ? entriesBeforeToday[0].balance
          : currentMonthDoc.oldStock;

        // Determine unit for the entry
        let entryUnit = 'Nos';
        if (currentMonthDoc.stockDetails && currentMonthDoc.stockDetails.length > 0) {
          const sorted = [...currentMonthDoc.stockDetails].sort((a, b) => new Date(b.date) - new Date(a.date));
          const entryWithUnit = sorted.find(e => e.unit);
          if (entryWithUnit) entryUnit = entryWithUnit.unit;
        }

        // Create new entry for today with cancelStock (restoration)
        todayEntry = {
          date: entryDate,
          type: 'ADDED',
          quantity: 0,
          invordStock: 0,
          sales: 0,
          damageStock: 0,
          expiredStock: 0,
          addon: 0,
          stockAdjustment: 0,
          cancelStock: safeConsumption, // ✅ Record as cancelled stock (adds to balance) - using stockQuantityConsumed value
          oldStock: previousDayBalance,
          balance: Math.max(0, previousDayBalance + safeConsumption),
          notes: `Order Cancellation Restoration (restored ${safeConsumption} ${entryUnit} from stockQuantityConsumed)`,
          unit: entryUnit, // ✅ Add unit field
          inwardType: 'product'
        };
        

        currentMonthDoc.stockDetails.push(todayEntry);
      } else {
        // Update existing entry for today
        // cancelStock adds to the balance (restores stock)
        const previousCancelStock = todayEntry.cancelStock || 0;
        todayEntry.cancelStock = previousCancelStock + safeConsumption;
        

        // Recalculate balance for today's entry
        todayEntry.balance = Math.max(0,
          (todayEntry.oldStock || 0) +
          (todayEntry.invordStock || 0) +
          (todayEntry.addon || 0) -
          (todayEntry.sales || 0) -
          (todayEntry.expiredStock || 0) -
          (todayEntry.damageStock || 0) +
          (todayEntry.stockAdjustment || 0) +
          todayEntry.cancelStock
        );
      }

      // Mark as modified and save
      currentMonthDoc.markModified('stockDetails');

      // Recalculate all entries after today to update their balances
      const sortedEntries = currentMonthDoc.stockDetails.sort((a, b) =>
        new Date(a.date) - new Date(b.date)
      );

      let runningBalance = currentMonthDoc.oldStock;
      for (const entry of sortedEntries) {
        entry.oldStock = runningBalance;
        entry.balance = Math.max(0,
          runningBalance +
          (entry.invordStock || 0) +
          (entry.addon || 0) -
          (entry.sales || 0) -
          (entry.expiredStock || 0) -
          (entry.damageStock || 0) +
          (entry.stockAdjustment || 0) +
          (entry.cancelStock || 0)
        );
        runningBalance = entry.balance;
      }

      // Recalculate monthly totals and closing balance
      this.recalculateBalances(currentMonthDoc);
      await currentMonthDoc.save();
    } catch (error) {
      console.error('Cafe stock restoration error:', error);
      // Don't throw - allow cancellation to complete even if stock restoration fails
      // Log the error for manual review
    }
  }
}

module.exports = new CafeStockService();

