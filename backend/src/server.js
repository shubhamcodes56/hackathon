require('dotenv').config();
const app = require('./app');
const logger = require('./utils/logger');

// Catch synchronous exceptions (e.g. typos, reference errors) that aren't caught by Express
process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    logger.error(`${err.name}: ${err.message}`);
    process.exit(1);
});

const PORT = process.env.PORT || 5000;

// Start Server
const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Catch asynchronous unhandled promise rejections (e.g. Database connection failures)
process.on('unhandledRejection', (err) => {
    logger.error('UNHANDLED REJECTION! 💥 Shutting down gracefully...');
    logger.error(`${err.name}: ${err.message}`);
    // Close the server to finish existing requests, then exit the process
    server.close(() => {
        process.exit(1);
    });
});
