const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

exports.protect = async (req, res, next) => {
    try {
        let token;
        // Check standard Authorization header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                status: 'fail',
                message: 'You are not logged in! Please log in to get access.'
            });
        }

        // Verify token cryptographically
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Pass decoded payload (e.g., id, role) to the next middleware
        req.user = decoded;
        next();
    } catch (err) {
        logger.warn(`Failed Auth attempt: ${err.message}`);
        return res.status(401).json({
            status: 'fail',
            message: 'Invalid or expired token. Please log in again.'
        });
    }
};

exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                status: 'fail',
                message: 'You do not have permission to perform this action'
            });
        }
        next();
    };
};
