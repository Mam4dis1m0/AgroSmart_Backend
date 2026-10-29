import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UsuariosService } from '../../Modules/usuarios/usuarios.service';
import { FincasService } from '../../Modules/fincas/fincas.service';
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
} from './common-providers.mock';

/**
 * Montaje común de las pruebas de UsuariosService (service.spec, casos y login): los cuatro
 * repositorios simulados y el módulo de Nest con todas sus dependencias. Así cada spec solo
 * cuenta lo que prueba y no repite imports ni providers.
 *
 * Nota: quien lo use debe declarar `jest.mock('bcrypt')` en su propio archivo (Jest lo
 * hoistea por archivo).
 */

/** Finca con rol de administrador, tal como la devuelve FincasService.listarDeUsuario(). */
export const fincaAdmin = {
  idfinca: 1,
  nombre: 'Finca A',
  ubicacion: null,
  tipoproduccion: null,
  rol: 'admin',
  plan: 'FREEMIUM',
};

/** Los cuatro repositorios que usa UsuariosService, simulados. */
export const crearReposUsuarios = () => ({
  usuario: createMockRepository(),
  administrador: createMockRepository(),
  empleado: createMockRepository(),
  comprador: createMockRepository(),
});

export type ReposUsuarios = ReturnType<typeof crearReposUsuarios>;

/** Crea UsuariosService con todas sus dependencias simuladas. */
export async function crearServicioUsuarios(
  repos: ReposUsuarios = crearReposUsuarios(),
): Promise<UsuariosService> {
  const modulo = await Test.createTestingModule({
    providers: [
      UsuariosService,
      { provide: getRepositoryToken(Usuario), useValue: repos.usuario },
      {
        provide: getRepositoryToken(Administrador),
        useValue: repos.administrador,
      },
      { provide: getRepositoryToken(Empleado), useValue: repos.empleado },
      {
        provide: getRepositoryToken(CompradorPerfil),
        useValue: repos.comprador,
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
  return modulo.get(UsuariosService);
}

/**
 * login() lee el usuario CON hash (la columna contrasena es select:false) mediante un
 * QueryBuilder: este helper deja ese QueryBuilder devolviendo `usuario`.
 */
export const usuarioConHash = (
  repoUsuario: ReposUsuarios['usuario'],
  usuario: unknown,
) => {
  const qb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(usuario),
  };
  repoUsuario.createQueryBuilder.mockReturnValue(qb as any);
};
