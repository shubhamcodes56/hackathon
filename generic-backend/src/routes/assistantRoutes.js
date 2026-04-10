const express = require('express');
const router = express.Router();
const assistant = require('../controllers/assistantController');

// POST /api/v1/assistant/query
router.post('/query', assistant.query);

module.exports = router;
