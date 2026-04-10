const express = require('express');
const { handleGemini } = require('../controllers/geminiController');

const router = express.Router();

// POST /api/v1/gemini
router.post('/', express.json(), handleGemini);

module.exports = router;
