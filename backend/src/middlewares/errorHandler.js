const logger = require('../utils/logger');

// Global error handling middleware
module.exports = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Log the error centrally
    logger.error(`[${req.method} ${req.originalUrl}] ${err.message}`);

    if (process.env.NODE_ENV === 'development') {
        res.status(err.statusCode).json({
            status: err.status,
            error: err,
            message: err.message,
            stack: err.stack
        });
    } else {
        // Production: mask non-operational errors
        if (err.isOperational) {
            res.status(err.statusCode).json({
                status: err.status,
                message: err.message
            });
        } else {
            // Log full error internally
            console.error('ERROR 💥', err);
            res.status(500).json({
                status: 'error',
                message: 'Something went very wrong!'
            });
        }
    }
};
