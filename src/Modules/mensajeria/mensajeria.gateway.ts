// Socket.IO — SOLO empuja eventos al cliente (mensaje nuevo, leído). Enviar y leer
// siguen siendo REST, así hay un único camino de escritura con todas las validaciones.
//
// Conexión (Flutter / web):  namespace  /mercado   con   auth: { token: '<JWT>' }
// Eventos del servidor:
//   listo          { idusuario }
//   mensaje:nuevo  { idhilo, mensaje: { idmensaje, idremitente, contenido, created_at, leido_at } }
//   mensaje:leido  { idhilo, hasta, por }     ← el otro leyó todo hasta ese idmensaje
//   error:auth     { message }                ← justo antes de cerrar la conexión
//
// El guard global de Nest solo cubre HTTP, por eso aquí se valida el JWT a mano.

import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { SesionService } from '../../auth/sesion.service';
import { TokenService } from '../../auth/token.service';

const sala = (idusuario: number) => `usuario:${idusuario}`;
const MAX_TIMEOUT_MS = 2_000_000_000; // setTimeout no admite más de ~24,8 días

@WebSocketGateway({
  namespace: '/mercado',
  cors: {
    // Misma regla que main.ts: apps móviles (sin Origin), localhost y FRONTEND_URL
    origin: (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
      const extra = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];
      const ok = !origin || /^http:\/\/localhost:\d+$/.test(origin) || extra.includes(origin);
      cb(ok ? null : new Error('No permitido por CORS'), ok);
    },
    credentials: true,
  },
})
export class MensajeriaGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(MensajeriaGateway.name);

  @WebSocketServer() private server: Namespace;

  constructor(
    private readonly tokens: TokenService,
    private readonly sesiones: SesionService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extraerToken(client);
      const user = this.tokens.verify(token);

      if (user.rol === 'empleado') throw new Error('Tu rol no tiene acceso a la mensajería');
      const activa = await this.sesiones.estaActiva(user.idusuario, user.rol === 'comprador' ? null : user.idfinca);
      if (!activa) throw new Error('Cuenta inactiva o sin acceso');

      client.data.idusuario = user.idusuario;
      await client.join(sala(user.idusuario));

      // Al vencer el JWT se corta la conexión (verify() solo corre al conectar)
      const exp = this.expiracionMs(token);
      if (exp !== null) {
        client.data.timer = setTimeout(() => client.disconnect(true), Math.min(Math.max(exp - Date.now(), 0), MAX_TIMEOUT_MS));
      }

      client.emit('listo', { idusuario: user.idusuario });
    } catch (err) {
      const message = (err as Error)?.message ?? 'No autorizado';
      this.logger.warn(`Conexión rechazada (${client.id}): ${message}`);
      client.emit('error:auth', { message });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data?.timer) clearTimeout(client.data.timer);
  }

  /** Lo usa MensajeriaService. Funciona aunque el usuario tenga varios dispositivos conectados. */
  emitirAUsuario(idusuario: number, evento: string, payload: unknown): void {
    this.server?.to(sala(idusuario)).emit(evento, payload);
  }

  private extraerToken(client: Socket): string {
    // Solo handshake.auth o cabecera Authorization; nunca por query-string (queda en los logs)
    const crudo = client.handshake.auth?.token ?? client.handshake.headers?.authorization ?? '';
    const token = String(crudo).replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new Error('Falta el token de autenticación');
    return token;
  }

  private expiracionMs(token: string): number | null {
    try {
      const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      return typeof exp === 'number' ? exp * 1000 : null;
    } catch {
      return null;
    }
  }
}
