import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { TokenService } from './token.service';
import { AuthUser } from './tenant-context';

const SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres!!';
const user: AuthUser = { idusuario: 7, email: 'ana@agrosmart.com', rol: 'admin', idfinca: 3 };

const b64 = (o: unknown) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

describe('TokenService (JWT HS256)', () => {
  const secretoOriginal = process.env.JWT_SECRET;
  let svc: TokenService;

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
    svc = new TokenService();
  });

  afterAll(() => {
    process.env.JWT_SECRET = secretoOriginal;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('firma y verifica: el usuario, el rol y la finca activa viajan en el token', () => {
    expect(svc.verify(svc.sign(user))).toEqual(user);
  });

  it('conserva idfinca = null cuando todavía no se eligió finca', () => {
    expect(svc.verify(svc.sign({ ...user, idfinca: null })).idfinca).toBeNull();
  });

  it('rechaza un token con el payload alterado (p. ej. cambiar de finca)', () => {
    const [h, , f] = svc.sign(user).split('.');
    const falso = b64({ sub: 7, email: user.email, rol: 'admin', idfinca: 999, iat: 1, exp: 9999999999 });
    expect(() => svc.verify(`${h}.${falso}.${f}`)).toThrow(UnauthorizedException);
  });

  it('rechaza un token firmado con OTRO secreto', () => {
    const token = svc.sign(user);
    process.env.JWT_SECRET = 'otro-secreto-totalmente-distinto-de-32+caracteres';
    expect(() => new TokenService().verify(token)).toThrow(UnauthorizedException);
  });

  it('rechaza alg:none (ataque clásico de JWT sin firma)', () => {
    const cuerpo = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 7, email: 'x', rol: 'admin', idfinca: 1, exp: 9999999999 })}`;
    expect(() => svc.verify(`${cuerpo}.`)).toThrow(UnauthorizedException);
  });

  it('rechaza un algoritmo distinto de HS256 aunque la firma sea válida para el cuerpo', () => {
    const cuerpo = `${b64({ alg: 'HS512', typ: 'JWT' })}.${b64({ sub: 7, email: 'x', rol: 'admin', idfinca: 1, exp: 9999999999 })}`;
    const firma = createHmac('sha256', SECRET).update(cuerpo).digest().toString('base64url');
    expect(() => svc.verify(`${cuerpo}.${firma}`)).toThrow(UnauthorizedException);
  });

  it('rechaza un token expirado', () => {
    const token = svc.sign(user);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 3600 * 1000); // +25 h (vida por defecto: 24 h)
    expect(() => svc.verify(token)).toThrow(/expiró/);
  });

  it('rechaza basura y tokens mal formados', () => {
    expect(() => svc.verify('no-es-un-jwt')).toThrow(UnauthorizedException);
    expect(() => svc.verify('a.b.c')).toThrow(UnauthorizedException);
  });

  it('rechaza un rol que no existe en el sistema', () => {
    const cuerpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 7, email: 'x', rol: 'superadmin', idfinca: 1, exp: 9999999999 })}`;
    const firma = createHmac('sha256', SECRET).update(cuerpo).digest().toString('base64url');
    expect(() => svc.verify(`${cuerpo}.${firma}`)).toThrow(UnauthorizedException);
  });

  it('el servidor no arranca sin JWT_SECRET (o con uno débil)', () => {
    delete process.env.JWT_SECRET;
    expect(() => new TokenService().onModuleInit()).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = 'corto';
    expect(() => new TokenService().onModuleInit()).toThrow(/JWT_SECRET/);
  });
});
