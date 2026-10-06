# Fase 4 — Administración

## Auditoría contractual

Verificado en los controllers actuales, sus decoradores Swagger, DTOs, registro del módulo y servicio. Prefijo global `/api/v1`. No se consultó una instancia desplegada de Swagger ni se ejecutaron operaciones contra PostgreSQL.

| Función | Endpoint | Contrato |
| --- | --- | --- |
| Listado | GET /api/v1/atracciones | data + meta.total/page/lastPage; una página por petición |
| Crear | POST /api/v1/atracciones | CreateAtraccionDto; respuesta AtraccionResponseDto |
| Reemplazar | PUT /api/v1/atracciones/:id | CreateAtraccionDto completo; 204; no utilizado |
| Editar | PATCH /api/v1/atracciones/:id | PartialType(CreateAtraccionDto); respuesta AtraccionResponseDto |
| Desactivar | DELETE /api/v1/atracciones/:id | softRemove; 204 |
| Paquetes | GET /api/v1/atracciones/:id/paquetes | solo lectura |
| Reservas ADMIN | GET /api/v1/admin/reservas | ReservationResponseDto[]; sin paginación |

POST, PUT, PATCH, DELETE y reservas ADMIN requieren JWT y ADMIN; RolesGuard está registrado globalmente. Los GET de catálogo y paquetes son públicos. Los guards frontend sirven a la navegación y no reemplazan esa autorización.

## Implementación

Rutas `/admin`, `/admin/atracciones`, `/admin/reservas` con adminGuard; entrada desde la cabecera usando el login existente. Rol leído del JWT: CLIENTE o ADMIN. Acceso denegado diferencia 401/403. Los errores ADMIN 401 invalidan la sesión; 403 conserva token y sesión.

Features independientes: layout, listado paginado, formulario Reactive Forms y reservas de solo lectura. Atracciones reutiliza AtraccionesService; AdminApiService consulta reservas y centraliza mensajes de error ADMIN. Creación y edición reciben la respuesta real y refrescan el listado. PATCH compara los campos del DTO con el formulario inicial; no envía propiedades internas ni undefined. Quitar un precio existente se rechaza explícitamente porque omitirlo conserva el precio en el backend.

Confirmación de desactivación con botones, foco inicial, Escape y ciclo de Tab. Listados adaptados a móvil, estados loading/empty/error y reintento. Solicitudes de paquetes anteriores se cancelan cuando cambia la selección.

## Límites y deuda contractual

- Paquetes: **DESEABLE** para una fase posterior. `package_prices` es aceptado y almacenado por POST/PATCH, pero no gestiona las filas de paquetes reservables, sus políticas o límites. Esta UI muestra los paquetes solo para consulta. No existen endpoints CRUD de paquetes. Una atracción creada puede carecer de paquetes reservables.
- Disponibilidad/calendario: **DESEABLE** para operación futura. Existe consulta de disponibilidad, no contrato administrativo para configurarla. No es necesario para el alcance de esta fase.
- Capacidad: **DESEABLE** para operación futura. Se devuelve `cuposTotales`, pero no está en CreateAtraccionDto/UpdateAtraccionDto. No se envía ni se edita.
- El servicio escribe `estaActivo` usando `free_cancellation` y la respuesta no expone estado activo. No se utiliza cancelación gratuita como indicador de activación. Revisar esta relación en una decisión posterior de backend.
- ReservationResponseDto no expone cliente ni fecha de creación: no se inventan ni se solicitan por endpoints alternativos.
- POST/PUT/PATCH no ofrecen configuración contractual de provincia/región aunque el listado pueda devolverlas.

No hubo modificación backend. No se introdujeron CRUD internos, métricas ficticias, acciones arbitrarias de reservas ni refactorización general. Observabilidad no forma parte del panel.

## Validación

- `npm.cmd run build`: pasa.
- `npm.cmd test -- --watch=false`: 9 Test Files; 116 Tests; todos pasan. Suite completa, sin exclusiones nuevas.
- 17 tests ADMIN cubren navegación CLIENTE/ADMIN, API paginada, loading/empty/error/retry, creación y refresco, doble submit, PATCH permitido, validación, ausencia de undefined, paginación, paquetes read-only, confirmación/DELETE/Escape, reservas/estados, ausencia de controles arbitrarios y 401/403.
- Warning de bundle: 556,77 kB; presupuesto de aviso 500 kB. No se ajustó el presupuesto.
- Validación con HttpTestingController y build; pendiente prueba manual con backend desplegado y navegador real.

Endpoint ADMIN sin utilizar: PUT /api/v1/atracciones/:id, porque la edición implementada es parcial. Cancelación de reservas no se incluye como acción administrativa.
