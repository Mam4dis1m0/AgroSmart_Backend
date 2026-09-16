import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsuariosService } from './usuarios.service';
import { Usuario } from '../../Entidades/entities/Usuario';
import { Administrador } from '../../Entidades/entities/Administrador';
import { Empleado } from '../../Entidades/entities/Empleado';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { MailService } from '../../mail/mail.service';
import {
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService, mockMailService,
  createMockRepository,
} from '../../test/mocks/common-providers.mock';

// bcrypt.compare hace un cálculo criptográfico real y lento (diseñado así a
// propósito). En una prueba unitaria no queremos probar bcrypt — eso ya lo
// prueba su propia librería — sino la LÓGICA de nuestro método. Por eso se
// mockea: así controlamos si la contraseña es "válida" o no para cada caso.
jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('UsuariosService', () => {
  let service: UsuariosService;
  const mockUsuarioRepository = createMockRepository();
  const mockAdministradorRepository = createMockRepository();
  const mockEmpleadoRepository = createMockRepository();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: getRepositoryToken(Usuario), useValue: mockUsuarioRepository },
        { provide: getRepositoryToken(Administrador), useValue: mockAdministradorRepository },
        { provide: getRepositoryToken(Empleado), useValue: mockEmpleadoRepository },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MÉTODO REPRESENTATIVO #1: login()
  // Se eligió porque combina: modo online/offline, verificación de
  // contraseña, distinción de rol (admin/empleado) y actualización de caché.
  // ─────────────────────────────────────────────────────────────────────────
  describe('login()', () => {
    const usuarioMock = {
      idusuario: 1,
      email: 'admin@agrosmart.com',
      contrasena: 'hash_guardado',
      primernombre: 'Carlos',
      primerapellido: 'Gómez',
      fotoperfil: null,
    };

    it('debe autenticar correctamente en modo online y marcar el rol admin', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      mockUsuarioRepository.findOneBy.mockResolvedValue(usuarioMock);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockAdministradorRepository.findOneBy.mockResolvedValue({ idusuario: 1 }); // es admin

      const result = await service.login('admin@agrosmart.com', 'clave123');

      expect(result.usuario.role).toBe('admin');
      expect(result.usuario.email).toBe('admin@agrosmart.com');
      // Debe cachear el login para poder usarlo luego en modo offline
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'usuario_login_admin@agrosmart.com',
        expect.objectContaining({ role: 'admin' }),
      );
    });

    it('debe marcar el rol empleado cuando el usuario NO está en AdministradorRepository', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      mockUsuarioRepository.findOneBy.mockResolvedValue(usuarioMock);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockAdministradorRepository.findOneBy.mockResolvedValue(null); // no es admin

      const result = await service.login('admin@agrosmart.com', 'clave123');

      expect(result.usuario.role).toBe('empleado');
    });

    it('debe rechazar con UnauthorizedException si el usuario no existe (online)', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      mockUsuarioRepository.findOneBy.mockResolvedValue(null);

      await expect(service.login('nadie@x.com', 'clave123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debe rechazar con UnauthorizedException si la contraseña es incorrecta', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      mockUsuarioRepository.findOneBy.mockResolvedValue(usuarioMock);
      mockedBcrypt.compare.mockResolvedValue(false as never); // contraseña no coincide

      await expect(
        service.login('admin@agrosmart.com', 'claveMala'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe autenticar en modo OFFLINE usando el caché si la contraseña coincide', async () => {
      mockSyncService.isOnline.mockResolvedValue(false);
      mockCacheService.get.mockReturnValue({
        idusuario: 1,
        primernombre: 'Carlos',
        email: 'admin@agrosmart.com',
        role: 'admin',
        contrasena: 'hash_guardado',
        fotoperfil: null,
      });
      mockedBcrypt.compare.mockResolvedValue(true as never);

      const result = await service.login('admin@agrosmart.com', 'clave123');

      expect(result._offline).toBe(true);
      expect(result.usuario.role).toBe('admin');
      // En modo offline NO debe tocar la base de datos
      expect(mockUsuarioRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('debe rechazar en modo OFFLINE si no hay sesión previa cacheada en este dispositivo', async () => {
      mockSyncService.isOnline.mockResolvedValue(false);
      mockCacheService.get.mockReturnValue(null);

      await expect(
        service.login('nuevo@x.com', 'clave123'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
