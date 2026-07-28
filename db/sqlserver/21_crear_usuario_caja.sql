SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- Crear el usuario de caja (TELLER) si no existe
IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE UsuarioId = 'caja')
BEGIN
    INSERT INTO dbo.Usuarios (UsuarioId, NombreCompleto, Pin, Rol, Activo, PasswordHash, RequiereCambioPin, FechaRegistro, FechaCreacion, FechaActualizacion)
    VALUES ('caja', 'Cajero de Pruebas', '1234', 'TELLER', 1, 'Caja2026.', 0, CAST(GETDATE() AS DATE), SYSDATETIME(), SYSDATETIME());
    PRINT 'Usuario de caja creado con éxito.';
END
ELSE
BEGIN
    PRINT 'El usuario de caja ya existe.';
END
GO
