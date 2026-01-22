import { FastifyRequest, FastifyReply } from 'fastify';

export async function userContext(request: FastifyRequest, reply: FastifyReply, next: (err?: Error) => void) {
  // This middleware will be very simple for now
  // It will just attach a user object to the request
  // In a real application, you would fetch the user from the database
  // based on the authentication information
  if (request.user) {
    request.userContext = {
      userId: request.user.sub,
      tenantId: request.tenantId,
    };
  }

  next();
}
