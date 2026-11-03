# Frontend Angular

Consumidor HTTP del marketplace y ADMIN. Instrucciones generales: [README principal](../README.md). Desde esta carpeta: `npm.cmd ci`, `npm.cmd start`, `npm.cmd run build` y `npm.cmd test -- --watch=false`.

## Integración de APIs

- Identity usa `http://localhost:3011/api/v2`; login obtiene el par de tokens y consulta `GET /auth/me`. El registro usa `first_name` y `last_name`, y requiere verificación de correo.
- Catalog usa `http://localhost:3014/api/v2`. La búsqueda por destino envía `city`; `query` busca por nombre o descripción. La búsqueda por fecha consulta aforo informativo de Inventory y no reserva cupos.
- `apiUrl` (`http://localhost:3000/api/v1`) se conserva solo para integraciones heredadas que aún apuntan a rutas v1. No es la URL de Identity ni Catalog.
- Los entornos Angular apuntan a los servicios locales descritos arriba. No hay un host remoto de backend configurado; antes de desplegar el frontend, define explícitamente las URLs del entorno de destino.

El catálogo no ofrece consulta/listado/cancelación de reservas del usuario. Su operación Booking de creación tampoco está conectada a una confirmación de aforo en Inventory; por eso el frontend no simula esos flujos y bloquea el checkout. Si Inventory no tiene horarios proyectados, la búsqueda por fecha puede responder 503.

## Desarrollo y pruebas

Desarrollo: `http://localhost:4200`. QR se genera localmente con qrcode-generator; identifica una reserva y no realiza check-in. Observabilidad ADMIN usa SSE autenticado y polling como fallback.

Scripts E2E reales: `package.json`; no hay target `ng e2e` configurado. Se conservan FASE-1.md a FASE-4.md como antecedentes; consulta [arquitectura](../docs/ARQUITECTURA.md) y [API-first](../docs/API-FIRST.md) para la implementación vigente.
