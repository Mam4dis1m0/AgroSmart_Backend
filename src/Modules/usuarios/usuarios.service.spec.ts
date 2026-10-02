import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsuariosService } from './usuarios.service';
import { Usuario } from '../../Entidades/entities/Usuario';
import { Administrador } from '../../Entidades/entities/Administrador';
import { Empleado } from '../../Entidades/entities/Empleado';
import { CompradorPerfil } from '../../Entidades/entities/CompradorPerfil';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { MailService } from '../../mail/mail.service';
import { TokenService } from '../../auth/token.service';
import { SesionService } from '../../auth/sesion.service';
import { FincasService } from '../fincas/fincas.service';
import { DataSource } from 'typeorm';
import {
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService, mockMailService,
  mockTokenService, mockFincasService, mockSesionService, mockDataSource,
  createMockRepository,
} from '../../test/mocks/common-providers.mock';

// bcrypt.compare hace un cálculo criptográfico real y lento (diseñado así a
// propósito). En una prueba unitaria no queremos probar bcrypt — eso ya lo
// prueba su propia librería — sino la LÓGICA de nuestro método. Por eso se
// mockea: así controlamos si la contraseña es "válida" o no para cada caso.
jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

const fincaAdmin = { idfinca: 1, nombre: 'Finca A', ubicacion: null, tipoproduccion: null, rol: 'admin', plan: 'FREEMIUM' };
const fincaEmpleado = { ...fincaAdmin, rol: 'empleado' };
const otraFinca = { ...fincaAdmin, idfinca: 2, nombre: 'Finca B' };

describe('UsuariosService', () => {
  let service: UsuariosService;
  const mockUsuarioRepository = createMockRepository();
  const mockAdministradorRepository = createMockRepository();
  const mockEmpleadoRepository = createMockRepository();
  const mockCompradorRepository = createMockRepository();

  // login() lee el usuario CON hash (la columna contrasena es select:false) vía QueryBuilder
  const usuarioConHash = (usuario: unknown) => {
    const qb = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(usuario),
    };
    mockUsuarioRepository.createQueryBuilder.mockReturnValue(qb as any);
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: getRepositoryToken(Usuario), useValue: mockUsuarioRepository },
        { provide: getRepositoryToken(Administrador), useValue: mockAdministradorRepository },
        { provide: getRepositoryToken(Empleado), useValue: mockEmpleadoRepository },
        { provide: getRepositoryToken(CompradorPerfil), useValue: mockCompradorRepository },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
        { provide: MailService, useValue: mockMailService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: FincasService, useValue: mockFincasService },
        { provide: SesionService, useValue: mockSesionService },
        { provide: DataSource, useValue: mockDataSource },
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
  // login(): combina modo online/offline, verificación de contraseña, rol por finca
  // (multi-tenant), emisión de JWT y actualización de caché.
  // ─────────────────────────────────────────────────────────────────────────
  describe('login()', () => {
    const usuarioMock = {
      idusuario: 1,
      email: 'admin@agrosmart.com',
      contrasena: 'hash_guardado',
      primernombre: 'Carlos',
      primerapellido: 'Gómez',
      fotoperfil: null,
      activo: true,
    };

    beforeEach(() => {
      mockAdministradorRepository.findOneBy.mockResolvedValue(null);
      mockCompradorRepository.findOneBy.mockResolvedValue(null);
      mockFincasService.listarDeUsuario.mockResolvedValue([]);
    });

    it('autentica online, emite el JWT y deja la única finca seleccionada con su rol', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      usuarioConHash(usuarioMock);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockAdministradorRepository.findOneBy.mockResolvedValue({ idusuario: 1 }); // es admin
      mockFincasService.listarDeUsuario.mockResolvedValue([fincaAdmin]);

      const result = await service.login('admin@agrosmart.com', 'clave123');

      expect(result.usuario.role).toBe('admin');
      expect(result.token).toBe('jwt-de-prueba');
      expect(result.idfinca).toBe(1);
      expect(result.requiereSeleccionFinca).toBe(false);
      expect(mockTokenService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ idusuario: 1, rol: 'admin', idfinca: 1 }),
      );
      // Debe cachear la sesión (con sus fincas) para poder usarla luego en modo offline
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'usuario_login_admin@agrosmart.com',
        expect.objectContaining({ role: 'admin', fincas: [fincaAdmin] }),
      );
    });

    it('el rol sale de la membresía de la finca: empleado en su finca', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      usuarioConHash(usuarioMock);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockFincasService.listarDeUsuario.mockResolvedValue([fincaEmpleado]);

      const result = await service.login('admin@agrosmart.com', 'clave123');

      expect(result.usuario.role).toBe('empleado');
      expect(result.idfinca).toBe(1);
    });

    it('con varias fincas NO elige una: el token queda sin finca y se pide seleccionarla', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      usuarioConHash(usuarioMock);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockAdministradorRepository.findOneBy.mockResolvedValue({ idusuario: 1 });
      mockFincasService.listarDeUsuario.mockResolvedValue([fincaAdmin, otraFinca]);

      const result = await service.login('admin@agrosmart.com', 'clave123');

      expect(result.idfinca).toBeNull();
      expect(result.requiereSeleccionFinca).toBe(true);
      expect(mockTokenService.sign).toHaveBeenCalledWith(expect.objectContaining({ idfinca: null }));
    });

    it('el comprador externo entra sin finca y no se consultan fincas (RNF-20)', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      usuarioConHash(usuarioMock);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockCompradorRepository.findOneBy.mockResolvedValue({ idusuario: 1 });

      const result = await service.login('admin@agrosmart.com', 'clave123');

      expect(result.usuario.role).toBe('comprador');
      expect(result.idfinca).toBeNull();
      expect(result.fincas).toEqual([]);
      expect(mockFincasService.listarDeUsuario).not.toHaveBeenCalled();
    });

    it('rechaza con UnauthorizedException si el usuario no existe (online)', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      usuarioConHash(null);

      await expect(service.login('nadie@x.com', 'clave123')).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza con UnauthorizedException si la contraseña es incorrecta', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      usuarioConHash(usuarioMock);
      mockedBcrypt.compare.mockResolvedValue(false as never); // contraseña no coincide

      await expect(service.login('admin@agrosmart.com', 'claveMala')).rejects.toThrow(UnauthorizedException);
    });

    it('usuario inexistente y contraseña errónea dan el MISMO mensaje (no revela qué correos existen)', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);

      usuarioConHash(null);
      const inexistente = await service.login('nadie@x.com', 'x').catch((e) => e.message);

      usuarioConHash(usuarioMock);
      mockedBcrypt.compare.mockResolvedValue(false as never);
      const claveMala = await service.login('admin@agrosmart.com', 'x').catch((e) => e.message);

      expect(inexistente).toBe(claveMala);
    });

    it('un usuario inactivo no puede autenticarse aunque la contraseña sea correcta (RNF-11)', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      usuarioConHash({ ...usuarioMock, activo: false });
      mockedBcrypt.compare.mockResolvedValue(true as never);

      await expect(service.login('admin@agrosmart.com', 'clave123')).rejects.toThrow(/no está activa/);
      expect(mockTokenService.sign).not.toHaveBeenCalled();
    });

    it('autentica en modo OFFLINE usando el caché si la contraseña coincide', async () => {
      mockSyncService.isOnline.mockResolvedValue(false);
      mockCacheService.get.mockReturnValue({
        idusuario: 1,
        primernombre: 'Carlos',
        primerapellido: 'Gómez',
        email: 'admin@agrosmart.com',
        role: 'admin',
        contrasena: 'hash_guardado',
        fotoperfil: null,
        fincas: [fincaAdmin],
      });
      mockedBcrypt.compare.mockResolvedValue(true as never);

      const result: any = await service.login('admin@agrosmart.com', 'clave123');

      expect(result._offline).toBe(true);
      expect(result.usuario.role).toBe('admin');
      expect(result.idfinca).toBe(1);
      // En modo offline NO debe tocar la base de datos
      expect(mockUsuarioRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('rechaza en modo OFFLINE si no hay sesión previa cacheada en este dispositivo', async () => {
      mockSyncService.isOnline.mockResolvedValue(false);
      mockCacheService.get.mockReturnValue(null);

      await expect(service.login('nuevo@x.com', 'clave123')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // registrar(): el registro público NUNCA crea empleados (los crea un administrador)
  // ─────────────────────────────────────────────────────────────────────────
  describe('registrar()', () => {
    it('no permite auto-registrarse como empleado: exige que lo cree un administrador', async () => {
      await expect(
        service.registrar({
          primernombre: 'Ana', email: 'ana@x.com', contrasena: 'secreta1', role: 'empleado',
        } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('un administrador exige apellido y cédula (RF-01)', async () => {
      await expect(
        service.registrar({
          primernombre: 'Ana', email: 'ana@x.com', contrasena: 'secreta1', role: 'admin',
        } as any),
      ).rejects.toThrow(/cedula/);
    });
  });
});
