import { FastifyRequest, FastifyReply } from 'fastify';

export async function userContext(request: FastifyRequest, reply: FastifyReply) {
  // This middleware will be very simple for now
  // It will just attach a user object to the request
  // In a real application, you would fetch the user from the database
  // based on the authentication information
  if ((request as any).user) {
    (request as any).userContext = {
      userId: (request as any).user.sub,
      tenantId: request.tenantId,
    };
  }
}
