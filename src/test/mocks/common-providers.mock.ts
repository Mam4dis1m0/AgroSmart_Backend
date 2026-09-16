/**
 * Mocks compartidos para los servicios transversales que casi todos los
 * *.service.spec.ts necesitan mockear (CacheService, OfflineQueueService,
 * SyncService, MailService).
 *
 * Uso:
 *   import {
 *     mockCacheService,
 *     mockOfflineQueueService,
 *     mockSyncService,
 *     mockMailService,
 *   } from '../../../test/mocks/common-providers.mock';
 *
 * Ajusta la ruta relativa según la ubicación real de cada spec.
 */

// Nombres de métodos verificados contra src/common/cache.service.ts:
// get, set, delete, has
export const mockCacheService = {
  get: jest.fn().mockReturnValue(null),
  set: jest.fn(),
  delete: jest.fn(),
  has: jest.fn().mockReturnValue(false),
};

// Nombres verificados contra src/common/offline-queue.service.ts: add()
export const mockOfflineQueueService = {
  add: jest.fn(),
};

// Nombre verificado contra src/common/sync.service.ts: isOnline() es async
export const mockSyncService = {
  isOnline: jest.fn().mockResolvedValue(true),
};

// Métodos verificados contra src/mail/mail.service.ts
export const mockMailService = {
  enviarRecuperacionPassword: jest.fn(),
  notificarStockBajo: jest.fn(),
  notificarTareaCompletada: jest.fn(),
  notificarTareaAsignada: jest.fn(),
  notificarTareaCompletadaConEvidencia: jest.fn(),
  enviarSmsFallback: jest.fn(),
};

// Factory genérica para simular un Repository de TypeORM.
// Cada test puede sobreescribir los métodos que necesite con mockResolvedValue/mockReturnValue.
export const createMockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  findOneByOrFail: jest.fn(),
  findOneOrFail: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  remove: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getOne: jest.fn(),
  })),
});
