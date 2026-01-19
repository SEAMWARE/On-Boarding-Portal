import { NextFunction, Response } from 'express';
import { oidcService } from '../service/openid.service';
import { AuthRequest } from '../type/auth-request';
import { AppError } from '../type/app-error';
import { logger } from '../service/logger';

const BEARER = 'Bearer ';

export function oidcAuthMiddleware() {
  return async function (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const auth = req.headers.authorization;

      if (!auth || !auth.startsWith(BEARER))
        return res.status(401).json({ error: 'Missing token' });

      const token = auth.slice(BEARER.length);
      req.user = await oidcService.validate(token);
      next();
    } catch (err) {
      if (err instanceof AppError) {
        return res.status(err.status).json({ error: err.message });
      } else {
        logger.error('OIDC validation error:', (err as any).toString());
        return res.status(401).json({ error: 'Invalid token' });
      }
    }
  };
}