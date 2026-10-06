# Fase 1: contratos y comunicación

Fuente de verdad: DTOs, controladores y servicio actuales de `booking-backend/src` (los DTOs generan el Swagger). No se modificó el backend ni se instalaron dependencias.

## Configuración

- Desarrollo: `src/environments/environment.development.ts`, API `http://localhost:3000/api/v1`. Ejecutar `npm.cmd start` o construir con `--configuration development`.
- Producción: `src/environments/environment.ts`, API `/api/v1` en el mismo origen. El despliegue debe enrutar esa ruta al backend; si se usa otro origen, configurar aquí su URL pública antes de construir.
- `angular.json` aplica el reemplazo de entorno en desarrollo. `API_URL` permite inyectar la configuración y sustituirla en pruebas. No contiene secretos.

## Archivos

| ARCHIVO | CAMBIO | MOTIVO |
| --- | --- | --- |
| `angular.json` | Reemplazo de entorno de desarrollo | Configurar cada entorno mediante Angular |
| `src/environments/environment.ts` | URL pública de producción | API del mismo origen |
| `src/environments/environment.development.ts` | URL de desarrollo | Una única configuración local |
| `src/app/core/api.config.ts` | Token de configuración y comprobación de origen/ruta | Centralizar URL y limitar Bearer |
| `src/app/contracts/atracciones.contracts.ts` | Auth, usuario, roles, atracciones, lista, paquetes, disponibilidad, checkout, pago y estados | Reproducir los contratos actuales sin interfaces duplicadas |
| `src/app/contracts/attraction-view.ts` | Lectura segura de fotos y ubicaciones JSON | El response declara arrays abiertos; `LocationDto.city` es numérico |
| `src/app/core/http-errors.ts` | Mensajes para 400/401/403/404/409/500, validación y Problem Details | Mostrar errores del backend consistentemente |
| `src/app/services/auth.service.ts` | `accessToken/user`, registro con cédula y rol cerrado leído del JWT | Eliminar aliases históricos; conservar login/logout y almacenamiento |
| `src/app/services/atracciones.service.ts` | Lista paginada exacta, detalle, paquetes y disponibilidad | Preparar endpoints reales y propagar errores |
| `src/app/services/reservas.service.ts` | Request/response actuales y claves suministradas por el llamador | Reintentar operaciones sin generar otra clave por request |
| `src/app/services/booking-navigation.service.ts` | Referencia al contrato nuevo | Mantener el flujo existente compilando |
| `src/app/interceptors/auth.interceptor.ts` | Bearer solo para origen y ruta de nuestra API | Evitar enviar JWT a terceros |
| `src/app/utils/async-validators.ts` | Provincias 01 a 24 | Igualar el validador ecuatoriano del backend |
| `src/app/app.ts` | Límites de registro, adaptación segura del checkout, claves por operación, errores y campos reales | Cambios mínimos en los flujos existentes |
| `src/app/app.html` | Cédula de registro y campos reales en sugerencias/voucher | Mantener las pantallas sin rediseño |
| `src/app/components/activity-results/activity-results.ts` | Campos actuales y errores de disponibilidad explícitos | Evitar tratar fallos HTTP como falta de resultados |
| `src/app/components/activity-results/activity-results.html` | Mostrar error HTTP y usar descripción actual | Comunicar errores sin cambiar la composición visual |
| `src/app/components/attraction-detail/attraction-detail.ts` | GET individual y campos actuales | Evitar descargar el catálogo para encontrar un detalle |
| `src/app/components/attraction-detail/attraction-detail.html` | Descripción actual | Eliminar alias contractual |
| `src/app/app.spec.ts` | Router/ActivatedRoute, registro, validador y adaptación del checkout | Sustituir assertions de scaffold y comprobar pago seguro/reintentos |
| `src/app/services/api-contracts.spec.ts` | Auth, roles, paquetes, paginación, disponibilidad, reserva, cancelación e interceptor | Comprobar requests/responses y claves del llamador |
| `src/app/core/http-errors.spec.ts` | Estados relevantes y formatos de errores | Verificar interpretación central |

## Contratos

- Eliminados del response de autenticación: `token`, `access_token`, `userId`, `roles` y fallbacks de usuario. `access_token` se conserva únicamente como nombre de la clave de almacenamiento existente, no como propiedad del contrato HTTP.
- Eliminados de atracción: `nombre`, `descripcion`, `ciudad`, `precioTicket`, `duracionHoras`, `images`, `imagenes`.
- Conservados campos reales: `categoria`, `categories`, `precioBase`, `package_prices`, `url`, `_links` y los demás campos de `AtraccionResponseDto`.
- Un solo `ReservationResponse` sustituye las interfaces duplicadas de reserva creada y reserva del usuario. Incluye adultos, niños, cupos, precio, pago seguro y estados `PENDIENTE | CONFIRMADA | CANCELADA`.
- `ReservationRequest` representa `num_adultos`, `ninos: [{ edad }]`, `product_type`, datos del cliente y pago `CREDIT_CARD | PAYPAL`. `ticket_count` permanece opcional porque el backend aún lo admite; el checkout actual usa `num_adultos`.
- No se envían totales, estados, precio calculado, PAN completo ni CVV. El formulario actual usa datos de tarjeta transitorios, sin persistencia; se limpian al cerrar o finalizar. No hay proveedor de pago real.
- Cada inicio de checkout genera una clave UUID v4. Reintentar el mismo payload conserva la clave; cambiar el payload genera otra. La cancelación conserva su clave para los reintentos de esa reserva. Los servicios no generan claves.

## Endpoints preparados

Todos relativos a la URL de API configurada:

- `POST /auth/register`, `POST /auth/login`.
- `GET /atracciones` con paginación.
- `GET /atracciones/:id` (también utilizado por el detalle).
- `GET /atracciones/:id/paquetes`.
- `GET /atracciones/:id/availability` con `date`, `product_type?`, `time?`.
- `POST /atracciones/:id/reservations` con `X-Idempotency-Key` del flujo.
- `GET /atracciones/reservations`.
- `POST /atracciones/reservations/:id/cancel` con `X-Idempotency-Key` del flujo.

## Validación final

- `npm.cmd run build`: código 0. Bundle inicial 522.84 kB; advertencia de presupuesto de 500 kB excedido en 22.84 kB, sin error de build.
- `npm.cmd test -- --watch=false`: código 0, Vitest 5.0.3, `Test Files 3 passed (3)`, `Tests 27 passed (27)`.
- Pruebas unitarias con backend HTTP simulado, sin E2E ni validación de un proveedor externo.

## Pendiente para Fase 2

- Conectar la pantalla completa de paquetes con `/paquetes`, sus precios y políticas reales. Las estimaciones, multiplicadores y reglas visuales anteriores siguen pendientes de sustitución; nunca se envían como precio del checkout.
- Capturar edades individuales y construir `ninos`. El servicio ya soporta esas edades; el formulario existente impide confirmar una selección con niños sin edades para no convertirlos en adultos silenciosamente.
- Integrar el precio/cupos calculados por backend en toda la experiencia de checkout y revisar los horarios iniciales existentes.
- Resolver nombres de ciudad si se necesita mostrarlos: `locations.city` es un ID, no un nombre; la presentación actual usa provincia/dirección.
- Reducir el bundle cuando corresponda abordar estructura y presentación.

FASE 1 - CONTRATOS FRONTEND/BACKEND ALINEADOS: SÍ
