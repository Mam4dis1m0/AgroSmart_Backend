// src/Modules/usuarios/usuarios.login.casos.spec.ts
// Casos de prueba del informe · Módulo USUARIOS · login() (CP-U09 … CP-U12)
// Clases de equivalencia sobre login(): online válido, credenciales inválidas, cuenta inactiva y offline con caché.
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsuariosService } from './usuarios.service';
import {
  mockCacheService,
  mockSyncService,
  mockTokenService,
  mockFincasService,
} from '../../test/mocks/common-providers.mock';
import {
  crearReposUsuarios,
  crearServicioUsuarios,
  fincaAdmin,
  usuarioConHash as dejarUsuarioConHash,
} from '../../test/mocks/usuarios-providers.mock';

jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('UsuariosService.login · casos del informe', () => {
  let service: UsuariosService;
  const repos = crearReposUsuarios();
  const usuarioConHash = (usuario: unknown) =>
    dejarUsuarioConHash(repos.usuario, usuario);

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
    service = await crearServicioUsuarios(repos);

    repos.administrador.findOneBy.mockResolvedValue(null);
    repos.comprador.findOneBy.mockResolvedValue(null);
    mockFincasService.listarDeUsuario.mockResolvedValue([]);
  });

  it('CP-U09 · login online correcto: emite JWT y deja la única finca seleccionada', async () => {
    mockSyncService.isOnline.mockResolvedValue(true);
    usuarioConHash(usuarioMock);
    mockedBcrypt.compare.mockResolvedValue(true as never);
    repos.administrador.findOneBy.mockResolvedValue({ idusuario: 1 });
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
    expect(repos.usuario.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('CP-U12 · sin internet y sin sesión previa en el dispositivo → 401', async () => {
    mockSyncService.isOnline.mockResolvedValue(false);
    mockCacheService.get.mockReturnValue(null);

    await expect(service.login('nuevo@x.com', 'clave123')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
