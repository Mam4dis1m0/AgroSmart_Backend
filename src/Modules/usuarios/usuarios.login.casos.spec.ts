// src/Modules/usuarios/usuarios.login.casos.spec.ts
// Casos de prueba del informe · Módulo USUARIOS · login() (CP-U09 … CP-U12)
// Clases de equivalencia sobre login(): online válido, credenciales inválidas, cuenta inactiva y offline con caché.
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
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
import {
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService,
  mockMailService,
  mockTokenService,
  mockFincasService,
  mockSesionService,
  mockDataSource,
  createMockRepository,
} from '../../test/mocks/common-providers.mock';

jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

const fincaAdmin = {
  idfinca: 1,
  nombre: 'Finca A',
  ubicacion: null,
  tipoproduccion: null,
  rol: 'admin',
  plan: 'FREEMIUM',
};

describe('UsuariosService.login · casos del informe', () => {
  let service: UsuariosService;
  const mockUsuarioRepository = createMockRepository();
  const mockAdministradorRepository = createMockRepository();
  const mockEmpleadoRepository = createMockRepository();
  const mockCompradorRepository = createMockRepository();

  // login() lee el usuario CON hash (contrasena es select:false) vía QueryBuilder
  const usuarioConHash = (usuario: unknown) => {
    const qb = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(usuario),
    };
    mockUsuarioRepository.createQueryBuilder.mockReturnValue(qb as any);
  };

  const usuarioMock = {
    idusuario: 1,
    email: 'admin@agrosmart.com',
    contrasena: 'hash_guardado',
    primernombre: 'Carlos',
    primerapellido: 'Gómez',
    fotoperfil: null,
    activo: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        {
          provide: getRepositoryToken(Usuario),
          useValue: mockUsuarioRepository,
        },
        {
          provide: getRepositoryToken(Administrador),
          useValue: mockAdministradorRepository,
        },
        {
          provide: getRepositoryToken(Empleado),
          useValue: mockEmpleadoRepository,
        },
        {
          provide: getRepositoryToken(CompradorPerfil),
          useValue: mockCompradorRepository,
        },
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
    service = mod.get(UsuariosService);

    mockAdministradorRepository.findOneBy.mockResolvedValue(null);
    mockCompradorRepository.findOneBy.mockResolvedValue(null);
    mockFincasService.listarDeUsuario.mockResolvedValue([]);
  });

  it('CP-U09 · login online correcto: emite JWT y deja la única finca seleccionada', async () => {
    mockSyncService.isOnline.mockResolvedValue(true);
    usuarioConHash(usuarioMock);
    mockedBcrypt.compare.mockResolvedValue(true as never);
    mockAdministradorRepository.findOneBy.mockResolvedValue({ idusuario: 1 });
    mockFincasService.listarDeUsuario.mockResolvedValue([fincaAdmin]);

    const result = await service.login('admin@agrosmart.com', 'clave123');

    expect(result.usuario.role).toBe('admin');
    expect(result.token).toBe('jwt-de-prueba');
    expect(result.idfinca).toBe(1);
    expect(result.requiereSeleccionFinca).toBe(false);
  });

  it('CP-U10 · usuario inexistente → 401', async () => {
    mockSyncService.isOnline.mockResolvedValue(true);
    usuarioConHash(null);

    await expect(service.login('nadie@x.com', 'clave123')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('CP-U10 · contraseña incorrecta → 401', async () => {
    mockSyncService.isOnline.mockResolvedValue(true);
    usuarioConHash(usuarioMock);
    mockedBcrypt.compare.mockResolvedValue(false as never);

    await expect(
      service.login('admin@agrosmart.com', 'claveMala'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('CP-U10 · correo inexistente y contraseña errónea dan el MISMO mensaje', async () => {
    mockSyncService.isOnline.mockResolvedValue(true);

    usuarioConHash(null);
    const inexistente = await service
      .login('nadie@x.com', 'x')
      .catch((e) => e.message);

    usuarioConHash(usuarioMock);
    mockedBcrypt.compare.mockResolvedValue(false as never);
    const claveMala = await service
      .login('admin@agrosmart.com', 'x')
      .catch((e) => e.message);

    expect(inexistente).toBe(claveMala);
  });

  it('CP-U11 · cuenta inactiva → 401 "no está activa" aunque la contraseña sea correcta', async () => {
    mockSyncService.isOnline.mockResolvedValue(true);
    usuarioConHash({ ...usuarioMock, activo: false });
    mockedBcrypt.compare.mockResolvedValue(true as never);

    await expect(
      service.login('admin@agrosmart.com', 'clave123'),
    ).rejects.toThrow(/no está activa/);
    expect(mockTokenService.sign).not.toHaveBeenCalled();
  });

  it('CP-U12 · login sin internet con sesión previa: _offline=true y no consulta la BD', async () => {
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
    expect(mockUsuarioRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('CP-U12 · sin internet y sin sesión previa en el dispositivo → 401', async () => {
    mockSyncService.isOnline.mockResolvedValue(false);
    mockCacheService.get.mockReturnValue(null);

    await expect(service.login('nuevo@x.com', 'clave123')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
