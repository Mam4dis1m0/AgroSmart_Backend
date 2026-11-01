import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ChatService, SyncMessageInput } from './chat.service';

// IMPORTANTE: conecta aquí el guard JWT real de AgroSmart antes de producción.
// No se importa un guard inventado porque hay que usar el que existe en tu repo.
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('sync')
  // TODO: @UseGuards(YourExistingJwtGuard)
  async sync(@Body() body: { mensajes: SyncMessageInput[] }) {
    if (!body || !Array.isArray(body.mensajes)) {
      return { ok: false, message: 'Se requiere un arreglo mensajes.' };
    }

    return this.chatService.sincronizarMensajes(body.mensajes);
  }
}
