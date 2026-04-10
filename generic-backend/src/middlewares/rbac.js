const db = require('../config/db');

// permit(action, resource) -> checks if any of the user's roles grant the permission
exports.permit = (action, resource) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
      }

      const userId = req.user.id;

      const q = `
        SELECT p.* FROM permissions p
        JOIN role_permissions rp ON rp.permission_id = p.id
        JOIN user_roles ur ON ur.role_id = rp.role_id
        WHERE ur.user_id = $1 AND p.action = $2 AND p.resource = $3
        LIMIT 1
      `;

      const result = await db.query(q, [userId, action, resource]);

      if (result.rowCount === 0) {
        return res.status(403).json({ status: 'fail', message: 'Forbidden: insufficient permissions' });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

// helper: requireRole(roleName)
exports.requireRole = (roleName) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
      const q = `SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = (SELECT id FROM roles WHERE name = $2 LIMIT 1) LIMIT 1`;
      const r = await db.query(q, [req.user.id, roleName]);
      if (r.rowCount === 0) return res.status(403).json({ status: 'fail', message: 'Forbidden: role required' });
      next();
    } catch (err) {
      next(err);
    }
  };
};
