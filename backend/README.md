# Backend API - MVC Architecture

## 🎯 Architecture Overview

This backend follows **MVC (Model-View-Controller) pattern** for clean, maintainable, and optimized code.

## 📁 Project Structure

```
backend/
├── controllers/          # HTTP request/response handlers
│   ├── BaseController.js
│   ├── TheaterController.js
│   ├── ProductController.js
│   └── OrderController.js
├── services/            # Business logic layer
│   ├── BaseService.js
│   ├── TheaterService.js
│   ├── ProductService.js
│   └── OrderService.js
├── validators/          # Input validation rules
│   ├── theaterValidator.js
│   ├── productValidator.js
│   └── orderValidator.js
├── routes/              # Route definitions (thin layer)
│   ├── *.mvc.js        # NEW MVC routes (active)
│   └── *.js            # OLD routes (kept for reference)
├── models/              # Database models
├── middleware/          # Express middleware
└── utils/              # Utility functions
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your MongoDB URI and other configs
```

### 3. Start Server
```bash
npm start
```

### 4. Test API
```bash
# Health check
curl http://localhost:8080/api/health

# Get theaters
curl http://localhost:8080/api/theaters?page=1&limit=10
```

## 📚 API Endpoints

### Theaters
- `GET /api/theaters` - List theaters
- `GET /api/theaters/:id` - Get theater
- `POST /api/theaters` - Create theater
- `PUT /api/theaters/:id` - Update theater
- `DELETE /api/theaters/:id` - Delete theater
- `GET /api/theaters/expiring-agreements` - Get expiring agreements
- `GET /api/theaters/:id/dashboard` - Get dashboard
- `GET /api/theaters/:theaterId/agreement-status` - Get agreement status

### Products
- `GET /api/theater-products/:theaterId` - List products
- `GET /api/theater-products/:theaterId/:productId` - Get product
- `POST /api/theater-products/:theaterId` - Create product
- `PUT /api/theater-products/:theaterId/:productId` - Update product
- `DELETE /api/theater-products/:theaterId/:productId` - Delete product

### Orders
- `GET /api/orders/theater/:theaterId` - List orders
- `GET /api/orders/theater/:theaterId/:orderId` - Get order
- `POST /api/orders/theater` - Create order
- `PUT /api/orders/theater/:theaterId/:orderId/status` - Update status

## 🎯 MVC Pattern Benefits

1. **Separation of Concerns**
   - Routes: Only routing and middleware
   - Controllers: HTTP handling
   - Services: Business logic
   - Models: Data structure

2. **Code Reusability**
   - BaseController: Common response methods
   - BaseService: Common database operations

3. **Maintainability**
   - Easy to find code
   - Clear structure
   - Consistent patterns

4. **Performance**
   - Optimized queries
   - Proper timeouts
   - Error handling

## 📖 Documentation

- `README_MVC_STRUCTURE.md` - Complete MVC guide
- `MVC_MIGRATION_STATUS.md` - Migration status
- `MVC_COMPLETE_SUMMARY.md` - Migration summary
- `QUICK_START_MVC.md` - Quick start guide

## 🔧 Development

### Adding New Module

1. Create Service (extends BaseService)
2. Create Controller (uses BaseController)
3. Create Validator
4. Create Route file (*.mvc.js)
5. Update server.js

See existing modules for examples.

## 🧪 Testing

```bash
# Run test script
node test-mvc-endpoints.js

# Or test manually
curl http://localhost:8080/api/theaters?page=1&limit=10
```

## ⚡ Performance

- All queries use `maxTimeMS` timeouts
- Parallel queries with `Promise.all`
- Optimized database operations
- Proper error handling

## 📝 License

[Your License Here]

