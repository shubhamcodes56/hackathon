const rateLimit = require('express-rate-limit');

// Global limiter — generous for a live campus app with frequent polling
exports.globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000, // 2000 requests per 15-min window (dashboard + AI queries)
    message: { status: 'fail', message: 'Too many requests from this IP, please try again in 15 minutes!' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.originalUrl.includes('/campus') || req.originalUrl.includes('/assistant'),
});

// Stricter limiter only for auth routes
exports.authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // max 20 login attempts per hour
    message: { status: 'fail', message: 'Too many login attempts, please try again after an hour!' }
});
