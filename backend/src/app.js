const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const globalErrorHandler = require('./middlewares/errorHandler');
const { globalLimiter } = require('./middlewares/rateLimiter');
const apiRoutes = require('./routes');

const app = express();

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, '../public')));

// DASHBOARD ROUTE (User-friendly view)
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// 1. GLOBAL SECURITY MIDDLEWARES
// Set security HTTP headers
app.use(helmet());

// Enable CORS (Note: wildcard '*' cannot be used with credentials: true)
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
}));

// Limit request payload size
app.use(express.json({ limit: '10kb' }));

// Apply Rate Limiting to all API routes
app.use('/api', globalLimiter);

// 2. LOGGING MIDDLEWARE
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// 3. MOUNT CORE ROUTES
app.use('/api/v1', apiRoutes);

// 4. UNDEFINED ROUTES HANDLER (Middleware catch-all)
app.use((req, res, next) => {
    const err = new Error(`Can't find ${req.originalUrl} on this server!`);
    err.status = 'fail';
    err.statusCode = 404;
    next(err);
});

// 5. GLOBAL ERROR HANDLER
app.use(globalErrorHandler);

module.exports = app;
