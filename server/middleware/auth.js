import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

export function createRequireAuth({ verifyToken = jwt.verify, findActiveUser }) {
  return async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Autenticación requerida.' });

    let payload;
    try {
      payload = verifyToken(token, process.env.JWT_SECRET, { issuer: 'gabot-cloud-ftth' });
    } catch {
      return res.status(401).json({ error: 'Sesión inválida o vencida.' });
    }

    try {
      const user = await findActiveUser(payload.sub, payload.tenantId);
      if (!user) return res.status(401).json({ error: 'Usuario no disponible o desactivado.' });
      req.user = { id: user.id, tenantId: user.tenantId, role: user.role };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export const requireAuth = createRequireAuth({
  findActiveUser: (id, tenantId) => prisma.user.findFirst({
    where: { id, tenantId, active: true },
    select: { id: true, tenantId: true, role: true },
  }),
});

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permisos para esta operación.' });
    }
    next();
  };
}
