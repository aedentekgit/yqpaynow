# Print Setup Guide

This guide explains how to set up automatic printing for POS orders.

## Installation

Install the required npm packages:

```bash
npm install puppeteer
```

**Note:** `pdf-to-printer` is already installed.

## Printer Type

### Regular/Silent Printers (PDF)
- Uses `pdf-to-printer` library for Windows printing
- Uses WebSocket-based silent printing service (frontend)
- Works with any Windows printer
- Automatically prints to default printer
- Silent printing via WebSocket connection (no print dialogs)

## API Endpoints

### POST `/api/print/receipt`
Auto-detect printer type and print (recommended)

**Request Body:**
```json
{
  "billData": {
    "billNumber": "ORD-12345",
    "orderNumber": "ORD-12345",
    "date": "2025-01-15T10:30:00Z",
    "customerName": "John Doe",
    "paymentMethod": "cash",
    "items": [
      {
        "name": "Burger",
        "quantity": 2,
        "price": 200,
        "total": 400
      }
    ],
    "subtotal": 400,
    "tax": 18,
    "discount": 10,
    "grandTotal": 408
  },
  "theaterInfo": {
    "name": "Theater Name",
    "address": {...},
    "phone": "1234567890"
  },
  "printerType": "regular" // Only regular/silent printing is supported
}
```

### POST `/api/print/bill`
Print to regular printer (PDF)

## Configuration

### Silent Printing Setup

The system uses WebSocket-based silent printing by default. The frontend automatically connects to the print service and sends print jobs silently without showing print dialogs.

**No additional configuration needed** - the system works out of the box with silent printing.

## How It Works

1. When user clicks "Confirm Order" in POS
2. Frontend uses silent print service (WebSocket-based)
3. Frontend connects to WebSocket print server automatically
4. Receipt HTML is sent to print server via WebSocket
5. Print happens automatically without browser dialog
6. Falls back to Cloud Print or regular printing if WebSocket is unavailable

## Troubleshooting

### Silent Printing Issues
- Ensure WebSocket print server is running and accessible
- Check WebSocket URL configuration in frontend config
- Verify printer is connected and set as default in Windows
- Check printer is online and has paper
- Verify `puppeteer` is installed for PDF generation (fallback)

## Testing

Test the print endpoint:

```bash
curl -X POST http://localhost:3000/api/print/receipt \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "billData": {
      "billNumber": "TEST-001",
      "customerName": "Test Customer",
      "items": [{"name": "Test Item", "quantity": 1, "price": 100, "total": 100}],
      "grandTotal": 100
    },
    "printerType": "regular"
  }'
```

