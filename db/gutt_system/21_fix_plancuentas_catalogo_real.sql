-- 21_fix_plancuentas_catalogo_real.sql
-- Base: GUTT_SYSTEM
-- El catálogo real de Crediapoyo/Fundación (verificado en vivo contra su core Informix,
-- tabla bcaccco, 1103 cuentas) usa 2 clases de cuenta que el CHECK original no admitía:
-- 6xxxxx = Cuentas Contingentes, 7xxxxx = Cuentas de Orden. El diseño original solo
-- contempló balance/resultados (1-5) porque el fixture de prueba nunca necesitó más.
-- También se agrega EsAgrupador, dato real de bcaccco.ccco_cod_tcue ('A'=agrupador,
-- 'M'=movimiento/postable) que el diseño original no capturaba: sin esto, nada impide
-- contabilizar (INSERT en DetalleAsiento) contra una cuenta de agrupación en vez de una
-- cuenta de movimiento real -- error contable real, no solo de estilo.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

IF OBJECT_ID('dbo.CK_PlanCuentas_Tipo', 'C') IS NOT NULL
    ALTER TABLE dbo.PlanCuentas DROP CONSTRAINT CK_PlanCuentas_Tipo;
GO

ALTER TABLE dbo.PlanCuentas
    ADD CONSTRAINT CK_PlanCuentas_Tipo CHECK (TipoCuenta IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO','CONTINGENTE','ORDEN'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PlanCuentas') AND name = 'EsAgrupador')
BEGIN
    ALTER TABLE dbo.PlanCuentas ADD EsAgrupador BIT NOT NULL CONSTRAINT DF_PlanCuentas_EsAgrupador DEFAULT(0);
    PRINT 'Columna EsAgrupador agregada a dbo.PlanCuentas.';
END
GO

-- No se puede contabilizar (DetalleAsiento) contra una cuenta de agrupación.
IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'TR_DetalleAsiento_NoAgrupador')
EXEC('
CREATE TRIGGER dbo.TR_DetalleAsiento_NoAgrupador ON dbo.DetalleAsiento
AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted i
        JOIN dbo.PlanCuentas pc ON pc.CuentaContableId = i.CuentaContableId
        WHERE pc.EsAgrupador = 1
    )
    BEGIN
        RAISERROR(''No se puede contabilizar contra una cuenta de agrupación (EsAgrupador=1) -- use una cuenta de movimiento (nivel hoja)'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END
');
GO

PRINT '=== 21_fix_plancuentas_catalogo_real.sql completado. ===';
GO
