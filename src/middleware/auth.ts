import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AuthenticatedRequest, AuthenticatedUser } from '../types/index.js';
import { queryOne } from '../db/index.js';

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  // Development bypass: allow testing with x-user-id or fallback to active user
  const devUserId = req.headers['x-user-id'] as string;
  if (config.nodeEnv === 'development' && devUserId) {
    const user = await queryOne<any>('SELECT user_id, mobile_number FROM users WHERE user_id = ?', [devUserId]);
    if (user) {
      req.user = user;
      return next();
    }
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (config.nodeEnv === 'development' && !authHeader) {
      const defaultUser = await queryOne<any>("SELECT user_id, mobile_number FROM users WHERE status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1");
      if (defaultUser) {
        req.user = defaultUser;
        return next();
      }
    }

    res.status(401).json({
      success: false,
      message: 'Authentication token required. Provide Bearer token in Authorization header.'
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.'
    });
  }
}
