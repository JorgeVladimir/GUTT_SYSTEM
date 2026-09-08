/* ============================================================================
   31_ponderaciones_riesgo_solvencia.sql
   ----------------------------------------------------------------------------
   Cierra el pendiente #2: las PONDERACIONES DE RIESGO que faltaban para calcular
   el indice de solvencia regulatorio de verdad.

   Hasta ahora sp_indicadores_perlas publicaba Patrimonio / Activo marcado
   `exacto: false` y con la leyenda "aproximacion", porque el indicador real es
       Solvencia = Patrimonio Tecnico Constituido / Activos Ponderados por Riesgo
   y ninguna de las dos piezas estaba parametrizada.

   Este script crea las tres tablas que faltaban:
     - dbo.PonderacionesRiesgo        -> ponderacion por familia de activo (APR)
     - dbo.ParametrosPatrimonioTecnico-> composicion del PTC (primario/secundario/deducciones)
     - dbo.ParametrosRegulatorios     -> limites (minimo de solvencia, tope de provision general)

   Todo es PARAMETRICO en tabla, no constantes en codigo: cuando la SEPS mueve una
   ponderacion o un limite, se edita el dato y no se recompila nada. Cada fila
   lleva su BaseNormativa para que una revision pueda auditar de donde sale.

   Resolucion de la ponderacion: gana el PREFIJO MAS LARGO que haga match con el
   codigo contable. Por eso 149915 (provision de vivienda) puede ponderar 40%
   mientras el resto de 1499 pondera 100%.

   Codigos SIN PUNTOS ('140205'), igual que el resto del Catalogo Unico migrado.
   ============================================================================ */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ---------------------------------------------------------------------------
   1. Ponderaciones de riesgo por familia de activo
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.PonderacionesRiesgo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PonderacionesRiesgo (
        PonderacionId  INT IDENTITY(1,1) PRIMARY KEY,
        PrefijoCuenta  NVARCHAR(15)  NOT NULL,
        Ponderacion    DECIMAL(5,4)  NOT NULL,   -- 0.2000 = 20%
        Categoria      NVARCHAR(60)  NOT NULL,
        Descripcion    NVARCHAR(200) NULL,
        BaseNormativa  NVARCHAR(200) NULL,
        Activo         BIT           NOT NULL CONSTRAINT DF_PondRiesgo_Activo DEFAULT 1
    );
    CREATE UNIQUE INDEX UX_PondRiesgo_Prefijo ON dbo.PonderacionesRiesgo (PrefijoCuenta);
END
GO

SET QUOTED_IDENTIFIER ON;

;WITH P(Prefijo, Pond, Categoria, Descripcion) AS (
    SELECT * FROM (VALUES
        -- 0% — riesgo soberano local y efectivo
        (N'1101', 0.0000, N'0% - Sin riesgo',        N'Caja: efectivo y billetes'),
        (N'1302', 0.0000, N'0% - Sin riesgo',        N'Inversiones para negociar del Estado o entidades del sector publico'),
        (N'1304', 0.0000, N'0% - Sin riesgo',        N'Inversiones disponibles para la venta del Estado o del sector publico'),
        (N'1306', 0.0000, N'0% - Sin riesgo',        N'Inversiones mantenidas hasta el vencimiento del Estado o del sector publico'),
        (N'1910', 0.0000, N'0% - Sin riesgo',        N'Divisas'),
        -- 10% — operaciones interbancarias de muy corto plazo
        (N'1201', 0.1000, N'10% - Interbancario',    N'Fondos interbancarios vendidos'),
        (N'1202', 0.1000, N'10% - Interbancario',    N'Operaciones de reporto con instituciones financieras'),
        -- 20% — exposicion frente a instituciones financieras y sector privado
        (N'1103', 0.2000, N'20% - Sistema financiero', N'Bancos y otras instituciones financieras'),
        (N'1104', 0.2000, N'20% - Sistema financiero', N'Efectos de cobro inmediato'),
        (N'1105', 0.2000, N'20% - Sistema financiero', N'Remesas en transito'),
        (N'1301', 0.2000, N'20% - Sistema financiero', N'Inversiones para negociar de entidades del sector privado'),
        (N'1303', 0.2000, N'20% - Sistema financiero', N'Inversiones disponibles para la venta del sector privado'),
        (N'1305', 0.2000, N'20% - Sistema financiero', N'Inversiones mantenidas hasta el vencimiento del sector privado'),
        (N'1307', 0.2000, N'20% - Sistema financiero', N'Inversiones de disponibilidad restringida'),
        (N'1399', 0.2000, N'20% - Sistema financiero', N'(Provision para inversiones) - pondera junto al activo que reduce'),
        (N'1602', 0.2000, N'20% - Sistema financiero', N'Intereses por cobrar de inversiones'),
        -- 40% — cartera de vivienda amparada con garantia hipotecaria
        (N'1403', 0.4000, N'40% - Vivienda hipotecaria', N'Cartera de credito de vivienda por vencer'),
        (N'1413', 0.4000, N'40% - Vivienda hipotecaria', N'Cartera de vivienda que no devenga intereses'),
        (N'1423', 0.4000, N'40% - Vivienda hipotecaria', N'Cartera de vivienda vencida'),
        (N'149915',0.4000, N'40% - Vivienda hipotecaria', N'(Provision cartera de vivienda) - pondera junto al activo que reduce'),
        -- 100% — resto del activo (cartera comercial/consumo/microcredito, fijos, otros)
        (N'14',   1.0000, N'100% - Riesgo pleno',    N'Cartera de credito (comercial, consumo y microempresa)'),
        (N'16',   1.0000, N'100% - Riesgo pleno',    N'Cuentas por cobrar'),
        (N'17',   1.0000, N'100% - Riesgo pleno',    N'Bienes realizables, adjudicados por pago y recuperados'),
        (N'18',   1.0000, N'100% - Riesgo pleno',    N'Propiedades y equipo'),
        (N'19',   1.0000, N'100% - Riesgo pleno',    N'Otros activos'),
        (N'12',   1.0000, N'100% - Riesgo pleno',    N'Operaciones interbancarias no cubiertas por una categoria especifica'),
        (N'13',   1.0000, N'100% - Riesgo pleno',    N'Inversiones no cubiertas por una categoria especifica'),
        (N'11',   1.0000, N'100% - Riesgo pleno',    N'Fondos disponibles no cubiertos por una categoria especifica')
    ) v(Prefijo, Pond, Categoria, Descripcion)
)
MERGE dbo.PonderacionesRiesgo AS destino
USING P AS origen ON destino.PrefijoCuenta = origen.Prefijo
WHEN MATCHED THEN UPDATE SET
        Ponderacion   = origen.Pond,
        Categoria     = origen.Categoria,
        Descripcion   = origen.Descripcion,
        BaseNormativa = N'Resolucion 127-2015-F (JPRMF) - Norma para la determinacion del patrimonio tecnico de las COAC',
        Activo        = 1
WHEN NOT MATCHED BY TARGET THEN
    INSERT (PrefijoCuenta, Ponderacion, Categoria, Descripcion, BaseNormativa, Activo)
    VALUES (origen.Prefijo, origen.Pond, origen.Categoria, origen.Descripcion,
            N'Resolucion 127-2015-F (JPRMF) - Norma para la determinacion del patrimonio tecnico de las COAC', 1);
GO

/* ---------------------------------------------------------------------------
   2. Composicion del Patrimonio Tecnico Constituido
   ---------------------------------------------------------------------------
   SaldoComo dice con que signo se lee la cuenta, y evita el error clasico de
   sumar dos veces una perdida:
     ACREEDOR = Haber - Debe  (capital, reservas, provision general de cartera)
     DEUDOR   = Debe  - Haber (perdidas acumuladas, plusvalia mercantil)
   Las DEDUCCION siempre se leen DEUDOR y se RESTAN; por eso 3602/3604 no estan
   incluidas en ningun prefijo del PRIMARIO.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.ParametrosPatrimonioTecnico', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ParametrosPatrimonioTecnico (
        ParametroId    INT IDENTITY(1,1) PRIMARY KEY,
        Componente     NVARCHAR(20)  NOT NULL,   -- PRIMARIO | SECUNDARIO | DEDUCCION
        PrefijoCuenta  NVARCHAR(15)  NOT NULL,
        Factor         DECIMAL(5,4)  NOT NULL CONSTRAINT DF_ParPT_Factor DEFAULT 1,
        SaldoComo      NVARCHAR(10)  NOT NULL CONSTRAINT DF_ParPT_Saldo DEFAULT N'ACREEDOR',
        LimitePctAPR   DECIMAL(7,4)  NULL,       -- tope como % de los APR (NULL = sin tope)
        Descripcion    NVARCHAR(200) NULL,
        BaseNormativa  NVARCHAR(200) NULL,
        Activo         BIT           NOT NULL CONSTRAINT DF_ParPT_Activo DEFAULT 1,
        CONSTRAINT CK_ParPT_Componente CHECK (Componente IN (N'PRIMARIO', N'SECUNDARIO', N'DEDUCCION')),
        CONSTRAINT CK_ParPT_SaldoComo  CHECK (SaldoComo IN (N'ACREEDOR', N'DEUDOR'))
    );
    CREATE UNIQUE INDEX UX_ParPT_Comp_Prefijo
        ON dbo.ParametrosPatrimonioTecnico (Componente, PrefijoCuenta);
END
GO

SET QUOTED_IDENTIFIER ON;

;WITH C(Componente, Prefijo, Factor, SaldoComo, LimitePct, Descripcion) AS (
    SELECT * FROM (VALUES
        -- Patrimonio tecnico PRIMARIO
        (N'PRIMARIO',   N'31',     1.0000, N'ACREEDOR', CAST(NULL AS DECIMAL(7,4)), N'Capital social - aportes de socios'),
        (N'PRIMARIO',   N'3301',   1.0000, N'ACREEDOR', NULL, N'Reservas legales (irrepartibles)'),
        (N'PRIMARIO',   N'3310',   1.0000, N'ACREEDOR', NULL, N'Reservas por resultados no operativos'),
        (N'PRIMARIO',   N'3402',   1.0000, N'ACREEDOR', NULL, N'Otros aportes patrimoniales'),
        (N'PRIMARIO',   N'3601',   1.0000, N'ACREEDOR', NULL, N'Utilidades o excedentes acumulados'),
        -- Patrimonio tecnico SECUNDARIO
        (N'SECUNDARIO', N'3303',   1.0000, N'ACREEDOR', NULL, N'Reservas especiales'),
        (N'SECUNDARIO', N'3305',   1.0000, N'ACREEDOR', NULL, N'Reserva por revalorizacion del patrimonio'),
        (N'SECUNDARIO', N'3490',   1.0000, N'ACREEDOR', NULL, N'Otros aportes patrimoniales - otros'),
        (N'SECUNDARIO', N'3501',   0.5000, N'ACREEDOR', NULL, N'Superavit por valuacion de propiedades (computa al 50%)'),
        (N'SECUNDARIO', N'3502',   0.5000, N'ACREEDOR', NULL, N'Superavit por valuacion de inversiones (computa al 50%)'),
        (N'SECUNDARIO', N'3603',   1.0000, N'ACREEDOR', NULL, N'Utilidad del ejercicio'),
        (N'SECUNDARIO', N'149930', 1.0000, N'ACREEDOR', 0.0125, N'Provision general para cartera - computa hasta 1.25% de los APR'),
        -- DEDUCCIONES (se leen con saldo deudor y se restan del patrimonio tecnico)
        (N'DEDUCCION',  N'3602',   1.0000, N'DEUDOR',   NULL, N'(Perdidas acumuladas)'),
        (N'DEDUCCION',  N'3604',   1.0000, N'DEUDOR',   NULL, N'(Perdida del ejercicio)'),
        (N'DEDUCCION',  N'1905',   1.0000, N'DEUDOR',   NULL, N'Gastos diferidos y plusvalia mercantil')
    ) v(Componente, Prefijo, Factor, SaldoComo, LimitePct, Descripcion)
)
MERGE dbo.ParametrosPatrimonioTecnico AS destino
USING C AS origen
   ON destino.Componente = origen.Componente AND destino.PrefijoCuenta = origen.Prefijo
WHEN MATCHED THEN UPDATE SET
        Factor        = origen.Factor,
        SaldoComo     = origen.SaldoComo,
        LimitePctAPR  = origen.LimitePct,
        Descripcion   = origen.Descripcion,
        BaseNormativa = N'Resolucion 127-2015-F (JPRMF) - composicion del patrimonio tecnico de las COAC',
        Activo        = 1
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Componente, PrefijoCuenta, Factor, SaldoComo, LimitePctAPR, Descripcion, BaseNormativa, Activo)
    VALUES (origen.Componente, origen.Prefijo, origen.Factor, origen.SaldoComo, origen.LimitePct, origen.Descripcion,
            N'Resolucion 127-2015-F (JPRMF) - composicion del patrimonio tecnico de las COAC', 1);
GO

/* ---------------------------------------------------------------------------
   3. Limites regulatorios (clave/valor) — para no dejar constantes en el codigo
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.ParametrosRegulatorios', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ParametrosRegulatorios (
        Clave          NVARCHAR(60)  NOT NULL PRIMARY KEY,
        Valor          DECIMAL(18,6) NOT NULL,
        Unidad         NVARCHAR(20)  NULL,
        Descripcion    NVARCHAR(300) NULL,
        BaseNormativa  NVARCHAR(200) NULL
    );
END
GO

SET QUOTED_IDENTIFIER ON;

;WITH R(Clave, Valor, Unidad, Descripcion, BaseNormativa) AS (
    SELECT * FROM (VALUES
        (N'SOLVENCIA_MINIMA', 0.090000, N'ratio',
         N'Relacion minima entre el patrimonio tecnico constituido y los activos ponderados por riesgo',
         N'Resolucion 127-2015-F (JPRMF)'),
        (N'PT_SECUNDARIO_TOPE_PRIMARIO', 1.000000, N'ratio',
         N'El patrimonio tecnico secundario no puede superar al primario',
         N'Resolucion 127-2015-F (JPRMF)'),
        (N'PROVISION_GENERAL_TOPE_APR', 0.012500, N'ratio',
         N'Tope de la provision general de cartera computable como patrimonio secundario, sobre los APR',
         N'Resolucion 127-2015-F (JPRMF)'),
        (N'MOROSIDAD_ALERTA', 0.050000, N'ratio',
         N'Umbral de morosidad ampliada a partir del cual el tablero levanta alerta de calidad de activos',
         N'Practica de supervision SEPS (parametro interno, no limite legal)')
    ) v(Clave, Valor, Unidad, Descripcion, BaseNormativa)
)
MERGE dbo.ParametrosRegulatorios AS destino
USING R AS origen ON destino.Clave = origen.Clave
WHEN MATCHED THEN UPDATE SET
        Valor = origen.Valor, Unidad = origen.Unidad,
        Descripcion = origen.Descripcion, BaseNormativa = origen.BaseNormativa
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Clave, Valor, Unidad, Descripcion, BaseNormativa)
    VALUES (origen.Clave, origen.Valor, origen.Unidad, origen.Descripcion, origen.BaseNormativa);
GO

/* ---------------------------------------------------------------------------
   4. Verificacion
   --------------------------------------------------------------------------- */
SELECT
    (SELECT COUNT(*) FROM dbo.PonderacionesRiesgo WHERE Activo = 1)           AS Ponderaciones,
    (SELECT COUNT(*) FROM dbo.ParametrosPatrimonioTecnico WHERE Activo = 1)   AS ComponentesPT,
    (SELECT COUNT(*) FROM dbo.ParametrosRegulatorios)                         AS Limites,
    -- Cuentas de ACTIVO con movimiento que ningun prefijo lograria ponderar.
    -- Debe dar 0: si no, el APR quedaria subestimado y la solvencia inflada.
    (SELECT COUNT(*) FROM (
        SELECT DISTINCT rc.CuentaContable
        FROM dbo.RegistroContable rc
        JOIN dbo.PlanCuentas pc ON pc.Codigo = rc.CuentaContable
        WHERE pc.TipoCuenta = N'ACTIVO'
          AND NOT EXISTS (
              SELECT 1 FROM dbo.PonderacionesRiesgo p
              WHERE p.Activo = 1 AND rc.CuentaContable LIKE p.PrefijoCuenta + N'%')
     ) x)                                                                     AS ActivosSinPonderar;
GO
