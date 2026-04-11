const express = require('express');
const authController = require('../controllers/authController');
const { validateBody } = require('../middlewares/validateRequest');
const { authLimiter } = require('../middlewares/rateLimiter');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

const {
	signupSchema,
	loginSchema,
	socialAuthSchema,
	googleAccessSchema
} = require('../validators/authValidator');
// Public auth routes (Apply strong Zod validation before generating response)
router.post('/signup', validateBody(signupSchema), authController.signup);
router.post('/login', authLimiter, validateBody(loginSchema), authController.login);
router.post('/social', authLimiter, validateBody(socialAuthSchema), authController.socialAuth);
router.get('/providers', authController.providers);
router.post('/google-access', authLimiter, validateBody(googleAccessSchema), authController.googleAccessAuth);

// Protected routes (requires valid JWT)

// Example of a Protected Route
router.get('/profile', protect, authController.getProfile);

module.exports = router;
