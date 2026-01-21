import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Request, Response, NextFunction } from 'express';

export interface HasUserId {
  userId?: number;
  tenantId?: number;
  tenantRole?: string;
  auth0UserId?: string;
}

export interface AuthenticatedRequest extends Request {
  userId?: number;
  tenantId?: number;
  tenantRole?: string;
  auth0UserId?: string;
  user?: {
    id: number;
    username: string;
    email: string;
    role: string;
    status: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    twilioConfigured?: boolean;
  };
  session?: {
    userId?: number;
    auth0UserId?: string;
    user?: any;
  };
}

export function getUserIdFromRequest(request: FastifyRequest | AuthenticatedRequest | HasUserId): number {
  const req = request as any;
  
  if (req.userId) {
    return req.userId;
  }
  
  if (req.session?.userId) {
    return req.session.userId;
  }
  
  if (req.user?.id) {
    return req.user.id;
  }
  
  throw new Error('User not authenticated');
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    
    if (authReq.session?.userId) {
      authReq.userId = authReq.session.userId;
      return next();
    }
    
    if (authReq.userId) {
      return next();
    }
    
    res.status(401).json({ message: 'Not authenticated' });
  } catch (error) {
    res.status(401).json({ message: 'Authentication failed' });
  }
}
