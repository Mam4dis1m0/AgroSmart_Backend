import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser, Roles, SinFinca } from '../../auth/auth.decorators';
import { AuthUser } from '../../auth/tenant-context';
import {
  CrearHiloDto,
  EnviarMensajeDto,
  ListarMensajesQueryDto,
} from '../../dto/mensajeria.dto';
import { MensajeriaService } from './mensajeria.service';

/**
 * Mensajería del Marketplace: comprador ↔ vendedor, siempre ligada a una oferta.
 *  · Participan 'comprador' y 'admin' (el vendedor es el admin que publicó). El empleado no.
 *  · @SinFinca: el comprador no pertenece a ninguna finca (RNF-20).
 *  · Solo los dos participantes del hilo pueden leerlo o escribir en él.
 */
@Controller('api/v1/mensajeria')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Roles('admin', 'comprador')
@SinFinca()
export class MensajeriaController {
  constructor(private readonly service: MensajeriaService) {}

  /** Botón «Chatear con el vendedor»: crea el hilo o devuelve el que ya existe. */
  @Post('hilos')
  abrirHilo(@Body() dto: CrearHiloDto, @CurrentUser() user: AuthUser) {
    return this.service.abrirHilo(dto, user);
  }

  /** Bandeja de chats (solo hilos con al menos un mensaje). */
  @Get('hilos')
  listarHilos(@CurrentUser() user: AuthUser) {
    return this.service.listarHilos(user);
  }

  // Rutas fijas ANTES de ':id'
  @Get('no-leidos')
  noLeidos(@CurrentUser() user: AuthUser) {
    return this.service.noLeidosTotal(user);
  }

  @Get('hilos/:id')
  detalleHilo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.detalleHilo(id, user);
  }

  @Get('hilos/:id/mensajes')
  mensajes(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListarMensajesQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listarMensajes(id, query, user);
  }

  @Post('hilos/:id/mensajes')
  enviar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnviarMensajeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.enviar(id, dto, user);
  }

  /** Marca como leídos los mensajes que recibí en este hilo. */
  @Patch('hilos/:id/leidos')
  marcarLeidos(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.marcarLeidos(id, user);
  }
}
