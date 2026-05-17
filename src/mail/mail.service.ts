import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  // Cuando admin asigna una tarea → le llega al empleado
  async notificarTareaAsignada(emailEmpleado: string, nombreTarea: string) {
    await this.mailerService.sendMail({
      to: emailEmpleado,
      subject: '📋 Nueva tarea asignada — AgroSmart',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px; border-radius: 12px;">
        
        <div style="background: #16a34a; border-radius: 10px; padding: 28px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">🌱 AgroSmart</h1>
          <p style="color: #bbf7d0; margin: 6px 0 0; font-size: 14px;">Sistema de Gestión Agrícola</p>
        </div>

        <div style="background: #ffffff; border-radius: 10px; padding: 28px; border: 1px solid #e5e7eb;">
          <h2 style="color: #111827; font-size: 18px; margin: 0 0 8px;">📋 Tienes una nueva tarea asignada</h2>
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">Se te ha asignado la siguiente actividad en el sistema.</p>

          <div style="background: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Actividad</p>
            <p style="margin: 6px 0 0; font-size: 18px; font-weight: 700; color: #15803d;">${nombreTarea}</p>
          </div>

          <p style="color: #374151; font-size: 14px; margin: 0 0 20px;">
            Ingresa a la aplicación para ver todos los detalles, fecha programada y más información sobre esta tarea.
          </p>

          <div style="text-align: center;">
            <a href="http://localhost:5173" style="display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
              Ver mis tareas →
            </a>
          </div>
        </div>

        <p style="text-align: center; color: #9ca3af; font-size: 12px; margin: 20px 0 0;">
          Este correo fue enviado automáticamente por AgroSmart. Por favor no respondas este mensaje.
        </p>

      </div>
    `,
  });
  }

  // Cuando empleado termina una tarea → le llega al admin
  async notificarTareaCompletada(emailAdmin: string, nombreTarea: string, nombreEmpleado: string) {
    await this.mailerService.sendMail({
      to: emailAdmin,
      subject: '📋 Tarea completada — AgroSmart',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px; border-radius: 12px;">
        
        <div style="background: #16a34a; border-radius: 10px; padding: 28px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">🌱 AgroSmart</h1>
          <p style="color: #bbf7d0; margin: 6px 0 0; font-size: 14px;">Sistema de Gestión Agrícola</p>
        </div>

        <div style="background: #ffffff; border-radius: 10px; padding: 28px; border: 1px solid #e5e7eb;">
          <h2 style="color: #111827; font-size: 18px; margin: 0 0 8px;">📋 Tarea completada</h2>
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">El empleado <strong>${nombreEmpleado}</strong> ha completado la tarea <strong>${nombreTarea}</strong>.</p>
        </div>

        <p style="text-align: center; color: #9ca3af; font-size: 12px; margin: 20px 0 0;">
          Este correo fue enviado automáticamente por AgroSmart. Por favor no respondas este mensaje.
        </p>

      </div>
    `,
    });
  }
}