# 08 — Administración / Seguridad / Usuarios y Roles

Módulo dirigido al **Administrador del sistema** (rol `ADMIN`, y en menor medida `MANAGER`). Cubre el
Portal Administrativo (`components/AdminView.tsx`), el inicio de sesión de todo el personal interno, y
la gestión de usuarios/roles/contraseñas. Complementa `db/informix/modulos/MODULO_AUDITORIA_SEGURIDAD.md`
(modelo legacy Informix `bca*`/`track_*`, solo lectura, no reemplazado aún por el sistema nuevo).

> **Advertencia previa a leer este manual**: la revisión de este módulo encontró vacíos de seguridad
> graves, incluida una vía de acceso administrativo que **no depende de credenciales reales** (ver
> `db/informix/modulos/... ` no aplica; ver sección "Hallazgos de seguridad" más abajo y el reporte de
> la revisión). Este manual describe el sistema **tal como funciona hoy**, incluyendo esos defectos,
> para que el administrador operativo sepa exactamente qué controles existen y cuáles no.

---

## 1. Qué es y quién lo usa

El Portal Administrativo (`ADMIN_HUB` en el menú) tiene 4 pestañas, controladas por
`activeTab` en `AdminView.tsx`:

| Pestaña | Para qué sirve | Quién la ve (según `constants.tsx` → `NAV_BY_ROLE`) |
|---|---|---|
| **SUMMARY** | Indicadores agregados: socios activos, patrimonio en ahorro, cartera vigente, índice de solvencia | ADMIN, MANAGER, SUPER_USER |
| **MEMBERS** | Directorio de **socios** (clientes), ficha integral editable (identidad, localización, cargas familiares, referencias) | ADMIN, MANAGER, SUPER_USER |
| **TASAS** | Tasas de interés por categoría de crédito y plazo máximo | ADMIN, MANAGER, SUPER_USER |
| **PRODUCTOS** | Parámetros de productos de ahorro/certificados SEPS (cuentas contables, transacciones permitidas) | ADMIN, MANAGER, SUPER_USER |
| **SEGURIDAD** | Solo respaldo/restauración de base de datos (export/import JSON) y parámetros globales de crédito (monto mín/máx) | ADMIN, MANAGER, SUPER_USER |

**Importante — lo que este portal NO tiene**: no existe ninguna pestaña ni pantalla para **crear,
desactivar o cambiar el rol de un usuario interno** (cajero, asesor, contador, gerente, administrador).
La pestaña "SEGURIDAD" del portal solo gestiona respaldo/restauración de datos y límites de crédito — no
gestión de identidades. El alta de personal (`dbo.Usuarios`) se hace **directamente en la base de datos
SQL Server**, fuera de la aplicación, sin interfaz ni validación de negocio ni registro de auditoría.
Esto es un vacío operativo y de auditoría, no solo una carencia de UI (ver hallazgo H2).

---

## 2. Roles del sistema y qué puede hacer cada uno

El campo `Rol` de `dbo.Usuarios` se compara contra 7 valores textuales exactos en todo el backend
(`server.js`) y el frontend (`constants.tsx` → `NAV_BY_ROLE`, `types.ts` → `UserRole`):

| Rol | Navegación visible (frontend) | Privilegios de negocio verificados en backend |
|---|---|---|
| `ADMIN` | Todo: panel admin, BI, reportes, caja, ahorros, DPF, contabilidad, aprobación de créditos | Aprobar/rechazar créditos, anular créditos, castigar cartera, anular transacciones contables |
| `SUPER_USER` | Igual que ADMIN (mismo array de menú) | No verificado explícitamente por nombre en los `if` de `server.js` — depende de qué comparación exacta use cada endpoint (ver hallazgo H4) |
| `MANAGER` | Igual que ADMIN | Aprobar/rechazar créditos, anular créditos, castigar cartera (mismo nivel que ADMIN en varios endpoints) |
| `ACCOUNTANT` | Plan contable, ahorros, DPF, BI, reportes | Sin verificación de rol específica encontrada en los endpoints contables revisados |
| `TELLER` | Caja/ventanilla, ahorros, DPF, reportes | Ninguna — realiza depósitos/retiros/transferencias; no tiene acceso de aprobación |
| `CREDIT_OFFICER` | Aprobación de créditos (hub), reportes | Explícitamente **bloqueado** de aprobar sus propias solicitudes (`server.js:1271-1273`) |
| `MEMBER` | Vista de socio: dashboard, ahorros, transferencias, créditos, perfil | Es el socio/cliente, no personal interno |

**Mapeo de roles legacy → sistema nuevo** (`mapRole()`, `server.js:172-182`): traduce el perfil textual de
Informix (`bcaperf`) a uno de los 7 roles de arriba por coincidencia de patrones (`SYSTE|SISTE|ADMIN|DIRECTIV`
→ ADMIN; `GERENCIA|GERENTE|JEFE` → MANAGER; `CONTAB|AUDITOR|FINANC` → ACCOUNTANT; `CAJA|VENTANILLA|OPERAC|RECEPCION`
→ TELLER; `CARTERA|CRÉDITO|ASESOR` → CREDIT_OFFICER; cualquier otro valor no reconocido cae a `MEMBER` por
defecto). Esta función solo se usa en el flujo de búsqueda/lectura contra Informix — el login real de
personal interno (`/api/auth/login.php`) lee el rol directamente de `dbo.Usuarios.Rol` en SQL Server, ya
migrado, no de Informix en vivo.

---

## 3. Inicio de sesión (login)

Endpoint: `POST /api/auth/login.php` (`server.js:440-483`).

1. El usuario ingresa `id` (usuario) y `pin`/contraseña.
2. El backend busca `UsuarioId` en `dbo.Usuarios` (case-insensitive, se hace `.toLowerCase()` sobre el id).
3. Verifica `Activo = 1`; si no, rechaza con "Usuario inactivo".
4. Compara la contraseña recibida contra `PasswordHash` (o `Pin` si `PasswordHash` es nulo) **en texto
   plano, sin hash** — ver hallazgo H1.
5. Si coincide, responde con los datos de sesión: `id`, `name`, `pin` (el valor almacenado, se lo
   devuelve al cliente), `role`, `needsPinChange`.

**No hay token de sesión, JWT, cookie de sesión ni cabecera `Authorization` en ninguna parte de
`server.js`.** El "estado de sesión" vive únicamente en memoria del navegador (`currentUser` en
`App.tsx`). Cada llamada posterior a un endpoint que necesita saber "quién soy" reenvía el `usuarioId`
como campo de texto en el cuerpo de la petición — el servidor confía en ese valor sin verificar que
quien lo envía efectivamente inició sesión como ese usuario. Ver hallazgo H3/H5 para el impacto.

### Timeout de inactividad (sí implementado, solo en frontend)

`App.tsx:115-185`: temporizador de 30 minutos (`IDLE_TIMEOUT`) desde el último evento de mouse/teclado/
touch/scroll. Al cumplirse, se muestra un modal de aviso con cuenta regresiva de 30 segundos
(`WARN_COUNTDOWN`); si el usuario no interactúa, `handleIdleLogout()` limpia `currentUser` y regresa a
la pantalla de login. Es un control **solo de UI** — no expira nada en el servidor porque el servidor no
mantiene sesión. Si el usuario copia el `usuarioId` y sigue llamando endpoints directamente (p. ej. con
`curl` o Postman) después del "logout" por inactividad, el backend los sigue aceptando indefinidamente.

### Cambio de contraseña/PIN

Endpoint: `POST /api/auth/update_password` (`server.js:486-517`). Actualiza `PasswordHash` (también en
texto plano — mismo campo que valida el login) y limpia `RequiereCambioPin`. **Este es el único evento
de seguridad que hoy queda en `dbo.AuditoriaProcesos`** (`proceso: 'SEGURIDAD'`, `accion:
'CAMBIO_PASSWORD'`), además de un registro paralelo en `dbo.AuditoriaUsuarios`.

No hay política de complejidad de contraseña/PIN aplicada en backend: `update_password` acepta
cualquier valor no vacío (`if (!id || !password)`), sin longitud mínima, sin exigir dígitos/letras, sin
verificar que no sea igual al PIN anterior. El campo se guarda en `NVARCHAR(100)` — sugiere que se
pensó para admitir un hash algún día, pero hoy guarda el valor tal cual se recibe.

---

## 4. Qué queda en auditoría hoy (y qué no)

Tabla `dbo.AuditoriaProcesos` (`proceso = 'SEGURIDAD'`, ver `db/sqlserver/23_auditoria_procesos.sql`),
helper `registrarAuditoriaProceso()` en `server.js:189-209`:

| Evento | ¿Auditado hoy? | Dónde |
|---|---|---|
| Cambio de contraseña/PIN propio | **Sí** | `server.js:503-510`, `accion: 'CAMBIO_PASSWORD'` |
| Login exitoso | **No** | — |
| Login fallido (intento con credenciales incorrectas) | **No** | — |
| Creación de usuario interno | **No** — porque no existe el endpoint que lo haría | — |
| Cambio de rol de un usuario | **No** — mismo motivo | — |
| Desactivación de usuario | **No** — mismo motivo | — |
| Anulación de transacción contable por un ADMIN | Parcialmente — la transacción de reverso queda en `RegistroContable`, pero la acción administrativa "quién anuló y por qué" no se registra en `AuditoriaProcesos` | `server.js:2807-2860` |

Sin bitácora de login, un auditor SEPS no puede reconstruir "quién entró, cuándo, desde dónde" para el
sistema nuevo — a diferencia del legacy Informix, que sí lo hacía vía `track_01` (10.843 sesiones
registradas históricamente, ver `MODULO_AUDITORIA_SEGURIDAD.md` §4). Esa capacidad se perdió en la
migración y no ha sido repuesta.

---

## 5. Hallazgos de seguridad

Ver el reporte completo con severidad y ubicación exacta en la respuesta de esta revisión. Resumen para
quien opere el sistema:

- El login tiene una **vía de respaldo local en el frontend** que no depende de la contraseña real del
  usuario — cualquier persona con acceso a la pantalla de login puede intentarlo.
- Varias contraseñas/PIN se comparan y almacenan **en texto plano**, sin hash.
- Al menos un endpoint administrativo confía en un campo `role` que **envía el propio cliente**, en vez
  de verificarlo contra la base de datos.
- No existe protección contra intentos repetidos de login (fuerza bruta) ni bloqueo temporal de cuenta.
- No existe pantalla de administración de usuarios internos: el alta/baja/cambio de rol se hace
  directamente en SQL Server, sin trazabilidad de aplicación.

---

## 6. Recomendaciones operativas mientras se corrigen los hallazgos técnicos

1. **Cambiar de inmediato** la contraseña de todas las cuentas cuyo `UsuarioId` coincida con los
   usuarios por defecto del frontend: `admin`, `superuser`, `cont`, `caja`, `asesor` (ver hallazgo
   crítico sobre credenciales embebidas). Si alguna de estas cuentas no debe existir en producción,
   desactivarla (`Activo = 0`) directamente en `dbo.Usuarios`.
2. Restringir por firewall/red el acceso a los endpoints de `server.js` solo a las estaciones de trabajo
   de la cooperativa mientras no exista autenticación por sesión/token.
3. Registrar manualmente (fuera del sistema, p. ej. en una bitácora física o Excel controlado) cualquier
   alta, baja o cambio de rol de usuario hasta que exista el endpoint y su auditoría automática.
4. No exponer `server.js` directamente a Internet sin un proxy que al menos aplique autenticación
   adicional (p. ej. VPN), dado que hoy la autorización de los endpoints es trivialmente evadible por
   quien pueda enviar peticiones HTTP directas.
