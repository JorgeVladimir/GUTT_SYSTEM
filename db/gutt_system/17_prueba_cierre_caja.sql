-- 17_prueba_cierre_caja.sql
-- Base: GUTT_SYSTEM
-- Objetivo: abrir un ControlCaja, hacer 2-3 TransaccionesCaja, cerrarlo actualizando
-- SaldoCierre/HoraCierre, y verificar que el saldo de cierre cuadra contra la suma de
-- transacciones. Incluye una transacción ANULADA a propósito, para confirmar que el
-- cálculo de cierre debe excluirla explícitamente (Anulado=1 no se descuenta solo:
-- es responsabilidad de la consulta/aplicación filtrar por Anulado=0 — el esquema no
-- tiene ningún mecanismo automático, como un trigger o columna calculada, que lo haga
-- por sí mismo; se deja anotado como hueco de diseño en el reporte final).
--
-- Datos ficticios marcados: usuario cajero de prueba 'test.cajero1', socio de prueba
-- 9999999999. Usa CAST(GETDATE() AS DATE) como Fecha de caja — re-ejecutable el mismo día
-- gracias al patrón IF NOT EXISTS, igual que 10_prueba_modelo.sql.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

USE GUTT_SYSTEM;
GO

DECLARE @CoopId INT = 1;
DECLARE @CajeroId NVARCHAR(20) = 'test.cajero1';
DECLARE @SocioId BIGINT;
DECLARE @CuentaAhorroId INT;
DECLARE @ControlCajaId INT;
DECLARE @SaldoApertura DECIMAL(18,2) = 100.00;

SELECT @SocioId = SocioId FROM dbo.Socios WHERE CooperativaId = @CoopId AND Identificacion = '9999999999';
IF @SocioId IS NULL
BEGIN
    PRINT 'ERROR: falta el socio de prueba. Correr primero 10_prueba_modelo.sql.';
    RETURN;
END
SELECT @CuentaAhorroId = CuentaId FROM dbo.Cuentas WHERE SocioId = @SocioId AND ProductoId = 2;

IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE UsuarioId = @CajeroId)
    INSERT INTO dbo.Usuarios (UsuarioId, CooperativaId, NombreCompleto, PasswordHash, Rol, Activo)
    VALUES (@CajeroId, @CoopId, 'Cajero de Prueba del Modelo', 'no-usar-en-produccion', 'TELLER', 1);

-- 1. Apertura de caja
IF NOT EXISTS (SELECT 1 FROM dbo.ControlCaja WHERE UsuarioId = @CajeroId AND Fecha = CAST(GETDATE() AS DATE))
    INSERT INTO dbo.ControlCaja (CooperativaId, UsuarioId, Fecha, HoraApertura, SaldoApertura, Estado)
    VALUES (@CoopId, @CajeroId, CAST(GETDATE() AS DATE), SYSDATETIME(), @SaldoApertura, 'ABIERTO');
SELECT @ControlCajaId = ControlId FROM dbo.ControlCaja WHERE UsuarioId = @CajeroId AND Fecha = CAST(GETDATE() AS DATE);

-- Si la caja de hoy ya estaba cerrada de una corrida anterior del script, la reabrimos
-- para poder repetir la prueba limpia el mismo día.
IF EXISTS (SELECT 1 FROM dbo.ControlCaja WHERE ControlId = @ControlCajaId AND Estado = 'CERRADO')
BEGIN
    DELETE FROM dbo.TransaccionesCaja WHERE ControlCajaId = @ControlCajaId;
    UPDATE dbo.ControlCaja SET Estado = 'ABIERTO', HoraCierre = NULL, SaldoCierre = NULL WHERE ControlId = @ControlCajaId;
END

-- 2. Tres transacciones de caja: dos depósitos, un retiro, y una CUARTA anulada
--    (para probar que Anulado=1 no debe contarse en el cuadre de cierre).
IF NOT EXISTS (SELECT 1 FROM dbo.TransaccionesCaja WHERE ControlCajaId = @ControlCajaId AND TipoOperacion = 'DEPOSITO' AND Monto = 80.00)
    INSERT INTO dbo.TransaccionesCaja (ControlCajaId, SocioId, CuentaId, TipoOperacion, Monto, UsuarioId)
    VALUES (@ControlCajaId, @SocioId, @CuentaAhorroId, 'DEPOSITO', 80.00, @CajeroId);

IF NOT EXISTS (SELECT 1 FROM dbo.TransaccionesCaja WHERE ControlCajaId = @ControlCajaId AND TipoOperacion = 'RETIRO' AND Monto = 30.00)
    INSERT INTO dbo.TransaccionesCaja (ControlCajaId, SocioId, CuentaId, TipoOperacion, Monto, UsuarioId)
    VALUES (@ControlCajaId, @SocioId, @CuentaAhorroId, 'RETIRO', 30.00, @CajeroId);

IF NOT EXISTS (SELECT 1 FROM dbo.TransaccionesCaja WHERE ControlCajaId = @ControlCajaId AND TipoOperacion = 'DEPOSITO' AND Monto = 45.00)
    INSERT INTO dbo.TransaccionesCaja (ControlCajaId, SocioId, CuentaId, TipoOperacion, Monto, UsuarioId)
    VALUES (@ControlCajaId, @SocioId, @CuentaAhorroId, 'DEPOSITO', 45.00, @CajeroId);

-- Transacción anulada: no debe formar parte del cuadre de cierre
IF NOT EXISTS (SELECT 1 FROM dbo.TransaccionesCaja WHERE ControlCajaId = @ControlCajaId AND TipoOperacion = 'DEPOSITO' AND Monto = 999.00)
    INSERT INTO dbo.TransaccionesCaja (ControlCajaId, SocioId, CuentaId, TipoOperacion, Monto, Anulado, UsuarioId)
    VALUES (@ControlCajaId, @SocioId, @CuentaAhorroId, 'DEPOSITO', 999.00, 1, @CajeroId);

PRINT '=== Transacciones de caja insertadas. ===';
GO

-- 3. Cierre de caja: SaldoCierre = SaldoApertura + depósitos válidos - retiros válidos
--    (100.00 + 80.00 + 45.00 - 30.00 = 195.00). La transacción anulada de 999.00 se excluye
--    explícitamente con Anulado = 0 en el cálculo.
DECLARE @ControlCajaId INT, @SaldoApertura DECIMAL(18,2), @SaldoCierreCalculado DECIMAL(18,2);
SELECT @ControlCajaId = ControlId, @SaldoApertura = SaldoApertura
FROM dbo.ControlCaja WHERE UsuarioId = 'test.cajero1' AND Fecha = CAST(GETDATE() AS DATE);

SELECT @SaldoCierreCalculado = @SaldoApertura
    + ISNULL((SELECT SUM(Monto) FROM dbo.TransaccionesCaja WHERE ControlCajaId = @ControlCajaId AND TipoOperacion = 'DEPOSITO' AND Anulado = 0), 0)
    - ISNULL((SELECT SUM(Monto) FROM dbo.TransaccionesCaja WHERE ControlCajaId = @ControlCajaId AND TipoOperacion = 'RETIRO' AND Anulado = 0), 0);

UPDATE dbo.ControlCaja
SET HoraCierre = SYSDATETIME(), SaldoCierre = @SaldoCierreCalculado, Estado = 'CERRADO'
WHERE ControlId = @ControlCajaId;

PRINT '=== Caja cerrada. SaldoCierre calculado: ' + CAST(@SaldoCierreCalculado AS NVARCHAR(20)) + ' ===';
GO

-- Verificación 1: detalle de las transacciones del día, incluida la anulada
PRINT '--- Transacciones de la caja de prueba (incluye la anulada, para que se vea que existe) ---';
SELECT cc.ControlId, tc.TipoOperacion, tc.Monto, tc.Anulado
FROM dbo.TransaccionesCaja tc
JOIN dbo.ControlCaja cc ON cc.ControlId = tc.ControlCajaId
WHERE cc.UsuarioId = 'test.cajero1' AND cc.Fecha = CAST(GETDATE() AS DATE)
ORDER BY tc.TransaccionId;
GO

-- Verificación 2: el cierre debe cuadrar EXACTAMENTE contra SaldoApertura + depósitos válidos - retiros válidos
PRINT '--- Cuadre de cierre de caja (Diferencia debe ser 0.00) ---';
SELECT
    cc.ControlId, cc.SaldoApertura, cc.SaldoCierre, cc.Estado,
    (cc.SaldoApertura
        + ISNULL((SELECT SUM(Monto) FROM dbo.TransaccionesCaja WHERE ControlCajaId = cc.ControlId AND TipoOperacion = 'DEPOSITO' AND Anulado = 0), 0)
        - ISNULL((SELECT SUM(Monto) FROM dbo.TransaccionesCaja WHERE ControlCajaId = cc.ControlId AND TipoOperacion = 'RETIRO' AND Anulado = 0), 0)
    ) AS SaldoEsperado,
    cc.SaldoCierre - (cc.SaldoApertura
        + ISNULL((SELECT SUM(Monto) FROM dbo.TransaccionesCaja WHERE ControlCajaId = cc.ControlId AND TipoOperacion = 'DEPOSITO' AND Anulado = 0), 0)
        - ISNULL((SELECT SUM(Monto) FROM dbo.TransaccionesCaja WHERE ControlCajaId = cc.ControlId AND TipoOperacion = 'RETIRO' AND Anulado = 0), 0)
    ) AS Diferencia
FROM dbo.ControlCaja cc
WHERE cc.UsuarioId = 'test.cajero1' AND cc.Fecha = CAST(GETDATE() AS DATE);
GO

-- Verificación 3: qué pasaría si (por bug de aplicación) alguien sumara TODAS las
-- transacciones sin filtrar Anulado — muestra el descuadre que causaría.
PRINT '--- Riesgo: cuadre SIN excluir transacciones anuladas (no debe usarse así) ---';
SELECT
    cc.ControlId, cc.SaldoCierre,
    (cc.SaldoApertura
        + ISNULL((SELECT SUM(Monto) FROM dbo.TransaccionesCaja WHERE ControlCajaId = cc.ControlId AND TipoOperacion = 'DEPOSITO'), 0)
        - ISNULL((SELECT SUM(Monto) FROM dbo.TransaccionesCaja WHERE ControlCajaId = cc.ControlId AND TipoOperacion = 'RETIRO'), 0)
    ) AS SaldoSiNoExcluyeAnuladas
FROM dbo.ControlCaja cc
WHERE cc.UsuarioId = 'test.cajero1' AND cc.Fecha = CAST(GETDATE() AS DATE);
GO

PRINT '=== 17_prueba_cierre_caja.sql completado. ===';
GO
