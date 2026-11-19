// Envío de SMS (Twilio) y validación de la firma del webhook de SMS entrantes.
//
// Variables de entorno:
//   TWILIO_SID, TWILIO_TOKEN, TWILIO_PHONE   → cuenta y número de AgroSmart
//   SMS_CODIGO_PAIS                           → prefijo para números locales (por defecto 57)
//   SMS_WEBHOOK_URL                           → URL pública exacta configurada en Twilio
//                                               (necesaria para validar la firma)

import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  get configurado(): boolean {
    return !!(
      process.env.TWILIO_SID &&
      process.env.TWILIO_TOKEN &&
      process.env.TWILIO_PHONE
    );
  }

  /** Número de AgroSmart al que los usuarios responden por SMS. */
  get numeroAgroSmart(): string | null {
    return process.env.TWILIO_PHONE ?? null;
  }

  /** Últimos 10 dígitos: así se compara '+57 300…', '300…' y '0057300…' como el mismo número. */
  static clave(telefono: string | null | undefined): string | null {
    const d = String(telefono ?? '').replace(/\D/g, '');
    return d.length >= 7 ? d.slice(-10) : null;
  }

  /** Formato E.164 para Twilio. */
  e164(telefono: string): string | null {
    const crudo = telefono.trim();
    const d = crudo.replace(/\D/g, '');
    if (d.length < 7) return null;
    if (crudo.startsWith('+')) return `+${d}`;
    if (d.startsWith('00')) return `+${d.slice(2)}`;
    const pais = (process.env.SMS_CODIGO_PAIS ?? '57').replace(/\D/g, '');
    return d.length <= 10 ? `+${pais}${d}` : `+${d}`;
  }

  /** Devuelve true si Twilio aceptó el SMS. Nunca lanza. */
  async enviar(telefono: string, texto: string): Promise<boolean> {
    if (!this.configurado) return false;
    const to = this.e164(telefono);
    if (!to) return false;
    const sid = process.env.TWILIO_SID!;
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization:
              'Basic ' +
              Buffer.from(`${sid}:${process.env.TWILIO_TOKEN}`).toString(
                'base64',
              ),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: process.env.TWILIO_PHONE!,
            To: to,
            Body: texto,
          }),
        },
      );
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      return true;
    } catch (err) {
      this.logger.warn(`No se pudo enviar SMS: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Firma de Twilio: HMAC-SHA1(token, URL + concatenación de clave+valor ordenados por clave),
   * en base64, comparada con la cabecera X-Twilio-Signature.
   */
  firmaValida(
    firma: string | undefined,
    url: string,
    params: Record<string, string>,
  ): boolean {
    const token = process.env.TWILIO_TOKEN;
    if (!token || !firma) return false;
    const datos =
      url +
      Object.keys(params)
        .sort()
        .map((k) => k + (params[k] ?? ''))
        .join('');
    const esperada = Buffer.from(
      createHmac('sha1', token).update(datos, 'utf8').digest('base64'),
    );
    const recibida = Buffer.from(firma);
    return (
      esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
    );
  }
}
