-- 28_normalizar_cuentacontable_legacy.sql
-- Base: SQLGUTPATATE
-- Normaliza los códigos de cuenta con formato punteado legacy ('1.2.01', etc.) que quedaron
-- en dbo.RegistroContable antes de que el Catálogo Único de Cuentas SEPS existiera
-- (ver 26_plan_cuentas_seps.sql / 27_cargar_plan_cuentas_seps.js), a su código real
-- equivalente en dbo.PlanCuentas. Sin esto, el Balance de Comprobación fragmenta estas
-- 13 filas como cuentas "fantasma" que no existen en el catálogo real.
-- Mapeo verificado por Concepto de cada asiento (ver conversación 2026-08-19):
--   1.2.01 (Cartera de Crédito de Consumo por Vencer)      -> 143110 Cartera de creditos de consumo
--   2.5.04 (Retención SOLCA crédito)                       -> 25049005 Impuesto solca
--   3.2.01 (Fondo Social de Reserva Irrepartible)          -> 330105 RESERVA LEGAL
--   5.2.01 (Comisiones por Servicios de Crédito)           -> 529010 Comisiones ganadas
--   5.1.01 (Ingresos por Intereses)                        -> 510410 Intereses cartera consumo
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

UPDATE dbo.RegistroContable SET CuentaContable = '143110'   WHERE CuentaContable = '1.2.01';
UPDATE dbo.RegistroContable SET CuentaContable = '25049005' WHERE CuentaContable = '2.5.04';
UPDATE dbo.RegistroContable SET CuentaContable = '330105'   WHERE CuentaContable = '3.2.01';
UPDATE dbo.RegistroContable SET CuentaContable = '529010'   WHERE CuentaContable = '5.2.01';
UPDATE dbo.RegistroContable SET CuentaContable = '510410'   WHERE CuentaContable = '5.1.01';
GO

PRINT '=== 28_normalizar_cuentacontable_legacy.sql completado. ===';
GO
