-- Crear el superusuario si no existe
IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE UsuarioId = 'superuser')
BEGIN
    INSERT INTO dbo.Usuarios (UsuarioId, NombreCompleto, Pin, Rol, Activo, PasswordHash, RequiereCambioPin, FechaRegistro, FechaCreacion, FechaActualizacion)
    VALUES ('superuser', 'Super Usuario del Sistema', '1234', 'SUPER_USER', 1, 'Gael240220.', 0, CAST(GETDATE() AS DATE), SYSDATETIME(), SYSDATETIME());
    PRINT 'Superusuario creado con éxito.';
END
ELSE
BEGIN
    PRINT 'El superusuario ya existe.';
END
GO
