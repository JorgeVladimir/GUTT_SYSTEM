-- 11_prueba_aislamiento_multicooperativa.sql
-- Base: GUTT_SYSTEM
-- Objetivo: probar que el modelo multi-tenencia (CooperativaId) realmente aísla los
-- datos entre dos cooperativas. Crea una segunda cooperativa ficticia ("TEST-COOP-2")
-- con su propio socio, cuenta y crédito, y confirma con consultas que un filtro por
-- CooperativaId separa los datos.
--
-- Esta prueba también expone (a propósito, sin dejarlo persistido) un hueco real del
-- diseño: hoy nada impide insertar una fila en SolicitudesCredito/Creditos/DepositosPlazo
-- con un CooperativaId distinto al de su propio Socio. El INSERT "malicioso" de la
-- sección 4 se ejecuta, se demuestra que pasa sin error, y se borra de inmediato.
-- El fix real (CHECK constraints vía función escalar) va en 12_fix_consistencia_cooperativa.sql.
--
-- Datos ficticios, claramente marcados: RUC de coop2 termina en TEST, identificación
-- del socio de coop2 es '8888888888' (coop1/fixture 10 ya usa '9999999999').
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

USE GUTT_SYSTEM;
GO

DECLARE @Coop1Id INT = 1;
DECLARE @Coop2Id INT;
DECLARE @Usuario2Id NVARCHAR(20) = 'test.admin2';
DECLARE @ProductoAhorroCoop2Id INT;
DECLARE @Socio1Id BIGINT, @Socio2Id BIGINT;
DECLARE @CuentaCoop2Id INT;
DECLARE @SolicitudCoop2Id NVARCHAR(50) = 'SOL-TEST2-0001';
DECLARE @CreditoCoop2Id NVARCHAR(50) = 'CRED-TEST2-0001';

-- 1. Segunda cooperativa ficticia
IF NOT EXISTS (SELECT 1 FROM dbo.Cooperativas WHERE NombreComercial = 'TEST-COOP-2')
BEGIN
    INSERT INTO dbo.Cooperativas (RazonSocial, RUC, CodigoSEPS, NombreComercial, Activa)
    VALUES ('Cooperativa TEST Aislamiento Multicooperativa Ltda', '1799999999888', 'TEST-002', 'TEST-COOP-2', 1);
    PRINT 'Cooperativa TEST-COOP-2 insertada.';
END
SELECT @Coop2Id = CooperativaId FROM dbo.Cooperativas WHERE NombreComercial = 'TEST-COOP-2';

-- 2. Usuario y producto financiero propios de coop2 (no reutilizar los de CooperativaId=1)
IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE UsuarioId = @Usuario2Id)
    INSERT INTO dbo.Usuarios (UsuarioId, CooperativaId, NombreCompleto, PasswordHash, Rol, Activo)
    VALUES (@Usuario2Id, @Coop2Id, 'Usuario de Prueba Coop2', 'no-usar-en-produccion', 'ADMIN', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.ProductosFinancieros WHERE CooperativaId = @Coop2Id AND CodigoProducto = 2)
    INSERT INTO dbo.ProductosFinancieros (
        CooperativaId, CodigoProducto, Nombre, TipoDeposito, EsCertificado,
        CuentaActiva, CuentaInactiva, CuentaGasto, CuentaProvision, CuentaDepositosConfirmar,
        NumCtas4Dig, PermiteDepositos, PermiteRetiros, PermiteDebitos, PermiteCreditos, PermiteTransferencias,
        Tasa, FormaPago, MesesAcreditacion
    )
    VALUES (
        @Coop2Id, 2, 'AHORRO A LA VISTA TEST-COOP-2', 'AHORRO A LA VISTA', 0,
        '21013505', '21013505', '41019001', '25019001', '21015015',
        28, 1, 1, 1, 1, 1,
        'TASA NOMINAL', 'MOVIMIENTO HISTORICO PONDERADO BASE', 'Diciembre'
    );
SELECT @ProductoAhorroCoop2Id = ProductoId FROM dbo.ProductosFinancieros WHERE CooperativaId = @Coop2Id AND CodigoProducto = 2;

-- 3. Socio, cuenta y crédito propios de coop2
IF EXISTS (SELECT 1 FROM dbo.Socios WHERE CooperativaId = @Coop2Id AND Identificacion = '8888888888')
    SELECT @Socio2Id = SocioId FROM dbo.Socios WHERE CooperativaId = @Coop2Id AND Identificacion = '8888888888';
ELSE
BEGIN
    INSERT INTO dbo.Socios (CooperativaId, TipoPersona, TipoIdentificacion, Identificacion, PrimerNombre, PrimerApellido, PIN, NumeroSocio, UsuarioRegistroId)
    VALUES (@Coop2Id, 'SOCIO', 'CÉDULA', '8888888888', 'Prueba', 'Cooperativa Dos', '1111', 'P' + CAST(NEXT VALUE FOR Seq_NumeroSocio AS NVARCHAR(10)), @Usuario2Id);
    SET @Socio2Id = SCOPE_IDENTITY();
END

IF NOT EXISTS (SELECT 1 FROM dbo.Cuentas WHERE SocioId = @Socio2Id AND ProductoId = @ProductoAhorroCoop2Id)
    INSERT INTO dbo.Cuentas (SocioId, NumeroCuenta, ProductoId) VALUES (@Socio2Id, '9' + RIGHT('00000000' + CAST(@Socio2Id AS NVARCHAR(8)), 8), @ProductoAhorroCoop2Id);
SELECT @CuentaCoop2Id = CuentaId FROM dbo.Cuentas WHERE SocioId = @Socio2Id AND ProductoId = @ProductoAhorroCoop2Id;

IF NOT EXISTS (SELECT 1 FROM dbo.SolicitudesCredito WHERE SolicitudID = @SolicitudCoop2Id)
    INSERT INTO dbo.SolicitudesCredito (SolicitudID, CooperativaId, SocioID, Identificacion, Monto, Saldo, Tasa, Plazo, Tipo, Estado, Origen)
    VALUES (@SolicitudCoop2Id, @Coop2Id, @Socio2Id, '8888888888', 800.00, 800.00, 16.00, 12, 'CONSUMO', 'APROBADO', 'PRUEBA_AISLAMIENTO');

IF NOT EXISTS (SELECT 1 FROM dbo.Creditos WHERE CreditoID = @CreditoCoop2Id)
    INSERT INTO dbo.Creditos (CreditoID, CooperativaId, SolicitudID, SocioID, Monto, Saldo, Tasa, Plazo, Tipo, Estado)
    VALUES (@CreditoCoop2Id, @Coop2Id, @SolicitudCoop2Id, @Socio2Id, 800.00, 800.00, 16.00, 12, 'CONSUMO', 'VIGENTE');

SELECT @Socio1Id = SocioId FROM dbo.Socios WHERE CooperativaId = @Coop1Id AND Identificacion = '9999999999';

PRINT '=== Datos de coop1 (Caja Patate, real) y coop2 (TEST-COOP-2, ficticia) insertados. ===';
GO

-- 4. Verificación 1: conteo por cooperativa (deben quedar completamente separados)
PRINT '--- Socios de prueba por cooperativa ---';
SELECT s.CooperativaId, c.NombreComercial, s.Identificacion, s.PrimerNombre, s.PrimerApellido
FROM dbo.Socios s JOIN dbo.Cooperativas c ON c.CooperativaId = s.CooperativaId
WHERE s.Identificacion IN ('9999999999', '8888888888')
ORDER BY s.CooperativaId;
GO

PRINT '--- Créditos de prueba por cooperativa (join correcto, filtrado por CooperativaId) ---';
SELECT cr.CooperativaId, cr.CreditoID, s.Identificacion, cr.Monto
FROM dbo.Creditos cr JOIN dbo.Socios s ON s.SocioId = cr.SocioID
WHERE cr.CreditoID LIKE 'CRED-TEST%'
ORDER BY cr.CooperativaId;
GO

-- 5. Verificación 2: demuestra el riesgo real de un query mal filtrado.
-- Si una consulta arma el reporte solo por rango de fechas o por un LIKE sobre CreditoID,
-- sin exigir CooperativaId, mezcla datos de las dos cooperativas en el mismo resultado.
PRINT '--- Riesgo: consulta SIN filtro de CooperativaId mezcla ambas cooperativas ---';
SELECT cr.CreditoID, cr.SocioID, cr.Monto, cr.CooperativaId
FROM dbo.Creditos cr
WHERE cr.CreditoID IN ('CRED-TEST-0001', 'CRED-TEST2-0001');
GO

-- 6. Verificación 3 (bug real, se corrige en 12_fix_consistencia_cooperativa.sql):
-- hoy nada impide una fila con CooperativaId de una cooperativa pero SocioID de otra.
-- Se inserta, se prueba que existe, y se borra de inmediato (no debe quedar persistida).
DECLARE @Socio1IdChk BIGINT;
SELECT @Socio1IdChk = SocioId FROM dbo.Socios WHERE CooperativaId = 1 AND Identificacion = '9999999999';
DECLARE @Socio2IdChk BIGINT;
SELECT @Socio2IdChk = SocioId FROM dbo.Socios WHERE CooperativaId = (SELECT CooperativaId FROM dbo.Cooperativas WHERE NombreComercial = 'TEST-COOP-2') AND Identificacion = '8888888888';

BEGIN TRY
    INSERT INTO dbo.SolicitudesCredito (SolicitudID, CooperativaId, SocioID, Identificacion, Monto, Saldo, Tasa, Plazo, Tipo, Estado, Origen)
    VALUES ('SOL-TEST-BUG-CROSSCOOP', 1, @Socio2IdChk, '8888888888', 1.00, 1.00, 1.00, 1, 'CONSUMO', 'SOLICITADO', 'PRUEBA_BUG_AISLAMIENTO');

    IF EXISTS (SELECT 1 FROM dbo.SolicitudesCredito WHERE SolicitudID = 'SOL-TEST-BUG-CROSSCOOP')
        PRINT '*** BUG CONFIRMADO: el esquema permitió CooperativaId=1 con un Socio de TEST-COOP-2. Sin fix aún. ***';

    DELETE FROM dbo.SolicitudesCredito WHERE SolicitudID = 'SOL-TEST-BUG-CROSSCOOP';
    PRINT 'Fila de prueba del bug borrada (no queda persistida).';
END TRY
BEGIN CATCH
    PRINT 'El INSERT cruzado fue rechazado por el motor: ' + ERROR_MESSAGE();
END CATCH
GO

PRINT '=== 11_prueba_aislamiento_multicooperativa.sql completado. ===';
GO
