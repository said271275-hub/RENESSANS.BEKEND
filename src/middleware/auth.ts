import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest, TokenPayload, UserRole } from '../types';
import { config } from '../config';

const JWT_SECRET = config.jwtSecret;

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Avtorizatsiyadan o\'tilmagan. Token topilmadi.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Yaroqsiz yoki muddati o\'tgan token.' });
    }
    req.user = decoded as TokenPayload;
    next();
  });
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Foydalanuvchi aniqlanmadi.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Ruxsat berilmadi. Ushbu amalni bajarish uchun sizda yetarli huquq yo\'q.' 
      });
    }

    next();
  };
};
