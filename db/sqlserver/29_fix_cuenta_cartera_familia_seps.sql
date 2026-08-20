-- 29_fix_cuenta_cartera_familia_seps.sql
-- Base: SQLGUTPATATE
-- CORRECCIÓN de 28_normalizar_cuentacontable_legacy.sql.
--
-- En el script 28 la cartera de crédito se mapeó a '143110' ("Cartera de creditos de
-- consumo") por coincidencia de NOMBRE. Es la cuenta equivocada: '143110' no pertenece a la
-- familia de estado de cartera del Catálogo Único SEPS -- esa familia es
--   1401..1404  POR VENCER            (por segmento)
--   1411..1414  QUE NO DEVENGA INTERESES
--   1421..1424  VENCIDA
-- cada una subdividida en bandas de antigüedad (…05 = 1-30 días, …10 = 31-90, etc.).
--
-- Consecuencia real detectada: la fórmula regulatoria de morosidad lee esa familia, así que
-- con la cartera contabilizada en '143110' el indicador de morosidad daba 0% mientras la
-- cartera operativa real estaba 100% en mora. Un descuadre así entre contabilidad y cartera
-- es exactamente lo que una revisión SEPS marca como hallazgo.
--
-- Se reasigna a '140205' (CONSUMO POR VENCER / De 1 a 30 días), que es cuenta de movimiento
-- (EsAgrupador = 0) y sí pertenece a la familia correcta.
--
-- PENDIENTE CONOCIDO (no lo resuelve este script): falta el proceso mensual de
-- reclasificación de cartera, que debe mover saldos entre bandas y entre por vencer /
-- no devenga / vencida conforme las cuotas envejecen. Mientras no exista, la clasificación
-- contable de cartera queda congelada en la banda de origen y la fuente de verdad para
-- morosidad es la tabla de amortización (ver /api/reports sp_sepsb11).
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

UPDATE dbo.RegistroContable SET CuentaContable = '140205' WHERE CuentaContable = '143110';
GO

PRINT '=== 29_fix_cuenta_cartera_familia_seps.sql completado. ===';
GO
