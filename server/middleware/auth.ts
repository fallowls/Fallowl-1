import { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../utils/errors";
import { storage } from "../storage";

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // Fallback to session for now to avoid breaking existing UI if it hasn't switched to JWT
      if ((request as any).session?.userId) {
        const userId = (request as any).session.userId;
        const user = await storage.getUser(userId);
        if (user) {
          (request as any).userId = user.id;
          const membership = await storage.ensureDefaultTenant(user.id);
          (request as any).tenantId = membership.tenantId;
          return;
        }
      }
      throw new UnauthorizedError("No token provided");
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };

    const user = await storage.getUser(decoded.userId);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    (request as any).userId = user.id;
    const membership = await storage.ensureDefaultTenant(user.id);
    (request as any).tenantId = membership.tenantId;
  } catch (error) {
    throw new UnauthorizedError("Invalid or expired token");
  }
}
