// src/Modules/usuarios/usuarios.casos.spec.ts
// Casos de prueba del informe · Módulo USUARIOS (CP-U01 … CP-U12)
// registrar(): camino básico V(G)=7 (6 caminos factibles) + DTO RegistrarUsuarioDto (clases de equivalencia y límites).
import {
  BadRequestException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsuariosService } from './usuarios.service';
import { RegistrarUsuarioDto } from '../../dto/Usuario.dto';
import {
  mockOfflineQueueService,
  mockSyncService,
} from '../../test/mocks/common-providers.mock';
import { crearServicioUsuarios } from '../../test/mocks/usuarios-providers.mock';

jest.mock('bcrypt');
(bcrypt.hash as jest.Mock).mockResolvedValue('hash');

describe('UsuariosService.registrar · casos del informe', () => {
  let service: UsuariosService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSyncService.isOnline.mockResolvedValue(false); // evita BD: el camino OK termina en registrarOffline()
    service = await crearServicioUsuarios();
  });

  const dto = (o: any = {}) => ({
    primernombre: 'Ana',
    primerapellido: 'Gómez',
    email: 'ana@x.com',
    contrasena: 'secreta1',
    cedula: '1234567',
    role: 'admin',
    ...o,
  });

  // ── caminos independientes ─────────────────────────────────────────────────
  it('CP-U01 · R1: rol "empleado" → 401 (lo crea un admin)', async () => {
    await expect(service.registrar(dto({ role: 'empleado' }))).rejects.toThrow(
      UnauthorizedException,
    );
  });
  it('CP-U02 · R2: rol desconocido → 400', async () => {
    await expect(
      service.registrar(dto({ role: 'superadmin' })),
    ).rejects.toThrow(BadRequestException);
  });
  it('CP-U03 · R3: comprador sin cédula ni apellido es válido', async () => {
    const r: any = await service.registrar(
      dto({
        role: 'comprador',
        cedula: undefined,
        primerapellido: undefined,
      }),
    );
    expect(r._offline).toBe(true);
  });
  it('CP-U04 · R4: admin sin apellido → 400', async () => {
    await expect(
      service.registrar(dto({ primerapellido: undefined })),
    ).rejects.toThrow(/cedula/);
  });
  it('CP-U05 · R5: admin sin cédula → 400', async () => {
    await expect(service.registrar(dto({ cedula: undefined }))).rejects.toThrow(
      BadRequestException,
    );
  });
  it('CP-U06 · R6: admin completo se registra', async () => {
    const r: any = await service.registrar(dto());
    expect(r.id).toBeDefined();
    expect(bcrypt.hash).toHaveBeenCalledWith('secreta1', 10); // la contraseña nunca se guarda en claro
  });
  it('CP-U07 · el correo se normaliza (trim + minúsculas)', async () => {
    await service.registrar(dto({ email: '  ANA@X.COM ' }));
    expect(mockOfflineQueueService.add).toHaveBeenCalledWith(
      '_registro_usuario',
      'CREATE',
      expect.objectContaining({
        userData: expect.objectContaining({ email: 'ana@x.com' }),
      }),
    );
  });

  // ── DTO: clases de equivalencia y valores límite ───────────────────────────
  const validar = (body: any) =>
    new ValidationPipe({ whitelist: true, transform: true }).transform(body, {
      type: 'body',
      metatype: RegistrarUsuarioDto,
    });

  it.each([
    ['contraseña de 5 caracteres', { contrasena: 'abcde' }, false],
    ['contraseña de 6 caracteres (límite)', { contrasena: 'abcdef' }, true],
    [
      'contraseña de 100 caracteres (límite)',
      { contrasena: 'a'.repeat(100) },
      true,
    ],
    ['contraseña de 101 caracteres', { contrasena: 'a'.repeat(101) }, false],
    ['cédula de 4 caracteres', { cedula: '1234' }, false],
    ['cédula de 5 caracteres (límite)', { cedula: '12345' }, true],
    ['cédula de 20 caracteres (límite)', { cedula: '1'.repeat(20) }, true],
    ['cédula de 21 caracteres', { cedula: '1'.repeat(21) }, false],
    ['cédula con espacio y @', { cedula: '12 345@' }, false],
    ['correo sin arroba', { email: 'ana.mail.com' }, false],
    ['nombre vacío', { primernombre: '' }, false],
  ])('CP-U08 · DTO: %s', async (_n, extra, ok) => {
    const body = {
      primernombre: 'Ana',
      email: 'ana@x.com',
      contrasena: 'secreta1',
      cedula: '1234567',
      ...extra,
    };
    if (ok) await expect(validar(body)).resolves.toBeDefined();
    else
      await expect(validar(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
