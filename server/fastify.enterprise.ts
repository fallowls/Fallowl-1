import fastify from 'fastify';
import { tenantIdentifier } from './middleware/tenantIdentifier';
import { asyncLocalStorage } from './prisma';
import { getProductsForTenant } from './enterprise';
import authRoutes from './auth/auth.routes';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Augment the FastifyRequest interface to include our custom property
declare module 'fastify' {
  interface FastifyRequest {
    tenant?: { id: string; status: string };
  }
}

export const app = fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Register authentication routes
app.register(authRoutes, { prefix: '/api/auth' });

// Setup AsyncLocalStorage for each request
app.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done) => {
  asyncLocalStorage.run({ tenantId: null }, () => {
    done();
  });
});

// Register the tenantIdentifier middleware for tenant-specific routes
app.addHook('preHandler', tenantIdentifier);

// Example of a protected route using the enterprise service
app.get('/api/products', async (request: FastifyRequest, reply: FastifyReply) => {
  if (request.tenant) {
    try {
        const products = await getProductsForTenant(request.tenant.id);
        reply.send(products);
    } catch (error) {
        request.log.error(error, 'Failed to retrieve products for tenant');
        reply.status(500).send({ error: 'Internal Server Error' });
    }
  } else {
    reply.status(403).send({ error: 'Forbidden: No tenant context available.' });
  }
});


const start = async () => {
  try {
    await app.listen({ port: 3000 });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}
