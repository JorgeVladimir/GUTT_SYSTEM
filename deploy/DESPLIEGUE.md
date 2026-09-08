# Despliegue e instalación de GUTT_SYSTEM

Runbook operativo. No describe cómo está el equipo de desarrollo hoy: describe **cómo se
instala el sistema en un cliente y cómo se opera después**.

Todo lo que aparece aquí es ejecutable y verificable. El punto de control es siempre el
mismo comando:

```powershell
npm run preflight
```

Sale con código 0 solo si el sistema está realmente listo. Sirve como acta de entrega.

---

## 1. Instalación en un equipo nuevo

### 1.1 Requisitos

| Componente | Mínimo | Nota |
|---|---|---|
| Windows | 10 / Server 2019 | |
| Node.js | 20 LTS | debe quedar en el PATH **del sistema**, no solo del usuario |
| SQL Server | 2019 Express o superior | Express sirve; ver limitación de respaldos abajo |
| Disco libre | 20 GB | respaldos + logs |

### 1.2 Pasos

```powershell
git clone <repo> C:\GUTT_SYSTEM
cd C:\GUTT_SYSTEM
npm install
```

Crear `api\.env` con, como mínimo:

```
SQL_SERVER_HOST=...
SQL_SERVER_INSTANCE=SQLEXPRESS
SQL_SERVER_DATABASE=SQLGUTPATATE
SQL_SERVER_USER=...
SQL_SERVER_PASSWORD=...
JWT_SECRET=<64+ caracteres aleatorios, distinto por instalación>
PUBLIC_APP_URL=https://...
```

> `JWT_SECRET` **no se reutiliza entre clientes**. Un secreto compartido permite que un token
> emitido en una cooperativa valga en otra. `preflight` rechaza secretos de menos de 32
> caracteres.

Levantar el esquema y el build:

```powershell
node tools\migrate.mjs --aplicar     # aplica db\sqlserver\*.sql en orden y registra cuáles
npm run build                        # genera dist\
```

Instalar arranque automático y respaldos (**PowerShell como administrador**):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\install-service.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\backup-db.ps1 -Instalar
```

Verificar:

```powershell
npm run preflight
npm test
```

---

## 2. Migraciones de base de datos

`node tools\migrate.mjs` es la única fuente de verdad sobre qué esquema tiene una base.

```powershell
node tools\migrate.mjs             # estado: aplicadas / pendientes / alteradas
node tools\migrate.mjs --aplicar   # ejecuta las pendientes, en orden, y las registra
```

Cada script se aplica **dentro de una transacción junto con su registro**: si falla a mitad,
no queda ni el cambio parcial ni la marca de aplicado.

> **Por qué existe esto.** `20_ice_seps.sql` estuvo commiteado semanas sin ejecutarse nunca.
> `server.js` escribía cinco columnas `ICE*` que no existían, así que **la aprobación de
> créditos estaba caída por completo** y nadie lo sabía. `preflight` ahora falla si hay
> migraciones pendientes, precisamente para que eso no llegue a un cliente.

Los `.js` de `db\sqlserver\` (22, 23_crear_usuario_revisor_externo, 25, 27) son cargadores de
datos con lógica propia y se corren aparte; el runner no los toca.

---

## 3. Arranque automático

`deploy\install-service.ps1` elige el mejor modo disponible:

| Modo | Cuándo | Qué da |
|---|---|---|
| **NSSM** | hay `nssm.exe` en `deploy\`, en el PATH o en `C:\nssm\` | servicio de Windows real, con rotación de logs a 10 MB y reinicio automático |
| **Tarea SYSTEM** | no hay NSSM | tarea al arranque del equipo, como SYSTEM, sin límite de tiempo y con reintentos |

Ambos modos sobreviven al reinicio y **no requieren sesión iniciada**. Es la diferencia con
lo que había antes: una tarea sin privilegios que solo corría con el usuario logueado.

En los dos casos se instala además el **watchdog** cada 3 minutos. No es redundante:

- el servicio revive un proceso **muerto**;
- el watchdog revive un proceso **vivo pero colgado**, que no responde `/api/health`.

Un cuelgue del driver de SQL cae en el segundo caso y el servicio solo no lo detectaría.

```powershell
Get-Service GuttSystemBackend                                   # modo NSSM
Get-ScheduledTask GuttSystemBackend | Get-ScheduledTaskInfo     # modo tarea
Get-Content C:\GUTT_SYSTEM\logs\watchdog.log -Tail 20
```

Desinstalar: `deploy\install-service.ps1 -Desinstalar` (como administrador).

---

## 4. Respaldos

```powershell
npm run backup                                          # respaldo completo + verificación
powershell ... -File deploy\backup-db.ps1 -Instalar     # tarea diaria 02:00 (requiere admin)
powershell ... -File deploy\backup-db.ps1 -Verificar    # RESTORE VERIFYONLY del último
```

Cada respaldo se crea con `CHECKSUM` y se verifica con `RESTORE VERIFYONLY` **en la misma
corrida**. Un respaldo que no se verifica no cuenta como respaldo: la corrupción se descubre
el día que hay que restaurarlo.

- Retención: 14 días por defecto (`-RetencionDias`).
- **Nunca se borra el último respaldo**, aunque supere la retención. Quedarse sin ninguno
  porque la tarea dejó de correr es peor que guardar uno de más.
- **SQL Server Express no soporta `COMPRESSION`**: el script detecta la edición
  (`EngineEdition = 4`) y omite la opción. Con `COMPRESSION` forzada, Express aborta el
  `BACKUP` entero.
- `backups\` está en `.gitignore`. Son archivos de decenas de MB.

Restaurar (con el backend detenido):

```sql
RESTORE DATABASE [SQLGUTPATATE] FROM DISK = N'C:\GUTT_SYSTEM\backups\<archivo>.bak'
WITH REPLACE, RECOVERY;
```

---

## 5. Correo (SMTP)

El sistema **no inventa** un servidor de correo: si no está configurado, lo dice y deja el
enlace de recuperación en el log del servidor en vez de fingir que envió.

```powershell
node tools\smtp.mjs                          # configuración + conexión + credenciales
node tools\smtp.mjs destino@dominio.com      # además envía un correo real
```

El diagnóstico separa las tres cosas que pueden fallar: configuración, conexión y envío.

Con Gmail, `SMTP_PASS` debe ser una **App Password de 16 caracteres** (con verificación en
dos pasos activa). La contraseña normal de la cuenta es rechazada con
`Username and Password not accepted`.

En caliente, con sesión de administrador: `GET /api/admin/smtp/estado` y
`POST /api/admin/smtp/prueba`.

---

## 6. Proceso mensual de reclasificación de cartera

Pantalla: **Reclasificación de Cartera**. Roles que pueden ejecutarlo: `ADMIN`,
`SUPER_USER`, `ACCOUNTANT`, `CARTERA`. Reversar: `ADMIN`, `SUPER_USER`, `ACCOUNTANT`.

Orden obligatorio, y la interfaz lo impone:

1. **Simular** — no toca nada. Muestra los movimientos, la calificación por operación y el
   ajuste de provisión.
2. **Aplicar** — pide confirmación explícita y asienta con fecha del corte.
3. **Reversar** — si hizo falta. Deja los saldos exactamente como estaban.

Controles que el proceso aplica solo:

- Un único proceso `APLICADO` por fecha de corte (índice único filtrado en la base).
- Si la cartera contable y la cartera de la tabla de amortización difieren por encima de la
  tolerancia (máx. $1 o 0,1 %), el proceso **se niega a aplicarse** y explica por qué.
  Reclasificar sobre un descuadre grande lo escondería en las bandas en vez de corregirlo.
- El asiento siempre cuadra: el proceso **redistribuye** el saldo contable con la estructura
  de bandas real, no crea ni destruye cartera.

Verificación de punta a punta: `npm run test:cartera` (simula, aplica, comprueba saldos,
provisión, morosidad, cuadre del balance, idempotencia, historial y reversa).

---

## 7. Operación diaria y incidentes

| Síntoma | Causa habitual | Qué hacer |
|---|---|---|
| El dominio público da 502 | `server.js` no está escuchando | `Get-Service GuttSystemBackend`; revisar `logs\backend.err.log` |
| El backend responde pero sin datos | SQL Server caído o credenciales cambiadas | `npm run preflight` (punto 3) |
| La morosidad contable no coincide con la real | falta correr el proceso mensual | Reclasificación de Cartera → Simular → Aplicar |
| Un indicador SEPS sale en blanco | cuenta fuera del Catálogo Único | `npm run test:reportes` señala las cuentas sin catalogar |
| El correo de recuperación no llega | SMTP sin App Password | `node tools\smtp.mjs` |
| Un módulo falla con "Invalid column name" | migración sin aplicar | `node tools\migrate.mjs --aplicar` |

**Al relanzar node en Windows**: `Start-Process` **con**
`-RedirectStandardOutput`/`-RedirectStandardError` deja el proceso vivo pero **sin escuchar
el puerto**. Sin redirección arranca bien. Ya costó una caída; no volver a agregarla.

**Archivos `.ps1` en ASCII puro**: Windows PowerShell 5.1 los lee como ANSI y un acento en un
comentario rompe el parseo con `MissingEndCurlyBrace`.

---

## 8. Pasar a servidor de producción (pendiente de decisión del cliente)

Hoy el sistema corre en el equipo de desarrollo detrás de un túnel Tailscale Funnel
(`127.0.0.1:5005`). Funciona para demo, **no para venta**.

El patrón de producción ya está probado en `192.168.1.164` (`PUNTO-VENTA`) para
`GUTT_FAC_CONY`, `GUTT_ECOMMERCE` y `GUTT_COBRANZAS`: Caddy con TLS por dominio + backend
como servicio NSSM + runner autoalojado de GitHub Actions que despliega en cada push a
`main`. Ver `INFRAESTRUCTURA-DEPLOY.md`.

Llevar GUTT_SYSTEM a ese esquema es replicar tres cosas, no inventar ninguna:

1. Entrada en el `Caddyfile` de `.164` apuntando a `C:\GUTT_SYSTEM\dist` y al backend 5005.
2. `deploy\install-service.ps1` en `.164` (con `nssm.exe` presente, para servicio real).
3. `.github/workflows/deploy.yml` copiado del patrón de los otros repos, agregando
   `node tools\migrate.mjs --aplicar` **antes** de `npm run build`.

> Decisión pendiente del cliente: si la base va en `.164` o en un servidor propio de la
> cooperativa. Cambia la cadena de conexión y quién es responsable de los respaldos.
