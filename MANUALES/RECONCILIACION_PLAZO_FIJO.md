# Reconciliación: Inventario (bcadpfi) vs. Contabilidad — Plazo Fijo

Documento de auditoría/reconciliación real, hecho a pedido del usuario tras comparar
`CarteraPlazoFijoView` contra el reporte legado "Anexo de depósitos" (Plazo Fijo) de
AFC/SITETRIOR (PowerBuilder), fecha de corte 2026-07-31. Complementa
`MANUALES/10_PLAZO_FIJO.md` (que describe el módulo) — este documento explica **por qué**
el inventario y la contabilidad no cuadraban a simple vista, con evidencia real (consultas
+ resultados contra producción), no una suposición.

**Regla seguida en todo este documento**: si una diferencia real no se explica al 100%,
se dice explícitamente. No se oculta ni se fuerza a cuadrar.

---

## 1. El síntoma reportado por el usuario

Reporte legado "Anexos de depósitos" (Plazo Fijo), corte 07/31/2026:

| Fuente | Concepto | Capital |
|---|---|---:|
| Inventario (`bcadpfi`, estado ACTIVO) | 39 pólizas | **$400,538.30** |
| Contabilidad (cuenta `210136` "Ahorro Fijo" solamente) | — | **$228,230.00** |

Diferencia aparente: **$172,308.30** — "el inventario tengo más que el contable".

## 2. Primera hipótesis (confirmada): faltaba sumar una segunda familia de cuentas

El balance de comprobación oficial firmado (`balance_compro_07312026.pdf`) tiene, además de
`2.1.01.36 Ahorro Fijo` ($228,230.00), una familia separada `2.1.03 Depósitos a plazo`
($173,837.83) — muy cercana a la diferencia observada.

**$228,230.00 (210136) + $173,837.83 (2103) = $402,067.83**, contra $400,538.30 de
inventario → diferencia residual de solo **$1,529.53** (0.38%), en vez de $172,308.30.

## 3. Causa raíz real, confirmada por el usuario/gerencia: cambio de parámetro del sistema

> "Desde un inicio todos los plazos fijos se mantenían en la cuenta 2103 pero se cambió los
> parámetros para que se alimenten a la cuenta 210136, entonces ahora se alimenta en esa
> cuenta." — usuario, 2026-08-01

Es decir: el módulo de Plazo Fijo del sistema legado posteaba originalmente a `2103`
("Depósitos a Plazo"), y en algún momento de 2026 se reconfiguró para postear a `210136`
("Ahorro Fijo") en su lugar. **Las pólizas actualmente ACTIVAS en `bcadpfi` tienen su
contrapartida contable repartida entre ambas familias**, según la fecha en que se originó
cada movimiento — por eso ninguna de las dos cuentas por separado cuadra contra el
inventario, mientras que la SUMA de ambas sí se acerca.

### 3.1 Evidencia directa del quiebre (fecha exacta confirmada en el diario)

Consulta contra `bcadcom`/`bcacomp` (líneas mayorizadas, comprobantes no anulados),
buscando la última fecha que postea a la familia `2103*` y la primera que postea a
`210136*`:

```sql
SELECT FIRST 1 cp.comp_cod_comp, cp.comp_fec_comp
FROM bcacomp cp
JOIN bcadcom dc ON dc.dcom_cod_comp = cp.comp_cod_comp
JOIN bcaccon cc ON cc.ccon_cod_ctas = dc.dcom_cod_ctas
WHERE cc.ccon_cod_ejer = 12 AND cc.ccon_cod_ccon LIKE '2103%'
  AND dc.dcom_may_dcom = 1 AND cp.comp_anulado = 0
ORDER BY cp.comp_fec_comp DESC, cp.comp_cod_comp DESC;
-- Resultado: comprobante 3077, 2026-05-22

SELECT FIRST 1 cp.comp_cod_comp, cp.comp_fec_comp
FROM bcacomp cp
JOIN bcadcom dc ON dc.dcom_cod_comp = cp.comp_cod_comp
JOIN bcaccon cc ON cc.ccon_cod_ctas = dc.dcom_cod_ctas
WHERE cc.ccon_cod_ejer = 12 AND cc.ccon_cod_ccon LIKE '210136%'
  AND dc.dcom_may_dcom = 1 AND cp.comp_anulado = 0
ORDER BY cp.comp_fec_comp ASC, cp.comp_cod_comp ASC;
-- Resultado: comprobante 3097, 2026-05-26
```

Detalle día por día de todos los comprobantes que postean a cualquiera de las dos familias
entre el 2026-05-19 y el 2026-05-28 (confirma que el quiebre es limpio, sin solape):

| Comprobante | Fecha | Cuenta | D/C | Valor | Detalle |
|---|---|---|---|---:|---|
| 3077 | 2026-05-22 | 210310 | D | 4,080.10 | Reclasificación DPF |
| 3077 | 2026-05-22 | 210305 | C | 4,080.10 | Reclasificación DPF |
| 3097 | 2026-05-26 | 21013615 | D | 30,000.00 | Modificación DPF |
| 3097 | 2026-05-26 | 21013605 | C | 30,000.00 | Modificación DPF |
| 3098 | 2026-05-26 | 21013605 | D | 30,000.00 | Pago de DPF |
| 3112 | 2026-05-27 | 21013615 | D | 10,000.00 | Reclasificación DPF |
| 3112 | 2026-05-27 | 21013610 | C | 10,000.00 | Reclasificación DPF |

**Conclusión**: el 2026-05-22 fue el último día que el sistema posteó Plazo Fijo a `2103*`;
desde el 2026-05-26 postea exclusivamente a `210136*`. No hay comprobantes de Plazo Fijo
entre esas dos fechas tocando ninguna de las dos familias — el quiebre es limpio.

## 4. Segunda causa (metodológica): `bcadcom` solo no basta para saldos de balance

Al intentar reconciliar por subcuenta (ej. `21013605` "Ahorro Fijo de 1 a 30 días") sumando
directamente `bcadcom` del ejercicio 2026 (mayorizado, no anulado), el lado DEBE cuadraba
exacto contra el balance de comprobación oficial, pero el HABER no:

| Cuenta | DEBE (bcadcom) | HABER (bcadcom) | HABER oficial (PDF) | Diferencia |
|---|---:|---:|---:|---:|
| 21013605 | 119,004.90 ✓ | 134,438.30 | 154,238.30 | **19,800.00** |

Se investigó con `bcasact` (saldos materializados por cuenta/periodo/oficina, mismo
mecanismo ya documentado en `MANUALES/11_UTILIDAD_RENTABILIDAD.md` para el balance
activos/pasivos/patrimonio) y apareció el faltante exacto en el **periodo de apertura**
(`peri_mes_peri = 0`, saldo arrastrado de 2025):

| Periodo | Mes | Debe | Haber |
|---|---|---:|---:|
| Apertura | 0 | 0.00 | **19,800.00** |
| 5 | Mayo | 30,500.00 | 30,000.00 |
| 6 | Junio | 85,504.90 | 59,858.60 |
| 7 | Julio | 3,000.00 | 44,579.70 |
| **Total** | | **119,004.90** | **154,238.30** ✓ |

**Causa confirmada**: la subcuenta `21013605` ya tenía un saldo de $19,800.00 arrastrado de
2025 (posteado directamente en `bcasact` en el periodo de apertura, sin línea equivalente en
`bcadcom` del ejercicio 2026 — mismo patrón ya conocido para las cuentas de balance de
clase 1/2/3 en el módulo de Utilidad y Rentabilidad). `bcadcom` del ejercicio actual **nunca**
contiene el saldo de apertura, solo el movimiento del año.

**Verificación completa**: usando `bcasact` (no `bcadcom`) para las 13 subcuentas de ambas
familias, el saldo calculado coincide **exacto, a la centésima**, con el balance de
comprobación oficial firmado, en las 13 filas sin excepción:

| Cuenta | Nombre | Debe | Haber | Saldo (Haber−Debe) | PDF oficial |
|---|---|---:|---:|---:|---:|
| 210136 | Ahorro Fijo | 324,193.20 | 552,423.20 | 228,230.00 | 228,230.00 ✓ |
| 21013605 | 1 a 30 días | 119,004.90 | 154,238.30 | 35,233.40 | 35,233.40 ✓ |
| 21013610 | 31 a 90 días | 51,388.30 | 77,000.00 | 25,611.70 | 25,611.70 ✓ |
| 21013615 | 91 a 180 días | 76,000.00 | 95,380.10 | 19,380.10 | 19,380.10 ✓ |
| 21013620 | 181 a 360 días | 74,800.00 | 189,000.00 | 114,200.00 | 114,200.00 ✓ |
| 21013625 | Más de 360 días | 0.00 | 13,380.00 | 13,380.00 | 13,380.00 ✓ |
| 21013630 | Por confirmar | 3,000.00 | 23,424.80 | 20,424.80 | 20,424.80 ✓ |
| 2103 | Depósitos a Plazo | 755,778.33 | 929,616.16 | 173,837.83 | 173,837.83 ✓ |
| 210305 | 1 a 30 días | 101,750.00 | 163,481.56 | 61,731.56 | 61,731.56 ✓ |
| 210310 | 31 a 90 días | 127,954.90 | 117,484.60 | -10,470.30 | -10,470.30 ✓ |
| 210315 | 91 a 180 días | 71,180.10 | 197,600.00 | 126,419.90 | 126,419.90 ✓ |
| 210320 | 181 a 360 días | 192,600.00 | 290,100.00 | 97,500.00 | 97,500.00 ✓ |
| 210325 | Más de 361 días | 152,413.33 | 148,500.00 | -3,913.33 | -3,913.33 ✓ |
| 210330 | Por confirmar | 109,880.00 | 12,450.00 | -97,430.00 | -97,430.00 ✓ |

Nota: `210310`, `210325` y `210330` tienen saldo **negativo** — normal para cuentas de
suspenso/reclasificación como "Por confirmar" (dinero que entra por HABER y se reclasifica
hacia el bucket definitivo por DEBE, dejando la cuenta suspenso con más débitos que
créditos).

## 5. Resultado final de la reconciliación (implementado en el sistema)

Con la metodología correcta (suma de ambas familias, vía `bcasact`):

| Concepto | Monto |
|---|---:|
| Inventario (`bcadpfi`, estado ACTIVO) | $400,538.30 |
| Contable — 210136 (Ahorro Fijo) | $228,230.00 |
| Contable — 2103 (Depósitos a Plazo) | $173,837.83 |
| **Contable total** | **$402,067.83** |
| **Diferencia (Contable − Inventario)** | **$1,529.53 (0.38%)** |

## 6. Lo que SÍ se explicó del residuo de $1,529.53, y lo que no

Se investigó activamente el origen del residuo restante, con los siguientes hallazgos:

1. **Comprobante 2265** (2026-02-24, "RENOVACION DPF", $1,963.33): marcado
   `comp_anulado = 1` en `bcacomp`, pero sus 2 líneas siguen `dcom_may_dcom = 1`
   (mayorizadas) — debita `210325` (>361 días) y acredita `210305` (1-30 días) por el mismo
   monto. **Es una reclasificación dentro de la misma familia (2103): el efecto neto sobre
   el TOTAL es cero**, por lo que no explica la diferencia de $1,529.53, aunque sí distorsiona
   el desglose por plazo (rango >361d entendido de menos, rango 1-30d de más). Se reporta
   igual en la UI como hallazgo de calidad de datos, mismo patrón que el ya documentado en
   `MANUALES/11_UTILIDAD_RENTABILIDAD.md`.
2. **Historial de interés (`afchdpf`)**: se confirmó que esta tabla es un log de
   provisión diaria de interés por póliza (1,642 filas para 82 pólizas con historial;
   ACTIVO 39 pólizas/1,420 filas, CANCELADO 37/203, RENOVADO 6/19), **no** una cadena de
   renovaciones con `hdpf_cod_dpfi` apuntando a la póliza sucesora — cada `hdpf_cod_dpfi`
   corresponde a un único `bcadpfi.dpfi_cod_dpfi` fijo. No se encontró en esta tabla una
   causa directa del residuo, aunque sí una póliza renovada (id 21, "RENOVADO", capital
   $1,516.48) cuyo monto es cercano en magnitud al residuo — no se pudo confirmar una
   relación causal exacta con la evidencia disponible.
3. **No se descarta** que el residuo provenga de capitalización de interés en alguna
   renovación (donde el monto reclasificado en el asiento contable difiere ligeramente del
   capital puro de la póliza nueva/vieja en `bcadpfi`), de un ajuste manual puntual, o de
   una combinación de varias diferencias pequeñas — no se identificó una causa única y
   verificable que explique el 100% del monto.

**Estado**: la diferencia de $1,529.53 (0.38% del total) queda documentada como **pendiente
de explicación completa**, no oculta ni forzada a cuadrar. Es un orden de magnitud muy
inferior al desajuste original ($172,308.30), y la metodología de reconciliación (suma de
ambas familias vía `bcasact`) está verificada al 100% a nivel de subcuenta contra el balance
de comprobación oficial firmado.

## 7. Qué se cambió en el sistema

- `PlazoFijoReconciliacionQueries.java` (nuevo): calcula inventario ACTIVO, saldo contable
  de ambas familias (`210136*`, `2103*`) vía `bcasact`, evidencia del cambio de parámetro
  (fechas/comprobantes de quiebre), y comprobantes anulados-pero-mayorizados que tocan estas
  cuentas.
- `PlazoFijoJsonRunner.java`: la salida JSON pasó de un arreglo plano a un objeto
  `{ polizas, reconciliacion }` (rompe compatibilidad hacia atrás con el formato anterior,
  actualizado también en el frontend).
- `CarteraPlazoFijoView.tsx`: nueva sección "Reconciliación: Inventario vs. Contabilidad"
  que muestra ambos totales lado a lado, la diferencia, la evidencia del cambio de
  parámetro, el desglose por subcuenta de ambas familias, y los comprobantes anulados con
  líneas posteadas — siempre visible, no se oculta si no cuadra al 100%.

## 8. Verificación en vivo (2026-08-01)

```
PlazoFijoReconciliacionQueries.calcular: inventario=400538.30 contable=402067.83 diferencia=1529.53
```

Coincide exacto con el análisis manual documentado arriba.
