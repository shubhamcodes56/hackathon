const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

function secureHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
}

function apiRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 180,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
  });
}

function processAndPurge() {
  return function processAndPurgeMiddleware(req, res, next) {
    if (req.body && typeof req.body === "object") {
      req.ephemeralSignal = { ...req.body };
    }

    res.on("finish", () => {
      if (req.ephemeralSignal) {
        Object.keys(req.ephemeralSignal).forEach((key) => {
          delete req.ephemeralSignal[key];
        });
      }
      if (req.body && typeof req.body === "object") {
        Object.keys(req.body).forEach((key) => {
          delete req.body[key];
        });
      }
    });

    next();
  };
}

function csrfProtection(options = {}) {
  const cookieName = options.cookieName || "digiguard_csrf";
  const headerName = (options.headerName || "x-csrf-token").toLowerCase();

  return function csrfMiddleware(req, res, next) {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      if (!req.cookies[cookieName]) {
        const token = crypto.randomBytes(24).toString("hex");
        res.cookie(cookieName, token, {
          httpOnly: false,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: 60 * 60 * 1000,
        });
      }
      return next();
    }

    const cookieToken = req.cookies[cookieName];
    const headerToken = req.headers[headerName];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return res.status(403).json({ error: "Invalid CSRF token" });
    }

    return next();
  };
}

module.exports = {
  secureHeaders,
  apiRateLimit,
  processAndPurge,
  csrfProtection,
};
