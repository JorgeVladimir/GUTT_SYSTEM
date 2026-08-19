-- 24_recuperacion_password_permisos.sql
-- Agrega soporte para recuperación de contraseña por correo (token temporal)
-- y permisos por módulo asignables desde el panel administrativo.
-- Idempotente: puede correr varias veces sin error.

IF COL_LENGTH('dbo.Usuarios', 'ResetToken') IS NULL
    ALTER TABLE dbo.Usuarios ADD ResetToken NVARCHAR(200) NULL;
GO

IF COL_LENGTH('dbo.Usuarios', 'ResetTokenExpira') IS NULL
    ALTER TABLE dbo.Usuarios ADD ResetTokenExpira DATETIME2 NULL;
GO

-- NULL = sin restricción (usa el menú completo de su Rol, comportamiento actual).
-- No-NULL = JSON array de ids de módulo (ver NAV_BY_ROLE en constants.tsx), ej:
--   ["DASHBOARD","TELLER_OPERATIONS","SAVINGS"]
IF COL_LENGTH('dbo.Usuarios', 'PermisosModulos') IS NULL
    ALTER TABLE dbo.Usuarios ADD PermisosModulos NVARCHAR(MAX) NULL;
GO
