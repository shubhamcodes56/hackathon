const express = require('express');
const { z } = require('zod');
const authController = require('../controllers/authController');
const { validateBody } = require('../middlewares/validateRequest');
const { authLimiter } = require('../middlewares/rateLimiter');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

const { signupSchema, loginSchema } = require('../validators/authValidator');
// Public auth routes (Apply strong Zod validation before generating response)
router.post('/signup', validateBody(signupSchema), authController.signup);
router.post('/login', authLimiter, validateBody(loginSchema), authController.login);

// Protected routes (requires valid JWT)

// Example of a Protected Route
router.get('/profile', protect, authController.getProfile);

module.exports = router;
