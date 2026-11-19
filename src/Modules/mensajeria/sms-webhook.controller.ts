// Webhook de Twilio: SMS que un usuario SIN INTERNET envía al número de AgroSmart.
// Configurar en Twilio → Phone Number → "A message comes in" → POST {SMS_WEBHOOK_URL}
//
// Formato del SMS:   #<idhilo> texto      (p. ej. "#42 ¿Todavía tiene el café?")
// Sin "#id" se usa la conversación más reciente de ese número.

import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Public } from '../../auth/auth.decorators';
import { MensajeriaService } from './mensajeria.service';
import { SmsService } from './sms.service';

const escaparXml = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
      })[c]!,
  );

@Controller('api/v1/mensajeria/sms')
export class SmsWebhookController {
  constructor(
    private readonly service: MensajeriaService,
    private readonly sms: SmsService,
  ) {}

  @Public()
  @Post('entrante')
  @HttpCode(200)
  async entrante(
    @Body() body: Record<string, string>,
    @Headers('x-twilio-signature') firma: string | undefined,
    @Req() req: any,
    @Res() res: any,
  ) {
    const url =
      process.env.SMS_WEBHOOK_URL ??
      `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    if (!this.sms.firmaValida(firma, url, body ?? {})) {
      throw new ForbiddenException('Firma inválida');
    }

    const respuesta = await this.service.recibirSms(
      body.From,
      body.Body,
      body.MessageSid,
    );
    const twiml = respuesta
      ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaparXml(respuesta)}</Message></Response>`
      : '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
    res.type('text/xml').send(twiml);
  }
}
