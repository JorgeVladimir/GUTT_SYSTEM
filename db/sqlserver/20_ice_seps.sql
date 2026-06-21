-- =============================================================================
-- 20_ice_seps.sql
-- ICE: Índice de Capacidad de Endeudamiento (SEPS Ecuador)
-- Resolución SEPS-IGT-DNG-2018-0037 — Art. 8: Evaluación de Capacidad de Pago
-- ICE = (CuotaMensual + DeudaExternaMensual) / IngresoNetoMensual × 100
-- Límites: ≤40% APROBADO | 41-50% ALERTA | >50% BLOQUEADO
-- =============================================================================
USE SQLGUTPATATE;
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columnas ICE en SolicitudesCredito
-- ─────────────────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'ICEPorcentaje')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD ICEPorcentaje DECIMAL(6,2) NULL;
    PRINT 'Columna ICEPorcentaje añadida a SolicitudesCredito.';
END
ELSE
    PRINT 'Columna ICEPorcentaje ya existe.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'ICEEstado')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD ICEEstado NVARCHAR(10) NULL;
    -- Posibles valores: APROBADO | ALERTA | BLOQUEADO | NULL (no calculado)
    PRINT 'Columna ICEEstado añadida a SolicitudesCredito.';
END
ELSE
    PRINT 'Columna ICEEstado ya existe.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'ICECuotaMensual')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD ICECuotaMensual DECIMAL(15,2) NULL;
    PRINT 'Columna ICECuotaMensual añadida.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'ICEIngresoNeto')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD ICEIngresoNeto DECIMAL(15,2) NULL;
    PRINT 'Columna ICEIngresoNeto añadida.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'ICEDeudaExterna')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD ICEDeudaExterna DECIMAL(15,2) NULL;
    PRINT 'Columna ICEDeudaExterna añadida.';
END
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Constraint de valores válidos en ICEEstado
-- ─────────────────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'CK_SolicitudesCredito_ICEEstado')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito
    ADD CONSTRAINT CK_SolicitudesCredito_ICEEstado
    CHECK (ICEEstado IS NULL OR ICEEstado IN ('APROBADO', 'ALERTA', 'BLOQUEADO'));
    PRINT 'Constraint CK_SolicitudesCredito_ICEEstado creado.';
END
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Vista auxiliar: ICE por solicitud activa (facilita reportes SEPS)
-- ─────────────────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.vw_ICE_Creditos', 'V') IS NOT NULL
    DROP VIEW dbo.vw_ICE_Creditos;
GO
CREATE VIEW dbo.vw_ICE_Creditos AS
SELECT
    s.SolicitudID,
    s.Identificacion,
    rs.PrimerNombre + ' ' + rs.Apellidos AS NombreSocio,
    s.Monto,
    s.Tasa,
    s.Plazo,
    s.Estado,
    s.ICEPorcentaje,
    s.ICEEstado,
    s.ICECuotaMensual,
    s.ICEIngresoNeto,
    s.ICEDeudaExterna,
    s.FechaSolicitud,
    CASE
        WHEN s.ICEPorcentaje IS NULL     THEN 'SIN CÁLCULO'
        WHEN s.ICEPorcentaje <= 40.00    THEN 'CAPACIDAD ADECUADA (≤40%)'
        WHEN s.ICEPorcentaje <= 50.00    THEN 'EN LÍMITE (41-50%)'
        ELSE                                  'SOBREENDEUDAMIENTO (>50%)'
    END AS ICEDescripcion
FROM dbo.SolicitudesCredito s
LEFT JOIN dbo.RegistroSocios rs ON rs.Identificacion = s.Identificacion;
GO
PRINT 'Vista vw_ICE_Creditos creada.';
GO

PRINT '=== Migración 20 (ICE SEPS) completada exitosamente. ===';
GO
