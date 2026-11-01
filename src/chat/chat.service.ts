import { Injectable } from '@nestjs/common';

export type SyncMessageInput = {
  idMensaje: string;
  telefonoDestino: string;
  texto: string;
  canal: 'SMS' | 'INTERNET';
  fecha: string;
};

@Injectable()
export class ChatService {
  // DEMO únicamente: se pierde al reiniciar. Reemplazar por repositorio/ORM
  // y una restricción UNIQUE sobre idMensaje antes de usar con datos reales.
  private readonly messages = new Map<string, SyncMessageInput>();

  async sincronizarMensajes(mensajes: SyncMessageInput[]) {
    let nuevos = 0;
    let duplicados = 0;

    for (const mensaje of mensajes) {
      if (
        !mensaje ||
        typeof mensaje.idMensaje !== 'string' ||
        !mensaje.idMensaje.trim() ||
        typeof mensaje.telefonoDestino !== 'string' ||
        typeof mensaje.texto !== 'string' ||
        !['SMS', 'INTERNET'].includes(mensaje.canal) ||
        typeof mensaje.fecha !== 'string' ||
        Number.isNaN(Date.parse(mensaje.fecha))
      ) {
        continue;
      }

      if (this.messages.has(mensaje.idMensaje)) {
        duplicados++;
        continue;
      }

      this.messages.set(mensaje.idMensaje, mensaje);
      nuevos++;
    }

    return {
      ok: true,
      recibidos: mensajes.length,
      nuevos,
      duplicados,
      nota: 'Almacenamiento temporal de demostración; conectar a la base de datos real.',
    };
  }
}
