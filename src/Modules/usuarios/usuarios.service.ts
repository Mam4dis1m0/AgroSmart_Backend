import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../../Entidades/entities/Usuario';
import { Administrador } from '../../Entidades/entities/Administrador';
import { Empleado } from '../../Entidades/entities/Empleado';
import * as bcrypt from 'bcrypt';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { v2 as cloudinary } from 'cloudinary';
// Agrega este import al inicio del archivo
import { MailService } from '../../mail/mail.service';
// Reemplaza la línea del import de NestJS al inicio del service
import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
// ── Configurar Cloudinary una sola vez al arrancar ────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

@Injectable()
export class UsuariosService extends BaseOfflineService<Usuario> {
  private resetTokens = new Map<string, { email: string; expiry: Date }>();
  private forgotPasswordCooldown = new Map<string, Date>();

  constructor(
  @InjectRepository(Usuario)       private usuarioRepo: Repository<Usuario>,
  @InjectRepository(Administrador) private adminRepo: Repository<Administrador>,
  @InjectRepository(Empleado)      private empleadoRepo: Repository<Empleado>,
  cache: CacheService,
  offlineQueue: OfflineQueueService,
  sync: SyncService,
  private mailService: MailService, // ← NUEVO
) {
  super(usuarioRepo, cache, offlineQueue, sync, 'usuario', 'idusuario');
}

  findAll() {
    return this.findAllOffline(() => this.usuarioRepo.find());
  }

  findOne(id: number) {
    return this.findOneOffline(id, () => this.usuarioRepo.findOneBy({ idusuario: id }));
  }

  // ── FIX #2: update refresca el nombre en el caché de login ────────────────
  async update(id: number, data: Partial<Usuario>) {
    return this.updateOffline(id, data, async () => {
      await this.usuarioRepo.update(id, data);
      const updated = await this.usuarioRepo.findOneBy({ idusuario: id });

      // Refrescar el nombre en el caché de sesión para que se refleje en
      // cualquier PC sin necesidad de volver a iniciar sesión
      if (updated?.email) {
        const cachedLogin = this.cache.get<any>(`usuario_login_${updated.email}`);
        if (cachedLogin) {
          this.cache.set(`usuario_login_${updated.email}`, {
            ...cachedLogin,
            primernombre: updated.primernombre ?? cachedLogin.primernombre,
          });
        }
      }

      return updated;
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.usuarioRepo.delete(id).then(() => {}));
  }

  // ── FIX #1: subir foto a Cloudinary → URL persistente en cualquier PC ─────
  async actualizarFotoPerfil(id: number, base64Image: string): Promise<{ fotoperfil: string }> {
    // Subir imagen a Cloudinary (carpeta agrosmart/perfiles, sobreescribe si ya existe)
    const uploadResult = await cloudinary.uploader.upload(base64Image, {
      folder:         'agrosmart/perfiles',
      public_id:      `usuario_${id}`,
      overwrite:      true,
      transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }],
    });

    const fotoUrl = uploadResult.secure_url;

    // Guardar la URL en la BD (columna fotoperfil debe existir — ver nota abajo)
    await this.usuarioRepo.update(id, { fotoperfil: fotoUrl } as any);

    // Actualizar el caché de login para que la foto aparezca de inmediato
    const usuario = await this.usuarioRepo.findOneBy({ idusuario: id });
    if (usuario?.email) {
      const cachedLogin = this.cache.get<any>(`usuario_login_${usuario.email}`);
      if (cachedLogin) {
        this.cache.set(`usuario_login_${usuario.email}`, { ...cachedLogin, fotoperfil: fotoUrl });
      }
    }

    return { fotoperfil: fotoUrl };
  }

  // ── Registro ─────────────────────────────────────────────────────────────
  async registrar(data: any) {
    const hash = await bcrypt.hash(data.contrasena, 10);
    const userData = {
      primernombre:    data.primernombre,
      segundonombre:   data.segundonombre,
      primerapellido:  data.primerapellido,
      segundoapellido: data.segundoapellido,
      email:           data.email,
      contrasena:      hash,
      telefono:        data.telefono,
    };

    const online = await this.sync.isOnline();

    if (online) {
      const usuario = this.usuarioRepo.create(userData);
      const saved = await this.usuarioRepo.save(usuario);

      if (data.role === 'admin') {
        await this.adminRepo.save(
          this.adminRepo.create({ idusuario: saved.idusuario, montomensual: data.montomensual ?? 0 }),
        );
      } else {
        await this.empleadoRepo.save(
          this.empleadoRepo.create({
            idusuario:      saved.idusuario,
            montoporhora:   data.montoporhora   ?? 0,
            montoporjornal: data.montoporjornal ?? 0,
          }),
        );
      }

      const usuarios: any[] = this.cache.get<any[]>(this.cacheKeyAll()) ?? [];
      this.cache.set(this.cacheKeyAll(), [...usuarios, { ...saved, _role: data.role }]);

      return { message: 'Usuario registrado', id: saved.idusuario };
    }

    const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tempUser = { idusuario: tempId, ...userData, _role: data.role, _offline: true };
    const usuarios: any[] = this.cache.get<any[]>(this.cacheKeyAll()) ?? [];
    this.cache.set(this.cacheKeyAll(), [...usuarios, tempUser]);
    this.offlineQueue.add('_registro_usuario', 'CREATE', {
      userData,
      role:           data.role,
      montoporhora:   data.montoporhora   ?? 0,
      montoporjornal: data.montoporjornal ?? 0,
      montomensual:   data.montomensual   ?? 0,
    });

    return {
      message: 'Usuario registrado localmente. Se sincronizará cuando haya internet.',
      id: tempId,
      _offline: true,
    };
  }
// Mapa en memoria: token → { email, expiry }
// Se borra automáticamente al reiniciar el servidor


  // ── Login normal ──────────────────────────────────────────────────────────
  async login(email: string, contrasena: string) {
    const online = await this.sync.isOnline();

    if (online) {
      const usuario = await this.usuarioRepo.findOneBy({ email });
      if (!usuario) throw new UnauthorizedException('Usuario no encontrado');

      const valida = await bcrypt.compare(contrasena, usuario.contrasena!);
      if (!valida) throw new UnauthorizedException('Contraseña incorrecta');

      const esAdmin = await this.adminRepo.findOneBy({ idusuario: usuario.idusuario });
      const role = esAdmin ? 'admin' : 'empleado';

      // FIX #1: leer fotoperfil desde la BD (columna fotoperfil),
      // no solo del caché local. Así funciona desde cualquier PC.
      const fotoperfil = (usuario as any).fotoperfil ?? null;

      this.cache.set(`usuario_login_${email}`, {
        idusuario:    usuario.idusuario,
        primernombre: usuario.primernombre,
        email:        usuario.email,
        role,
        contrasena:   usuario.contrasena,
        fotoperfil,
      });

      return {
        usuario: {
          id:         usuario.idusuario,
          // FIX #2: devolver nombre completo para que el frontend lo muestre
          nombre:     usuario.primernombre,
          apellido:   usuario.primerapellido,
          email:      usuario.email,
          role,
          fotoperfil,
        },
      };
    }

    const cachedUser = this.cache.get<any>(`usuario_login_${email}`);
    if (!cachedUser) {
      throw new UnauthorizedException(
        'Sin conexión a internet. Este usuario no ha iniciado sesión antes en este dispositivo.',
      );
    }

    const valida = await bcrypt.compare(contrasena, cachedUser.contrasena);
    if (!valida) throw new UnauthorizedException('Contraseña incorrecta');

    return {
      usuario: {
        id:         cachedUser.idusuario,
        nombre:     cachedUser.primernombre,
        email:      cachedUser.email,
        role:       cachedUser.role,
        fotoperfil: cachedUser.fotoperfil ?? null,
      },
      _offline: true,
      _mensaje: 'Sesión iniciada en modo offline.',
    };
  }

  // ── Cambiar contraseña ────────────────────────────────────────────────────
  async cambiarPassword(id: number, contrasenaActual: string, contrasenaNueva: string) {
    const usuario = await this.usuarioRepo.findOneBy({ idusuario: id });
    if (!usuario) throw new UnauthorizedException('Usuario no encontrado');

    const valida = await bcrypt.compare(contrasenaActual, usuario.contrasena!);
    if (!valida) throw new UnauthorizedException('La contraseña actual es incorrecta');

    const hash = await bcrypt.hash(contrasenaNueva, 10);
    await this.usuarioRepo.update(id, { contrasena: hash });

    const cachedUser = this.cache.get<any>(`usuario_login_${usuario.email}`);
    if (cachedUser) {
      this.cache.set(`usuario_login_${usuario.email}`, { ...cachedUser, contrasena: hash });
    }

    return { message: 'Contraseña actualizada correctamente' };
  }

  // ── Login con Google ──────────────────────────────────────────────────────
  async loginGoogle(email: string, picture?: string) {
    const online = await this.sync.isOnline();

    if (online) {
      const usuario = await this.usuarioRepo.findOneBy({ email });
      if (!usuario) {
        throw new UnauthorizedException(
          'Este correo de Google no está registrado en AgroSmart. Contacta al administrador.',
        );
      }

      const esAdmin = await this.adminRepo.findOneBy({ idusuario: usuario.idusuario });
      const role = esAdmin ? 'admin' : 'empleado';

      // FIX #1: priorizar foto guardada en BD, luego la de Google
      const fotoperfil = (usuario as any).fotoperfil ?? picture ?? null;

      this.cache.set(`usuario_login_${email}`, {
        idusuario:    usuario.idusuario,
        primernombre: usuario.primernombre,
        email:        usuario.email,
        role,
        contrasena:   usuario.contrasena,
        fotoperfil,
      });

      return {
        usuario: {
          id:         usuario.idusuario,
          nombre:     usuario.primernombre,
          apellido:   usuario.primerapellido,
          email:      usuario.email,
          role,
          fotoperfil,
        },
      };
    }

    const cachedUser = this.cache.get<any>(`usuario_login_${email}`);
    if (!cachedUser) {
      throw new UnauthorizedException(
        'Sin conexión. Este usuario no ha iniciado sesión antes en este dispositivo.',
      );
    }

    return {
      usuario: {
        id:         cachedUser.idusuario,
        nombre:     cachedUser.primernombre,
        email:      cachedUser.email,
        role:       cachedUser.role,
        fotoperfil: cachedUser.fotoperfil ?? null,
      },
      _offline: true,
    };
  }

  // ── Solicitar recuperación ────────────────────────────────────────────────
async forgotPassword(email: string) {
  const online = await this.sync.isOnline();

  // Busca el usuario (online o caché)
  let usuario: any = null;
  if (online) {
    usuario = await this.usuarioRepo.findOneBy({ email });
  } else {
    const cached = this.cache.get<any>(`usuario_login_${email}`);
    if (cached) usuario = cached;
  }

  // Por seguridad siempre responde igual — no revela si el email existe
  if (!usuario) {
    return { message: 'Si el correo está registrado, recibirás instrucciones.' };
  }

  // Genera token aleatorio
  const token = Math.random().toString(36).slice(2) +
                Math.random().toString(36).slice(2) +
                Date.now().toString(36);

  // Guarda en memoria con expiración de 30 minutos
  const expiry = new Date(Date.now() + 30 * 60 * 1000);
  this.resetTokens.set(token, { email, expiry });

  // Limpia el token automáticamente al expirar
  setTimeout(() => this.resetTokens.delete(token), 30 * 60 * 1000);

  // Envía el correo
  const nombre = usuario.primernombre ?? 'Usuario';
  await this.mailService.enviarRecuperacionPassword(email, token, nombre);

  this.logger.log(`🔑 Token de recuperación generado para ${email}`);
  return { message: 'Si el correo está registrado, recibirás instrucciones.' };
}

// ── Restablecer contraseña ────────────────────────────────────────────────
async resetPassword(token: string, nuevaContrasena: string) {
  const datos = this.resetTokens.get(token);

  if (!datos) {
    throw new UnauthorizedException('El enlace no es válido o ya fue usado.');
  }

  if (new Date() > datos.expiry) {
    this.resetTokens.delete(token);
    throw new UnauthorizedException('El enlace expiró. Solicita uno nuevo.');
  }

  if (nuevaContrasena.length < 6) {
    throw new UnauthorizedException('La contraseña debe tener mínimo 6 caracteres.');
  }

  // Hashea y guarda la nueva contraseña
  const hash = await bcrypt.hash(nuevaContrasena, 10);
  await this.usuarioRepo.update({ email: datos.email }, { contrasena: hash });

  // Invalida el token inmediatamente después de usarlo
  this.resetTokens.delete(token);

  this.logger.log(`✅ Contraseña restablecida para ${datos.email}`);
  return { message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' };
}
}