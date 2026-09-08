-- 20_seed_cooperativa_crediapoyo.sql
-- Base: GUTT_SYSTEM
-- Alta de la cooperativa real para la que se está preparando la venta (Crediapoyo),
-- distinta de la CooperativaId=1 (Caja Patate, RUC placeholder) usada hasta ahora
-- solo para pruebas. RUC y representante verificados contra la proforma real
-- PRF-2026-GUTT-001/003 y la consulta pública de RUC del SRI (2026-08-06).
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Cooperativas WHERE RUC = '1891813608001')
BEGIN
    INSERT INTO dbo.Cooperativas (RazonSocial, RUC, NombreComercial, ColorPrimario, ColorAcento, Activa)
    VALUES ('Caja de Ahorro Crediapoyo', '1891813608001', 'Crediapoyo', '#14532D', '#FACC15', 1);
    PRINT 'Cooperativa Crediapoyo insertada.';
END
ELSE
    PRINT 'Cooperativa Crediapoyo ya existe.';
GO

PRINT '=== 20_seed_cooperativa_crediapoyo.sql completado. ===';
GO
