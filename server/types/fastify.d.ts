import { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    db?: any;
    userContext?: {
      userId: string;
      tenantId: string;
    };
  }
}
