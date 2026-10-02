import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { Public, Roles, SinFinca } from './auth.decorators';
import { TenantContext, AuthUser } from './tenant-context';
import { TokenService } from './token.service';

// Controlador de mentira para probar cada combinación de decoradores
class Dummy {
  @Public() publica() {}
  @Roles('admin') soloAdmin() {}
  normal() {}
  @Roles('admin', 'empleado', 'comprador') @SinFinca() catalogo() {}
}

describe('AuthGuard (JWT + rol + finca activa)', () => {
  process.env.JWT_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres!!';
  const tokens = new TokenService();
  const sesiones = { estaActiva: jest.fn() };
  const auditoriaRepo = { save: jest.fn().mockResolvedValue({}), create: jest.fn((x) => x) };
  const guard = new AuthGuard(new Reflector(), tokens, sesiones as any, auditoriaRepo as any);

  const admin: AuthUser = { idusuario: 1, email: 'a@x.com', rol: 'admin', idfinca: 1 };
  const empleado: AuthUser = { idusuario: 2, email: 'e@x.com', rol: 'empleado', idfinca: 1 };
  const comprador: AuthUser = { idusuario: 3, email: 'c@x.com', rol: 'comprador', idfinca: null };
  const adminSinFinca: AuthUser = { ...admin, idfinca: null };

  /** Ejecuta el guard como lo hace Nest: dentro del contexto de petición. */
  const entrar = (metodo: keyof Dummy, usuario?: AuthUser | string) => {
    const authorization =
      typeof usuario === 'string' ? usuario : usuario ? `Bearer ${tokens.sign(usuario)}` : undefined;
    const req: any = { headers: authorization ? { authorization } : {}, method: 'GET', originalUrl: '/x' };
    const context = {
      getType: () => 'http',
      getHandler: () => Dummy.prototype[metodo],
      getClass: () => Dummy,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    return TenantContext.run(async () => {
      const ok = await guard.canActivate(context);
      return { ok, req, finca: TenantContext.idfinca(), usuario: TenantContext.user() };
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sesiones.estaActiva.mockResolvedValue(true);
  });

  it('una ruta @Public pasa sin token', async () => {
    expect((await entrar('publica')).ok).toBe(true);
  });

  it('sin token → 401', async () => {
    await expect(entrar('normal')).rejects.toThrow(UnauthorizedException);
  });

  it('token inválido → 401', async () => {
    await expect(entrar('normal', 'Bearer abc.def.ghi')).rejects.toThrow(UnauthorizedException);
  });

  it('esquema distinto de Bearer → 401', async () => {
    await expect(entrar('normal', `Basic ${tokens.sign(admin)}`)).rejects.toThrow(UnauthorizedException);
  });

  it('con token válido publica usuario y finca activa para los servicios (aislamiento)', async () => {
    const r = await entrar('normal', admin);
    expect(r.ok).toBe(true);
    expect(r.finca).toBe(1);
    expect(r.usuario).toEqual(admin);
    expect(r.req.user).toEqual(admin);
  });

  it('un empleado no entra a una ruta @Roles("admin") y el intento queda auditado (RNF-20)', async () => {
    await expect(entrar('soloAdmin', empleado)).rejects.toThrow(ForbiddenException);
    await new Promise(setImmediate); // la auditoría es fire-and-forget
    expect(auditoriaRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ operacion: 'DENEGADO', idusuario: 2, idfinca: 1 }),
    );
  });

  it('el comprador externo NO entra a rutas de gestión por defecto (tareas, inventario, costos)', async () => {
    await expect(entrar('normal', comprador)).rejects.toThrow(ForbiddenException);
    await expect(entrar('soloAdmin', comprador)).rejects.toThrow(ForbiddenException);
  });

  it('el comprador SÍ entra al catálogo (@SinFinca + rol comprador)', async () => {
    expect((await entrar('catalogo', comprador)).ok).toBe(true);
  });

  it('un admin sin finca elegida no entra a rutas de gestión…', async () => {
    await expect(entrar('normal', adminSinFinca)).rejects.toThrow(/finca activa/);
  });

  it('…pero sí a las rutas @SinFinca (para poder elegir finca)', async () => {
    expect((await entrar('catalogo', adminSinFinca)).ok).toBe(true);
  });

  it('un usuario desactivado o sin acceso a la finca no opera con un token todavía vigente (RNF-11)', async () => {
    sesiones.estaActiva.mockResolvedValue(false);
    await expect(entrar('normal', admin)).rejects.toThrow(/inactiva|acceso/);
  });

  it('para compradores se verifica la cuenta, no la finca', async () => {
    await entrar('catalogo', comprador);
    expect(sesiones.estaActiva).toHaveBeenCalledWith(3, null);
  });
});
