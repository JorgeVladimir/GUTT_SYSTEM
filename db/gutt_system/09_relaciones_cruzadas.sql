-- 09_relaciones_cruzadas.sql
-- Base: GUTT_SYSTEM
-- FKs entre tablas de scripts distintos que no podían declararse antes porque
-- la tabla referenciada todavía no existía en ese punto del despliegue.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MovimientosCuenta_TransaccionCaja')
    ALTER TABLE dbo.MovimientosCuenta
        ADD CONSTRAINT FK_MovimientosCuenta_TransaccionCaja FOREIGN KEY (TransaccionCajaId) REFERENCES dbo.TransaccionesCaja(TransaccionId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MovimientosCuenta_Asiento')
    ALTER TABLE dbo.MovimientosCuenta
        ADD CONSTRAINT FK_MovimientosCuenta_Asiento FOREIGN KEY (AsientoContableId) REFERENCES dbo.AsientosContables(AsientoId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_TransaccionesCaja_Asiento')
    ALTER TABLE dbo.TransaccionesCaja
        ADD CONSTRAINT FK_TransaccionesCaja_Asiento FOREIGN KEY (AsientoContableId) REFERENCES dbo.AsientosContables(AsientoId);
GO

PRINT '=== 09_relaciones_cruzadas.sql completado. ===';
GO
