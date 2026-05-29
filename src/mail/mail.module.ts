import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: config.get('MAIL_USER'),
            pass: config.get('MAIL_PASS'),
          },
        },
        defaults: {
          from: `"AgroSmart" <${config.get('MAIL_USER')}>`,
          // Headers que Gmail usa para clasificar como importante
          headers: {
            'X-Priority': '1',
            'X-MSMail-Priority': 'High',
            'Importance': 'High',
          },
        },
      }),
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}