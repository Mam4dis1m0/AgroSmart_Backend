import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

// Datos para el correo de stock bajo
export interface InfoStockBajoEmail {
  nombreInsumo:  string;
  tipo?:         string | null;
  stockActual:   number;
  stockMinimo:   number;
  unidadMedida?: string | null;
  cantidadUsada: number;
}

// Datos extra que se incluirán en el correo de tarea asignada
export interface InfoTareaEmail {
  nombreTarea:        string;
  fechaProgramada?:   string | null;
  cultivo?:           string | null;
  lote?:              string | null;
  descripcion?:       string | null;
  pagoacordado?:      number | null;
  nombreAdmin?:       string | null;
  tiempototal?:       number | null;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailerService: MailerService) {}

  // ── Tarea asignada → email al empleado ────────────────────────────────────
  // FIX #3: ahora recibe InfoTareaEmail con todos los detalles relevantes
  async notificarTareaAsignada(emailEmpleado: string, info: InfoTareaEmail) {
    const {
      nombreTarea,
      fechaProgramada,
      cultivo,
      lote,
      descripcion,
      pagoacordado,
      nombreAdmin,
      tiempototal,
    } = info;

    // Construye filas opcionales para la tabla de detalles
    const filaOpcional = (icono: string, etiqueta: string, valor: string | null | undefined) =>
      valor
        ? `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:140px;">${icono} ${etiqueta}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#111827;font-size:13px;font-weight:600;">${valor}</td>
           </tr>`
        : '';

    const detalles = [
      filaOpcional('📅', 'Fecha programada', fechaProgramada
        ? new Date(fechaProgramada).toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : null),
      filaOpcional('🌿', 'Cultivo',    cultivo),
      filaOpcional('🗺️', 'Lote',       lote),
      filaOpcional('📝', 'Descripción', descripcion),
      filaOpcional('⏱️', 'Tiempo estimado', tiempototal ? `${tiempototal} h` : null),
      filaOpcional('💵', 'Pago acordado',   pagoacordado != null ? `$${pagoacordado.toLocaleString('es-CO')}` : null),
      filaOpcional('👤', 'Asignada por',    nombreAdmin),
    ].filter(Boolean).join('');

    try {
      await this.mailerService.sendMail({
        to:      emailEmpleado,
        subject: '📋 Nueva tarea asignada — AgroSmart',
        headers: {
          'X-Priority':       '1',
          'X-MSMail-Priority': 'High',
          'Importance':        'High',
          'Precedence':        'bulk',
        },
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px;">
            <div style="background:#16a34a;border-radius:10px;padding:28px;text-align:center;margin-bottom:24px;">
              <h1 style="color:#fff;margin:0;font-size:22px;">🌱 AgroSmart</h1>
              <p style="color:#bbf7d0;margin:6px 0 0;font-size:14px;">Sistema de Gestión Agrícola</p>
            </div>

            <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e5e7eb;">
              <h2 style="color:#111827;font-size:18px;margin:0 0 8px;">📋 Tienes una nueva tarea asignada</h2>
              <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Se te ha asignado la siguiente actividad en el sistema.</p>

              <!-- Nombre de la tarea -->
              <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;padding:16px;margin-bottom:20px;">
                <p style="margin:0;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Actividad</p>
                <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#15803d;">${nombreTarea}</p>
              </div>

              <!-- Tabla de detalles -->
              ${detalles ? `
              <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                ${detalles}
              </table>` : ''}

              <div style="text-align:center;">
                <a href="${process.env.FRONTEND_URL ?? 'http://localhost:5173'}"
                   style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
                  Ver mis tareas →
                </a>
              </div>
            </div>

            <p style="text-align:center;color:#9ca3af;font-size:12px;margin:20px 0 0;">
              AgroSmart · agrosmart346@gmail.com
            </p>
          </div>
        `,
      });
      this.logger.log(`✅ Email tarea asignada enviado a ${emailEmpleado}`);
    } catch (err) {
      this.logger.error(`❌ Error enviando email a ${emailEmpleado}: ${err.message}`);
    }
  }

  // ── Tarea completada → email al admin ─────────────────────────────────────
  async notificarTareaCompletada(
    emailAdmin: string,
    nombreTarea: string,
    nombreEmpleado: string,
  ) {
    try {
      await this.mailerService.sendMail({
        to:      emailAdmin,
        subject: `✅ Tarea completada por ${nombreEmpleado} — AgroSmart`,
        headers: {
          'X-Priority':       '1',
          'X-MSMail-Priority': 'High',
          'Importance':        'High',
          'Precedence':        'bulk',
        },
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px;">
            <div style="background:#16a34a;border-radius:10px;padding:28px;text-align:center;margin-bottom:24px;">
              <h1 style="color:#fff;margin:0;font-size:22px;">🌱 AgroSmart</h1>
              <p style="color:#bbf7d0;margin:6px 0 0;font-size:14px;">Sistema de Gestión Agrícola</p>
            </div>
            <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e5e7eb;">
              <h2 style="color:#111827;font-size:18px;margin:0 0 8px;">✅ Tarea completada</h2>
              <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">
                El empleado <strong style="color:#111827;">${nombreEmpleado}</strong> ha marcado como completada la siguiente tarea:
              </p>
              <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;padding:16px;margin-bottom:24px;">
                <p style="margin:0;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Tarea</p>
                <p style="margin:6px 0 0;font-size:18px;font-weight:700;color:#15803d;">${nombreTarea}</p>
              </div>
              <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:14px;margin-bottom:20px;">
                <p style="margin:0;font-size:13px;color:#92400e;">
                  ⏰ Completada el <strong>${new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                </p>
              </div>
              <div style="text-align:center;">
                <a href="${process.env.FRONTEND_URL ?? 'http://localhost:5173'}"
                   style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
                  Ver en el sistema →
                </a>
              </div>
            </div>
            <p style="text-align:center;color:#9ca3af;font-size:12px;margin:20px 0 0;">
              AgroSmart · agrosmart346@gmail.com
            </p>
          </div>
        `,
      });
      this.logger.log(`✅ Email tarea completada enviado a admin ${emailAdmin}`);
    } catch (err) {
      this.logger.error(`❌ Error enviando email al admin ${emailAdmin}: ${err.message}`);
    }
  }

  // ── Stock bajo → email al admin ───────────────────────────────────────────
  async notificarStockBajo(emailAdmin: string, info: InfoStockBajoEmail) {
    const { nombreInsumo, tipo, stockActual, stockMinimo, unidadMedida, cantidadUsada } = info;
    const unidad = unidadMedida ?? '';
    const porcentaje = stockMinimo > 0 ? Math.round((stockActual / stockMinimo) * 100) : 0;
    const colorBarra = stockActual <= 0 ? '#dc2626' : '#f59e0b';

    try {
      await this.mailerService.sendMail({
        to:      emailAdmin,
        subject: `⚠️ Stock bajo: ${nombreInsumo} — AgroSmart`,
        headers: {
          'X-Priority':        '1',
          'X-MSMail-Priority': 'High',
          'Importance':        'High',
          'Precedence':        'bulk',
        },
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px;">
            <div style="background:#16a34a;border-radius:10px;padding:28px;text-align:center;margin-bottom:24px;">
              <h1 style="color:#fff;margin:0;font-size:22px;">🌱 AgroSmart</h1>
              <p style="color:#bbf7d0;margin:6px 0 0;font-size:14px;">Sistema de Gestión Agrícola</p>
            </div>
            <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e5e7eb;">
              <div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px;padding:16px;margin-bottom:20px;">
                <h2 style="color:#991b1b;font-size:17px;margin:0 0 4px;">⚠️ Alerta de stock bajo</h2>
                <p style="color:#7f1d1d;font-size:13px;margin:0;">Un insumo ha caído por debajo del stock mínimo configurado.</p>
              </div>
              <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;padding:16px;margin-bottom:20px;">
                <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Insumo</p>
                <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#15803d;">${nombreInsumo}</p>
                ${tipo ? `<p style="margin:2px 0 0;font-size:13px;color:#6b7280;">Tipo: ${tipo}</p>` : ''}
              </div>
              <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:10px 14px;background:#fef2f2;color:#991b1b;font-size:13px;width:50%;border-right:1px solid #e5e7eb;">
                    📉 Stock actual
                    <div style="font-size:22px;font-weight:700;color:#dc2626;margin-top:4px;">${stockActual} ${unidad}</div>
                  </td>
                  <td style="padding:10px 14px;background:#f9fafb;color:#6b7280;font-size:13px;">
                    🎯 Stock mínimo
                    <div style="font-size:22px;font-weight:700;color:#374151;margin-top:4px;">${stockMinimo} ${unidad}</div>
                  </td>
                </tr>
              </table>
              <div style="margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280;margin-bottom:4px;">
                  <span>Nivel de stock</span><span>${porcentaje}% del mínimo</span>
                </div>
                <div style="background:#e5e7eb;border-radius:99px;height:10px;overflow:hidden;">
                  <div style="background:${colorBarra};height:10px;width:${Math.min(porcentaje, 100)}%;border-radius:99px;"></div>
                </div>
              </div>
              <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:14px;margin-bottom:20px;">
                <p style="margin:0;font-size:13px;color:#92400e;">
                  🔻 Se descontaron <strong>${cantidadUsada} ${unidad}</strong> al registrar el uso en una tarea.<br>
                  ⏰ Fecha: <strong>${new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                </p>
              </div>
              <p style="font-size:14px;color:#374151;margin:0 0 20px;">Por favor realiza una nueva compra o ajusta el stock mínimo desde el sistema.</p>
              <div style="text-align:center;">
                <a href="${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/insumos"
                   style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
                  Ver inventario →
                </a>
              </div>
            </div>
            <p style="text-align:center;color:#9ca3af;font-size:12px;margin:20px 0 0;">AgroSmart · agrosmart346@gmail.com</p>
          </div>
        `,
      });
      this.logger.log(`✅ Email stock bajo enviado a ${emailAdmin} — insumo: ${nombreInsumo}`);
    } catch (err) {
      this.logger.error(`❌ Error enviando email de stock bajo: ${err.message}`);
    }
  }


  // ── Recuperación de contraseña → email al usuario ─────────────────────────
  async enviarRecuperacionPassword(email: string, token: string, nombre: string) {
    const resetUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/reset-password?token=${token}`;
    try {
      await this.mailerService.sendMail({
        to:      email,
        subject: '🔑 Recuperación de contraseña — AgroSmart',
        headers: {
          'X-Priority':        '1',
          'X-MSMail-Priority': 'High',
          'Importance':        'High',
        },
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px;">
            <div style="background:#16a34a;border-radius:10px;padding:28px;text-align:center;margin-bottom:24px;">
              <h1 style="color:#fff;margin:0;font-size:22px;">🌱 AgroSmart</h1>
              <p style="color:#bbf7d0;margin:6px 0 0;font-size:14px;">Sistema de Gestión Agrícola</p>
            </div>
            <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e5e7eb;">
              <h2 style="color:#111827;font-size:18px;margin:0 0 8px;">🔑 Restablecer tu contraseña</h2>
              <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">
                Hola <strong style="color:#111827;">${nombre}</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta.
              </p>
              <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">
                Haz clic en el botón de abajo para crear una nueva contraseña. Este enlace es válido por <strong>30 minutos</strong>.
              </p>
              <div style="text-align:center;margin-bottom:24px;">
                <a href="${resetUrl}"
                   style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">
                  Restablecer contraseña →
                </a>
              </div>
              <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:14px;">
                <p style="margin:0;font-size:13px;color:#92400e;">
                  ⚠️ Si no solicitaste esto, ignora este correo. Tu contraseña no cambiará.
                </p>
              </div>
            </div>
            <p style="text-align:center;color:#9ca3af;font-size:12px;margin:20px 0 0;">
              AgroSmart · agrosmart346@gmail.com
            </p>
          </div>
        `,
      });
      this.logger.log(`✅ Email recuperación contraseña enviado a ${email}`);
    } catch (err) {
      this.logger.error(`❌ Error enviando email de recuperación a ${email}: ${err.message}`);
    }
  }

  // ── SMS fallback (sin internet) ───────────────────────────────────────────
  async enviarSmsFallback(telefono: string, mensaje: string) {
    try {
      const accountSid = process.env.TWILIO_SID;
      const authToken  = process.env.TWILIO_TOKEN;
      const from       = process.env.TWILIO_PHONE;

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type':  'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ From: from!, To: telefono, Body: mensaje }),
        }
      );

      if (!response.ok) throw new Error(await response.text());
      this.logger.log(`✅ SMS enviado a ${telefono}`);
    } catch (err) {
      this.logger.error(`❌ Error enviando SMS a ${telefono}: ${err.message}`);
    }
  }

  async notificarTareaCompletadaConEvidencia(
  emailAdmin: string, idTarea: number, tipoactividad: string,
  nombreEmpleado: string, lote: string, fechaprogramada: string,
  observaciones: string, pdfBuffer: Buffer,
) {
  try {
    await this.mailerService.sendMail({
      to: emailAdmin,
      subject: `✅ Tarea #${idTarea} completada — ${tipoactividad}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px;">
          <div style="background:#16a34a;border-radius:10px;padding:28px;text-align:center;margin-bottom:24px;">
            <h1 style="color:#fff;margin:0;font-size:22px;">🌱 AgroSmart</h1>
          </div>
          <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e5e7eb;">
            <h2 style="color:#111827;font-size:18px;">✅ Tarea completada con evidencia</h2>
            <p>El empleado <strong>${nombreEmpleado}</strong> completó la tarea <strong>${tipoactividad}</strong>.</p>
            <p style="color:#6b7280;font-size:13px;">Adjunto encontrarás el reporte PDF con la evidencia fotográfica.</p>
          </div>
        </div>
      `,
      attachments: [{
        filename: `reporte_tarea_${idTarea}_${Date.now()}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    });
    this.logger.log(`✅ Email con evidencia enviado a ${emailAdmin}`);
  } catch (err) {
    this.logger.error(`❌ Error enviando email con evidencia: ${(err as Error).message}`);
  }
}
}