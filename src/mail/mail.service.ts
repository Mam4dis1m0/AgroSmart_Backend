import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailerService: MailerService) {}

  // ── Tarea asignada → email al empleado ────────────────────────────────────
  async notificarTareaAsignada(emailEmpleado: string, nombreTarea: string) {
    try {
      await this.mailerService.sendMail({
        to: emailEmpleado,
        subject: '📋 Nueva tarea asignada — AgroSmart',
        headers: {
          'X-Priority': '1',
          'X-MSMail-Priority': 'High',
          'Importance': 'High',
          'Precedence': 'bulk',
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
              <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;padding:16px;margin-bottom:24px;">
                <p style="margin:0;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Actividad</p>
                <p style="margin:6px 0 0;font-size:18px;font-weight:700;color:#15803d;">${nombreTarea}</p>
              </div>
              <div style="text-align:center;">
                <a href="http://localhost:5173" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
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
        to: emailAdmin,
        subject: `✅ Tarea completada por ${nombreEmpleado} — AgroSmart`,
        headers: {
          'X-Priority': '1',
          'X-MSMail-Priority': 'High',
          'Importance': 'High',
          'Precedence': 'bulk',
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
                  ⏰ Completada el <strong>${new Date().toLocaleDateString('es-CO', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</strong>
                </p>
              </div>
              <div style="text-align:center;">
                <a href="http://localhost:5173" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
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
    } catch (error) {
     this.logger.error(`❌ Error enviando email stock bajo a ${emailAdmin}: ${(error as Error).message}`);
    }
  }
  async enviarRecuperacionPassword(email: string, token: string, nombre: string) {
  const enlace = `http://localhost:5173/reset-password?token=${token}`;
  try {
    await this.mailerService.sendMail({
      to: email,
      subject: '🔑 Recupera tu contraseña — AgroSmart',
      headers: { 'X-Priority': '1', 'Importance': 'High' },
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px;">
          <div style="background:linear-gradient(135deg,#15803d,#16a34a);border-radius:12px;padding:32px;text-align:center;margin-bottom:24px;">
            <h1 style="color:#fff;margin:0;font-size:26px;">🌱 AgroSmart</h1>
            <p style="color:#bbf7d0;margin:6px 0 0;font-size:14px;">Sistema de Gestión Agrícola</p>
          </div>
          <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e5e7eb;">
            <h2 style="color:#111827;font-size:20px;margin:0 0 8px;">🔑 Recupera tu contraseña</h2>
            <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">
              Hola <strong style="color:#111827;">${nombre}</strong>, haz clic en el botón para restablecer tu contraseña.
              Este enlace expira en <strong>30 minutos</strong>.
            </p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${enlace}" style="display:inline-block;background:linear-gradient(135deg,#15803d,#16a34a);color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:700;">
                Restablecer contraseña →
              </a>
            </div>
            <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:14px;">
              <p style="margin:0;font-size:12px;color:#92400e;">
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
    this.logger.log(`✅ Correo de recuperación enviado a ${email}`);
  } catch (err) {
    this.logger.error(`❌ Error enviando correo de recuperación: ${err.message}`);
  }
}

 async notificarStockBajo(emailAdmin: string, nombreInsumo: string, stockActual: number, stockMinimo: number, unidad: string) {
  try {
    await this.mailerService.sendMail({
      to: emailAdmin,
      subject: '⚠️ Stock bajo de insumo — AgroSmart',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px; border-radius: 12px;">
        
        <div style="background: #16a34a; border-radius: 10px; padding: 28px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">🌱 AgroSmart</h1>
          <p style="color: #bbf7d0; margin: 6px 0 0; font-size: 14px;">Sistema de Gestión Agrícola</p>
        </div>

        <div style="background: #ffffff; border-radius: 10px; padding: 28px; border: 1px solid #e5e7eb;">
          <h2 style="color: #111827; font-size: 18px; margin: 0 0 8px;">⚠️ Stock bajo detectado</h2>
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">Un insumo ha bajado por debajo del stock mínimo requerido.</p>

          <div style="background: #fef9c3; border-left: 4px solid #ca8a04; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
            <p style="margin: 0; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Insumo</p>
            <p style="margin: 6px 0 0; font-size: 18px; font-weight: 700; color: #92400e;">${nombreInsumo}</p>
          </div>

          <div style="display: flex; gap: 12px; margin-bottom: 24px;">
            <div style="flex: 1; background: #fee2e2; border-radius: 8px; padding: 14px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">Stock actual</p>
              <p style="margin: 6px 0 0; font-size: 22px; font-weight: 700; color: #dc2626;">${stockActual} ${unidad}</p>
            </div>
            <div style="flex: 1; background: #f0fdf4; border-radius: 8px; padding: 14px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">Stock mínimo</p>
              <p style="margin: 6px 0 0; font-size: 22px; font-weight: 700; color: #16a34a;">${stockMinimo} ${unidad}</p>
            </div>
          </div>

          <p style="color: #374151; font-size: 14px; margin: 0 0 20px;">
            Se recomienda reabastecer este insumo lo antes posible para no interrumpir las operaciones.
          </p>

          <div style="text-align: center;">
            <a href="http://localhost:5173" style="display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
              Ver insumos →
            </a>
          </div>
        </div>

        <p style="text-align: center; color: #9ca3af; font-size: 12px; margin: 20px 0 0;">
          Este correo fue enviado automáticamente por AgroSmart. Por favor no respondas este mensaje.
        </p>
      </div>
    `,
  });
    this.logger.log(`✅ Email stock bajo enviado a ${emailAdmin}`);
  } catch (error) {
    this.logger.error(`❌ Error enviando email stock bajo a ${emailAdmin}: ${(error as Error).message}`);
  }
}
}
