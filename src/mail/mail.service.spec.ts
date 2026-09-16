import { Test, TestingModule } from '@nestjs/testing';
import { MailerService } from '@nestjs-modules/mailer';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;

  const mockMailerService = {
    sendMail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MailerService, useValue: mockMailerService },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // TODO: agrega aquí los tests de cada método de MailService, por ejemplo:
  // it('debería llamar a mailerService.sendMail con los parámetros correctos', async () => {
  //   await service.sendWelcomeEmail('correo@ejemplo.com', 'Juan');
  //   expect(mockMailerService.sendMail).toHaveBeenCalledWith(
  //     expect.objectContaining({ to: 'correo@ejemplo.com' }),
  //   );
  // });
});
