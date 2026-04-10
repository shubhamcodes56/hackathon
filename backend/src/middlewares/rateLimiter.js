const rateLimit = require('express-rate-limit');

exports.globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per window
    message: { status: 'fail', message: 'Too many requests from this IP, please try again in 15 minutes!' },
    standardHeaders: true,
    legacyHeaders: false,
});

exports.authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // max 10 failed login attempts per hour per IP
    message: { status: 'fail', message: 'Too many login attempts, please try again after an hour!' }
});
