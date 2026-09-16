# Guía de corrección de tests — AgroSmart_Backend

## Qué pasaba

Los 29 tests fallaban porque cada `TestingModule` se creaba sin mockear las
dependencias del constructor (Repository de TypeORM + `CacheService`,
`OfflineQueueService`, `SyncService`, y en algunos casos `MailService` o
repositorios de otras entidades). Nest no podía instanciar la clase y
`.compile()` lanzaba la excepción antes de que el test corriera.

## Qué incluye este paquete

- `test/mocks/common-providers.mock.ts` — mocks reutilizables para
  `CacheService`, `OfflineQueueService`, `SyncService`, `MailService` y un
  factory `createMockRepository()` para simular cualquier Repository.
- `Modules/cultivos/cultivos.controller.spec.ts` y
  `Modules/cultivos/cultivos.service.spec.ts` — ejemplo completo ya corregido.
- `Modules/tareas/tareas.service.spec.ts` — ejemplo del caso más complejo
  (múltiples repositorios + MailService).
- `mail/mail.service.spec.ts` — ejemplo mockeando `MailerService`.
- `templates/controller.spec.template.ts` y
  `templates/service.spec.template.ts` — plantillas para que repliques el
  patrón en los módulos restantes.

## Mapeo de dependencias por módulo (según tu log)

| Archivo | Dependencias a mockear |
|---|---|
| `usuarios.controller.spec.ts` | `UsuariosService` |
| `notificaciones.controller.spec.ts` | `NotificacionesService` |
| `asignacion-tarea.controller.spec.ts` | `AsignacionTareaService` |
| `empleado-cosecha.controller.spec.ts` | `EmpleadoCosechaService` |
| `administrador.controller.spec.ts` | `AdministradorService` |
| `produccion-palma.controller.spec.ts` | `ProduccionPalmaService` |
| `cultivos.controller.spec.ts` | `CultivosService` ✅ (incluido) |
| `empleado.controller.spec.ts` | `EmpleadoService` |
| `auditoria.controller.spec.ts` | `AuditoriaService` |
| `lotes.controller.spec.ts` | `LotesService` |
| `palmas.controller.spec.ts` | `PalmasService` |
| `insumos.controller.spec.ts` | `InsumosService` |
| `tareas.controller.spec.ts` | `TareasService` |
| `palmas.service.spec.ts` | `PalmaRepository`, `CacheService`, `OfflineQueueService`, `SyncService` |
| `administrador.service.spec.ts` | `AdministradorRepository`, `CacheService`, `OfflineQueueService`, `SyncService` |
| `detalle-tarea.service.spec.ts` | `DetalleTareaRepository`, `InsumoRepository`, `MailService`, `CacheService`, `OfflineQueueService`, `SyncService` |
| `auditoria.service.spec.ts` | `AuditoriaRepository`, `CacheService`, `OfflineQueueService`, `SyncService` |
| `tareas.service.spec.ts` | `TareaRepository`, `EmpleadoRepository`, `AsignacionTareaRepository`, `InsumoRepository`, `DetalleTareaRepository`, `MailService`, `CacheService`, `OfflineQueueService`, `SyncService` ✅ (incluido) |
| `empleado.service.spec.ts` | `EmpleadoRepository`, `CacheService`, `OfflineQueueService`, `SyncService` |
| `lotes.service.spec.ts` | `LoteRepository`, `CacheService`, `OfflineQueueService`, `SyncService` |
| `mail.service.spec.ts` | `MailerService` ✅ (incluido) |
| `insumos.service.spec.ts` | `InsumoRepository`, `CacheService`, `OfflineQueueService`, `SyncService`, `MailService` |
| `cultivos.service.spec.ts` | `CultivoRepository`, `CacheService`, `OfflineQueueService`, `SyncService` ✅ (incluido) |

> Nota: `detalle-tarea.controller.spec.ts` no aparecía con FAIL etiquetado en
> el resumen pero mostraba el mismo stack trace en tu primera captura — revísalo
> igual con la plantilla de controller.

## Pasos para aplicar la corrección

1. Copia `test/mocks/common-providers.mock.ts` a la misma ruta en tu proyecto
   (créala si no existe la carpeta `test/mocks`).
2. Para cada `*.controller.spec.ts`, usa `templates/controller.spec.template.ts`
   reemplazando `NOMBRE` por el nombre del módulo.
3. Para cada `*.service.spec.ts`, usa `templates/service.spec.template.ts`,
   revisando en la tabla de arriba qué dependencias extra debes mockear
   (cópialas del log real: todo lo que aparece dentro del paréntesis en
   `Nest can't resolve dependencies of X (?, A, B, C)`).
4. Verifica en el constructor de cada servicio si usa `@InjectRepository(Entidad)`
   (usa `getRepositoryToken(Entidad)`) o un token custom tipo
   `@Inject('AlgoRepository')` (usa el string directamente como `provide`).
5. Corre `npm run test` de nuevo — deberían pasar todos los `should be defined`.
   Luego puedes ir agregando tests reales por método (`findAll`, `create`, etc.)
   usando los mocks ya definidos.
