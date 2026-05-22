// src/Modules/usuarios/usuarios.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
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

@Injectable()
export class UsuariosService extends BaseOfflineService<Usuario> {
  constructor(
    @InjectRepository(Usuario)    private usuarioRepo: Repository<Usuario>,
    @InjectRepository(Administrador) private adminRepo: Repository<Administrador>,
    @InjectRepository(Empleado)   private empleadoRepo: Repository<Empleado>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(usuarioRepo, cache, offlineQueue, sync, 'usuario', 'idusuario');
  }

  findAll() {
    return this.findAllOffline(() => this.usuarioRepo.find());
  }

  findOne(id: number) {
    return this.findOneOffline(id, () => this.usuarioRepo.findOneBy({ idusuario: id }));
  }

  update(id: number, data: Partial<Usuario>) {
    return this.updateOffline(id, data, async () => {
      await this.usuarioRepo.update(id, data);
      return this.usuarioRepo.findOneBy({ idusuario: id });
    });
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.usuarioRepo.delete(id).then(() => {}));
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
            idusuario: saved.idusuario,
            montoporhora:   data.montoporhora   ?? 0,
            montoporjornal: data.montoporjornal ?? 0,
          }),
        );
      }

      // Guarda en caché para login offline posterior
      const usuarios: any[] = this.cache.get<any[]>(this.cacheKeyAll()) ?? [];
      this.cache.set(this.cacheKeyAll(), [...usuarios, { ...saved, _role: data.role }]);

      return { message: 'Usuario registrado', id: saved.idusuario };
    }

    // ── Modo offline: guarda en caché con id temporal ───────────────────
    const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tempUser = { idusuario: tempId, ...userData, _role: data.role, _offline: true };
    const usuarios: any[] = this.cache.get<any[]>(this.cacheKeyAll()) ?? [];
    this.cache.set(this.cacheKeyAll(), [...usuarios, tempUser]);
    // Encola como operación especial para que SyncService haga
    // los dos INSERTs: tabla usuario + tabla empleado/administrador
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

  // ── Login ─────────────────────────────────────────────────────────────────
  // Con internet  → valida en Supabase y guarda usuario en caché
  // Sin internet  → busca en caché local (usuarios previamente logueados)
  async login(email: string, contrasena: string) {
    const online = await this.sync.isOnline();

    if (online) {
      const usuario = await this.usuarioRepo.findOneBy({ email });
      if (!usuario) throw new UnauthorizedException('Usuario no encontrado');

      const valida = await bcrypt.compare(contrasena, usuario.contrasena!);
      if (!valida) throw new UnauthorizedException('Contraseña incorrecta');

      const esAdmin = await this.adminRepo.findOneBy({ idusuario: usuario.idusuario });
      const role = esAdmin ? 'admin' : 'empleado';

      // Guarda en caché para acceso offline futuro
      this.cache.set(`usuario_login_${email}`, {
        idusuario: usuario.idusuario,
        primernombre: usuario.primernombre,
        email: usuario.email,
        role,
        contrasena: usuario.contrasena, // hash, necesario para verificar offline
      });

      return { usuario: { id: usuario.idusuario, nombre: usuario.primernombre, email: usuario.email, role } };
    }

    // ── Modo offline: busca usuario cacheado por email ───────────────────
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
        id:     cachedUser.idusuario,
        nombre: cachedUser.primernombre,
        email:  cachedUser.email,
        role:   cachedUser.role,
      },
      _offline: true,
      _mensaje: 'Sesión iniciada en modo offline.',
    };
  }
}