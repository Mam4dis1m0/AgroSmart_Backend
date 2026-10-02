# AgroSmart — Multi-tenant, planes SaaS y Marketplace (guía del backend)

Basado en `AgroSmart_Web_Movil_Documento_Combinado.docx` (EP-09 a EP-13, RNF-16 a RNF-21).

## 1. Poner en marcha la base de datos (Supabase)

1. **Supabase → SQL Editor** → pega y ejecuta `database/01_migracion_multitenant.sql`.
   - Es idempotente y no destructivo. Tus datos actuales pasan a una finca llamada **"Finca Principal"**
     (propietario = el primer administrador; admins/empleados existentes quedan como miembros).
   - Antes de correrlo, vacía la cola offline del backend (`.cache/pending-queue.json`): lo encolado antes
     de la migración no trae `idfinca`.
2. `database/00_esquema_base_OPCIONAL.sql` solo sirve si empiezas con un Supabase **vacío** (córrelo primero).
3. Revisa los valores marcados `AJUSTAR` en la tabla `plan` (límites Freemium, precio Premium, comisiones 5 % / 3 %).
4. En el backend: agrega `JWT_SECRET` al `.env` (ya se agregó uno; ver `.env.example`) y reinicia.

## 2. Modelo

```
usuario ──< finca_usuario >── finca ──< lote, cultivo, tarea, insumo, cosecha, nomina, listado ...
 (global)   (rol por finca)   (tenant)         └─ todas llevan idfinca (FK compuestas: no se mezclan fincas)
```
- Un usuario puede pertenecer a varias fincas con rol distinto en cada una (`admin` | `empleado`).
- El **comprador externo** no pertenece a ninguna finca (`comprador_perfil`).
- El plan (Freemium/Premium) es **por finca** (`finca.idplan`, `suscripcion`).
- Aislamiento en 3 capas: guard JWT + filtro `idfinca` en cada consulta + FK compuestas en la BD. RLS activo
  en todas las tablas (cierra la API REST pública de Supabase; el backend usa el rol `postgres`).

## 3. Autenticación (cambio principal para web y Flutter)

Todas las rutas exigen `Authorization: Bearer <token>`, salvo `register`, `login`, `login-google`,
`forgot-password` y `reset-password`.

```
POST /usuarios/login {email, contrasena}
 → { usuario:{id,nombre,apellido,email,role,fotoperfil}, token, idfinca, fincas:[{idfinca,nombre,rol,plan}],
     requiereSeleccionFinca }
```
- 1 finca → queda seleccionada. Varias → `requiereSeleccionFinca=true`: llamar
  `POST /api/v1/fincas/:idfinca/seleccionar` → devuelve un **token nuevo** con esa finca. Cambiar de finca = pedir otro token.
- Admin sin fincas → `POST /api/v1/fincas {nombre, ubicacion, tipoproduccion}` (devuelve token con la finca).
- Comprador: `role:"comprador"`, sin finca; solo accede al Marketplace y a sus notificaciones.
- Errores útiles: `401` token ausente/vencido/usuario inactivo · `403` rol no permitido o sin finca activa ·
  `403 {code:"PLAN_PREMIUM_REQUERIDO"}` · `403 {code:"LIMITE_PLAN_*"}` · `503` operación que requiere internet.

## 4. Cambios que rompen compatibilidad

| Antes | Ahora |
|---|---|
| Endpoints abiertos, sin token | Token obligatorio |
| `POST /usuarios/register` con `role:"empleado"` | Los empleados los crea un admin: `POST /usuarios/empleados` (requiere cédula) |
| `POST /usuarios/login-google {email, picture}` | `{credential}` = ID token de Google; el backend lo verifica (necesita `GOOGLE_CLIENT_ID`) |
| `PUT /usuarios/:id` aceptaba cualquier campo (incluida la contraseña) | Solo nombres, teléfono y cédula |
| `DELETE /usuarios/:id` borraba la fila | Saca al usuario de la finca (y desactiva la cuenta si no tiene otra) |
| `idadmincreador/idadminasignador/idadminregistro` los enviaba el cliente | Salen del token (se ignora lo enviado) |
| Cualquier cuerpo con `idfinca` | Se ignora: la finca siempre sale del token |
| Login distinguía "usuario no existe" / "contraseña incorrecta" | Mensaje único (no revela qué correos existen) |
| El hash de la contraseña viajaba en `/empleados`, `/tareas`... | Ya no (`select:false`) |
| `register` aceptaba sin cédula | Admin/empleado requieren primerapellido y cédula (única) |

## 5. Roles

| | admin | empleado | comprador |
|---|---|---|---|
| Lecturas de cultivos, lotes, insumos, tareas | ✅ | ✅ (tareas: solo las suyas) | ❌ |
| Crear/editar/borrar cultivos, lotes, insumos, tareas, asignaciones | ✅ | ❌ | ❌ |
| Cambiar estado / registrar horas / consumir insumos de SU tarea | ✅ | ✅ | ❌ |
| Personal, nómina, reportes, suscripción, dashboard | ✅ | ❌ | ❌ |
| Publicar y vender en el Marketplace | ✅ | ❌ | ❌ |
| Catálogo, ordenar, mis compras, carrito | ✅ (carrito: Premium) | catálogo | ✅ |

## 6. Endpoints nuevos (`/api/v1/...`)

- **Fincas**: `GET fincas/mis-fincas` · `POST fincas` · `POST fincas/:id/seleccionar` · `GET fincas/dashboard` ·
  `GET|PUT fincas/activa` · `GET fincas/activa/miembros` · `PATCH|DELETE fincas/activa/miembros/:idusuario`
- **Planes**: `GET planes` · `GET suscripcion` · `POST suscripcion/contratar|cancelar` · `GET suscripcion/pagos`
- **Cosechas**: `GET|POST cosechas` · `GET cosechas/cultivo/:id` · `PUT|DELETE cosechas/:id`
- **Compras de insumo**: `POST insumos/:id/compras` · `GET insumos/compras`
- **Marketplace** (`marketplace/`): `listados` (catálogo; `?q=&categoria=&lat=&lng=&radioKm=`) · `listados/mios` ·
  `POST listados` · `PUT|DELETE listados/:id` · `POST listados/:id/destacar` · `POST fotos` ·
  `ordenes` · `ordenes/mis-compras` · `ordenes/ventas` · `PATCH ordenes/:id/aceptar|rechazar|cerrar|cancelar` ·
  `carrito` · `carrito/ordenar` · `wishlist`
- **Premium**: `nomina` (calcular → ajustar deducciones → confirmar → pagar) · `reportes/costos` · `reportes/exportar?tipo=gastos|insumos|cultivo` · `chat`
- **Usuarios**: `GET usuarios/me` · `POST usuarios/empleados` · `GET|PUT usuarios/comprador/perfil|ubicacion`

## 7. Planes (editable en la tabla `plan`)

| | Freemium | Premium |
|---|---|---|
| Cultivos / empleados / fincas | 3 / 3 / 1 | ilimitado |
| Nómina, control insumos-pagos, Excel, Talent Center, Chat IA, carrito/wishlist, acceso anticipado | ❌ | ✅ |
| Comisión Marketplace | 5 % | 3 % |

Al cancelar o vencer, la finca vuelve a Freemium **conservando sus datos** (los límites solo frenan nuevos registros).

## 8. Pendiente / supuestos a confirmar

- **Pasarela de pagos simulada** (`suscripciones/pasarela-pago.service.ts`). En `NODE_ENV=production` se niega a cobrar
  hasta integrar un proveedor real (RNF-18).
- **Excel**: se entrega CSV (abre en Excel). Para `.xlsx` real añadir `exceljs` y cambiar `toCsv()` en `reportes.service.ts`.
- **No implementado todavía** (tablas y entidades sí existen): Talent Center, anuncios de insumos, persistencia del chat IA,
  chat interno entre usuarios, borrador offline de publicaciones del Marketplace.
- Nómina: `bruto = horas×valor/hora + jornadas×valor/jornal + pago acordado de tareas completadas sin horas`;
  no incluye `empleado_cosecha`. Confirmar la regla con negocio.
- Los datos offline guardados en `.cache/` antes de este cambio usan claves antiguas y se ignoran (puedes borrar la carpeta).
