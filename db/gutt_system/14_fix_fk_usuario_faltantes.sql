-- 14_fix_fk_usuario_faltantes.sql
-- Base: GUTT_SYSTEM
-- BUG DE DISEÑO: al inspeccionar todas las columnas *Usuario* del esquema (sys.columns +
-- sys.foreign_key_columns), aparecen varias que guardan un UsuarioId pero NO tienen FK
-- hacia dbo.Usuarios — a diferencia de TransaccionesCaja.UsuarioId, MovimientosCuenta.UsuarioId,
-- AsientosContables.UsuarioId y Socios.UsuarioRegistroId, que sí la tienen:
--   - ControlCaja.UsuarioId            (quién abrió/cierra la caja)
--   - DepositosPlazo.UsuarioAperturaID (quién abrió el DPF)
--   - DepositosPlazo.UsuarioLiquidacionID (quién liquidó/canceló el DPF)
--   - TasasPlazoFijo.UsuarioConfigID   (quién configuró la tasa)
-- Sin la FK, un typo en el UsuarioId (o un usuario que nunca existió) queda invisible: la
-- caja se abre o el DPF se liquida "a nombre de" alguien que el sistema no puede resolver
-- ni auditar de vuelta a dbo.Usuarios.
-- No se tocan AuditoriaProcesos.UsuarioId / AuditoriaUsuarios.UsuarioId a propósito: un
-- log de auditoría debe poder insertarse aunque el UsuarioId ya no exista o sea un intento
-- inválido (ej. un intento de login fallido con un UsuarioId que no existe es, en sí mismo,
-- el evento de seguridad que hay que registrar) — forzar FK ahí rompería ese caso de uso.
--
-- Nota de longitud: ControlCaja.UsuarioId/DepositosPlazo.Usuario*ID/TasasPlazoFijo.UsuarioConfigID
-- eran NVARCHAR(50) mientras que Usuarios.UsuarioId es NVARCHAR(20) — SQL Server exige que
-- ambos lados de una FK nvarchar calcen en largo, así que se achicaron a NVARCHAR(20) (se
-- verificó primero que ningún valor ya insertado superaba 10 caracteres, así que no trunca
-- nada existente).
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

-- SQL Server exige que ambos lados de una FK nvarchar tengan el mismo largo/escala
-- (a diferencia de una comparación normal, donde el motor convierte implícitamente).
-- Estas columnas son NVARCHAR(50) y Usuarios.UsuarioId es NVARCHAR(20); se verificó con
-- MAX(LEN(...)) que ningún valor ya insertado supera 10 caracteres, así que achicarlas a
-- NVARCHAR(20) para que calcen con la PK no trunca nada existente.
-- UC_ControlCaja_Usuario_Fecha (UNIQUE sobre UsuarioId, Fecha) depende de la columna;
-- hay que soltarla y recrearla alrededor del ALTER COLUMN.
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UC_ControlCaja_Usuario_Fecha')
    ALTER TABLE dbo.ControlCaja DROP CONSTRAINT UC_ControlCaja_Usuario_Fecha;
GO

ALTER TABLE dbo.ControlCaja ALTER COLUMN UsuarioId NVARCHAR(20) NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UC_ControlCaja_Usuario_Fecha')
    ALTER TABLE dbo.ControlCaja ADD CONSTRAINT UC_ControlCaja_Usuario_Fecha UNIQUE (UsuarioId, Fecha);
GO

ALTER TABLE dbo.DepositosPlazo ALTER COLUMN UsuarioAperturaID NVARCHAR(20) NOT NULL;
GO
ALTER TABLE dbo.DepositosPlazo ALTER COLUMN UsuarioLiquidacionID NVARCHAR(20) NULL;
GO
ALTER TABLE dbo.TasasPlazoFijo ALTER COLUMN UsuarioConfigID NVARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ControlCaja_Usuario')
    ALTER TABLE dbo.ControlCaja WITH CHECK
        ADD CONSTRAINT FK_ControlCaja_Usuario FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios(UsuarioId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_DepositosPlazo_UsuarioApertura')
    ALTER TABLE dbo.DepositosPlazo WITH CHECK
        ADD CONSTRAINT FK_DepositosPlazo_UsuarioApertura FOREIGN KEY (UsuarioAperturaID) REFERENCES dbo.Usuarios(UsuarioId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_DepositosPlazo_UsuarioLiquidacion')
    ALTER TABLE dbo.DepositosPlazo WITH CHECK
        ADD CONSTRAINT FK_DepositosPlazo_UsuarioLiquidacion FOREIGN KEY (UsuarioLiquidacionID) REFERENCES dbo.Usuarios(UsuarioId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_TasasPlazoFijo_UsuarioConfig')
    ALTER TABLE dbo.TasasPlazoFijo WITH CHECK
        ADD CONSTRAINT FK_TasasPlazoFijo_UsuarioConfig FOREIGN KEY (UsuarioConfigID) REFERENCES dbo.Usuarios(UsuarioId);
GO

-- Índices de soporte para las FKs nuevas
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ControlCaja_UsuarioId' AND object_id = OBJECT_ID('dbo.ControlCaja'))
    CREATE INDEX IX_ControlCaja_UsuarioId ON dbo.ControlCaja(UsuarioId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DepositosPlazo_UsuarioAperturaID' AND object_id = OBJECT_ID('dbo.DepositosPlazo'))
    CREATE INDEX IX_DepositosPlazo_UsuarioAperturaID ON dbo.DepositosPlazo(UsuarioAperturaID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DepositosPlazo_UsuarioLiquidacionID' AND object_id = OBJECT_ID('dbo.DepositosPlazo'))
    CREATE INDEX IX_DepositosPlazo_UsuarioLiquidacionID ON dbo.DepositosPlazo(UsuarioLiquidacionID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TasasPlazoFijo_UsuarioConfigID' AND object_id = OBJECT_ID('dbo.TasasPlazoFijo'))
    CREATE INDEX IX_TasasPlazoFijo_UsuarioConfigID ON dbo.TasasPlazoFijo(UsuarioConfigID);
GO

PRINT '=== 14_fix_fk_usuario_faltantes.sql completado. ===';
GO
