/**
 * Fastify Type Augmentation
 * Extends Fastify's request types to include authentication properties
 */

import 'fastify';
import '@fastify/jwt';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: number;
    auth0UserId?: string;
  }
  
  interface Session {
    userId?: number;
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
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub?: string;
      userId?: number;
      [key: string]: any;
    };
    user: {
      sub?: string;
      userId?: number;
      [key: string]: any;
    };
  }
}
