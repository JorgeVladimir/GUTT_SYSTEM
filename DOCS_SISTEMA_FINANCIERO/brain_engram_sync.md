# Sincronización del Buró de Crédito Interno y Reglas de Negocio

Este documento resume las reglas de negocio implementadas en la plataforma **Caja de Ahorro Patate**, detallando el scoring del buró interno, las relaciones de base de datos vigentes y las propuestas de mejora financiera.

---

## 1. Buró de Crédito Interno (Scoring Dinámico)

El sistema calcula un **Scoring Score** interno para evaluar la salud crediticia de los socios basada en su comportamiento de ahorro y cumplimiento de obligaciones.

### Fórmula Matemática del Scoring

El puntaje del socio se calcula dinámicamente utilizando una puntuación base inicial y aplicando incrementos fijos por factores de buen comportamiento, penalizados por retrasos en dividendos.

Sea:
* \(S_{\text{base}} = 200\) el puntaje inicial asignado a todo nuevo socio.
* \(N_{\text{pagos\_a\_tiempo}}\) el número de cuotas pagadas puntualmente en el histórico del socio.
* \(N_{\text{pagos\_atrasados}}\) el número de cuotas que han incurrido en mora (días de atraso > 0).
* \(D_{\text{mora}}\) el total de días acumulados de retraso en todos los créditos activos.
* \(A_{\text{aportaciones}}\) el saldo total acumulado en Certificados de Aportación.

El puntaje final \(S\) se define mediante la fórmula:

\[
S = \max\left(0, \min\left(1000, S_{\text{base}} + (50 \times N_{\text{pagos\_a\_tiempo}}) - (100 \times N_{\text{pagos\_atrasados}}) - (2 \times D_{\text{mora}}) + f(A_{\text{aportaciones}})\right)\right)
\]

Donde la función de incentivo de aportación \(f(A)\) está acotada para evitar distorsiones:
\[
f(A_{\text{aportaciones}}) = \min\left(150, 10 \times \lfloor \sqrt{A_{\text{aportaciones}}} \rfloor\right)
\]

### Clasificación de Riesgo SEPS

El puntaje resultante mapea directamente a las categorías de riesgo estipuladas por la SEPS en Ecuador:

| Rango de Score | Calificación de Riesgo | Perfil de Riesgo | Acciones en Plataforma |
|---|---|---|---|
| \(801 - 1000\) | **EXCELENTE** (A) | Mínimo | Aprobación automática hasta montos límite por rol. |
| \(601 - 800\) | **BUENO** (B) | Bajo | Requiere revisión técnica estándar. |
| \(401 - 600\) | **REGULAR** (C) | Moderado | Requiere doble firma o garante solidario calificado. |
| \(201 - 400\) | **MALO** (D) | Alto | Requiere garantía prendaria o hipotecaria obligatoria. |
| \(0 - 200\) | **NEGADO** (E) | Crítico | Rechazo automático de nuevas solicitudes. |

---

## 2. Propuesta: Índice de Capacidad de Endeudamiento (ICE)

Para robustecer la etapa de evaluación de crédito y predecir sobreendeudamiento, se recomienda al desarrollador principal la implementación del **Índice de Capacidad de Endeudamiento (ICE)**.

### Definición Matemática
El ICE mide el porcentaje de los ingresos mensuales del socio que serán destinados a cubrir la nueva cuota proyectada sumada a sus obligaciones financieras preexistentes.

\[
\text{ICE} = \frac{C_{\text{proyectada}} + \sum D_{\text{externas}}}{\text{Ingresos Netos Mensuales}} \times 100
\]

Donde:
* \(C_{\text{proyectada}}\): La cuota del plan de amortización calculado (Capital + Interés + Rubros).
* \(\sum D_{\text{externas}}\): Obligaciones vigentes en el Buró de Crédito externo o retenciones judiciales.
* \(\text{Ingresos Netos Mensuales}\): Ingresos declarados del socio menos deducciones de ley.

### Límites de Aprobación Regulatoria
* **ICE \(\le 40\%\)**: **Aceptable**. Nivel óptimo de endeudamiento.
* **ICE \(41\% - 50\%\)**: **Alerta**. Requiere justificación de ingresos extraordinarios.
* **ICE > \(50\%\)**: **Crítico**. Bloqueo de aprobación por exceso de riesgo (Normativa SEPS de sobreendeudamiento).

---

## 3. Integridad Referencial de Base de Datos

Se verificó el flujo de datos y la integridad referencial en la base de datos SQL Server (`SQLGUTPATATE`). Las llaves foráneas siguen la secuencia jerárquica estricta de negocio:

```mermaid
graph TD
    RegistroSocios["dbo.RegistroSocios (SOCIOID)"] -->|1:N| SolicitudesCredito["dbo.SolicitudesCredito (SocioID)"]
    SolicitudesCredito -->|1:1 / 1:N| Creditos["dbo.Creditos (SolicitudID)"]
    Creditos -->|1:N (Cascada)| TablaDeAmortizacion["dbo.TablaDeAmortizacion (CreditoID)"]
    TablaDeAmortizacion -->|1:N (Cascada)| RubrosCreditos["dbo.RubrosCreditos (AmortizacionID)"]
```

### Detalle de Llaves y Restricciones
1. **SocioID**: Llave foránea en `SolicitudesCredito` y `Creditos` referenciando a `RegistroSocios(SOCIOID)`.
2. **SolicitudID**: Llave foránea en `Creditos` referenciando a `SolicitudesCredito(SolicitudID)`.
3. **CreditoID**: Llave foránea en `TablaDeAmortizacion` referenciando a `Creditos(CreditoID)` con cláusula `ON DELETE CASCADE`.
4. **AmortizacionID**: Llave foránea en `RubrosCreditos` referenciando a `TablaDeAmortizacion(AmortizacionID)` con cláusula `ON DELETE CASCADE`.

---

## ⚠️ Alerta de Arquitectura: Falta Relación Muchos a Muchos en Rubros

> [!WARNING]
> **Hallazgo en Rubros de Crédito (`dbo.RubrosCreditos`)**
>
> Actualmente, la tabla `RubrosCreditos` se relaciona de manera **1 a Muchos (1:N)** directamente con `TablaDeAmortizacion` a través de `AmortizacionID`, teniendo columnas rígidas como `NombreRubro` (NVARCHAR) y `Monto` (DECIMAL).
>
> **Implicaciones Técnicas:**
> * **Redundancia:** Los nombres de los rubros (ej: "Seguro de Desgravamen", "SOLCA") se duplican como texto plano en millones de registros de cuotas.
> * **Falta de Catálogo:** No existe una tabla paramétrica de rubros, impidiendo cambios globales de tarifas o auditoría de conceptos financieros aprobados por el Consejo de Administración.
>
> **Solución Recomendada:**
> Implementar una relación **Muchos a Muchos (M:N)** creando una tabla de catálogo y una de asociación intermedia:
> 
> 1. `dbo.CatalogoRubros`: (IdRubro, Nombre, MetodoCalculo, ValorDefecto, Activo).
> 2. `dbo.CuotaRubroAsociacion`: (AmortizacionID, IdRubro, MontoCalculado, Estado).
