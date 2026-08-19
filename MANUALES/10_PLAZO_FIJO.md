# 10 — Cartera de Plazo Fijo (Reporte Ejecutivo)

Pantalla de reportería de **cartera de Depósitos a Plazo Fijo consolidada** (vigente / vencida /
cancelada) de Caja Patate, con tarjetas de resumen, tasas promedio ponderadas por monto, gráfico de
composición y el detalle de todas las pólizas registradas en `bcadpfi`, descargable en CSV e
imprimible. Es un módulo de **solo lectura**: no crea, liquida, cancela ni renueva pólizas (eso lo hace
`PlazoFijoView.tsx` / Depósitos a Plazo, el módulo operativo existente que reserva el archivo
`04_PLAZO_FIJO.md` del índice general, aún pendiente de documentar).

> Nota de alcance: este manual **no es el mismo módulo** que `PlazoFijoView.tsx` (`AppView.PLAZO_FIJO`).
> Ese es el flujo operativo (apertura, liquidación, cancelación anticipada, renovación de pólizas)
> contra una base espejo en SQL Server (`dbo.DepositosPlazo`). Este es un **reporte gerencial/ejecutivo**
> nuevo, que consulta el core bancario legado (Informix, tabla real `bcadpfi`) en vivo, siguiendo
> exactamente el mismo patrón que `09_CARTERA_CREDITO.md`.

---

## 1. Qué es y quién lo usa

| Pantalla | Componente | Quién la usa | Qué hace |
|---|---|---|---|
| Cartera de Plazo Fijo | `components/CarteraPlazoFijoView.tsx` (`AppView.CARTERA_PLAZO_FIJO`) | Administrador, Super Usuario, Gerente, Contador | Tarjetas de resumen (total captado, vigente, vencida, cancelada), tasas promedio ponderadas por monto, gráfico de composición y tabla de detalle de cada póliza de plazo fijo, con búsqueda, descarga CSV e impresión |
| `GET /api/reportes/cartera-plazo-fijo` (server.js) | — | Backend interno | Ejecuta como subproceso la herramienta Java `PlazoFijoJsonRunner` del proyecto hermano `C:\GUTT_CONEXION_CAJA_PATATE\jdbc-informix`, que consulta Informix (`afccajapatate`, tabla `bcadpfi`) directamente vía JDBC a través del túnel Tailscale (`100.104.56.83:1526`), y devuelve el resultado como JSON |

A diferencia de `PlazoFijoView.tsx` (que administra pólizas contra un espejo en SQL Server con
operaciones de escritura: apertura, liquidación, cancelación, renovación), este reporte **es de solo
lectura contra Informix producción** y no comparte tabla, conexión ni lógica con el módulo operativo.
Ambos conviven sin conflicto.

---

## 2. Estructura de datos real (verificada contra producción, 2026-08-01)

Tabla principal `bcadpfi` (99 registros, $804,704.87 en total al momento de la verificación), con
catálogo de estados `bcaedpf`:

| Código | Estado |
|---|---|
| 1 | ACTIVO |
| 2 | VENCIDO |
| 3 | CANCELADO |
| 4 | PENDIENTE EFECTIVIZAR |
| 5 | PACTADO |
| 6 | ANULADO |
| 7 | RENOVADO |
| 8 | PENDIENTE DE PAGO |

Distribución real verificada en producción el 2026-08-01 (`SELECT edpf_des_edpf, COUNT(*), SUM(dpfi_val_dpfi) FROM bcadpfi d JOIN bcaedpf e ON e.edpf_cod_edpf = d.dpfi_cod_edpf GROUP BY 1`):

| Estado | # Pólizas | Monto |
|---|---:|---:|
| ACTIVO | 39 | $400,538.30 |
| CANCELADO | 48 | $315,575.29 |
| ANULADO | 4 | $48,300.00 |
| RENOVADO | 8 | $40,291.28 |
| **Total** | **99** | **$804,704.87** |

(No había registros VENCIDO, PACTADO, PENDIENTE EFECTIVIZAR ni PENDIENTE DE PAGO en producción al
momento de esta verificación; si aparecen en el futuro, el reporte los clasifica automáticamente sin
necesidad de cambios, porque se agrupan por `bcaedpf.edpf_des_edpf`, no por código hardcodeado.)

### 2.1 Clasificación de negocio (pedida explícitamente, no es 1:1 con el catálogo)

| Bucket del reporte | Estados que agrupa |
|---|---|
| **Vigente** | ACTIVO + PACTADO + RENOVADO |
| **Vencida** | VENCIDO |
| **Cancelada** | CANCELADO |
| **Otros estados** (tarjeta aparte, en rojo) | ANULADO + PENDIENTE EFECTIVIZAR + PENDIENTE DE PAGO |

El bucket "Otros estados" existe para **no ocultar** el dato de ANULADO ($48,300.00 real, el 6 % de la
cartera total) solo porque no encajaba en los 3 buckets pedidos (vigente/vencida/cancelada) — se
muestra aparte, explícitamente, en vez de omitirse.

### 2.2 Consulta SQL

Ver `C:\GUTT_CONEXION_CAJA_PATATE\jdbc-informix\sql\cartera_plazo_fijo_template.sql`. A diferencia de
`cartera_credito_template.sql`, **no requiere fecha de corte**: `bcadpfi` ya guarda el estado vigente de
cada póliza directamente (no hay que reconstruir un corte histórico sumando cuotas/abonos como en
`bcacred`/`bcadivc`).

Columnas devueltas: `id_dpf`, `num_dpf`, `num_socio`, `identificacion`, `nombres` (join a `bcaclie`),
`fec_apertura`, `fec_vencimiento`, `plazo_dias`, `tasa`, `monto`, `porc_retencion`, `plazo_reclamo`,
`num_pago_interes`, `cod_estado`, `estado` (join a `bcaedpf`), `beneficiario`, `detalle`, `cod_oficina`,
`cod_caja`, `cod_moneda`.

### 2.3 Tasas promedio ponderadas

Las tasas promedio que se muestran por bucket (vigente/vencida/cancelada) son **promedios ponderados
por monto**, no promedios simples: `Σ(monto_i × tasa_i) / Σ(monto_i)`, calculado en el frontend
(`CarteraPlazoFijoView.tsx`) sobre los datos crudos recibidos, sin redondeos intermedios en el
acumulado.

---

## 3. Cómo se opera paso a paso

1. El usuario entra a "Cartera de Plazo Fijo" desde el menú lateral (visible solo para los roles
   listados arriba).
2. Al cargar la pantalla, se dispara automáticamente una consulta a `GET /api/reportes/cartera-plazo-fijo`.
   **Esta consulta es en vivo contra el core bancario legado y puede tardar entre 15 y 40 segundos**, sin
   caché ni tabla espejo: la pantalla muestra un estado de carga explícito.
3. Botón "Actualizar" para volver a consultar.
4. Tarjetas de resumen: total captado, vigente (con tasa promedio ponderada y # de pólizas), vencida,
   cancelada, y — si hay monto — la tarjeta roja de "Otros estados".
5. Gráfico de composición (dona) con la misma paleta institucional, y panel de tasas promedio
   ponderadas por bucket.
6. Tabla de detalle con búsqueda por nombre, cédula, número de socio o número de póliza (filtro en
   memoria, no dispara nueva consulta a Informix).
7. Botón CSV: descarga todas las columnas originales de cada póliza. Botón Imprimir: `window.print()`
   sobre `.printable-area`, mismo patrón que el resto del sistema.

---

## 4. Reglas de negocio y validaciones aplicadas

| Regla | Dónde se aplica | Observación |
|---|---|---|
| Solo `ADMIN`, `MANAGER`, `ACCOUNTANT` (más `SUPER_USER` en frontend) pueden ver el reporte | Frontend (`hasAccess`) y backend (`PLAZO_FIJO_ROLES` en server.js) | `CREDIT_OFFICER` queda fuera (a diferencia de Cartera de Crédito): esto es cartera de captaciones, no de créditos. `TELLER` y `MEMBER` tampoco, por ser información agregada institucional |
| Montos y tasas se muestran tal como los devuelve Informix, sin redondeos intermedios | `CarteraPlazoFijoView.tsx` (`money()` formatea solo al renderizar) | Mismo criterio que `09_CARTERA_CREDITO.md` |
| Timeout de 60 segundos en el subproceso Java | server.js (`PLAZO_FIJO_TIMEOUT_MS`) | Igual que Cartera de Crédito |

---

## 5. Notas operativas

- Requiere lo mismo que Cartera de Crédito: `java` en el `PATH` del proceso `server.js`, el proyecto
  `jdbc-informix` compilado (`target\classes`, incluye ahora `PlazoFijoJsonRunner.class`,
  `JsonUtil.class` y el método `ReportQueries.carteraPlazoFijo()`), y el túnel Tailscale activo.
- El endpoint nuevo solo queda activo después de reiniciar `node server.js`.
- Verificado en vivo durante la construcción de este módulo (2026-08-01): 99 pólizas, $804,704.87 en
  total (ACTIVO $400,538.30 / CANCELADO $315,575.29 / ANULADO $48,300.00 / RENOVADO $40,291.28) —
  coincide exactamente con la cifra que el usuario ya había verificado por separado antes de pedir este
  módulo, lo que confirma la integridad de la consulta.
- **Hallazgo de calidad de datos, no oculto**: nombres y textos libres (`detalle`, `beneficiario`) con
  tildes pueden llegar corruptos (carácter de reemplazo Unicode U+FFFD) al leerlos vía JDBC desde
  Informix — verificado a nivel de bytes, no es un artefacto de consola. La causa raíz está en la
  configuración de locale del cliente Informix/JDBC (afecta también a `CarteraJsonRunner`, no es nuevo
  de este módulo), no en este código. **No afecta ningún monto ni cifra numérica** (montos, tasas,
  fechas, códigos de estado llegan correctos). Pendiente: configurar `DB_LOCALE`/`CLIENT_LOCALE` en la
  conexión JDBC si se requiere mostrar nombres con tildes perfectos.

## 6. Reconciliación Inventario vs. Contabilidad (2026-08-01)

Desde 2026-08-01, `GET /api/reportes/cartera-plazo-fijo` devuelve `{ polizas, reconciliacion }` (antes
devolvía solo un arreglo de pólizas). El campo `reconciliacion` compara el inventario vigente
(`bcadpfi`, estado ACTIVO) contra el saldo contable real (suma de las cuentas `210136` "Ahorro Fijo" +
`2103` "Depósitos a Plazo", porque un cambio de parámetro del sistema legado migró el posteo de una
familia a la otra durante 2026). `CarteraPlazoFijoView.tsx` muestra ambos totales lado a lado con la
diferencia y la evidencia del cambio de parámetro — **ver el análisis completo, con las consultas SQL y
resultados reales, en `MANUALES/RECONCILIACION_PLAZO_FIJO.md`**. Un residuo de $1,529.53 (0.38% del
total al 2026-07-31) queda documentado como no explicado al 100%, sin ocultarlo.
