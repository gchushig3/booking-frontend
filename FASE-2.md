# Fase 2: atracción → experiencia → checkout

Implementación sobre las pantallas existentes de detalle y el modal de checkout. Sin cambios en el backend, estilos globales, dependencias, ADMIN ni comentarios. La Fase 1 y sus pruebas de contratos se conservan; su prueba de adaptación se actualizó para seleccionar un paquete real y comenzar otra operación explícitamente.

## Archivos

| ARCHIVO | CAMBIO | MOTIVO |
| --- | --- | --- |
| `src/app/components/attraction-detail/attraction-detail.ts` | GET individual y paquetes; selección con paquete completo; formularios reactivos de fecha y participantes; edades dinámicas; límites y política real; disponibilidad con `switchMap` y cleanup | Reemplazar reglas frontend por respuestas del backend y evitar respuestas obsoletas |
| `src/app/components/attraction-detail/attraction-detail.html` | Experiencias reales, precio unitario/moneda, políticas, edades, horarios reales, loading/error/404/empty state | Mantener la composición actual sin opciones ni beneficios inventados |
| `src/app/services/booking-navigation.service.ts` | Selección con experiencia, modalidad, fecha, turno, adultos y niños con edades | Conservar el estado real sin `ticket_count` agregado ni total calculado |
| `src/app/services/reservas.service.ts` | Notificación de cambios de disponibilidad al detalle, incluida la confirmación | Refrescar cupos sin reconstruir datos en frontend |
| `src/app/app.ts` | Checkout desde selección real; snapshot inmutable al primer envío; una clave por operación; doble click bloqueado; 409 diferenciados; limpieza de pago; cancelación por intención; catálogo condicionado a su pantalla | Confirmar/reintentar de manera segura y evitar descargar el catálogo al abrir un detalle |
| `src/app/app.html` | Resumen real, total pendiente de backend y confirmación con estado/participantes/turno/precio/referencia reales | Eliminar selección y pricing duplicados del modal sin rediseñarlo |
| `src/app/components/activity-results/activity-results.ts` | Disponibilidad de búsqueda con `switchMap` y `takeUntilDestroyed` | Evitar que una fecha antigua sobrescriba la búsqueda actual |
| `src/app/components/activity-results/activity-results.html` | Idioma solo cuando está en `supported_languages` | Quitar el beneficio fijo «Guía en español» |
| `src/app/app.spec.ts` | Adaptación a selección real e idempotencia por operación; inicio en URL de detalle sin catálogo | Conservar la cobertura de Fase 1 con el flujo actualizado |
| `src/app/components/attraction-detail/attraction-detail.spec.ts` | 18 pruebas del detalle, paquetes, participantes, edades, límites, políticas, horarios, estados y consultas obsoletas | Comprobar comportamiento observable y contratos |
| `src/app/checkout-flow.spec.ts` | 17 pruebas de checkout, pago seguro, claves, confirmación, conflictos y cancelación | Comprobar requests reales y respuestas del backend |
| `src/app/components/activity-results/activity-results.spec.ts` | 2 pruebas de cancelación de búsquedas antiguas y cleanup | Verificar el cambio de fecha en el catálogo |
| `src/app/testing/booking.fixtures.ts` | Fixtures exclusivamente de pruebas | Datos controlados para comprobar casos distintos de las antiguas constantes |

## Matriz del flujo

| PASO | FUENTE DE DATOS | MOCK ELIMINADO | ESTADO |
| --- | --- | --- | --- |
| Atracción | GET `/atracciones/:id` | Búsqueda del ID descargando el catálogo | OK; loading/error/404 |
| Paquete | GET `/atracciones/:id/paquetes` | `PACKAGES`, modalidades y límites fijos | OK; empty/error y ambigüedad bloquean avance |
| Fecha | Usuario; disponibilidad del backend | Suposición de disponibilidad diaria | OK; nueva consulta cancela la anterior |
| Horario | `AvailabilityResponse.times` | Horarios fijos y turno por defecto frontend | OK; consulta adicional por turno para conocer sus cupos |
| Participantes | Usuario y min/max del paquete | Límites por modalidad y suma enviada como `ticket_count` | OK; adultos y niños son participantes físicos |
| Edades | FormArray y `ChildDto` | Gratuidad/edad infantil fija | OK; una edad obligatoria entera 0–17 por niño |
| Precio | `precio_unitario`/`moneda`; `total_price` tras checkout | Multiplicadores, pareja 57, adicional 50, ajustes 0.01 | OK; «Total final calculado al confirmar» antes del checkout |
| Pago | Usuario; DTO seguro; MockPaymentProvider existente | Método solo visual | OK; CREDIT_CARD/PAYPAL; sin PAN completo ni CVV en request/storage |
| Checkout | Snapshot del paquete/fecha/turno/participantes/cliente/pago | Totales y participantes reconstruidos por frontend | OK; clave UUID v4 estable y solicitud idéntica en reintentos |
| Confirmación | `ReservationResponse` | Precio/estado asumidos | OK; ID, atracción, fecha, turno, adultos/niños, estado, total y referencia segura |

## Idempotencia y conflictos

- Se genera una clave al abrir una nueva operación de checkout. Antes del primer envío puede editarse el formulario; desde el primer envío se conserva una solicitud inmutable y se bloquea su edición. Timeout/error de red/reintento manual reutilizan solicitud y clave. Cerrar y comenzar otra operación genera una clave nueva. No hay reintento automático ni cambio automático de clave tras errores.
- `INSUFFICIENT_AVAILABILITY`: informa al usuario y refresca la misma fecha/modalidad/turno; bloquea reenvíos mientras faltan cupos. Si vuelven a existir cupos suficientes, el usuario puede reintentar explícitamente con la misma clave.
- Códigos `IDEMPOTENCY_*`: mensaje distinto, reenvío bloqueado y recomendación de revisar las reservas. Otros 409 conservan el mensaje del backend como conflicto.
- Cada apertura explícita del diálogo de cancelación genera otra clave. El error deja el diálogo abierto y conserva la clave para reintentar; cerrar el diálogo o completar la cancelación termina esa intención.
- PAN, CVV, caducidad y titular temporal se limpian al enviar el snapshot, al cambiar a PayPal y al cerrar/completar el checkout. El snapshot contiene como máximo titular y últimos cuatro dígitos.

## Validación final

- `npm.cmd run build`: código 0. Bundle inicial **521.37 kB**; warning de presupuesto de **500 kB**, excedido en **21.37 kB**. Sin errores de compilación.
- `npm.cmd test -- --watch=false`: código 0, **`Test Files 6 passed (6)`**, **`Tests 65 passed (65)`**. Base de 27 pruebas más 38 pruebas de esta fase.
- Las pruebas usan HttpTestingController y el DOM de los componentes; no se añadieron E2E ni proveedores externos.
- Búsqueda global del flujo productivo: no hay `PACKAGES`, horarios fijos, fórmulas de pareja/multiplicadores, políticas infantiles ni límites de grupo inventados. `ticket_count` permanece en el contrato compatible y en la representación existente del historial; no se utiliza en el request del checkout activo.

## Mocks restantes y deuda técnica

- El pago sigue siendo la simulación académica autorizada, con MockPaymentProvider en el backend. Los datos simulados de las pruebas viven exclusivamente en specs/fixtures.
- Las etiquetas de modalidad traducidas del historial (`tipoPaqueteLabel`) permanecen; no generan experiencias reservables. También se mantienen las imágenes y destinos editoriales existentes, que no fijan precios, políticas ni disponibilidad.
- El DTO de checkout acepta `product_type`, no el ID del paquete. El esquema actual no impone unicidad por `(atraccion_id, tipo_experiencia)` y el backend resuelve un paquete por modalidad. Si `/paquetes` devuelve varios paquetes con la misma modalidad, el detalle muestra los datos recibidos pero bloquea su checkout para evitar confirmar otro paquete. Resolver ese caso requiere una decisión futura de contrato/backend; no se modificó el backend ni se inventó un campo de request.
- La política infantil se muestra desde `politicas_json`; reglas de pricing y total definitivo siguen siendo responsabilidad del backend. No se duplicó el motor de precios.
- Continúa el warning de tamaño del bundle. La arquitectura general de App y el historial de reservas quedan para fases posteriores.

FLUJO ATRACCIÓN → CHECKOUT COMPLETAMENTE ALINEADO CON BACKEND: SÍ

DATOS DE NEGOCIO INVENTADOS EN EL FLUJO ACTIVO: NO
