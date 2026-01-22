import { FastifyRequest, FastifyReply } from 'fastify';

export async function tenantIdentifier(request: FastifyRequest, reply: FastifyReply) {
  // Identify tenant from subdomain or header
  const host = request.hostname || '';
  const subdomain = host.split('.')[0];
  
  if (subdomain && subdomain !== 'localhost' && subdomain !== 'www' && subdomain !== 'dialpax') {
    request.tenantId = subdomain;
  } else {
    request.tenantId = 'public';
  }
}
