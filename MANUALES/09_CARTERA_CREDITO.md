# 09 — Cartera de Crédito (Reporte Ejecutivo)

Pantalla de reportería de **cartera de crédito consolidada** (vigente / vencida / demandada / castigada)
de Caja Patate, con tarjetas de resumen, gráfico de composición y detalle de todas las operaciones de
crédito activas a una fecha de corte, descargable en CSV e imprimible. Es un módulo de **solo lectura**:
no crea, aprueba ni modifica créditos (eso lo hace `CreditOfficerApproval.tsx` / Aprobación de Créditos,
fuera de este manual).

> Nota de alcance: este manual no es el mismo módulo que reserva `02_CREDITOS.md` en el índice general
> (que cubre el flujo operativo de solicitud/aprobación/desembolso/cobranza de créditos, aún pendiente de
> documentar). Tampoco es `07_REPORTES_SEPS.md` (reportes regulatorios formales ante la SEPS). Este es un
> reporte gerencial/ejecutivo de cartera, nuevo, que consulta el core bancario legado en vivo.

---

## 1. Qué es y quién lo usa

| Pantalla | Componente | Quién la usa | Qué hace |
|---|---|---|---|
| Cartera de Crédito | `components/CarteraCreditoView.tsx` (`AppView.CARTERA_CREDITO`) | Administrador, Super Usuario, Gerente, Contador, Asesor de Crédito | Muestra tarjetas de resumen (cartera total, vigente, vencida, castigada), un gráfico de composición y una tabla con el detalle de cada operación de crédito a una fecha de corte, con búsqueda, descarga CSV e impresión |
| `GET /api/reportes/cartera-credito` (server.js) | — | Backend interno | Ejecuta como subproceso la herramienta Java `CarteraJsonRunner` del proyecto hermano `C:\GUTT_CONEXION_CAJA_PATATE\jdbc-informix`, que consulta Informix (`afccajapatate`) directamente vía JDBC a través del túnel Tailscale (`100.104.56.83:1526`), y devuelve el resultado como JSON |

A diferencia del resto de módulos de este sistema (que leen de SQL Server o del puente PowerShell/ODBC a
Informix ya existente, ver `queryInformix()` en server.js), este reporte **no reutiliza ese puente**: usa
una herramienta Java independiente, ya construida y validada fuera de este repositorio, porque el puente
PowerShell/ODBC existente no tiene la consulta de cartera (`sql/cartera_credito_template.sql`, en el
proyecto `jdbc-informix`) implementada. Ambos caminos a Informix conviven; no hay conflicto entre ellos
porque son procesos y conexiones separadas.

---

## 2. Cómo se opera paso a paso

1. El usuario entra a "Cartera de Crédito" desde el menú lateral (visible solo para los roles listados
   arriba).
2. Al cargar la pantalla, se dispara automáticamente una consulta a `GET /api/reportes/cartera-credito`
   con la fecha de hoy (zona horaria `America/Guayaquil`) como fecha de corte por defecto.
3. **Esta consulta es en vivo contra el core bancario legado y puede tardar entre 15 y 40 segundos** (no
   hay caché ni tabla espejo): la pantalla muestra un estado de carga explícito indicando esto, en lugar de
   simular una respuesta instantánea.
4. El usuario puede cambiar la fecha de corte con el selector de fecha superior y presionar "Actualizar"
   para volver a consultar con esa fecha (el mismo parámetro que acepta `CarteraJsonRunner` por línea de
   comandos).
5. Una vez cargados los datos: tarjetas de resumen (cartera total, vigente, vencida, castigada, más
   demandada / provisión requerida / recuperación de capital-interés / mora recuperada), un gráfico de
   composición (dona, misma paleta de colores que `ReportsView.tsx`) y la tabla de detalle con las 14
   columnas más relevantes de las 20 que trae el reporte.
6. La tabla se puede filtrar por nombre, cédula, número de socio o número de operación (filtro en memoria
   sobre los datos ya cargados, no dispara una nueva consulta a Informix).
7. Botón CSV: descarga **todas** las columnas originales de cada fila (incluye `cap_recuperado`,
   `int_recuperado`, `mora_recuperada`, `provision_requerida`, `linea_credito`, etc., no solo las visibles
   en pantalla), mismo patrón de exportación (`Blob` + BOM UTF-8 + separador `;`) que
   `ReportsView.tsx:247-266`.
8. Botón Imprimir: usa `window.print()` sobre el bloque de tabla (`.printable-area`), igual que el resto
   del sistema.

---

## 3. Reglas de negocio y validaciones aplicadas

| Regla | Dónde se aplica | Observación |
|---|---|---|
| Solo `ADMIN`, `MANAGER`, `ACCOUNTANT`, `CREDIT_OFFICER` (más `SUPER_USER` en el frontend, rol solo de demo local) pueden ver el reporte | Frontend (`CarteraCreditoView.tsx`, gate `hasAccess`) y backend (`CARTERA_CREDITO_ROLES` en server.js, dentro de `GET /api/reportes/cartera-credito`) | `TELLER` y `MEMBER` quedan excluidos: es información financiera agregada de toda la cooperativa, no de un socio individual. A diferencia de otros reportes de este sistema (ver hallazgo H1 de `01_SOCIOS.md` sobre endpoints sin `requireAuth`), este endpoint nuevo sí exige JWT válido (`requireAuth`) y valida el rol contenido en el token, no solo la sesión |
| Fecha de corte solo se acepta en formato `YYYY-MM-DD` | server.js (regex `^\d{4}-\d{2}-\d{2}$` antes de pasarla como argumento de línea de comandos al proceso Java) | Cualquier valor que no calce ese formato se ignora y se usa la fecha de hoy; evita inyección de argumentos al subproceso |
| Los montos (`saldo_vigente`, `saldo_vencido`, `saldo_demandado`, `saldo_castigado`, `saldo_total`, etc.) se muestran tal como los devuelve Informix, sin redondeos intermedios | `CarteraCreditoView.tsx` (`money()` formatea solo al renderizar; las sumas para las tarjetas se acumulan sobre los valores crudos, sin `parseFloat(x.toFixed(2))` intermedios) | Evita el patrón de error clásico de acumular imprecisión de punto flotante por redondear en cada paso intermedio |
| Timeout de 60 segundos en el subproceso Java | server.js (`CARTERA_CREDITO_TIMEOUT_MS`) | Si Informix o el túnel Tailscale no responden a tiempo, el usuario recibe un error explícito (`504`) en vez de una espera indefinida |

---

## 4. Qué queda en auditoría hoy (y qué no)

`GET /api/reportes/cartera-credito` es de **solo lectura** (no modifica ningún dato) y, siguiendo el mismo
criterio que el resto de endpoints de solo consulta del sistema (ej. `GET /api/socios/buscar`, `GET
/api/reportes/situacion-general`), **no llama a `registrarAuditoriaProceso()`**. Si en el futuro se
requiere trazabilidad de quién consultó la cartera completa de la cooperativa y cuándo (dato sensible), se
puede añadir un registro de auditoría de tipo `REPORTES` sin cambiar el resto del flujo.

---

## 5. Notas operativas

- El endpoint nuevo **solo queda activo después de reiniciar el proceso `node server.js`** que sirve la
  API (el proceso que ya estaba corriendo en producción/desarrollo al momento de construir este módulo no
  recarga código en caliente).
- Requiere que la máquina donde corre `server.js` tenga: (a) `java` en el `PATH`, (b) el proyecto
  `C:\GUTT_CONEXION_CAJA_PATATE\jdbc-informix` compilado (`target\classes`) con su `config\db.properties`
  configurado, y (c) el túnel Tailscale hacia `100.104.56.83:1526` activo. Si cualquiera de estas tres
  condiciones falla, el endpoint responde `500`/`502`/`504` con un mensaje explícito en vez de colgarse.
- Verificado en vivo durante la construcción de este módulo: 238 operaciones de crédito a fecha de corte
  2026-07-31, cartera total ≈ $442,829.33 (vigente ≈ $437,051.81, vencida ≈ $5,777.52). Estos números
  cambian con cada corte y se muestran solo como evidencia de que la integración end-to-end (frontend →
  `server.js` → Java → Informix) funciona, no como un valor de referencia fijo.

## 6. Vista alternativa: por Línea (OBL) y Antigüedad — 2026-08-01

El usuario comparó este módulo contra el reporte legado "ANEXO LINEAS" (AFC/SITETRIOR), que agrupa la
cartera por código de línea de crédito ("OBL", ej. 1402/1404/1428/1452) con buckets de mora por
antigüedad (H30D/H90D/H180D/H360D/360→), en vez de por letra de calificación (A-1/A-2/...). Desde
2026-08-01, `GET /api/reportes/cartera-credito` devuelve `{ fechaCorte, operaciones, porLineaAntiguedad }`
(antes devolvía solo el arreglo `operaciones`) y `CarteraCreditoView.tsx` tiene un selector "Por
Calificación" / "Por Línea y Antigüedad" que alterna entre ambas vistas sin disparar una nueva consulta.

**Qué es "OBL" (confirmado contra producción, no es `bcaccre.ccre_cod_ccre`)**: cada línea de crédito en
`bcaccre` (códigos 1-10: Productivo, Consumo, Vivienda, Microempresa, etc.) tiene, además de su propio
código, seis columnas con el código de cuenta CUC que le corresponde según la situación del crédito
(`ccre_nor_ccon` por vencer, `ccre_ven_ccon` vencida, `ccre_rie_ccon` que no devenga intereses,
`ccre_rel_ccon` demandada, `ccre_rve_ccon`/`ccre_rri_ccon` reestructurada). El código "OBL" que agrupa el
Anexo Líneas es exactamente uno de esos 6 códigos — ej. línea 4 "Microempresa" → `1404` (por vencer),
`1452` (vencida), `1428` (no devenga). Ver `sql/cartera_credito_linea_antiguedad_template.sql` para el
detalle completo.

**Verificación de cuadre**: sumando `calf_val_acti + calf_val_venc + calf_val_deve + calf_val_dema +
calf_val_cast` de `bcacalf` a la fecha de calificación 2026-07-31 se obtuvo **$443,552.99**, exacto
contra el "Tot.Capit" operativo del Anexo Líneas legado. La antigüedad se calcula con `calf_dias_venc`
(para capital vencido, mismo criterio que usa el CUC para 1.4.52) y con los días al próximo vencimiento
de cuota no pagada vía `bcadivc` (para capital por vencer/no devenga, mismo criterio que 1.4.02/1.4.04).
Los campos "Int.Provi"/"Int.Venci" del anexo legado (montos muy pequeños, $5.64 y $87.04 sobre una
cartera de $443K) no se pudieron mapear con certeza a un campo específico de `bcacalf` — se documenta
como limitación conocida, no se fuerza a coincidir. El contraste contra la segunda tabla del anexo
("SALDOS DE LAS CUENTAS DE CARTERA - Contabilidad", $443,575.30, diferencia $70.37 vs. lo operativo)
tampoco se pudo reconciliar al 100% con el tiempo disponible en esta sesión — queda como pendiente para
una revisión futura si se requiere, siguiendo el mismo patrón de "documentar sin ocultar" usado en
`MANUALES/RECONCILIACION_PLAZO_FIJO.md`.
