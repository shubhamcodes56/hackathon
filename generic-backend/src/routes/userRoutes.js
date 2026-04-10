const express = require('express');
const userController = require('../controllers/userController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

const router = express.Router();

// For demonstration, we'll keep these public so the user can see data easily
// In a real app, you would use: router.use(protect);
router.get('/', userController.getAllUsers);
router.get('/stats', userController.getUserStats);

module.exports = router;
