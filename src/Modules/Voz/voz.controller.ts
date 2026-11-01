import { Body, Controller, Post } from '@nestjs/common';
import { Roles, RequiereFuncion } from '../../auth/auth.decorators';
import { InterpretarVozDto } from '../../dto/voz.dto';
import { VozService } from './voz.service';

/**
 * Asistente por voz: convierte lo que dice el administrador en un PLAN de acciones
 * (crear lote → cultivo → tareas). No crea nada: la app muestra el plan, el usuario confirma
 * y la app crea cada cosa con los endpoints normales (con sus permisos y validaciones).
 *
 * Es una función de IA, igual que el chat (Premium). Para abrirla a todas las fincas, quita @RequiereFuncion.
 */
@Controller('api/v1/voz')
@Roles('admin')
@RequiereFuncion('chat_ia')
export class VozController {
  constructor(private readonly voz: VozService) {}

  @Post('interpretar')
  interpretar(@Body() dto: InterpretarVozDto) {
    return this.voz.interpretar(dto);
  }
}
