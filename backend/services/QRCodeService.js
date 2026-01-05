const BaseService = require('./BaseService');
const Theater = require('../models/Theater');
const { generateQRCodes } = require('../utils/qrCodeGenerator');
const QRCode = require('qrcode');

/**
 * QR Code Service
 * Handles all QR code-related business logic
 */
class QRCodeService extends BaseService {
  constructor() {
    super(null); // No base model
  }

  /**
   * Generate QR codes
   */
  async generateQRCodes(data) {
    const {
      theaterId,
      qrType,
      name,
      seatClass,
      selectedSeats,
      logoUrl,
      logoType,
      userId
    } = data;

    // Additional validation for screen type
    if (qrType === 'screen') {
      if (!selectedSeats || selectedSeats.length === 0) {
        throw new Error('Selected seats are required for screen type QR codes');
      }
      if (selectedSeats.length > 100) {
        throw new Error('Cannot generate more than 100 QR codes at once');
      }
    }

    const result = await generateQRCodes({
      theaterId,
      qrType,
      name,
      seatClass,
      selectedSeats,
      logoUrl,
      logoType,
      userId
    });

    return {
      count: result.count,
      qrType: qrType,
      batchId: result.batchId,
      failedSeats: result.failedSeats || 0
    };
  }

  /**
   * Generate legacy QR code (table-based)
   */
  async generateLegacyQRCode(theaterId, tableNumber, baseUrl) {
    const theater = await Theater.findById(theaterId).maxTimeMS(20000);
    if (!theater) {
      throw new Error('Theater not found');
    }

    const qrCode = theater.generateQRCode(tableNumber);
    await theater.save();

    const qrUrl = `${baseUrl}/menu/${qrCode.code}?theaterId=${theaterId}&tableNumber=${tableNumber}`;

    const qrCodeImage = await QRCode.toDataURL(qrUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    return {
      qrCode: qrCode.code,
      tableNumber,
      url: qrUrl,
      image: qrCodeImage,
      theaterId,
      theaterName: theater.name,
      createdAt: qrCode.createdAt
    };
  }

  /**
   * Get QR code by ID
   */
  async getQRCodeById(qrCodeId) {
    const theater = await Theater.findOne({ 'qrCodes._id': qrCodeId })
      .maxTimeMS(20000);

    if (!theater) {
      return null;
    }

    const qrCode = theater.qrCodes.id(qrCodeId);
    return qrCode || null;
  }

  /**
   * Get QR codes for theater
   */
  async getQRCodesByTheater(theaterId) {
    const theater = await Theater.findById(theaterId)
      .select('qrCodes name')
      .maxTimeMS(20000);

    if (!theater) {
      throw new Error('Theater not found');
    }

    return theater.qrCodes || [];
  }

  /**
   * Delete QR code
   */
  async deleteQRCode(theaterId, qrCode) {
    const theater = await Theater.findById(theaterId).maxTimeMS(20000);
    if (!theater) {
      throw new Error('Theater not found');
    }

    theater.qrCodes = theater.qrCodes.filter(qc => qc.code !== qrCode);
    await theater.save();

    return true;
  }

  /**
   * Verify QR code
   */
  async verifyQRCode(qrCode) {
    const theater = await Theater.findOne({ 'qrCodes.code': qrCode })
      .select('name qrCodes')
      .maxTimeMS(20000);

    if (!theater) {
      return null;
    }

    const qr = theater.qrCodes.find(qc => qc.code === qrCode);
    if (!qr) {
      return null;
    }

    return {
      valid: true,
      theaterId: theater._id,
      theaterName: theater.name,
      qrCode: qr.code,
      tableNumber: qr.tableNumber
    };
  }
}

module.exports = new QRCodeService();

