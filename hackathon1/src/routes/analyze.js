const express = require("express");
const { analyzeSignal } = require("../onionEngine");

const router = express.Router();

router.get("/csrf-token", (req, res) => {
  const token = req.cookies[process.env.CSRF_COOKIE_NAME || "digiguard_csrf"] || null;
  res.json({ csrfToken: token });
});

router.post("/analyze/signal", async (req, res) => {
  const result = await analyzeSignal(req.ephemeralSignal || req.body || {});
  res.json(result);
});

router.post("/analyze", async (req, res) => {
  const result = await analyzeSignal(req.ephemeralSignal || req.body || {});
  res.json(result);
});

router.post("/intercept", async (req, res) => {
  const payload = req.ephemeralSignal || req.body || {};
  const result = await analyzeSignal(payload);
  const block = result.strikeRed || result.totalScore >= 80;

  res.json({
    block,
    result,
  });
});

module.exports = router;
