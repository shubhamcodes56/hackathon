# 🔐 FAANG-Level Security Architecture for Node.js & PostgreSQL

This document provides a highly secure, modular, and reusable blueprint for defending a generic backend and database against internal and external threats, attacks, and vulnerabilities. This architecture works universally across any future backend project.

---

## 1. Complete Security Architecture

A fully secure backend relies on a **Defense-in-Depth** approach, meaning security is layered at the Network, Application, Database, and Monitoring levels.

### The "Onion" Security Model
1. **Network Layer:** WAF (Web Application Firewall), IP Blocklisting, and DDoS protection (e.g., via Cloudflare).
2. **Application (API) Layer:** HTTPS, Helmet (security headers), Rate Limiting, CORS, and Payload Validation (Zod/Joi).
3. **Authentication Layer:** Stateless JWT tokens, short-lived Access Tokens, HttpOnly Refresh Tokens, and Bcrypt hashing.
4. **Database Layer:** Row-Level Security (RLS), Parameterized Queries (to block SQLi), and encrypted rest-data for sensitive PII.

---

## 2. Middleware & Code Implementation Examples

### Application Security: Rate Limiting & DoS Prevention
Brute-force attacks must be stopped at the API gateway before they hit the database.

**`src/middlewares/rateLimiter.js`**
```javascript
const rateLimit = require('express-rate-limit');

// Generic API Rate Limiter
exports.globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again in 15 minutes!',
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter Auth Rate Limiter
exports.authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 failed login attempts per hour per IP
    message: 'Too many login attempts, please try again after an hour!'
});
```

### Application Security: Payload Sanitization & XSS
Never trust client data. All `req.body` must be validated by a schema.

**Payload Validation (using Zod):**
```javascript
const { z } = require('zod');

// Ensure 'email' is actually an email, and prevent injection strings
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/, 'Must contain uppercase').regex(/[0-9]/, 'Must contain number'),
  fullName: z.string().min(2).max(50).trim()
});

exports.validateBody = (schema) => (req, res, next) => {
    try {
        req.body = schema.parse(req.body); // Parses and strips unknown fields
        next();
    } catch (err) {
        res.status(400).json({ status: 'fail', errors: err.errors });
    }
};
```

### Authentication Security: JWT Best Practices
- **Never** store JWT tokens in `localStorage`. They are vulnerable to Cross-Site Scripting (XSS).
- **Access Tokens:** Short expiration (e.g., 15 minutes), sent in standard Authorization headers.
- **Refresh Tokens:** Long expiration (e.g., 7 days), securely stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies.

```javascript
// Securely sending a Refresh Token in an HttpOnly cookie
res.cookie('jwt_refresh', refreshToken, {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    httpOnly: true, // CANNOT be read by client-side Javascript (prevents XSS)
    secure: process.env.NODE_ENV === 'production', // MUST be true in prod (forces HTTPS)
    sameSite: 'strict' // Prevents CSRF attacks
});
```

---

## 3. Best Practices Checklist

### ✔️ Network & API Checklist
- [ ] Are we using `helmet()` in Express to block clickjacking and MIME sniffing?
- [ ] Is CORS strictly allowing only authorized frontend domains, and dropping `*` origins?
- [ ] Are we returning generic error generic messages in production (no stack traces or SQL errors)?
- [ ] Is payload size limited (`app.use(express.json({ limit: '10kb' }))`) to prevent memory exhaustion DoS attacks?

### ✔️ Database Security Checklist
- [ ] Are we using Parameterized queries or an ORM (like Prisma) for **every single** database call to prevent SQL Injection?
- [ ] Does the application's database user have the principle of **least privilege**? (e.g., the web server DB user cannot `DROP TABLE`).
- [ ] Are we utilizing Postgres `UUID` (v4) for primary keys instead of predictable sequential IDs (like `id: 1, 2, 3`)?
- [ ] Are extremely sensitive fields (like SSNs, API tokens) encrypted at the application level *before* inserting them into PostgreSQL using libraries like `crypto`?

### ✔️ Authentication Security Checklist
- [ ] Are passwords hashed using `bcrypt` (with a minimum salt factor of 12)?
- [ ] Are roles decoupled from the user table (RBAC implementation)?
- [ ] Is there an absolute token invalidation mechanism for logging out across all devices (Token Blacklist or modifying a `passwordChangedAt` timestamp in the database)?

---

## 4. Common Vulnerabilities and Fixes

| Vulnerability | How Attackers Exploit It | The Mitigation / Fix |
| :--- | :--- | :--- |
| **SQL Injection (SQLi)** | Writing `' OR 1=1 --` into a login field to bypass the password check. | **Fix:** Never concatenate SQL strings. Instead, use Parameterized queries (`pool.query('SELECT * FROM users WHERE email = $1', [email])`). |
| **Cross-Site Scripting (XSS)** | Injecting `<script>stealCookie()</script>` into a comment box. | **Fix:** Encode output on the frontend (React does this automatically). Never store Access JWTs in LocalStorage. |
| **Cross-Site Request Forgery (CSRF)** | Tricking a logged-in user into clicking a malicious link that forces a hidden state-changing request. | **Fix:** Use `SameSite: strict` on auth cookies, and implement Anti-CSRF tokens if sessions are used. |
| **Broken Access Control (IDOR)** | Updating `?user_id=5` to `?user_id=6` in the URL to view another user's private data. | **Fix:** Always enforce RBAC. The DB query must check if `user_id` matches `req.user.id` or if `req.user.role === 'admin'`. |

---

## 5. Monitoring & Logging: Real-World Implementation

A secure system assumes it *will* be attacked. The goal is to catch it early.

1. **Structured Auditing (`morgan` & Winston/Pino):**
   - Store all structured logs in JSON format via a logger like `Winston`. Ensure passwords and credit cards are scrubbed explicitly from logs.
2. **The "Honeypot" Endpoint:**
   - Create fake endpoints (e.g., `/api/v1/admin/debug`) that legitimate users naturally ignore. If anyone ever requests this endpoint, instantly permanently IP-ban them via AWS WAF or Cloudflare. They are actively crawling you for vulnerabilities.
3. **Alerting System:**
   - Integrate with tools like Datadog or Sentry. Trigger instant Slack/Email alerts if the API generates more than 50 `HTTP 500` errors in a single minute, or a single IP hits 50 `HTTP 401 Unauthorized` requests (signaling a credential stuffing attack).
