const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const geminiRoutes = require('./geminiRoutes');

const router = express.Router();

// Base route for authentication /api/v1/auth
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/gemini', geminiRoutes);
const apiKeyRoutes = require('./apiKeyRoutes');
// LLM helpers: save key, list models, chat proxy
router.use('/llm', apiKeyRoutes);
const assistantRoutes = require('./assistantRoutes');
router.use('/assistant', assistantRoutes);

// Add future routes here
// router.use('/products', productRoutes);

module.exports = router;
