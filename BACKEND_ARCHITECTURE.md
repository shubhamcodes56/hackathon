# 🚀 FAANG-Level Node.js & Express Generic Backend Architecture

This document provides a highly modular, clean, scalable, and secure backend foundation designed for **any application**. It is thoroughly decoupled from business logic and strictly adheres to enterprise Separation of Concerns (SoC).

---

## 1. Complete Backend Folder Structure

This structure guarantees that as your generic backend scales from 5 to 500 routes, the codebase will remain cleanly organized.

```text
generic-backend/
├── src/
│   ├── config/             # Environment variables & DB connection (e.g., db.js, env.js)
│   ├── controllers/        # Request handlers (logic-less, only handles req/res)
│   │   └── authController.js
│   ├── services/           # Heavy business logic (called by controllers)
│   │   └── authService.js
│   ├── routes/             # Route definitions mapping to controllers
│   │   ├── index.js        # Main router aggregator
│   │   └── authRoutes.js
│   ├── middlewares/        # Custom Express middlewares
│   │   ├── authMiddleware.js
│   │   ├── errorHandler.js
│   │   ├── rateLimiter.js
│   │   └── validateRequest.js
│   ├── models/             # Database Schemas or ORM (Prisma/Sequelize/TypeORM)
│   ├── utils/              # Helper functions (e.g., logger.js, hash.js, jwt.js)
│   ├── app.js              # Express app initialization & middleware mounting
│   └── server.js           # Server entry point (app.listen)
├── .env.example            # Environment variables template
├── package.json
└── README.md
```

---

## 2. Core Backend Code (Node.js + Express)

### `src/server.js` (Entry Point)
Strictly responsible for starting the server and handling fatal errors.

```javascript
require('dotenv').config();
const app = require('./app');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled promise rejections (e.g., failed DB connection)
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection! 💥 Shutting down... ${err.message}`);
  server.close(() => process.exit(1));
});
```

### `src/app.js` (Express Setup)
Strictly responsible for configuring Express, security middlewares, and mounting routes.

```javascript
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan'); // HTTP request logger
const globalErrorHandler = require('./middlewares/errorHandler');
const rateLimiter = require('./middlewares/rateLimiter');
const apiRoutes = require('./routes');

const app = express();

// 1. GLOBAL SECURITY MIDDLEWARES
app.use(helmet()); // Sets generic security HTTP headers
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '10kb' })); // Body parser, limit payload size to prevent DOS
app.use(rateLimiter);

// 2. LOGGING MIDDLEWARE
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// 3. MOUNT ROUTES
// All generic routes are prefixed with /api/v1
app.use('/api/v1', apiRoutes);

// 4. UNHANDLED ROUTES
app.all('*', (req, res, next) => {
    res.status(404).json({
        status: 'fail',
        message: `Can't find ${req.originalUrl} on this server!`
    });
});

// 5. GLOBAL ERROR HANDLER
app.use(globalErrorHandler);

module.exports = app;
```

---

## 3. JWT Authentication System & RBAC

### `src/utils/jwt.js` (Token Generation)
```javascript
const jwt = require('jsonwebtoken');

exports.signToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN
    });
};
```

### `src/middlewares/authMiddleware.js` (Protection & Roles)
```javascript
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Middleware to protect routes (Authentication)
exports.protect = async (req, res, next) => {
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ status: 'fail', message: 'You are not logged in! Please log in to get access.' });
        }

        // 1. Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 2. (Optional but ideal) Check if user still exists in DB
        // const currentUser = await User.findById(decoded.id);
        // if (!currentUser) throw new Error('User no longer exists');

        req.user = decoded; // { id, role, iat, exp }
        next();
    } catch (err) {
        logger.error(`Auth Error: ${err.message}`);
        res.status(401).json({ status: 'fail', message: 'Invalid or expired token.' });
    }
};

// Middleware for RBAC (Authorization)
exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        // req.user was set by the `protect` middleware
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                status: 'fail', 
                message: 'You do not have permission to perform this action' 
            });
        }
        next();
    };
};
```

---

## 4. Generic API Example: Setup

### `src/routes/index.js` (Master Router)
```javascript
const express = require('express');
const authRoutes = require('./authRoutes');
const router = express.Router();

router.use('/auth', authRoutes);
// router.use('/users', userRoutes);
// router.use('/settings', settingsRoutes);

module.exports = router;
```

### `src/routes/authRoutes.js` (Route Definitions)
Notice how clean the routes are. There is ZERO logic here.

```javascript
const express = require('express');
const authController = require('../controllers/authController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);

// Example of a Protected & Restricted route
router.delete('/delete-account', protect, restrictTo('admin', 'super-admin'), authController.deleteAccount);

module.exports = router;
```

### `src/controllers/authController.js` (Logic-less Handlers)
Controllers should only take the input, pass it to the **Service** layer, and return the output.

```javascript
const authService = require('../services/authService');

exports.signup = async (req, res, next) => {
    try {
        const { email, password, fullName } = req.body;
        // The service handles DB interaction and business logic
        const { user, token } = await authService.createUser({ email, password, fullName });
        
        res.status(201).json({
            status: 'success',
            token,
            data: { user }
        });
    } catch (err) {
        next(err); // Passes error to the globalErrorHandler
    }
};
```

---

## 5. Global Error Handling Middleware

### `src/middlewares/errorHandler.js`
In Express, any middleware with 4 arguments `(err, req, res, next)` is automatically recognized as an Error Handler.

```javascript
const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    logger.error(`[${req.method} ${req.originalUrl}] ${err.message}`);

    if (process.env.NODE_ENV === 'development') {
        res.status(err.statusCode).json({
            status: err.status,
            error: err,
            message: err.message,
            stack: err.stack
        });
    } else {
        // Production: Don't leak error details to the client
        res.status(err.statusCode).json({
            status: err.status,
            message: err.isOperational ? err.message : 'Something went very wrong!'
        });
    }
};
```

---

## 6. Enterprise Architecture Explanation

### Why this design? (Separation of Concerns)
1. **Routes Layer (`routes/`)**: Acts as the *Traffic Cop*. It only cares about "What URL was hit, what HTTP method, and who should handle it?"
2. **Controller Layer (`controllers/`)**: Acts as the *Translator*. It extracts data from `req.body` or `req.query`, translates it for the Service layer, and translates the Service layer's response back into an HTTP response using `res.json()`.
3. **Service Layer (`services/`)**: Acts as the *Brain*. **This is the most important layer**. All business logic lives here. Because it takes raw JavaScript objects instead of Express `req` objects, you can easily test this code without mocking HTTP requests.
4. **Data Access Layer (`models/`)**: Dedicated to SQL queries or Prisma/Sequelize calls. Keeps SQL away from business logic.

### Why is this generic and future-proof?
- **Zero App-Specific Bloat:** There are no models for "Posts", "Products", or "Flights". It strictly contains the core infrastructure every app needs: Auth, RBAC, Logging, and Error Handling.
- **Microservice Ready:** Because the logic is decoupled via the Service layer, converting an Express monolith into multiple isolated microservices later reduces to simple refactoring. 
- **Graceful Error Catching:** By centralizing errors in `globalErrorHandler`, you guarantee that no request will ever "hang" indefinitely or crash the Node process ungracefully.
