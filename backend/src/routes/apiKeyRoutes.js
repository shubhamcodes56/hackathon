const express = require('express');
const router = express.Router();
const apiKeyController = require('../controllers/apiKeyController');
const chatController = require('../controllers/chatController');

// Save API key (server-side storage)
router.post('/save-key', apiKeyController.saveKey);
router.post('/clear-key', apiKeyController.clearKey);
router.get('/has-key', apiKeyController.hasKey);
// Get available models from upstream (requires saved key)
router.get('/models', apiKeyController.getModels);

// Chat proxy (server forwards request using saved key)
router.post('/chat', chatController.chat);

module.exports = router;
