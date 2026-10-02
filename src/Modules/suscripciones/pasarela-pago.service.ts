// src/Modules/suscripciones/pasarela-pago.service.ts
//
// ⚠️ PASARELA SIMULADA. RNF-18 exige "mecanismos de seguridad certificados" para
// suscripciones, listados destacados y comisiones; eso significa integrar un proveedor
// real (Wompi, ePayco, Mercado Pago, Stripe...). Mientras tanto este servicio aprueba
// los cobros SOLO en desarrollo, para poder probar el flujo completo.
//
// En producción (NODE_ENV=production) se niega a cobrar a menos que declares
// explícitamente PAGOS_SIMULADOS=true: así nadie obtiene Premium gratis por accidente.
//
// Para integrar un proveedor, reemplaza el cuerpo de cobrar() manteniendo la firma.

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export interface ResultadoCobro {
  aprobado: boolean;
  proveedor: string;
  referencia: string;
  motivo?: string;
}

@Injectable()
export class PasarelaPagoService {
  private readonly logger = new Logger(PasarelaPagoService.name);

  async cobrar(
    monto: number,
    moneda: string,
    concepto: string,
    _meta: Record<string, unknown> = {},
  ): Promise<ResultadoCobro> {
    const esProduccion = process.env.NODE_ENV === 'production';
    if (esProduccion && process.env.PAGOS_SIMULADOS !== 'true') {
      throw new ServiceUnavailableException(
        'La pasarela de pagos aún no está configurada en este entorno',
      );
    }

    this.logger.warn(`💳 [SIMULADO] Cobro aprobado: ${monto} ${moneda} — ${concepto}`);
    return { aprobado: true, proveedor: 'SIMULADO', referencia: `SIM-${Date.now()}` };
  }
}
