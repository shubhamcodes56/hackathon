const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const globalErrorHandler = require('./middlewares/errorHandler');
const { globalLimiter } = require('./middlewares/rateLimiter');
const apiRoutes = require('./routes');

const app = express();
const frontendDir = path.join(__dirname, '../../frontend');

// Serve static files from the unified frontend folder
app.use(express.static(frontendDir, { extensions: ['html'] }));

// Dashboard/root now render the new frontend UI
app.get(['/', '/dashboard'], (req, res) => {
    res.sendFile(path.join(frontendDir, 'index.html'));
});

app.get(['/auth', '/login', '/signup'], (req, res) => {
    res.sendFile(path.join(frontendDir, 'auth.html'));
});

// Extra safety net for auth routes in case navigation lands here via a variant path.
app.use((req, res, next) => {
    if (req.method === 'GET' && (
        req.path === '/auth' || req.path === '/auth/' || req.path.startsWith('/auth/') ||
        req.path === '/login' || req.path === '/login/' ||
        req.path === '/signup' || req.path === '/signup/'
    )) {
        return res.sendFile(path.join(frontendDir, 'auth.html'));
    }
    next();
});

// Dedicated chat workspace route
app.get('/chat', (req, res) => {
    res.sendFile(path.join(frontendDir, 'chat.html'));
});

app.get('/reserve', (req, res) => {
    res.sendFile(path.join(frontendDir, 'reserve.html'));
});

// 1. GLOBAL SECURITY MIDDLEWARES
// Set security HTTP headers
app.use(helmet());

// Enable CORS for both localhost and 127.0.0.1 frontend origins.
const allowedOrigins = new Set([
    process.env.CLIENT_URL || 'http://localhost:30000',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://localhost:30000',
    'http://127.0.0.1:30000'
]);

app.use(cors({
    origin: (origin, callback) => {
        // Allow non-browser clients (no Origin header) and allowed browser origins.
        if (!origin || allowedOrigins.has(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
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
