/* ============================================================================
   30_reclasificacion_cartera.sql
   ----------------------------------------------------------------------------
   Cierra el pendiente #1: el proceso mensual de RECLASIFICACION DE CARTERA entre
   estados (por vencer / no devenga intereses / vencida) y bandas de antiguedad,
   con su CALIFICACION de riesgo y su PROVISION requerida.

   Antes de esto la clasificacion contable quedaba congelada en la cuenta con que
   se desembolso el credito (140205 hardcodeada en server.js): una cartera 100%
   en mora seguia reportando morosidad contable 0%. Los indicadores PERLAS lo
   alertaban pero nadie lo resolvia.

   Diseno:
   - dbo.ParametrosProvisionCartera es PARAMETRICA a proposito. Los porcentajes
     son los minimos de la Resolucion 128-2015-F (JPRMF, Norma para la Gestion
     del Riesgo de Credito); cada COAC puede constituir por encima del minimo,
     asi que se editan en tabla y no en codigo.
   - Los codigos contables van SIN PUNTOS ('140205'), igual que el resto del
     Catalogo Unico ya migrado.
   - El proceso es reversable: cada corrida guarda su detalle y el asiento que
     genero, de modo que una reclasificacion mal fechada se deshace sin tocar
     RegistroContable a mano.
   ============================================================================ */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ---------------------------------------------------------------------------
   1. Cabecera de cada corrida del proceso
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.ReclasificacionCartera', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ReclasificacionCartera (
        ProcesoId             INT IDENTITY(1,1) PRIMARY KEY,
        FechaCorte            DATE           NOT NULL,
        Estado                NVARCHAR(20)   NOT NULL,   -- SIMULADO | APLICADO | REVERSADO
        UsuarioId             NVARCHAR(50)   NOT NULL,
        FechaEjecucion        DATETIME2      NOT NULL CONSTRAINT DF_RecCart_Fecha DEFAULT SYSDATETIME(),
        OperacionesEvaluadas  INT            NOT NULL CONSTRAINT DF_RecCart_Ops DEFAULT 0,
        MontoReclasificado    DECIMAL(15,2)  NOT NULL CONSTRAINT DF_RecCart_Monto DEFAULT 0,
        CarteraBruta          DECIMAL(15,2)  NOT NULL CONSTRAINT DF_RecCart_Bruta DEFAULT 0,
        CarteraImproductiva   DECIMAL(15,2)  NOT NULL CONSTRAINT DF_RecCart_Improd DEFAULT 0,
        ProvisionRequerida    DECIMAL(15,2)  NOT NULL CONSTRAINT DF_RecCart_ProvReq DEFAULT 0,
        ProvisionConstituida  DECIMAL(15,2)  NOT NULL CONSTRAINT DF_RecCart_ProvCon DEFAULT 0,
        AsientoProvisionado   DECIMAL(15,2)  NOT NULL CONSTRAINT DF_RecCart_ProvAsi DEFAULT 0,
        ReversaDeProcesoId    INT            NULL,
        Observaciones         NVARCHAR(500)  NULL,
        CONSTRAINT CK_RecCart_Estado CHECK (Estado IN (N'SIMULADO', N'APLICADO', N'REVERSADO'))
    );
    CREATE INDEX IX_RecCart_Corte ON dbo.ReclasificacionCartera (FechaCorte, Estado);
END
GO

/* Solo puede existir UNA corrida APLICADA por fecha de corte. Es el candado de
   idempotencia: sin el, correr dos veces el proceso duplicaria los asientos. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_RecCart_CorteAplicado')
    CREATE UNIQUE INDEX UX_RecCart_CorteAplicado
        ON dbo.ReclasificacionCartera (FechaCorte)
        WHERE Estado = N'APLICADO';
GO

/* ---------------------------------------------------------------------------
   2. Detalle: un renglon por movimiento cuenta-origen -> cuenta-destino
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.ReclasificacionCarteraDetalle', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ReclasificacionCarteraDetalle (
        DetalleId       BIGINT IDENTITY(1,1) PRIMARY KEY,
        ProcesoId       INT            NOT NULL,
        Tipo            NVARCHAR(20)   NOT NULL,   -- RECLASIFICACION | PROVISION
        Segmento        NVARCHAR(20)   NULL,
        CuentaOrigen    NVARCHAR(20)   NULL,
        CuentaDestino   NVARCHAR(20)   NULL,
        EstadoDestino   NVARCHAR(30)   NULL,
        BandaDestino    NVARCHAR(40)   NULL,
        Calificacion    NVARCHAR(5)    NULL,
        Operaciones     INT            NOT NULL CONSTRAINT DF_RecCartDet_Ops DEFAULT 0,
        Monto           DECIMAL(15,2)  NOT NULL,
        CONSTRAINT FK_RecCartDet_Proceso FOREIGN KEY (ProcesoId)
            REFERENCES dbo.ReclasificacionCartera (ProcesoId)
    );
    CREATE INDEX IX_RecCartDet_Proceso ON dbo.ReclasificacionCarteraDetalle (ProcesoId, Tipo);
END
GO

/* ---------------------------------------------------------------------------
   3. Parametros de calificacion y provision por segmento y dias de mora
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.ParametrosProvisionCartera', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ParametrosProvisionCartera (
        ParametroId          INT IDENTITY(1,1) PRIMARY KEY,
        Segmento             NVARCHAR(20)  NOT NULL,   -- COMERCIAL|CONSUMO|VIVIENDA|MICROEMPRESA
        Calificacion         NVARCHAR(5)   NOT NULL,   -- A1..E
        DiasMoraDesde        INT           NOT NULL,
        DiasMoraHasta        INT           NULL,       -- NULL = sin tope superior
        PorcentajeProvision  DECIMAL(7,4)  NOT NULL,   -- 0.0100 = 1%
        CuentaProvision      NVARCHAR(20)  NOT NULL,
        BaseNormativa        NVARCHAR(200) NULL,
        Activo               BIT           NOT NULL CONSTRAINT DF_ParProv_Activo DEFAULT 1
    );
    CREATE UNIQUE INDEX UX_ParProv_Segmento_Calif
        ON dbo.ParametrosProvisionCartera (Segmento, Calificacion);
END
GO

/* Carga idempotente de los parametros. Rangos de dias por segmento y porcentajes
   minimos de provision segun Resolucion 128-2015-F (JPRMF).
   Cuenta de provision por segmento (Catalogo Unico):
     149905 comercial | 149910 consumo | 149915 vivienda | 149920 microempresa   */
SET QUOTED_IDENTIFIER ON;

;WITH Param(Segmento, Calificacion, Desde, Hasta, Pct, Cuenta) AS (
    SELECT * FROM (VALUES
        -- COMERCIAL (Comercial Prioritario)
        (N'COMERCIAL',    N'A1',   0,    0,    0.0100, N'149905'),
        (N'COMERCIAL',    N'A2',   1,   15,    0.0200, N'149905'),
        (N'COMERCIAL',    N'A3',  16,   30,    0.0300, N'149905'),
        (N'COMERCIAL',    N'B1',  31,   60,    0.0600, N'149905'),
        (N'COMERCIAL',    N'B2',  61,   90,    0.1000, N'149905'),
        (N'COMERCIAL',    N'C1',  91,  120,    0.2000, N'149905'),
        (N'COMERCIAL',    N'C2', 121,  180,    0.4000, N'149905'),
        (N'COMERCIAL',    N'D',  181,  360,    0.6000, N'149905'),
        (N'COMERCIAL',    N'E',  361, NULL,    1.0000, N'149905'),
        -- CONSUMO (Consumo Prioritario)
        (N'CONSUMO',      N'A1',   0,    5,    0.0100, N'149910'),
        (N'CONSUMO',      N'A2',   6,   20,    0.0200, N'149910'),
        (N'CONSUMO',      N'A3',  21,   35,    0.0300, N'149910'),
        (N'CONSUMO',      N'B1',  36,   50,    0.0600, N'149910'),
        (N'CONSUMO',      N'B2',  51,   65,    0.1000, N'149910'),
        (N'CONSUMO',      N'C1',  66,   80,    0.2000, N'149910'),
        (N'CONSUMO',      N'C2',  81,   95,    0.4000, N'149910'),
        (N'CONSUMO',      N'D',   96,  125,    0.6000, N'149910'),
        (N'CONSUMO',      N'E',  126, NULL,    1.0000, N'149910'),
        -- VIVIENDA (Inmobiliario)
        (N'VIVIENDA',     N'A1',   0,    5,    0.0100, N'149915'),
        (N'VIVIENDA',     N'A2',   6,   35,    0.0200, N'149915'),
        (N'VIVIENDA',     N'A3',  36,   65,    0.0300, N'149915'),
        (N'VIVIENDA',     N'B1',  66,  120,    0.0600, N'149915'),
        (N'VIVIENDA',     N'B2', 121,  180,    0.1000, N'149915'),
        (N'VIVIENDA',     N'C1', 181,  210,    0.2000, N'149915'),
        (N'VIVIENDA',     N'C2', 211,  270,    0.4000, N'149915'),
        (N'VIVIENDA',     N'D',  271,  450,    0.6000, N'149915'),
        (N'VIVIENDA',     N'E',  451, NULL,    1.0000, N'149915'),
        -- MICROEMPRESA (Microcredito)
        (N'MICROEMPRESA', N'A1',   0,    5,    0.0100, N'149920'),
        (N'MICROEMPRESA', N'A2',   6,   20,    0.0200, N'149920'),
        (N'MICROEMPRESA', N'A3',  21,   35,    0.0300, N'149920'),
        (N'MICROEMPRESA', N'B1',  36,   50,    0.0600, N'149920'),
        (N'MICROEMPRESA', N'B2',  51,   65,    0.1000, N'149920'),
        (N'MICROEMPRESA', N'C1',  66,   80,    0.2000, N'149920'),
        (N'MICROEMPRESA', N'C2',  81,   95,    0.4000, N'149920'),
        (N'MICROEMPRESA', N'D',   96,  125,    0.6000, N'149920'),
        (N'MICROEMPRESA', N'E',  126, NULL,    1.0000, N'149920')
    ) v(Segmento, Calificacion, Desde, Hasta, Pct, Cuenta)
)
MERGE dbo.ParametrosProvisionCartera AS destino
USING Param AS origen
   ON destino.Segmento = origen.Segmento AND destino.Calificacion = origen.Calificacion
WHEN MATCHED THEN UPDATE SET
        DiasMoraDesde       = origen.Desde,
        DiasMoraHasta       = origen.Hasta,
        PorcentajeProvision = origen.Pct,
        CuentaProvision     = origen.Cuenta,
        BaseNormativa       = N'Resolucion 128-2015-F (JPRMF) - porcentaje minimo del rango de la calificacion',
        Activo              = 1
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Segmento, Calificacion, DiasMoraDesde, DiasMoraHasta, PorcentajeProvision, CuentaProvision, BaseNormativa, Activo)
    VALUES (origen.Segmento, origen.Calificacion, origen.Desde, origen.Hasta, origen.Pct, origen.Cuenta,
            N'Resolucion 128-2015-F (JPRMF) - porcentaje minimo del rango de la calificacion', 1);
GO

/* ---------------------------------------------------------------------------
   4. Verificacion: las cuentas de provision referenciadas deben existir en el
      Catalogo Unico. Si no existen, el proceso generaria asientos huerfanos.
   --------------------------------------------------------------------------- */
SELECT
    (SELECT COUNT(*) FROM dbo.ParametrosProvisionCartera)                       AS ParametrosCargados,
    (SELECT COUNT(DISTINCT p.CuentaProvision)
       FROM dbo.ParametrosProvisionCartera p
      WHERE NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas pc WHERE pc.Codigo = p.CuentaProvision))
                                                                                AS CuentasProvisionFaltantes;
GO
