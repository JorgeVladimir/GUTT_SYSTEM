---
name: tecnifin-nuevo-proyecto
description: Crea un proyecto nuevo (como C:\TECNIFIN) sin repetir los errores con que nacio GUTT_SYSTEM. Estructura, las 14 reglas, .env.example, pruebas de higiene y CI que solo prueba. Usala cuando se pida crear un proyecto o repo nuevo de la compania, o revisar que uno existente cumple las reglas.
---

# Crear un proyecto sin repetir los errores de GUTT_SYSTEM

Referencia viva: `C:\TECNIFIN` (creado el 2026-09-20). **Copia de ahi, no reescribas**: `src/platform/postgres.js`,
`tools/migrate.mjs`, `tools/init-db.mjs`, `tools/_env.mjs`, `tests/higiene.test.mjs`, `.github/workflows/ci.yml`, `.gitignore`.

## Pasos (en este orden)
1. Carpeta hermana `C:\<NOMBRE>` y `git init -b main`. **El repo remoto en GitHub y el primer commit los confirma el usuario.**
2. Esqueleto: `db/migrations`, `db/seeds`, `src/platform`, `src/modules`, `tests/fixtures`, `tools`, `deploy`, `docs/adr`, `.github/workflows`.
3. Raiz con solo: `CLAUDE.md`, `AGENTS.md`, `README.md`, `package.json`, `.gitignore`, `.env.example`. Nada mas (regla 8).
4. `CLAUDE.md` corto (< 120 lineas): quien orquesta, comandos, las reglas, trampas de Windows. **Cero credenciales.**
5. Copiar la capa de acceso y el migrador con el prefijo del proyecto (`<NOMBRE>_PG_*`); en el codigo nuevo no aparece el prefijo viejo.
6. `.env` real: generar la clave del rol de aplicacion con `crypto.randomBytes`, nunca mostrarla ni escribirla en un archivo versionado.
7. `npm install`, `npm run db:init`, `npm run migrate`, `npm test` (unitarias + higiene) en verde.
8. Prueba negativa: crear a mano un archivo con `X_PASSWORD=abc` y un `test-suelto.js` en la raiz; las pruebas de higiene deben ponerse rojas. Borrarlos.
9. Smoke de orquestacion: un agente lanzado desde el orquestador escribe y borra un archivo en `var/` del proyecto nuevo.
   Requiere el proyecto en `permissions.additionalDirectories` del `.claude/settings.json` del orquestador.
10. Anotar en el plan y en el tablero el estado real (que quedo hecho y que no).

## Las reglas (resumen; el texto completo esta en `C:\TECNIFIN\CLAUDE.md`)
Multi-tenant desde el dia 1 (`CooperativaId` + RLS + `withTenant`) · un backend y una base por entorno · esquema solo por
`migrate.mjs` con SHA-256 · modulos <= 500 lineas · datos regulatorios parametricos y cuentas por prefijo · suite roja = no se
fusiona · secretos solo en `.env` · raiz limpia · identificadores con el nombre del proyecto y el nombre visible como dato ·
`deploy/` desde la Fase 0 · demo separada de datos reales · CI que solo prueba · una sola implementacion · un solo plan.

## No hacer
- No copiar scripts de `deploy/` de GUTT_SYSTEM tal cual: asumen SQL Server y su servicio.
- No crear `server.x.js` paralelos ni scripts de migracion sueltos.
- No reutilizar el prefijo o la base del sistema anterior.
