import { SyncService } from './sync.service';

/** SyncService sin tocar base de datos: solo se prueba cómo reacciona isOnline(). */
const crearServicio = () =>
  new SyncService({} as any, {} as any, {} as any, {} as any);

describe('SyncService.isOnline', () => {
  afterEach(() => jest.restoreAllMocks());

  it('si ya estaba online responde de inmediato y verifica la conexión en segundo plano', async () => {
    const svc: any = crearServicio();
    svc._online = true;
    const chequeo = jest.spyOn(svc, 'checkConnection').mockResolvedValue(true);

    expect(await svc.isOnline()).toBe(true);
    expect(chequeo).toHaveBeenCalledTimes(1);
  });

  it('si el chequeo en segundo plano falla no deja una promesa rechazada sin atender', async () => {
    const svc: any = crearServicio();
    svc._online = true;
    jest.spyOn(svc, 'checkConnection').mockRejectedValue(new Error('boom'));
    const aviso = jest
      .spyOn(svc.logger, 'warn')
      .mockImplementation(() => undefined);
    const sinAtender = jest.fn();
    process.on('unhandledRejection', sinAtender);

    try {
      // La respuesta no espera al chequeo: sigue siendo la del último estado conocido
      expect(await svc.isOnline()).toBe(true);
      await new Promise((r) => setImmediate(r)); // deja correr la tarea de fondo
      await new Promise((r) => setImmediate(r));

      expect(aviso).toHaveBeenCalledWith(expect.stringContaining('boom'));
      expect(sinAtender).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', sinAtender);
    }
  });

  it('si el chequeo en segundo plano dice que se perdió la conexión, pasa a offline', async () => {
    const svc: any = crearServicio();
    svc._online = true;
    jest.spyOn(svc, 'checkConnection').mockResolvedValue(false);

    await svc.isOnline();
    await new Promise((r) => setImmediate(r));

    expect(svc._online).toBe(false);
  });
});
