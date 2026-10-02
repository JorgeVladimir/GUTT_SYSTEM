/* ============================================================================
   35_reset_password_demo.sql
   ----------------------------------------------------------------------------
   Reseteo puntual de contrasena para 'admin' y 'cartera' a pedido del usuario,
   para desbloquear el ingreso durante la presentacion del 2026-09-13 (el
   usuario 'asesor' con rol CREDIT_OFFICER no tiene permiso de aprobacion).
   ============================================================================ */
SET QUOTED_IDENTIFIER ON;
GO

UPDATE dbo.Usuarios SET PasswordHash = '$2b$10$3v9Y.9kYj0DXnn23Hp1I6u8un8F.FyynOj6MKnkbpj7l4/xxjjRZu', RequiereCambioPin = 0
WHERE UsuarioId IN ('admin', 'cartera');
GO

SELECT UsuarioId, Rol, Activo, LEFT(PasswordHash,7) AS HashPrefix FROM dbo.Usuarios WHERE UsuarioId IN ('admin','cartera');
GO
