import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { TenantContext } from '../../auth/tenant-context';
import { TareaEvidenciaService } from './tarea-evidencia.service';

@Controller('api/v1/tareas')
export class TareaEvidenciaController {
  constructor(private readonly service: TareaEvidenciaService) {}

  @Get(':id/evidencias')
  listar(@Param('id', ParseIntPipe) id: number) {
    return this.service.listar(
      TenantContext.requireFinca(),
      id,
      TenantContext.requireUser(),
    );
  }

  /** Agrega una foto a la tarea (por ejemplo, avance del trabajo) sin completarla. */
  @Post(':id/evidencias')
  @UseInterceptors(
    FileInterceptor('evidencia', {
      storage: diskStorage({
        destination: './uploads/evidencias',
        filename: (_req, file, cb) =>
          cb(null, `${Date.now()}-${file.originalname}`),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async agregar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { observaciones?: string; idasigtarea?: string },
    @UploadedFile() file?: any,
  ) {
    if (!file?.path)
      throw new BadRequestException('Falta la foto (campo "evidencia")');
    const fs = await import('fs');
    try {
      return await this.service.registrar(
        TenantContext.requireFinca(),
        id,
        TenantContext.requireUser(),
        file.path,
        {
          observaciones: body?.observaciones,
          idasigtarea: body?.idasigtarea ? Number(body.idasigtarea) : null,
        },
      );
    } finally {
      fs.unlink(file.path, () => {});
    }
  }

  /** Elimina una foto de evidencia (el admin cualquiera de la finca; el empleado, solo la suya). */
  @Delete(':id/evidencias/:idevidencia')
  eliminar(
    @Param('id', ParseIntPipe) id: number,
    @Param('idevidencia', ParseIntPipe) idevidencia: number,
  ) {
    return this.service.eliminar(
      TenantContext.requireFinca(),
      id,
      idevidencia,
      TenantContext.requireUser(),
    );
  }
}
