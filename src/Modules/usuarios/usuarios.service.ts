import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Usuario } from '../../Entidades/entities/Usuario';
import { Administrador } from '../../Entidades/entities/Administrador';
import { Empleado } from '../../Entidades/entities/Empleado';
import { CompradorPerfil } from '../../Entidades/entities/CompradorPerfil';
import { FincaUsuario } from '../../Entidades/entities/FincaUsuario';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { v2 as cloudinary } from 'cloudinary';
import { MailService } from '../../mail/mail.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  RegistrarEmpleadoDto,
  RegistrarUsuarioDto,
  UbicacionCompradorDto,
  UpdateUsuarioDto,
} from '../../dto/Usuario.dto';
import { esViolacionUnica } from '../../common/sql';
import { AuthUser, Rol, TenantContext } from '../../auth/tenant-context';
import { TokenService } from '../../auth/token.service';
import { SesionService } from '../../auth/sesion.service';
import { FincaResumen, FincasService } from '../fincas/fincas.service';

// ── Configurar Cloudinary una sola vez al arrancar ────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/** Datos de sesión que se guardan para poder iniciar sesión sin conexión. */
interface SesionCache {
  idusuario:      number;
  primernombre:   string | null;
  primerapellido: string | null;
  email:          string;
  role:           Rol;            // rol base (sin finca elegida)
  contrasena:     string | null;  // hash bcrypt
  fotoperfil:     string | null;
  fincas:         FincaResumen[];
}

const COLUMNAS_PUBLICAS_UPDATE: (keyof UpdateUsuarioDto)[] = [
  'primernombre', 'segundonombre', 'primerapellido', 'segundoapellido', 'telefono', 'cedula',
];

@Injectable()
export class UsuariosService extends BaseOfflineService<Usuario> {
  // usuario es una tabla global (no tiene idfinca): el aislamiento va por finca_usuario
  protected readonly escopadoPorFinca = false;

  private resetTokens = new Map<string, { email: string; expiry: Date }>();
  private forgotPasswordCooldown = new Map<string, Date>();

  constructor(
    @InjectRepository(Usuario)         private usuarioRepo: Repository<Usuario>,
    @InjectRepository(Administrador)   private adminRepo: Repository<Administrador>,
    @InjectRepository(Empleado)        private empleadoRepo: Repository<Empleado>,
    @InjectRepository(CompradorPerfil) private compradorRepo: Repository<CompradorPerfil>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
    private mailService: MailService,
    private readonly tokens: TokenService,
    private readonly fincas: FincasService,
    private readonly sesiones: SesionService,
    private readonly ds: DataSource,
  ) {
    super(usuarioRepo, cache, offlineQueue, sync, 'usuario', 'idusuario');
  }

  // ── Consultas (siempre acotadas a la finca activa) ────────────────────────
  findAll() {
    return this.findAllOffline(() =>
      this.usuarioRepo
        .createQueryBuilder('u')
        .innerJoin(FincaUsuario, 'fu', 'fu.idusuario = u.idusuario AND fu.idfinca = :f', { f: this.idfinca })
        .getMany(),
    );
  }

  async findOne(id: number) {
    const yo = TenantContext.requireUser();
    if (id !== yo.idusuario) {
      if (yo.rol !== 'admin') throw new ForbiddenException('Acceso no autorizado');
      return this.findOneOffline(id, async () => {
        if (!(await this.fincas.esMiembro(this.idfinca, id))) {
          throw new NotFoundException('El usuario no pertenece a esta finca');
        }
        return this.usuarioRepo.findOneBy({ idusuario: id });
      });
    }
    return this.findOneOffline(id, () => this.usuarioRepo.findOneBy({ idusuario: id }));
  }

  /** Perfil del usuario autenticado + sus fincas (para que el móvil arme el selector). */
  async me() {
    const yo = TenantContext.requireUser();
    const usuario = await this.usuarioRepo.findOneBy({ idusuario: yo.idusuario });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    const fincas = yo.rol === 'comprador' ? [] : await this.fincas.listarDeUsuario(yo.idusuario);
    return {
      usuario: this.usuarioPublico(usuario, yo.rol),
      idfinca: yo.idfinca,
      fincas,
    };
  }

  // ── Actualización (solo campos permitidos) ────────────────────────────────
  async update(id: number, data: UpdateUsuarioDto) {
    const yo = TenantContext.requireUser();
    if (id !== yo.idusuario && yo.rol !== 'admin') {
      throw new ForbiddenException('Solo puedes editar tu propio perfil');
    }

    // Lista blanca: jamás se acepta contrasena, email, activo, etc. por esta vía
    const cambios: Record<string, unknown> = {};
    for (const campo of COLUMNAS_PUBLICAS_UPDATE) {
      if ((data as any)?.[campo] !== undefined) cambios[campo] = (data as any)[campo];
    }
    if (Object.keys(cambios).length === 0) {
      throw new BadRequestException('No hay campos válidos para actualizar');
    }

    return this.updateOffline(id, cambios, async () => {
      if (id !== yo.idusuario && !(await this.fincas.esMiembro(this.idfinca, id))) {
        throw new NotFoundException('El usuario no pertenece a esta finca');
      }
      try {
        await this.usuarioRepo.update(id, cambios as any);
      } catch (err) {
        if (esViolacionUnica(err)) throw new ConflictException('La cédula ya está registrada');
        throw err;
      }
      const updated = await this.usuarioRepo.findOneBy({ idusuario: id });

      // Refrescar el nombre en el caché de sesión (se refleja sin volver a iniciar sesión)
      if (updated?.email) {
        const cachedLogin = this.cache.get<any>(this.claveLogin(updated.email));
        if (cachedLogin) {
          this.cache.set(this.claveLogin(updated.email), {
            ...cachedLogin,
            primernombre: updated.primernombre ?? cachedLogin.primernombre,
          });
        }
      }
      return updated;
    });
  }

  /**
   * "Eliminar" a un usuario = sacarlo de la finca activa. Si no le queda ninguna otra
   * finca, la cuenta se desactiva (RNF-11). Nunca se borra la fila: hay historial
   * (tareas, nómina, auditoría) que depende de ella.
   */
  async remove(id: number) {
    const yo = TenantContext.requireUser();
    if (id === yo.idusuario) throw new BadRequestException('No puedes eliminarte a ti mismo');
    if (!(await this.sync.isOnline())) {
      throw new ServiceUnavailableException('Esta operación requiere conexión a internet');
    }

    await this.fincas.quitarMiembro(this.idfinca, id);

    const [{ restantes }] = await this.ds.query(
      `SELECT COUNT(*)::int AS restantes FROM finca_usuario WHERE idusuario = $1 AND activo = true`,
      [id],
    );
    if (restantes === 0) {
      await this.usuarioRepo.update(id, { activo: false });
    }
    this.sesiones.invalidar(id);
    this.removeCacheItem(id);
    return { message: 'Usuario removido de la finca' };
  }

  // ── Foto de perfil ────────────────────────────────────────────────────────
  async actualizarFotoPerfil(id: number, base64Image: string): Promise<{ fotoperfil: string }> {
    const yo = TenantContext.requireUser();
    if (id !== yo.idusuario) throw new ForbiddenException('Solo puedes cambiar tu propia foto');

    // ~7 MB de base64 ≈ 5 MB de imagen
    if (base64Image.length > 7_000_000) {
      throw new BadRequestException('La imagen supera el tamaño máximo (5 MB)');
    }

    const uploadResult = await cloudinary.uploader.upload(base64Image, {
      folder:         'agrosmart/perfiles',
      public_id:      `usuario_${id}`,
      overwrite:      true,
      transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }],
    });

    const fotoUrl = uploadResult.secure_url;
    await this.usuarioRepo.update(id, { fotoperfil: fotoUrl });

    const usuario = await this.usuarioRepo.findOneBy({ idusuario: id });
    if (usuario?.email) {
      const cachedLogin = this.cache.get<any>(this.claveLogin(usuario.email));
      if (cachedLogin) {
        this.cache.set(this.claveLogin(usuario.email), { ...cachedLogin, fotoperfil: fotoUrl });
      }
    }
    return { fotoperfil: fotoUrl };
  }

  // ── Registro público: dueño de finca (admin) o comprador (CU-01 / CU-31) ──
  async registrar(data: RegistrarUsuarioDto) {
    const role = (data.role ?? 'admin') as string;
    if (role === 'empleado') {
      throw new UnauthorizedException(
        'Los empleados los registra un administrador desde su finca (POST /usuarios/empleados).',
      );
    }
    if (role !== 'admin' && role !== 'comprador') {
      throw new BadRequestException('role debe ser "admin" o "comprador"');
    }
    // RF-01: nombre, apellido, correo y cédula obligatorios para quien gestiona fincas
    if (role === 'admin' && (!data.primerapellido || !data.cedula)) {
      throw new BadRequestException('primerapellido y cedula son obligatorios para administradores');
    }

    const userData = await this.datosUsuario(data);
    const online = await this.sync.isOnline();

    if (online) {
      try {
        const saved = await this.ds.transaction(async (m) => {
          const usuario = await m.save(Usuario, m.create(Usuario, userData));
          if (role === 'admin') {
            await m.save(Administrador, m.create(Administrador, {
              idusuario: usuario.idusuario, montomensual: data.montomensual ?? 0,
            }));
          } else {
            await m.save(CompradorPerfil, m.create(CompradorPerfil, {
              idusuario: usuario.idusuario,
              ubicacion: data.ubicacion ?? null,
              latitud:   data.latitud ?? null,
              longitud:  data.longitud ?? null,
            }));
          }
          return usuario;
        });
        return { message: 'Usuario registrado', id: saved.idusuario };
      } catch (err) {
        this.traducirDuplicado(err);
        throw err;
      }
    }

    // Offline: se guarda localmente y se sube al reconectar
    return this.registrarOffline(userData, role, {
      montomensual: data.montomensual ?? 0,
      ubicacion: data.ubicacion ?? null, latitud: data.latitud ?? null, longitud: data.longitud ?? null,
    });
  }

  // ── CU-01 · El administrador registra un empleado en SU finca ─────────────
  async registrarEmpleado(data: RegistrarEmpleadoDto, admin: AuthUser) {
    const idfinca = TenantContext.requireFinca();
    const userData = await this.datosUsuario(data);
    const online = await this.sync.isOnline();

    if (online) {
      try {
        const saved = await this.ds.transaction(async (m) => {
          const usuario = await m.save(Usuario, m.create(Usuario, userData));
          await m.save(Empleado, m.create(Empleado, {
            idusuario:      usuario.idusuario,
            montoporhora:   data.montoporhora   ?? 0,
            montoporjornal: data.montoporjornal ?? 0,
          }));
          // valida el límite del plan y crea la membresía dentro de la misma transacción
          await this.fincas.agregarMiembro(idfinca, usuario.idusuario, 'empleado', { manager: m });
          return usuario;
        });
        const { contrasena: _hash, ...sinHash } = saved; // el hash nunca va al caché
        this.updateCacheList(sinHash);
        return { message: 'Empleado registrado', id: saved.idusuario };
      } catch (err) {
        this.traducirDuplicado(err);
        throw err;
      }
    }

    return this.registrarOffline(userData, 'empleado', {
      montoporhora: data.montoporhora ?? 0,
      montoporjornal: data.montoporjornal ?? 0,
      idfinca,
      creadoPor: admin.idusuario,
    });
  }

  private async datosUsuario(data: {
    primernombre: string; segundonombre?: string; primerapellido?: string; segundoapellido?: string;
    email: string; contrasena: string; telefono?: string; cedula?: string;
  }) {
    return {
      primernombre:    data.primernombre.trim(),
      segundonombre:   data.segundonombre ?? null,
      primerapellido:  data.primerapellido?.trim() ?? null,
      segundoapellido: data.segundoapellido ?? null,
      email:           data.email.trim().toLowerCase(),
      contrasena:      await bcrypt.hash(data.contrasena, 10),
      telefono:        data.telefono ?? null,
      cedula:          data.cedula?.trim() ?? null,
    };
  }

  private traducirDuplicado(err: any): void {
    if (!esViolacionUnica(err)) return;
    const detalle = `${err?.constraint ?? ''} ${err?.detail ?? ''}`.toLowerCase();
    if (detalle.includes('cedula')) throw new ConflictException('La cédula ya está registrada');
    throw new ConflictException('El correo ya está registrado');
  }

  private registrarOffline(userData: Record<string, unknown>, role: string, extra: Record<string, unknown>) {
    const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { contrasena: _hash, ...visible } = userData;
    const usuarios: any[] = this.cache.get<any[]>(this.cacheKeyAll()) ?? [];
    this.cache.set(this.cacheKeyAll(), [...usuarios, { idusuario: tempId, ...visible, _role: role, _offline: true }]);
    this.offlineQueue.add('_registro_usuario', 'CREATE', { userData, role, ...extra });

    return {
      message: 'Usuario registrado localmente. Se sincronizará cuando haya internet.',
      id: tempId,
      _offline: true,
    };
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  private claveLogin(email: string): string {
    return `usuario_login_${email.trim().toLowerCase()}`;
  }

  /** Lee el usuario CON hash (la columna es select:false). */
  private buscarConHash(criterio: { email?: string; id?: number }): Promise<Usuario | null> {
    const qb = this.usuarioRepo.createQueryBuilder('u').addSelect('u.contrasena');
    if (criterio.id !== undefined) qb.where('u.idusuario = :id', { id: criterio.id });
    else qb.where('lower(u.email) = lower(:email)', { email: (criterio.email ?? '').trim() });
    return qb.getOne();
  }

  private async rolBase(idusuario: number): Promise<Rol> {
    if (await this.adminRepo.findOneBy({ idusuario })) return 'admin';
    if (await this.compradorRepo.findOneBy({ idusuario })) return 'comprador';
    return 'empleado';
  }

  private usuarioPublico(u: Pick<Usuario, 'idusuario' | 'primernombre' | 'primerapellido' | 'email' | 'fotoperfil'>, role: Rol) {
    return {
      id:         u.idusuario,
      nombre:     u.primernombre,
      apellido:   u.primerapellido,
      email:      u.email,
      role,
      fotoperfil: u.fotoperfil ?? null,
    };
  }

  /**
   * Arma la respuesta de login y emite el JWT.
   *  · 1 sola finca  → queda seleccionada automáticamente (CU-36, flujo alterno)
   *  · varias fincas → token sin finca; el cliente llama POST /fincas/:id/seleccionar
   *  · comprador     → token sin finca (solo catálogo público)
   */
  private construirSesion(s: SesionCache, extra: Record<string, unknown> = {}) {
    let rol: Rol = s.role;
    let idfinca: number | null = null;

    if (s.role !== 'comprador') {
      if (s.fincas.length === 1) {
        idfinca = s.fincas[0].idfinca;
        rol = s.fincas[0].rol;
      } else if (s.fincas.length > 1) {
        rol = s.fincas.some((f) => f.rol === 'admin') ? 'admin' : 'empleado';
      }
    }

    const token = this.tokens.sign({ idusuario: s.idusuario, email: s.email, rol, idfinca });
    return {
      usuario: this.usuarioPublico(
        { idusuario: s.idusuario, primernombre: s.primernombre, primerapellido: s.primerapellido, email: s.email, fotoperfil: s.fotoperfil },
        rol,
      ),
      token,
      idfinca,
      fincas: s.fincas,
      requiereSeleccionFinca: s.role !== 'comprador' && s.fincas.length > 1,
      ...extra,
    };
  }

  async login(email: string, contrasena: string) {
    const online = await this.sync.isOnline();

    if (online) {
      const usuario = await this.buscarConHash({ email });
      // Mismo mensaje para "no existe" y "contraseña incorrecta": no revela qué correos existen
      const valida = !!usuario?.contrasena && (await bcrypt.compare(contrasena, usuario.contrasena));
      if (!usuario || !valida) throw new UnauthorizedException('Correo o contraseña incorrectos');
      if (usuario.activo === false) throw new UnauthorizedException('Tu cuenta no está activa. Contacta al administrador.');

      const role   = await this.rolBase(usuario.idusuario);
      const fincas = role === 'comprador' ? [] : await this.fincas.listarDeUsuario(usuario.idusuario);

      const sesion: SesionCache = {
        idusuario:      usuario.idusuario,
        primernombre:   usuario.primernombre,
        primerapellido: usuario.primerapellido,
        email:          usuario.email as string,
        role,
        contrasena:     usuario.contrasena as string,
        fotoperfil:     usuario.fotoperfil ?? null,
        fincas,
      };
      this.cache.set(this.claveLogin(sesion.email), sesion);
      return this.construirSesion(sesion);
    }

    // ── Offline: valida contra el hash guardado la última vez que inició sesión aquí ──
    const cached = this.cache.get<SesionCache>(this.claveLogin(email));
    if (!cached?.contrasena) {
      throw new UnauthorizedException(
        'Sin conexión a internet. Este usuario no ha iniciado sesión antes en este dispositivo.',
      );
    }
    const valida = await bcrypt.compare(contrasena, cached.contrasena);
    if (!valida) throw new UnauthorizedException('Correo o contraseña incorrectos');

    return this.construirSesion(cached, { _offline: true, _mensaje: 'Sesión iniciada en modo offline.' });
  }

  // ── Login con Google ──────────────────────────────────────────────────────
  /**
   * Verifica el ID token de Google contra Google (aud = tu Client ID, correo verificado).
   * Ya no se confía en un correo enviado por el cliente: ahora ese correo da acceso (JWT).
   */
  private async verificarGoogle(credential: string): Promise<{ email: string; picture?: string }> {
    const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new ServiceUnavailableException('GOOGLE_CLIENT_ID no está configurado en el servidor');
    }

    let info: any;
    try {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      info = await res.json();
    } catch {
      throw new UnauthorizedException('No se pudo validar la cuenta de Google');
    }

    const emailVerificado = info?.email_verified === true || info?.email_verified === 'true';
    if (info?.aud !== clientId || !info?.email || !emailVerificado) {
      throw new UnauthorizedException('Credencial de Google inválida');
    }
    return { email: String(info.email).toLowerCase(), picture: info.picture };
  }

  async loginGoogle(credential: string) {
    if (!(await this.sync.isOnline())) {
      throw new ServiceUnavailableException('El inicio de sesión con Google requiere conexión a internet');
    }
    const { email, picture } = await this.verificarGoogle(credential);

    const usuario = await this.usuarioRepo
      .createQueryBuilder('u')
      .where('lower(u.email) = lower(:email)', { email })
      .getOne();
    if (!usuario) {
      throw new UnauthorizedException(
        'Este correo de Google no está registrado en AgroSmart. Regístrate o contacta al administrador.',
      );
    }
    if (usuario.activo === false) throw new UnauthorizedException('Tu cuenta no está activa. Contacta al administrador.');

    const role   = await this.rolBase(usuario.idusuario);
    const fincas = role === 'comprador' ? [] : await this.fincas.listarDeUsuario(usuario.idusuario);

    const previo = this.cache.get<SesionCache>(this.claveLogin(email));
    const sesion: SesionCache = {
      idusuario:      usuario.idusuario,
      primernombre:   usuario.primernombre,
      primerapellido: usuario.primerapellido,
      email:          usuario.email as string,
      role,
      contrasena:     previo?.contrasena ?? null,
      fotoperfil:     usuario.fotoperfil ?? picture ?? previo?.fotoperfil ?? null,
      fincas,
    };
    this.cache.set(this.claveLogin(email), sesion);
    return this.construirSesion(sesion);
  }

  // ── Cambiar contraseña ────────────────────────────────────────────────────
  async cambiarPassword(id: number, contrasenaActual: string, contrasenaNueva: string) {
    const yo = TenantContext.requireUser();
    if (id !== yo.idusuario) throw new ForbiddenException('Solo puedes cambiar tu propia contraseña');

    const usuario = await this.buscarConHash({ id });
    if (!usuario?.contrasena) throw new UnauthorizedException('Usuario no encontrado');

    const valida = await bcrypt.compare(contrasenaActual, usuario.contrasena);
    if (!valida) throw new UnauthorizedException('La contraseña actual es incorrecta');

    const hash = await bcrypt.hash(contrasenaNueva, 10);
    await this.usuarioRepo.update(id, { contrasena: hash });

    const cached = this.cache.get<any>(this.claveLogin(usuario.email as string));
    if (cached) this.cache.set(this.claveLogin(usuario.email as string), { ...cached, contrasena: hash });

    return { message: 'Contraseña actualizada correctamente' };
  }

  // ── Recuperación de contraseña ────────────────────────────────────────────
  async forgotPassword(email: string) {
    const online = await this.sync.isOnline();
    const correo = email.trim().toLowerCase();

    let usuario: any = null;
    if (online) {
      usuario = await this.usuarioRepo
        .createQueryBuilder('u')
        .where('lower(u.email) = :e', { e: correo })
        .getOne();
    } else {
      usuario = this.cache.get<any>(this.claveLogin(correo));
    }

    // Por seguridad siempre responde igual — no revela si el email existe
    const respuesta = { message: 'Si el correo está registrado, recibirás instrucciones.' };
    if (!usuario || usuario.activo === false) return respuesta;

    // Cooldown de 60 s por correo (evita usar el endpoint para spamear a alguien)
    const ultimo = this.forgotPasswordCooldown.get(correo);
    if (ultimo && Date.now() - ultimo.getTime() < 60_000) return respuesta;
    this.forgotPasswordCooldown.set(correo, new Date());

    // Token criptográficamente seguro (antes: Math.random, predecible)
    const token = randomBytes(32).toString('hex');
    this.resetTokens.set(token, { email: correo, expiry: new Date(Date.now() + 30 * 60 * 1000) });
    setTimeout(() => this.resetTokens.delete(token), 30 * 60 * 1000).unref();

    await this.mailService.enviarRecuperacionPassword(correo, token, usuario.primernombre ?? 'Usuario');
    this.logger.log(`🔑 Token de recuperación generado para ${correo}`);
    return respuesta;
  }

  async resetPassword(token: string, nuevaContrasena: string) {
    const datos = this.resetTokens.get(token);
    if (!datos) throw new UnauthorizedException('El enlace no es válido o ya fue usado.');

    if (new Date() > datos.expiry) {
      this.resetTokens.delete(token);
      throw new UnauthorizedException('El enlace expiró. Solicita uno nuevo.');
    }

    const hash = await bcrypt.hash(nuevaContrasena, 10);
    await this.usuarioRepo
      .createQueryBuilder()
      .update(Usuario)
      .set({ contrasena: hash })
      .where('lower(email) = :e', { e: datos.email })
      .execute();

    this.resetTokens.delete(token);
    this.logger.log(`✅ Contraseña restablecida para ${datos.email}`);
    return { message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' };
  }

  // ── Comprador: ubicación para alertas de ofertas cercanas (CU-34) ─────────
  async actualizarUbicacionComprador(idusuario: number, dto: UbicacionCompradorDto) {
    const res = await this.compradorRepo.update({ idusuario }, dto as any);
    if (!res.affected) throw new NotFoundException('Perfil de comprador no encontrado');
    return this.compradorRepo.findOneBy({ idusuario });
  }

  async perfilComprador(idusuario: number) {
    const perfil = await this.compradorRepo.findOneBy({ idusuario });
    if (!perfil) throw new NotFoundException('Perfil de comprador no encontrado');
    return perfil;
  }
}
