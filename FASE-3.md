# Fase 3 - Flujo cliente de reservas y comentarios

Implementado sobre las pantallas existentes, sin modificar backend ni el contrato de checkout. Detalle y comentarios viven en ReservationDetail; App solo integra el modal y mantiene la cancelacion existente.

## Archivos

| Archivo | Cambio | Motivo |
|---|---|---|
| src/app/contracts/atracciones.contracts.ts | CreateComentarioRequest y ComentarioResponse | DTO REST exacto, fechas JSON como string |
| src/app/services/reservas.service.ts | GET reserva individual | Detalle completo y autorizacion backend |
| src/app/services/comentarios.service.ts | GET y POST comentarios | API centralizada y JWT del interceptor existente |
| src/app/components/reservation-detail/reservation-detail.ts | Estado detalle, comentarios y Reactive Forms | Cleanup, switchMap, validaciones, errores y doble submit |
| src/app/components/reservation-detail/reservation-detail.html | Modal, detalle, listado y formulario | Campos reales, acciones segun estado y mensajes accesibles |
| src/app/app.ts | Integracion detalle y ajustes cancelacion/autenticacion | Respuesta real, misma key en reintento, cierre de operacion y errores separados |
| src/app/app.html | Participantes/cupos, detalle, codigo textual | Eliminar QR externo y mejorar informacion real |
| src/app/components/activity-results/activity-results.ts | Elimina umbral 8.5 | No confundir rating API con comentarios 1-5 |
| src/app/components/activity-results/activity-results.html | Etiqueta rating API | No anunciar promedio calculado de comentarios |
| src/app/components/reservation-detail/reservation-detail.spec.ts | 16 tests | Contrato, estado, comentarios, limites, 401/403/409 y cleanup |
| src/app/reservations-flow.spec.ts | 15 tests | Listado, detalle GET, cancelacion, keys, errores y ausencia QR |

## Validacion

npm.cmd run build: exit 0.
npm.cmd test -- --watch=false: exit 0.

Test Files 8 passed
Tests 97 passed

Los 66 tests anteriores siguen pasando; se agregaron 31. No se realizaron E2E. Aviso de build: bundle inicial 531.76 kB, 31.76 kB sobre presupuesto de 500 kB. No se modificaron budgets ni se hicieron optimizaciones arquitectonicas.

## Matriz CLIENTE

Todos los endpoints de esta tabla usan el prefijo /api/v1.

| FUNCION | ENDPOINT | UI | TEST | ESTADO |
|---|---|---|---|---|
| Registro | POST /auth/register | Formulario con cedula | app / api-contracts | LISTO |
| Login | POST /auth/login | Modal existente | api-contracts | LISTO |
| Catalogo | GET /atracciones | Catalogo/resultados | app / activity-results | LISTO |
| Detalle atraccion | GET /atracciones/:id | Pantalla existente | attraction-detail | LISTO |
| Paquetes | GET /atracciones/:id/paquetes | Seleccion real por ID | attraction-detail / checkout-flow | LISTO |
| Disponibilidad | GET /atracciones/:id/availability | Fecha/turno reales | attraction-detail | LISTO |
| Participantes | DTO de checkout | Adultos, ninos y edades | attraction-detail / checkout-flow | LISTO |
| Checkout | POST /atracciones/:id/reservations | Flujo existente congelado | checkout-flow / api-contracts | LISTO |
| Confirmacion | Respuesta checkout | Voucher real y codigo textual | checkout-flow / reservations-flow | LISTO |
| Mis reservas | GET /atracciones/reservations | Lista con loading/empty/error | reservations-flow | LISTO |
| Detalle reserva | GET /atracciones/reservations/:reservationId | Modal individual | reservation-detail / reservations-flow | LISTO |
| Cancelacion | POST /atracciones/reservations/:reservationId/cancel | Modal con key por intencion/reintento | reservations-flow | LISTO |
| Listar comentarios | GET /atracciones/:id/comentarios | Listado en detalle de reserva | reservation-detail | LISTO |
| Crear comentario | POST /atracciones/:id/comentarios | Reactive Forms 1-5, 3-3000 caracteres | reservation-detail | LISTO |
| Logout | Local, sin endpoint | Boton existente | api-contracts | LISTO |

## Limites y deuda

- ReservationResponseDto no devuelve ID/nombre del paquete. Se muestra product_type como modalidad, sin inferir otro paquete. No se cambia el contrato aprobado.
- Detalle/listado de reserva no incluyen pago en el mapping actual; si llega payment, detalle muestra solo metodo, nunca transaccion_hash, PAN o CVV.
- ComentarioResponseDto no devuelve autor publico: no se inventa ni se muestra usuario. No se muestra reserva_id de comentarios de otros clientes.
- El mapping backend de atraccion conserva ratings fijos (score 5, number_of_reviews 0). Se etiqueta como rating de API, separado de comentarios reales, sin calcular promedios.
- MockPaymentProvider sigue existente y autorizado; contenidos editoriales e imagenes de respaldo permanecen. No hay mocks de reservas/comentarios en ejecucion (los fixtures estan solo en tests).
- App conserva deuda arquitectonica previa; la logica nueva de detalle/comentarios esta aislada en el componente especifico.
- Endpoints alternativos no usados por UI: POST /atracciones/search, POST /atracciones/details (batch), GET /atracciones/health. No falta ningun endpoint requerido en esta fase. ADMIN permanece fuera de alcance.
- Comentarios se listan en detalle de reserva autenticado; el formulario solo se ofrece para CONFIRMADA sin comentario conocido. Si un comentario aparece concurrentemente, 409 bloquea otra creacion y refresca el listado sin POST automatico.
- Cancelacion ya cancelada puede devolver 200 CANCELADA segun backend; se respeta la respuesta real. Otros errores se interpretan con el helper HTTP existente y permanecen en el modal.
- Cancelacion: abrir intencion genera key; timeout/error conserva key; cerrar explicitamente descarta esa intencion; respuesta exitosa aplica datos del servidor, cierra operacion y refresca lista.
- QR externo eliminado de reserva y confirmacion; se usa codigo textual y copiar codigo. Ningun UUID se envia a proveedor QR.
