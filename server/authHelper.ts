import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

export interface AuthenticatedRequest extends Request {
  userId?: number;
  tenantId?: number;
  auth?: any;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // If we have a session userId, we use that (local login)
    if (req.session && (req.session as any).userId) {
      req.userId = (req.session as any).userId;
      
      const membership = await storage.ensureDefaultTenant(req.userId!);
      if (membership) {
        req.tenantId = membership.tenantId;
      }
      return next();
    }

    const auth = req.auth;
    
    if (!auth || !auth.sub) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const auth0UserId = auth.sub;
    const email = auth['https://app.com/email'] || auth.email || '';
    let username = auth['https://app.com/name'] || auth.name || auth.nickname || '';
    
    if (!username || username.trim() === '') {
      if (email) {
        username = email.split('@')[0];
      } else {
        username = `user_${auth0UserId.split('|')[1] || auth0UserId}`;
      }
    }

    let user = await storage.getUserByAuth0Id(auth0UserId);
    
    if (!user) {
      const firstName = auth.given_name || username;
      const lastName = auth.family_name || '';
      
      try {
        user = await storage.createUser({
          auth0Id: auth0UserId,
          email,
          username,
          firstName,
          lastName,
          password: '',
          role: auth['https://app.com/roles']?.[0] || 'user'
        });
      } catch (createError: any) {
        if (createError.code === '23505' && createError.constraint === 'users_auth0_id_unique') {
          user = await storage.getUserByAuth0Id(auth0UserId);
        } else {
          throw createError;
        }
      }
    }

    if (!user) {
      return res.status(500).json({ message: "Failed to create or retrieve user" });
    }

    req.userId = user.id;
    
    // Get tenant ID for multi-tenancy
    const membership = await storage.ensureDefaultTenant(user.id);
    if (membership) {
      req.tenantId = membership.tenantId;
    }

    next();
  } catch (error: any) {
    console.error('Auth helper error:', error);
    return res.status(500).json({ message: "Authentication error" });
  }
}

/**
 * Structural interface for any request with userId
 * Works with both Express AuthenticatedRequest and Fastify FastifyRequest
 */
export interface HasUserId {
  userId?: number;
}

export function getUserIdFromRequest(req: HasUserId): number {
  if (!req.userId) {
    throw new Error("User ID not found. Ensure requireAuth middleware is applied.");
  }
  return req.userId;
}
