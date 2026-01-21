import { FastifyRequest, FastifyReply } from 'fastify';
import { findTenantByApiKey, findTenantByDomain } from '../services/tenantService';
import { asyncLocalStorage } from '../prisma'; // Using prisma's async local storage

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: { id: string; status: string };
  }
}

export async function tenantIdentifier(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    const hostname = request.hostname;

    let tenant = null;

    // Strategy 1: Identify tenant by custom domain
    if (hostname.endsWith(process.env.APP_DOMAIN!)) {
        const subdomain = hostname.split('.')[0];
        if (subdomain !== 'www' && subdomain !== 'api') {
            tenant = await findTenantByDomain(subdomain);
        }
    }
    
    // Strategy 2: Identify tenant by API Key (must be present regardless)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized: Missing or invalid Authorization header' });
    }
    const apiKey = authHeader.substring(7);
    if (!apiKey) {
      return reply.status(401).send({ error: 'Unauthorized: API Key is missing' });
    }

    const tenantFromApiKey = await findTenantByApiKey(apiKey);

    // If both methods are used, they must resolve to the same tenant
    if (tenant && tenantFromApiKey && tenant.id !== tenantFromApiKey.id) {
        console.error(`[Security Alert] Tenant mismatch: Domain(${tenant.id}) vs API Key(${tenantFromApiKey.id})`);
        return reply.status(403).send({ error: 'Forbidden: Domain and API Key mismatch.' });
    }
    
    tenant = tenantFromApiKey || tenant;

    if (!tenant) {
      console.warn(`[Security Alert] Unidentified tenant access attempt from host: ${hostname}`);
      return reply.status(403).send({ error: 'Forbidden: Unidentified tenant' });
    }

    if (tenant.status !== 'active') {
      console.warn(`[Security Alert] Inactive tenant access attempt: ${tenant.id}`);
      return reply.status(403).send({ error: 'Forbidden: Inactive tenant' });
    }

    // Attach tenant to request for logging and context
    request.tenant = tenant;

    // Set tenantId in AsyncLocalStorage for downstream data isolation
    const store = asyncLocalStorage.getStore();
    if (store) {
      store.tenantId = tenant.id;
    }

  } catch (error) {
    request.log.error(error, 'Error during tenant identification');
    reply.status(500).send({ error: 'Internal Server Error' });
  }
}
