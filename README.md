# Frontend Angular

Consumidor HTTP del marketplace y ADMIN. Instrucciones vigentes: [README principal](../README.md). Desde esta carpeta: `npm.cmd ci`, `npm.cmd start`, `npm.cmd run build` y `npm.cmd test -- --watch=false`.

Desarrollo: `http://localhost:4200`; environment.development.ts apunta a `http://localhost:3000/api/v1`. environment.ts utiliza `/api/v1` relativo. QR se genera localmente con qrcode-generator; identifica una reserva, no realiza check-in. Observabilidad ADMIN utiliza SSE autenticado y polling como fallback.

Scripts E2E reales: package.json; no hay target `ng e2e` configurado. Se conservan FASE-1.md a FASE-4.md como antecedentes; consultar [arquitectura](../docs/ARQUITECTURA.md) y [API-first](../docs/API-FIRST.md) para la implementación vigente.
