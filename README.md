# GUTT SYSTEM

Sistema bancario (core banking) para cooperativas de ahorro y crédito reguladas
por la SEPS (Ecuador). Cubre socios, cuentas, créditos, plazo fijo, caja y
contabilidad, con integración de solo lectura al núcleo legado para consulta
y reportería mientras dura la migración.

## Requisitos

- Node.js
- SQL Server (local o remoto) para la base transaccional

## Ejecutar en local

1. Instalar dependencias:
   `npm install`
2. Configurar `api/.env` con la conexión a SQL Server y las demás variables
   (ver `.env.example`).
3. Levantar backend y frontend:
   `npm run dev:full`
   (o por separado: `npm run server` para el API en el puerto 5005, `npm run dev` para el frontend Vite en el puerto 5000)

## Pruebas

```
npm test                  # suite completa
npm run test:conectividad
npm run test:creditos
npm run test:integracion
npm run test:seguridad
npm run test:dpf
npm run test:caja
```

## Integración con backend legado

La app puede consumir un API remoto para autenticación y perfiles del núcleo
legado durante la transición.

1. Crear un archivo `.env.local` en la raíz con base en `.env.example`.
2. Configurar estas variables:
   - `VITE_USE_REMOTE_API=true`
   - `VITE_API_URL=/api`
   - `VITE_API_PROXY_TARGET=http://192.168.0.197`
3. Levantar el frontend con `npm run dev`.

Con esta configuración, las llamadas a `/api/*` se enrutan al servidor remoto
durante desarrollo.

Endpoints esperados por el frontend:
- `POST /api/auth/login.php`
- `GET /api/users/get_profile.php?id=<id>`
- `POST /api/reports/generate.php`

## Estructura del proyecto

- `server.js` — backend Express, base de datos transaccional actual.
- `components/` — frontend React.
- `db/sqlserver/` — migraciones de la base actual.
- `db/gutt_system/` — esquema nuevo en evaluación (ver `MANUALES/` y
  `DOCS_SISTEMA_FINANCIERO/` para el resto de la documentación técnica y de
  usuario).
