import { ForbiddenException } from '@nestjs/common';
import { BaseOfflineService } from './base-offline.service';
import { TenantContext, AuthUser } from '../auth/tenant-context';
import {
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService,
  createMockRepository,
  conSesion,
  sesionAdmin,
  sesionEmpleado,
} from '../test/mocks/common-providers.mock';

// Servicio mínimo que usa la clase base igual que los módulos reales (cultivos, insumos...)
class ServicioDePrueba extends BaseOfflineService<any> {
  constructor(repo: any) {
    super(repo, mockCacheService as any, mockOfflineQueueService as any, mockSyncService as any, 'cultivo', 'idcultivo');
  }
  listar() {
    return this.findAllOffline(() => this.repo.find({ where: this.where() } as any));
  }
  crear(dto: any) {
    return this.createOffline(dto, () => this.repo.save(this.repo.create(this.withFinca(dto))));
  }
  actualizarOffline(id: number, dto: any) {
    return this.updateOffline(id, dto, async () => dto);
  }
  clave() {
    return this.cacheKeyAll();
  }
  async borrar(id: number) {
    return this.deleteEnFinca(id);
  }
}

describe('Aislamiento multi-tenant en BaseOfflineService', () => {
  const repo = createMockRepository();
  const svc = new ServicioDePrueba(repo);
  const finca2: AuthUser = { ...sesionAdmin, idfinca: 2 };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSyncService.isOnline.mockResolvedValue(true);
  });

  describe('caché por finca', () => {
    it('cada finca tiene su propia clave de caché (jamás se sirve a otra)', async () => {
      const a = await conSesion(sesionAdmin, async () => svc.clave());
      const b = await conSesion(finca2, async () => svc.clave());
      expect(a).not.toBe(b);
      expect(a).toBe('cultivo_f1_all');
      expect(b).toBe('cultivo_f2_all');
    });

    it('un empleado no comparte caché con el administrador (sus listas vienen filtradas)', async () => {
      const admin = await conSesion(sesionAdmin, async () => svc.clave());
      const emp = await conSesion(sesionEmpleado, async () => svc.clave());
      expect(emp).not.toBe(admin);
    });

    it('un comprador (sin finca) se aísla por usuario', async () => {
      const c1 = await conSesion({ idusuario: 50, email: 'a', rol: 'comprador', idfinca: null }, async () => svc.clave());
      const c2 = await conSesion({ idusuario: 51, email: 'b', rol: 'comprador', idfinca: null }, async () => svc.clave());
      expect(c1).not.toBe(c2);
    });
  });

  describe('lecturas y escrituras', () => {
    it('toda consulta se filtra por la finca activa', async () => {
      repo.find.mockResolvedValue([]);
      await conSesion(finca2, () => svc.listar());
      expect(repo.find).toHaveBeenCalledWith({ where: { idfinca: 2 } });
    });

    it('al crear, la finca sale de la sesión: ignora el idfinca que mande el cliente', async () => {
      repo.create.mockImplementation((x) => x);
      repo.save.mockImplementation((x) => Promise.resolve(x));

      await conSesion(sesionAdmin, () => svc.crear({ nombrelote: 'Lote A', idfinca: 999 }));

      expect(repo.create).toHaveBeenCalledWith({ nombrelote: 'Lote A', idfinca: 1 });
    });

    it('sin finca activa no se consulta nada: 403 (nunca "sin filtro")', async () => {
      await expect(
        conSesion({ ...sesionAdmin, idfinca: null }, () => svc.listar()),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('borrar solo afecta a registros de la finca activa y responde 404 si es de otra', async () => {
      repo.delete.mockResolvedValue({ affected: 0 });
      await expect(conSesion(sesionAdmin, () => svc.borrar(77))).rejects.toThrow(/no existe en esta finca/);
      expect(repo.delete).toHaveBeenCalledWith({ idcultivo: 77, idfinca: 1 });
    });

    it('borrar algo con dependencias responde 409 en vez de un error 500 (RNF-06)', async () => {
      repo.delete.mockRejectedValue({ code: '23503' });
      await expect(conSesion(sesionAdmin, () => svc.borrar(5))).rejects.toThrow(/registros asociados/);
    });
  });

  describe('modo offline', () => {
    beforeEach(() => mockSyncService.isOnline.mockResolvedValue(false));

    it('lo creado offline viaja a la cola con la finca de la sesión (no la del cliente)', async () => {
      await conSesion(sesionAdmin, () => svc.crear({ nombrelote: 'Lote B', idfinca: 999 }));

      expect(mockOfflineQueueService.add).toHaveBeenCalledWith(
        'cultivo',
        'CREATE',
        expect.objectContaining({ nombrelote: 'Lote B', idfinca: 1 }),
      );
    });

    it('un UPDATE offline lleva la finca para que SyncService no pise filas de otra finca', async () => {
      await conSesion(sesionAdmin, () => svc.actualizarOffline(5, { nombrelote: 'X', idfinca: 999 }));

      const [, , payload] = mockOfflineQueueService.add.mock.calls[0];
      expect(payload).toEqual({ idcultivo: 5, nombrelote: 'X', idfinca: 1 });
    });
  });

  it('TenantContext rechaza usar el contexto fuera de una petición', () => {
    expect(() => TenantContext.requireFinca()).toThrow(ForbiddenException);
  });
});
