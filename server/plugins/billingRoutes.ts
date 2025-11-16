import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { insertSubscriptionPlanSchema, insertInvoiceSchema } from '@shared/schema';
import { rateLimitConfigs } from './rateLimiters';

/**
 * Billing Routes Plugin for Fastify (Subscription Plans & Invoices)
 * Migrated from Express routes
 */
export default async function billingRoutes(fastify: FastifyInstance) {
  // GET /subscription-plans - Get all subscription plans
  fastify.get('/subscription-plans', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const plans = await storage.getAllSubscriptionPlans();
      return reply.send(plans);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /subscription-plans - Create new subscription plan
  fastify.post('/subscription-plans', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const planData = insertSubscriptionPlanSchema.parse(request.body);
      const plan = await storage.createSubscriptionPlan(planData);
      return reply.send(plan);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // PUT /subscription-plans/:id - Update subscription plan
  fastify.put('/subscription-plans/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const planId = parseInt(id);
      const planData = insertSubscriptionPlanSchema.partial().parse(request.body);
      const plan = await storage.updateSubscriptionPlan(planId, planData);
      return reply.send(plan);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // GET /invoices - Get all invoices
  fastify.get('/invoices', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const invoices = await storage.getAllInvoices();
      return reply.send(invoices);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /invoices - Create new invoice
  fastify.post('/invoices', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const invoiceData = insertInvoiceSchema.parse(request.body);
      const invoice = await storage.createInvoice(invoiceData);
      return reply.send(invoice);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });
}
