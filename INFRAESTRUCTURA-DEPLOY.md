# Infraestructura y despliegue — Grupo Lina

Nota de contexto para continuar trabajando desde cualquier equipo (creada 2026-07-08). Si tu sesión de Claude Code no tiene memoria de engram sincronizada, lee esto primero.

## Equipos

| Equipo | IP | Hostname | Rol | Proyectos locales |
|---|---|---|---|---|
| Escritorio | 192.168.1.97 | SERVER-CONY | Desarrollo | GUTT_SYSTEM, GUTT_SYSTEM_MOVIL, copias de staging de GUTT_FAC_CONY/GUTT_ECOMMERCE |
| Servidor producción | 192.168.1.164 | PUNTO-VENTA | **Producción real** | GUTT_FAC_CONY, GUTT_ECOMMERCE, GUTT_COBRANZAS |
| Laptop | 192.168.1.9 | — | Desarrollo remoto | INTEGRACION-AFC + lo que clones |

`.164` corre Caddy (servicio `CaddyFACCONY`, config en `C:\GUTT_FAC_CONY\deploy\caddy\Caddyfile`) sirviendo:
- `facturacionelectronica.grupolina.com` → `C:\GUTT_FAC_CONY\dist` + backend `FACCONYBackend` (puerto 3002)
- `importadoralina.grupolina.com` → `C:\GUTT_ECOMMERCE\dist` + backend `InventarioCONYBackend` (puerto 7002)
- `cobranzas.grupolina.com` → `C:\GUTT_COBRANZAS\dist` + backend `CobranzaGUTTBackend` (puerto 4000)

Todos los backends corren como servicios Windows via NSSM (no PM2, aunque existan archivos `ecosystem.config.cjs` — están desactualizados/no se usan).

## Repos de GitHub (cuenta `JorgeVladimir`, todos privados)

- `GUTT_FAC_CONY`, `GUTT_ECOMMERCE`, `GUTT_COBRANZAS` (conectados a producción)
- `GUTT_SYSTEM`, `GUTT_SYSTEM_MOVIL` (sin despliegue automático)

Nombres viejos que ya NO existen (fueron renombrados): `FAC-CONY`, `INVENTARIO-PAGINA-WEB--CONY`. Si ves esos nombres en algún remote o script viejo, corresponden a `GUTT_FAC_CONY` y `GUTT_ECOMMERCE` respectivamente.

## Pipeline de despliegue automático

Cada uno de los 3 repos de producción tiene `.github/workflows/deploy.yml`: al hacer `push` a `main`, un runner autoalojado en `.164` ejecuta:
1. `git fetch origin main` + `git reset --hard origin/main`
2. `npm install`
3. `npm run build`
4. `nssm restart <servicio correspondiente>`

Los 3 runners están instalados como servicios de Windows en `.164` (`C:\actions-runners\{faccony,ecommerce,cobranzas}`), corriendo como cuenta `NT AUTHORITY\NETWORK SERVICE`. Verificado funcionando de punta a punta (5 despliegues de prueba exitosos el 2026-07-08).

**Importante — flujo de trabajo**: cualquier `push` a `main` en `GUTT_FAC_CONY`/`GUTT_ECOMMERCE`/`GUTT_COBRANZAS` publica en vivo automáticamente. Si quieres probar algo sin publicarlo, trabaja en una rama (`git checkout -b mi-cambio`) y haz merge a `main` solo cuando quieras que salga en producción. `GUTT_SYSTEM` y `GUTT_SYSTEM_MOVIL` no tienen este riesgo.

## Detalles técnicos ya resueltos (por si se toca de nuevo)

- **Autenticación git→GitHub para el runner**: llave SSH dedicada en `.164` en `C:\ProgramData\ssh\gutt_github_deploy_pull` (accesible para Network Service), configurada por repo via `git config core.sshCommand "ssh -i C:/ProgramData/ssh/gutt_github_deploy_pull ..."` (local a cada repo, no global). La llave pública está agregada a nivel de cuenta en GitHub (Settings → SSH keys), no como Deploy Key por repo (GitHub no permite reusar una deploy key en varios repos).
- **Git "dubious ownership"**: las carpetas son propiedad de `SISTEMAS` pero el runner corre como Network Service. Se resolvió con `git config --system --add safe.directory C:/GUTT_FAC_CONY` (y análogo para los otros 2) en `.164`.
- **Permisos para reiniciar servicios**: Network Service no podía controlar `FACCONYBackend`/`InventarioCONYBackend`/`CobranzaGUTTBackend` por defecto. Se ajustó el descriptor de seguridad de cada servicio (`sc sdset`) agregando una ACE para Network Service (start/stop/query).
- Acceso administrativo a `.164` desde `.97`: llave SSH separada `gutt-deploy-97-to-164` (para administración manual, distinta de la llave de despliegue del runner).

## Cómo trabajar desde cualquier equipo (laptop, .97, etc.)

```
git clone https://github.com/JorgeVladimir/GUTT_ECOMMERCE.git C:\GUTT_ECOMMERCE
git clone https://github.com/JorgeVladimir/GUTT_SYSTEM.git C:\GUTT_SYSTEM
```
`git pull` antes de empezar, `git push` al terminar. Cada carpeta es una sesión de Claude Code independiente (`cd` a la carpeta y corre `claude`).
