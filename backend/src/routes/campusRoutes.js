const express = require('express');
const router = express.Router();
const campusController = require('../controllers/campusController');

// GET /api/v1/campus/next-move
router.get('/next-move', campusController.nextMove);
// GET /api/v1/campus/upcoming-alert
router.get('/upcoming-alert', campusController.upcomingAlert);
// GET /api/v1/campus/timetable/live
router.get('/timetable/live', campusController.timetableLive);
// GET /api/v1/campus/dashboard-live
router.get('/dashboard-live', campusController.dashboardLive);

module.exports = router;
