import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

// AsyncLocalStorage for holding the tenant context
const asyncLocalStorage = new AsyncLocalStorage<{ tenantId: string }>();

const prisma = new PrismaClient();

// Prisma middleware to enforce tenant isolation
prisma.$use(async (params, next) => {
  const { model, action, args } = params;

  // Define models that are tenant-specific and require isolation
  const tenantModels = ['Product', 'Invoice', 'User', 'Contact']; // Add any other tenant-specific models here

  // Get the tenant context from AsyncLocalStorage
  const store = asyncLocalStorage.getStore();
  const tenantId = store?.tenantId;

  if (tenantId && tenantModels.includes(model as string)) {
    // Intercept read/find queries
    if (['findUnique', 'findFirst', 'findMany'].includes(action)) {
      if (args.where) {
        args.where.tenantId = tenantId;
      } else {
        args.where = { tenantId };
      }
    }

    // Intercept write/create queries
    if (action === 'create') {
      if (args.data) {
        args.data.tenantId = tenantId;
      } else {
        args.data = { tenantId };
      }
    }
    
    // Intercept update/delete queries
    if (['update', 'updateMany', 'delete', 'deleteMany'].includes(action)) {
       if (args.where) {
        args.where.tenantId = tenantId;
      } else {
        args.where = { tenantId };
      }
    }
  }

  return next(params);
});

export { prisma, asyncLocalStorage };
