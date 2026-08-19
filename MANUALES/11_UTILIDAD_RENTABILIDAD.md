# 11 — Utilidad y Rentabilidad (Reporte Ejecutivo)

Pantalla de reportería de **utilidad neta y rentabilidad aproximada** (ROA/ROE) de Caja Patate,
calculada en vivo a partir del Catálogo Único de Cuentas (CUC) real de la SEPS, con verificación
explícita de partida doble y cruce contra el balance materializado. Es un módulo de **solo lectura**: no
registra asientos contables ni modifica el plan de cuentas.

> Metodología de verificación inspirada en la ya aplicada al proyecto hermano de Fundación
> (`D:\GUTT_PROYECT_FIES\MODELO_NUEVO\ALCANCE.md`), adaptada a Caja Patate. El share SMB no estuvo
> accesible al momento de construir este módulo (`\\100.112.161.17\D$\GUTT_PROYECT_FIES`), así que la
> metodología se rehizo desde cero contra los datos reales de Caja Patate, sin copiar cifras ni
> asumir que la estructura del catálogo es idéntica entre entidades — se verificó cada supuesto contra
> producción (ver sección 2).

---

## 1. Qué es y quién lo usa

| Pantalla | Componente | Quién la usa | Qué hace |
|---|---|---|---|
| Utilidad y Rentabilidad | `components/UtilidadRentabilidadView.tsx` (`AppView.UTILIDAD_RENTABILIDAD`) | Administrador, Super Usuario, Gerente, Contador | Ingresos/gastos del ejercicio, utilidad neta y anualizada, balance (activos/pasivos/patrimonio), ROA/ROE aproximados, y una sección de validaciones y hallazgos de calidad de datos que **nunca se oculta** |
| `GET /api/reportes/utilidad-rentabilidad` (server.js) | — | Backend interno | Ejecuta como subproceso `UtilidadRentabilidadJsonRunner` (proyecto `jdbc-informix`), que corre varias consultas contra Informix (`afccajapatate`), calcula todo con `BigDecimal` (nunca `float`/`double`) y devuelve un único objeto JSON |

`CREDIT_OFFICER` y `TELLER` no tienen acceso: es información financiera sensible de toda la cooperativa
(utilidad neta, rentabilidad), no operativa de un socio.

---

## 2. Estructura del CUC de Caja Patate (verificada en vivo, no asumida)

Tablas reales usadas: `bcaccon` (plan de cuentas, una fila por cuenta **por ejercicio** — ver 2.1),
`bcacomp` (cabecera de comprobante), `bcadcom` (líneas débito/crédito), `bcaejer` (ejercicios: 10=2024,
11=2025, **12=2026**, el actual), `bcaperi` (periodos dentro de un ejercicio), `bcatasi` (catálogo
D/C: `D`=DEBITO, `C`=CREDITO), `bcanatu` (catálogo de natura: `D`=DEUDORA, `A`=ACREEDORA,
`S`=NO VALOR CUC), `bcasact` (saldos materializados por cuenta/periodo/oficina).

### 2.1 Cada cuenta existe una vez por ejercicio

Verificado con `SELECT ccon_cod_ctas, ccon_cod_ejer, ccon_cod_ccon, ccon_nom_ccon, ccon_cod_natu FROM
bcaccon WHERE ccon_cod_ejer=12 AND ccon_cod_ccon='1'` → una sola fila (`ccon_cod_ctas=24346`,
`ACTIVO`, natura `D`). Es decir, `ccon_cod_ctas` (el serial interno, PK real) es único por
**(ejercicio, código de cuenta)** — la misma cuenta "1101 Caja" tiene un `ccon_cod_ctas` distinto en
2024, 2025 y 2026. `bcadcom.dcom_cod_ctas` apunta a ese serial, así que filtrar por
`bcaccon.ccon_cod_ejer = 12` en el JOIN ya restringe correctamente al ejercicio 2026, sin necesitar
pasar por `bcaperi`/`bcaejer` para ese propósito.

### 2.2 Clases del CUC (primer dígito de `ccon_cod_ccon`) y su natura real

Verificado con `SELECT ccon_cod_ccon, ccon_nom_ccon, ccon_cod_natu FROM bcaccon WHERE ccon_cod_ejer=12
AND ccon_cod_ccon IN ('1','2','3','4','5','7')`:

| Clase | Nombre | Natura real |
|---|---|---|
| 1 | ACTIVO | D (deudora) |
| 2 | PASIVOS | A (acreedora) |
| 3 | PATRIMONIO | A (acreedora) |
| 4 | GASTOS | D (deudora) |
| 5 | INGRESOS | A (acreedora) |
| 7 | CUENTAS DE ORDEN | — (memorándum, fuera de balance) |

La clase **7 (Cuentas de Orden)** se excluye de todo cálculo de utilidad/balance: son cuentas de
memorándum (ej. garantías, contingentes), no activos/pasivos reales — verificado que en 2026 tienen
movimiento (`$1,025,137.62` en D y C, exactamente iguales entre sí) que no debe sumarse al balance.

### 2.3 Convención de signos verificada con asientos reales (no asumida)

Se tomaron cuentas reales y se inspeccionaron sus líneas de diario:

- **Gasto real** (`45010501 Remuneraciones mensuales`): 6 líneas, **100 % tipo D** (débito),
  $6,500.00 — ningún crédito. Confirma: para cuentas deudoras (clase 4), el saldo real = `SUM(D) − SUM(C)`.
- **Ingreso real** (`510420 Cartera de microcrédito`, dentro de "Intereses y descuentos de cartera de
  créditos"): 230 líneas C por $42,845.13 y 24 líneas D por $307.07 (reversos/correcciones menores).
  Confirma: para cuentas acreedoras (clase 5), el saldo real = `SUM(C) − SUM(D)`.

Esta convención (`D natura → SUM(D)-SUM(C)`, `A natura → SUM(C)-SUM(D)`) se aplica de forma genérica en
el código (`UtilidadRentabilidadQueries.saldoClase`/`saldoBcasact`), consultando la natura real de cada
clase en cada corrida (no hardcodeada), para que siga siendo válida si el catálogo cambia en un
ejercicio futuro.

---

## 3. Verificación de partida doble (obligatoria antes de mostrar cualquier cifra)

Consulta: `sql/utilidad_partida_doble.sql`, filtrando `dcom_may_dcom = 1` (solo líneas mayorizadas) y
`comp_anulado = 0` (excluyendo comprobantes anulados). Resultado real verificado el 2026-08-01, corte
2026-07-31:

| Tipo | # Líneas | Total |
|---|---:|---:|
| D (Débito) | 4,375 | $6,806,909.14 |
| C (Crédito) | 4,889 | $6,806,909.14 |

**Cuadra exacto (`partidaDobleCuadra = true`)**. El reporte muestra este resultado de forma explícita
en pantalla (banda de validaciones verde/roja) sea cual sea el resultado — si algún día no cuadrara, se
mostraría en rojo con la diferencia exacta, no se ocultaría.

### 3.1 Por qué se excluyen líneas no mayorizadas y comprobantes anulados

- **8 líneas sin mayorizar** (`dcom_may_dcom = 0`) al 2026-07-31, por $872.12 en movimiento bruto — no
  son saldo en firme, se excluyen del cálculo. Sin este filtro, la partida doble *también* cuadraría
  (el sistema las mantiene balanceadas incluso sin mayorizar), pero incluirlas mezclaría borradores con
  el resultado real.
- **Hallazgo real, no oculto**: el comprobante **2265** (2026-02-24, "Integración Contable de
  RENOVACION DPF en DOLARES", $1,963.33) está marcado `comp_anulado = 1` en `bcacomp`, pero sus 2 líneas
  de diario siguen con `dcom_may_dcom = 1` (mayorizadas) en las cuentas de pasivo `210325` ("De más de
  361 días") y `210305` ("De 1 a 30 días") — es decir, **un comprobante anulado que sigue afectando el
  saldo contable posteado**. No afecta el cálculo de utilidad de este reporte (no toca clase 4/5), pero
  sí podría estar distorsionando el saldo de depósitos a plazo por reclasificación entre esos dos
  rangos de plazo. Se reporta en la sección "Hallazgos de Calidad de Datos" de la pantalla, con el
  detalle completo (comprobante, fecha, cuenta, valor), y en el JSON (`calidadDatos.detalleComprobantesAnuladosConLineasPosteadas`).

---

## 4. Cálculo de ingresos, gastos y utilidad neta

**Ingresos (clase 5) y gastos (clase 4) se calculan siempre desde el diario (`bcadcom`) del ejercicio
2026, nunca desde `bcasact`** — porque las cuentas de resultados son *nominales*: arrancan en $0 cada
1 de enero (verificado: en el periodo de apertura del ejercicio, `sact_cod_peri` con `peri_mes_peri=0`,
las clases 4 y 5 no tienen ningún saldo inicial, solo las clases 1/2/3 sí lo tienen). Por lo tanto el
acumulado del diario del ejercicio completo ya es, por definición, el ingreso/gasto real del año.

Resultado real verificado (corte 2026-07-31, 7 meses transcurridos):

| Concepto | Monto |
|---|---:|
| Ingresos (clase 5) | $75,011.27 |
| Gastos (clase 4) | $67,358.64 |
| **Utilidad neta (real, sin anualizar)** | **$7,652.63** |
| Utilidad anualizada (× 12 / 7 meses) | $13,118.79 |

---

## 5. Cálculo del balance (activos/pasivos/patrimonio) — por qué NO se usa solo `bcadcom`

A diferencia de ingresos/gastos, las cuentas de balance (clases 1/2/3) son **permanentes**: arrastran
saldo de años anteriores. `bcadcom` del ejercicio 2026 por sí solo **no** contiene ese arrastre, solo el
movimiento del año — se verificó que no existe un asiento de "apertura" en `bcacomp` que traslade el
saldo de 2025 al nuevo ejercicio. Por eso el balance se obtiene de `bcasact` (saldo materializado,
acumulado por periodo), y se **cruza obligatoriamente contra el diario** antes de confiar en él (el
usuario advirtió explícitamente que en la entidad hermana Fundación este tipo de tabla puede estar
descuadrada en periodos abiertos).

### 5.1 Detalle técnico de `bcasact` (para no duplicar montos)

`bcasact` guarda un renglón por cada nivel jerárquico del plan de cuentas (la cuenta raíz de cada clase
Y cada subcuenta), con rollup automático del sistema hacia la raíz. La consulta usa
`LENGTH(ccon_cod_ccon) = 1` para tomar **solo** la fila raíz de cada clase (evita sumar dos veces
raíz + subcuentas). Hay un periodo especial de apertura (`peri_mes_peri = 0`) con el saldo inicial del
año, y un periodo por cada mes calendario transcurrido.

### 5.2 Cruce realizado (2026-08-01, corte 2026-07-31)

Para las clases de resultados (4 y 5), el saldo de `bcasact` (acumulado) debe coincidir EXACTO con el
saldo del diario del ejercicio completo, porque ambos cuentan lo mismo sin arrastre:

| Clase | Saldo diario | Saldo `bcasact` | Diferencia | ¿Coincide? |
|---|---:|---:|---:|---|
| 4 (Gastos) | $67,358.64 | $67,358.64 | $0.00 | Sí |
| 5 (Ingresos) | $75,011.27 | $75,011.27 | $0.00 | Sí |

**`bcasactCuadraConDiario = true`** — a diferencia de lo advertido para Fundación, en Caja Patate
`bcasact` SÍ coincidió exactamente con el diario al momento de esta verificación. Esto no es una
garantía permanente: el reporte recalcula y muestra este cruce en cada corrida, y si algún día no
coincidiera, la pantalla lo mostraría en rojo con la diferencia exacta (banda de validaciones).

Resultado real del balance (mismo corte):

| Concepto | Monto |
|---|---:|
| Activos totales (clase 1) | $480,585.61 |
| Pasivos totales (clase 2) | $471,219.70 |
| Patrimonio (clase 3) | $1,713.28 |
| Patrimonio + utilidad no distribuida | $9,365.91 |

### 5.3 Verificación cruzada adicional: ecuación contable

`Activos = Pasivos + Patrimonio + Utilidad del ejercicio (aún no cerrada)`:

$480,585.61 = $471,219.70 + $1,713.28 + $7,652.63 = **$480,585.61** — cuadra exacto
(`ecuacionContableCuadra = true`, diferencia $0.00). Esta coincidencia a la centésima, con datos
provenientes de dos fuentes distintas (`bcasact` para balance, `bcadcom` para resultados), es la
evidencia más fuerte de que el sistema contable de Caja Patate está internamente consistente al
2026-07-31.

---

## 6. ROA / ROE aproximados — fórmulas y limitaciones (leer antes de usar estas cifras)

| Indicador | Fórmula | Resultado (2026-07-31) |
|---|---|---:|
| ROA aproximado | Utilidad anualizada / Activos totales | **2.73 %** |
| ROE estricto | Utilidad anualizada / Patrimonio (clase 3 solamente) | **765.71 %** |
| ROE ajustado | Utilidad anualizada / (Patrimonio + utilidad no distribuida) | **140.07 %** |

**Limitaciones que se muestran explícitamente en pantalla, no solo aquí:**

1. **Cifras autogeneradas, no validadas por un contador/auditor externo.** Son un cálculo directo sobre
   el CUC real, útil como referencia operativa, no un estado financiero auditado.
2. **Anualización simple** (`utilidad_del_periodo × 12 / meses_transcurridos`), sobre datos parciales
   (7 de 12 meses al momento de esta verificación) — puede variar significativamente al cierre del año,
   especialmente si hay estacionalidad en ingresos/gastos.
3. **El "ROE estricto" no es representativo** y así se etiqueta en pantalla (con ícono de alerta): el
   patrimonio contable de la clase 3 es de solo $1,713.28 frente a activos de $480,585.61 — un
   patrimonio inusualmente bajo para el tamaño de la cartera, probablemente porque buena parte del
   capital social/certificados de aportación de los socios está clasificado como pasivo (obligación con
   el público) en vez de patrimonio, como es común en cooperativas de ahorro y crédito, y/o porque hubo
   distribución de excedentes/dividendos durante el año que redujo el patrimonio remanente (se detectó
   movimiento neto de -$14,632.56 en la clase 3 durante 2026, principalmente débitos). **Se recomienda
   que un contador confirme si esa clasificación es la correcta antes de usar el ROE para decisiones.**
   Por eso se calcula también un "ROE ajustado" (usando patrimonio + utilidad no distribuida) como
   referencia menos extrema, aunque tampoco se presenta como cifra oficial.

---

## 7. Cómo se opera paso a paso

1. El usuario entra a "Utilidad y Rentabilidad" desde el menú lateral (roles: `ADMIN`, `MANAGER`,
   `ACCOUNTANT`, más `SUPER_USER` en frontend).
2. Se dispara automáticamente `GET /api/reportes/utilidad-rentabilidad` (ejercicio 12 / año 2026 por
   defecto, parametrizable vía querystring `?ejercicio=&anio=` para años futuros). **Puede tardar hasta
   40 segundos** (varias consultas reales encadenadas contra Informix, sin caché).
3. Banda de 3 validaciones (Partida Doble / Ecuación Contable / bcasact vs. Diario), siempre visible,
   en verde si cuadra y en rojo con el detalle del descuadre si no.
4. Tarjetas de ingresos, gastos, utilidad neta y utilidad anualizada.
5. Tarjetas de balance (activos, pasivos, patrimonio, patrimonio + utilidad).
6. Panel de ROA/ROE con las limitaciones explicadas en pantalla (no solo en este manual).
7. Sección "Hallazgos de Calidad de Datos": líneas no mayorizadas y comprobantes anulados con líneas
   posteadas, con tabla de detalle — **siempre visible, incluso si el número es cero**.

---

## 8. Utilidad calculada vs. registrada en libros (cuenta 3.6.03.05) — 2026-08-01

El usuario reportó que la cuenta `3.6.03.05 "Utilidad del Ejercicio"` del balance de comprobación
oficial firmado (`balance_compro_07312026.pdf`) muestra un saldo final de julio de **$478.28**, muy por
debajo de la utilidad calculada en este módulo ($7,652.63 = Ingresos − Gastos). Se investigó la causa
real contra producción:

- **`bcadcom` (diario) no tiene NINGÚN posteo a la cuenta 360305 durante el ejercicio 2026**, salvo un
  único comprobante (2894, 2026-01-01, "REGULACION PARTICIPACION LABORAL E IMPUESTO RENTA AÑO 2025",
  $292.56 débito) — un ajuste de inicio de año por participación laboral/impuesto a la renta del
  ejercicio ANTERIOR, no un posteo del resultado de 2026.
- **`bcasact` (saldo materializado) para esta cuenta solo tiene el periodo de apertura** (`peri_mes_peri
  = 0`, saldo arrastrado de 2025 = $770.84 crédito). $770.84 − $292.56 = **$478.28**, exacto contra el
  PDF oficial.
- **`bcaperi.peri_cie_peri` (flag de cierre de periodo) está en 0 (no cerrado) en los 13 periodos
  mensuales de 2026 revisados** — ningún mes del ejercicio en curso ha sido cerrado formalmente por el
  sistema legado.

**Conclusión**: la cuenta 3.6.03.05 no refleja el resultado del ejercicio en curso porque el sistema
legado traslada el neto de Ingresos−Gastos a esta cuenta recién en el **proceso de cierre** (mensual o
anual), que todavía no se ha ejecutado para ningún periodo de 2026. Esto es **normal en un ejercicio
contable abierto**, no un error de este reporte ni una inconsistencia de datos. `UtilidadRentabilidadQueries.calcular()`
expone esto como `utilidadEnLibros` (`saldoCuenta360305`, `utilidadCalculada`, `diferencia`,
`periodosCerrados`/`periodosDelEjercicio`, `hayCierreMensualPendiente`, `explicacion`), y
`UtilidadRentabilidadView.tsx` muestra ambos números lado a lado con la explicación, siempre visible.

## 9. Notas operativas

- Requiere lo mismo que los otros reportes de este proyecto hermano: `java` en el `PATH`, `jdbc-informix`
  compilado (incluye ahora `UtilidadRentabilidadQueries.class`, `UtilidadRentabilidadJsonRunner.class`,
  `JsonUtil.class`), y el túnel Tailscale activo. Timeout de 60 segundos en el subproceso.
- Todo el cálculo numérico en el lado Java usa `BigDecimal` (nunca `float`/`double`), incluyendo
  divisiones para porcentajes (escala intermedia de 10 dígitos, redondeo `HALF_UP`, resultado final a 2
  decimales para dinero y 2 para porcentajes) — evita el error clásico de imprecisión binaria en cálculos
  financieros.
- Endpoint nuevo, activo solo tras reiniciar `node server.js`.
