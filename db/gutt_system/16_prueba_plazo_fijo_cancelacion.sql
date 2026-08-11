-- 16_prueba_plazo_fijo_cancelacion.sql
-- Base: GUTT_SYSTEM
-- Objetivo: probar cancelación anticipada y liquidación de un DPF — Estado, FechaLiquidacion
-- y PenalizacionAplicada en DepositosPlazo, más su asiento contable correspondiente en
-- AsientosContables/DetalleAsiento con OrigenModulo='PLAZO_FIJO'.
--
-- Se abre un DPF nuevo en el tramo de 31-90 días (TasaID=2, penalización 25% sobre el
-- tramo, según seed de 05_plazo_fijo.sql) a 60 días, y se cancela a los 20 días — antes
-- del vencimiento, para que la penalización realmente aplique (a diferencia del DPF de
-- 10_prueba_modelo.sql, que usa el tramo 1-30 días con 0% de penalización y no sirve para
-- probar este caso).
--
-- Nota sobre códigos de cuenta: TasasPlazoFijo.CuentaContableDPF usa formato SEPS con
-- puntos ('2.1.03.10'). El PlanCuentas de prueba (fixture 10) usa códigos de 6 dígitos sin
-- puntos ('210305'). Este script inserta el PlanCuentas del tramo CON el formato punteado
-- para que calce exactamente con TasasPlazoFijo.CuentaContableDPF/DepositosPlazo.CuentaContableDPF
-- — de otro modo un JOIN por código nunca encontraría la cuenta. La inconsistencia de fondo
-- entre los tres formatos de código (ProductosFinancieros de 8 dígitos, TasasPlazoFijo
-- punteado, PlanCuentas de prueba de 6 dígitos) queda documentada como hueco pendiente en
-- el reporte final — no se resuelve acá porque es una decisión de catálogo, no un bug de
-- esquema, y afecta directamente lo que gutt-system-adaptacion-queries necesite consultar.
--
-- Datos ficticios marcados: DepositoID='DPF-TEST-0002', socio de prueba 9999999999.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

USE GUTT_SYSTEM;
GO

DECLARE @CoopId INT = 1;
DECLARE @SocioId BIGINT;
DECLARE @UsuarioId NVARCHAR(20) = 'test.admin';
DECLARE @DepositoId NVARCHAR(20) = 'DPF-TEST-0002';
DECLARE @TasaId INT;
DECLARE @PeriodoId INT;
DECLARE @AsientoId INT;
DECLARE @CtaCaja INT, @CtaDPFTramo2 INT, @CtaInteresesCausados INT, @CtaRetencionesPagar INT, @CtaIngresoPenalizacion INT;

SELECT @SocioId = SocioId FROM dbo.Socios WHERE CooperativaId = @CoopId AND Identificacion = '9999999999';
SELECT @TasaId = TasaID FROM dbo.TasasPlazoFijo WHERE CooperativaId = @CoopId AND CodigoRango = '210310'; -- 31-90 días, 25% penalización
IF @SocioId IS NULL OR @TasaId IS NULL
BEGIN
    PRINT 'ERROR: falta el socio de prueba o el tramo de tasa 31-90 días. Correr primero 10_prueba_modelo.sql / 05_plazo_fijo.sql.';
    RETURN;
END

-- Plan de cuentas necesario para este asiento (además de Caja '110105', ya insertada en 10_prueba_modelo.sql)
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '2.1.03.10')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (@CoopId, '2.1.03.10', 'Depósitos a Plazo 31-90 días', 'PASIVO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '410205')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (@CoopId, '410205', 'Intereses Causados en Depósitos a Plazo', 'GASTO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '210510')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (@CoopId, '210510', 'Retenciones por Pagar SRI', 'PASIVO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '510205')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (@CoopId, '510205', 'Ingresos por Penalización Cancelación Anticipada DPF', 'INGRESO');

SELECT @CtaCaja = CuentaContableId FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '110105';
SELECT @CtaDPFTramo2 = CuentaContableId FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '2.1.03.10';
SELECT @CtaInteresesCausados = CuentaContableId FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '410205';
SELECT @CtaRetencionesPagar = CuentaContableId FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '210510';
SELECT @CtaIngresoPenalizacion = CuentaContableId FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '510205';

SELECT @PeriodoId = PeriodoId FROM dbo.PeriodosContables WHERE CooperativaId = @CoopId AND Anio = YEAR(SYSDATETIME()) AND Mes = MONTH(SYSDATETIME());
IF @PeriodoId IS NULL
BEGIN
    INSERT INTO dbo.PeriodosContables (CooperativaId, Anio, Mes) VALUES (@CoopId, YEAR(SYSDATETIME()), MONTH(SYSDATETIME()));
    SELECT @PeriodoId = PeriodoId FROM dbo.PeriodosContables WHERE CooperativaId = @CoopId AND Anio = YEAR(SYSDATETIME()) AND Mes = MONTH(SYSDATETIME());
END

-- 1. Apertura del DPF a 60 días (tramo 31-90 días)
IF NOT EXISTS (SELECT 1 FROM dbo.DepositosPlazo WHERE DepositoID = @DepositoId)
    INSERT INTO dbo.DepositosPlazo (
        DepositoID, CooperativaId, SocioID, Identificacion, NombreSocio, NumCertificado,
        TasaID, TasaNominalAnual, PlazosDias, MontoCapital, InteresProyectado, RetencionProyectada, InteresNetoProyectado,
        FechaVencimiento, CuentaContableDPF, UsuarioAperturaID
    )
    VALUES (
        @DepositoId, @CoopId, @SocioId, '9999999999', 'Prueba Del Modelo', 'CERT-TEST-0002',
        @TasaId, 4.50, 60, 1000.00, 7.50, 0.15, 7.35,
        DATEADD(DAY, 60, GETDATE()), '2.1.03.10', @UsuarioId
    );

-- 2. Cancelación anticipada a los 20 días (antes del vencimiento a 60 días)
--    InteresLiquidado = 1000 * 4.50% * 20/360 = 2.50
--    PenalizacionAplicada = 25% del interés devengado = 0.63
--    RetencionAplicada = 2% sobre el interés neto de penalización = 0.04
--    InteresNetoLiquidado = 2.50 - 0.63 - 0.04 = 1.83
IF EXISTS (SELECT 1 FROM dbo.DepositosPlazo WHERE DepositoID = @DepositoId AND Estado = 'ACTIVO')
    UPDATE dbo.DepositosPlazo
    SET Estado = 'CANCELADO',
        FechaLiquidacion = SYSDATETIME(),
        InteresLiquidado = 2.50,
        PenalizacionAplicada = 0.63,
        RetencionAplicada = 0.04,
        InteresNetoLiquidado = 1.83,
        MotivosCancelacion = 'Cancelación anticipada solicitada por el socio (prueba de esquema)',
        UsuarioLiquidacionID = @UsuarioId,
        FechaModificacion = SYSDATETIME()
    WHERE DepositoID = @DepositoId;

-- 3. Asiento contable de la cancelación (partida doble, OrigenModulo='PLAZO_FIJO')
--    Debe: 1000.00 (extingue pasivo DPF) + 2.50 (gasto interés causado) = 1002.50
--    Haber: 1001.83 (caja entregada al socio) + 0.04 (retención por pagar) + 0.63 (ingreso por penalización) = 1002.50
IF NOT EXISTS (SELECT 1 FROM dbo.AsientosContables WHERE OrigenModulo = 'PLAZO_FIJO' AND OrigenId = @DepositoId)
BEGIN
    INSERT INTO dbo.AsientosContables (CooperativaId, PeriodoContableId, Concepto, UsuarioId, OrigenModulo, OrigenId)
    VALUES (@CoopId, @PeriodoId, 'Cancelación anticipada DPF ' + @DepositoId + ' (prueba de esquema)', @UsuarioId, 'PLAZO_FIJO', @DepositoId);
    SET @AsientoId = SCOPE_IDENTITY();

    INSERT INTO dbo.DetalleAsiento (AsientoId, CuentaContableId, TipoAsiento, Valor) VALUES (@AsientoId, @CtaDPFTramo2, 'D', 1000.00);
    INSERT INTO dbo.DetalleAsiento (AsientoId, CuentaContableId, TipoAsiento, Valor) VALUES (@AsientoId, @CtaInteresesCausados, 'D', 2.50);
    INSERT INTO dbo.DetalleAsiento (AsientoId, CuentaContableId, TipoAsiento, Valor) VALUES (@AsientoId, @CtaCaja, 'H', 1001.83);
    INSERT INTO dbo.DetalleAsiento (AsientoId, CuentaContableId, TipoAsiento, Valor) VALUES (@AsientoId, @CtaRetencionesPagar, 'H', 0.04);
    INSERT INTO dbo.DetalleAsiento (AsientoId, CuentaContableId, TipoAsiento, Valor) VALUES (@AsientoId, @CtaIngresoPenalizacion, 'H', 0.63);
END

PRINT '=== DPF cancelado anticipadamente y asiento contable insertado. ===';
GO

-- Verificación 1: estado, penalización y liquidación del DPF
PRINT '--- DepositosPlazo tras la cancelación anticipada ---';
SELECT DepositoID, Estado, FechaVencimiento, FechaLiquidacion, MontoCapital, InteresLiquidado, PenalizacionAplicada, RetencionAplicada, InteresNetoLiquidado
FROM dbo.DepositosPlazo
WHERE DepositoID = 'DPF-TEST-0002';
GO

-- Verificación 2: partida doble del asiento de cancelación (Debe debe cuadrar con Haber)
PRINT '--- Partida doble del asiento de cancelación del DPF (debe cuadrar) ---';
SELECT a.AsientoId, a.Concepto, a.OrigenModulo, a.OrigenId,
       SUM(CASE WHEN d.TipoAsiento = 'D' THEN d.Valor ELSE 0 END) AS TotalDebe,
       SUM(CASE WHEN d.TipoAsiento = 'H' THEN d.Valor ELSE 0 END) AS TotalHaber
FROM dbo.AsientosContables a
JOIN dbo.DetalleAsiento d ON d.AsientoId = a.AsientoId
WHERE a.OrigenModulo = 'PLAZO_FIJO' AND a.OrigenId = 'DPF-TEST-0002'
GROUP BY a.AsientoId, a.Concepto, a.OrigenModulo, a.OrigenId;
GO

PRINT '=== 16_prueba_plazo_fijo_cancelacion.sql completado. ===';
GO
