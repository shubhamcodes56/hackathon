const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');

const router = express.Router();

// Base route for authentication /api/v1/auth
router.use('/auth', authRoutes);
router.use('/users', userRoutes);

// Add future routes here
// router.use('/products', productRoutes);

module.exports = router;
