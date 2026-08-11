-- 10_prueba_modelo.sql
-- Base: GUTT_SYSTEM
-- NO es un script de producción. Es un fixture de prueba: recorre el ciclo de vida
-- completo (socio -> cuenta -> crédito -> plazo fijo -> caja -> contabilidad) para
-- comprobar que el modelo nuevo sostiene FKs, CHECKs y partida doble antes de
-- adaptar server.js o migrar datos reales. Los datos que inserta son ficticios,
-- claramente marcados (cédula 9999999999), y se pueden borrar en cualquier momento
-- sin afectar nada — GUTT_SYSTEM todavía no tiene datos reales.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

USE GUTT_SYSTEM;
GO

DECLARE @CoopId INT = 1;
DECLARE @SocioId BIGINT;
DECLARE @UsuarioId NVARCHAR(20) = 'test.admin';
DECLARE @CuentaAhorroId INT, @CuentaCertifId INT;
DECLARE @SolicitudId NVARCHAR(50) = 'SOL-TEST-0001';
DECLARE @CreditoId NVARCHAR(50) = 'CRED-TEST-0001';
DECLARE @AmortId INT;
DECLARE @DepositoId NVARCHAR(20) = 'DPF-TEST-0001';
DECLARE @PeriodoId INT;
DECLARE @ControlCajaId INT;
DECLARE @TransaccionId BIGINT;
DECLARE @AsientoId INT;
DECLARE @CtaCaja INT, @CtaAhorros INT, @CtaCartera INT, @CtaDPF INT, @CtaIntereses INT;

-- 0. Usuario de prueba (GUTT_SYSTEM.Usuarios no trae seed propio, a diferencia de SQLGUTPATATE)
IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE UsuarioId = @UsuarioId)
    INSERT INTO dbo.Usuarios (UsuarioId, CooperativaId, NombreCompleto, PasswordHash, Rol, Activo)
    VALUES (@UsuarioId, @CoopId, 'Usuario de Prueba del Modelo', 'no-usar-en-produccion', 'ADMIN', 1);

-- 1. Plan de cuentas mínimo para poder contabilizar (catálogo real se carga aparte, esto es solo para la prueba)
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '110105')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (@CoopId, '110105', 'Caja General', 'ACTIVO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '210135')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (@CoopId, '210135', 'Depósitos de Ahorro a la Vista', 'PASIVO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '140105')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (@CoopId, '140105', 'Cartera de Créditos por Vencer', 'ACTIVO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '210305')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (@CoopId, '210305', 'Depósitos a Plazo 1-30 días', 'PASIVO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '510105')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (@CoopId, '510105', 'Intereses Ganados en Cartera', 'INGRESO');

SELECT @CtaCaja = CuentaContableId FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '110105';
SELECT @CtaAhorros = CuentaContableId FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '210135';
SELECT @CtaCartera = CuentaContableId FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '140105';
SELECT @CtaDPF = CuentaContableId FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '210305';
SELECT @CtaIntereses = CuentaContableId FROM dbo.PlanCuentas WHERE CooperativaId = @CoopId AND Codigo = '510105';

IF NOT EXISTS (SELECT 1 FROM dbo.PeriodosContables WHERE CooperativaId = @CoopId AND Anio = YEAR(SYSDATETIME()) AND Mes = MONTH(SYSDATETIME()))
    INSERT INTO dbo.PeriodosContables (CooperativaId, Anio, Mes) VALUES (@CoopId, YEAR(SYSDATETIME()), MONTH(SYSDATETIME()));
SELECT @PeriodoId = PeriodoId FROM dbo.PeriodosContables WHERE CooperativaId = @CoopId AND Anio = YEAR(SYSDATETIME()) AND Mes = MONTH(SYSDATETIME());

-- 2. Socio de prueba
IF EXISTS (SELECT 1 FROM dbo.Socios WHERE CooperativaId = @CoopId AND Identificacion = '9999999999')
    SELECT @SocioId = SocioId FROM dbo.Socios WHERE CooperativaId = @CoopId AND Identificacion = '9999999999';
ELSE
BEGIN
    INSERT INTO dbo.Socios (CooperativaId, TipoPersona, TipoIdentificacion, Identificacion, PrimerNombre, PrimerApellido, PIN, NumeroSocio, UsuarioRegistroId)
    VALUES (@CoopId, 'SOCIO', 'CÉDULA', '9999999999', 'Prueba', 'Del Modelo', '0000', 'P' + CAST(NEXT VALUE FOR Seq_NumeroSocio AS NVARCHAR(10)), @UsuarioId);
    SET @SocioId = SCOPE_IDENTITY();

    INSERT INTO dbo.SocioDireccion (SocioId, ProvinciaResidencia, CantonResidencia, DireccionDomicilio)
    VALUES (@SocioId, 'Tungurahua', 'Patate', 'Dirección de prueba s/n');

    INSERT INTO dbo.SocioReferencia (SocioId, Nombre, Telefono, Relacion) VALUES (@SocioId, 'Referencia de Prueba', '0999999999', 'Amistad');
    INSERT INTO dbo.SocioCarga (SocioId, Nombre, Parentesco, Edad) VALUES (@SocioId, 'Carga de Prueba', 'Hijo/a', 10);
END

-- 3. Cuentas (certificado + ahorro), igual que el auto-alta de usp_RegistrarSocio en SQLGUTPATATE
IF NOT EXISTS (SELECT 1 FROM dbo.Cuentas WHERE SocioId = @SocioId AND ProductoId = 1)
BEGIN
    INSERT INTO dbo.Cuentas (SocioId, NumeroCuenta, ProductoId) VALUES (@SocioId, '1' + RIGHT('00000000' + CAST(@SocioId AS NVARCHAR(8)), 8), 1);
    INSERT INTO dbo.Cuentas (SocioId, NumeroCuenta, ProductoId) VALUES (@SocioId, '2' + RIGHT('00000000' + CAST(@SocioId AS NVARCHAR(8)), 8), 2);
END
SELECT @CuentaCertifId = CuentaId FROM dbo.Cuentas WHERE SocioId = @SocioId AND ProductoId = 1;
SELECT @CuentaAhorroId = CuentaId FROM dbo.Cuentas WHERE SocioId = @SocioId AND ProductoId = 2;

-- 4. Ciclo de crédito completo: solicitud -> aprobación -> desembolso -> amortización -> calificación
IF NOT EXISTS (SELECT 1 FROM dbo.SolicitudesCredito WHERE SolicitudID = @SolicitudId)
    INSERT INTO dbo.SolicitudesCredito (SolicitudID, CooperativaId, SocioID, Identificacion, Monto, Saldo, Tasa, Plazo, Tipo, Estado, Origen)
    VALUES (@SolicitudId, @CoopId, @SocioId, '9999999999', 1000.00, 1000.00, 15.00, 12, 'CONSUMO', 'APROBADO', 'PRUEBA_MODELO');

IF NOT EXISTS (SELECT 1 FROM dbo.Creditos WHERE CreditoID = @CreditoId)
    INSERT INTO dbo.Creditos (CreditoID, CooperativaId, SolicitudID, SocioID, Monto, Saldo, Tasa, Plazo, Tipo, Estado)
    VALUES (@CreditoId, @CoopId, @SolicitudId, @SocioId, 1000.00, 1000.00, 15.00, 12, 'CONSUMO', 'VIGENTE');

IF NOT EXISTS (SELECT 1 FROM dbo.TablaAmortizacion WHERE CreditoID = @CreditoId AND NumeroCuota = 1)
BEGIN
    INSERT INTO dbo.TablaAmortizacion (CreditoID, NumeroCuota, FechaPago, Capital, Interes, InteresDevengado, InteresPagado, SeguroDesgravamen, ContribucionSOLCA, GastosAdministrativos, Total)
    VALUES (@CreditoId, 1, CONVERT(NVARCHAR(10), DATEADD(MONTH, 1, GETDATE()), 120), 80.00, 12.50, 0, 0, 1.50, 0.30, 0.50, 94.80);
    SET @AmortId = SCOPE_IDENTITY();
    INSERT INTO dbo.RubrosCreditos (AmortizacionID, NombreRubro, Monto) VALUES (@AmortId, 'SEGURO_DESGRAVAMEN', 1.50);
END

IF NOT EXISTS (SELECT 1 FROM dbo.CalificacionCartera WHERE CreditoID = @CreditoId AND FechaCorte = CAST(GETDATE() AS DATE))
    INSERT INTO dbo.CalificacionCartera (CreditoID, FechaCorte, SaldoCapital, DiasMora, Categoria, PorcentajeProvision, ValorProvision)
    VALUES (@CreditoId, CAST(GETDATE() AS DATE), 1000.00, 0, 'A1', 1.00, 10.00);

-- 5. Depósito a plazo fijo (tramo 1-30 días, TasaID = 1)
IF NOT EXISTS (SELECT 1 FROM dbo.DepositosPlazo WHERE DepositoID = @DepositoId)
    INSERT INTO dbo.DepositosPlazo (DepositoID, CooperativaId, SocioID, Identificacion, NombreSocio, NumCertificado, TasaID, TasaNominalAnual, PlazosDias, MontoCapital, InteresProyectado, RetencionProyectada, InteresNetoProyectado, FechaVencimiento, CuentaContableDPF, UsuarioAperturaID)
    VALUES (@DepositoId, @CoopId, @SocioId, '9999999999', 'Prueba Del Modelo', 'CERT-TEST-0001', 1, 3.50, 30, 500.00, 1.44, 0.03, 1.41, DATEADD(DAY, 30, GETDATE()), '2.1.03.05', @UsuarioId);

-- 6. Caja: apertura, transacción de depósito, movimiento de cuenta, detalle de efectivo
IF NOT EXISTS (SELECT 1 FROM dbo.ControlCaja WHERE UsuarioId = @UsuarioId AND Fecha = CAST(GETDATE() AS DATE))
    INSERT INTO dbo.ControlCaja (CooperativaId, UsuarioId, Fecha, HoraApertura, SaldoApertura, Estado)
    VALUES (@CoopId, @UsuarioId, CAST(GETDATE() AS DATE), SYSDATETIME(), 200.00, 'ABIERTO');
SELECT @ControlCajaId = ControlId FROM dbo.ControlCaja WHERE UsuarioId = @UsuarioId AND Fecha = CAST(GETDATE() AS DATE);

-- FIX DE IDEMPOTENCIA (antes: TransaccionesCaja/DetalleEfectivoTransaccion/MovimientosCuenta/
-- AsientosContables/DetalleAsiento se insertaban sin guarda, así que correr este script dos
-- veces duplicaba la transacción de depósito de prueba, duplicaba el asiento contable, y
-- sumaba 50.00 dos veces al saldo de la cuenta de ahorros. Se envuelve todo el bloque 6+7 en
-- un solo IF NOT EXISTS sobre la transacción que lo dispara, mismo criterio que ya usa
-- 17_prueba_cierre_caja.sql para sus propias TransaccionesCaja.
IF NOT EXISTS (
    SELECT 1 FROM dbo.TransaccionesCaja tc
    WHERE tc.ControlCajaId = @ControlCajaId AND tc.CuentaId = @CuentaAhorroId
      AND tc.TipoOperacion = 'DEPOSITO' AND tc.Monto = 50.00
)
BEGIN
    INSERT INTO dbo.TransaccionesCaja (ControlCajaId, SocioId, CuentaId, TipoOperacion, Monto, UsuarioId)
    VALUES (@ControlCajaId, @SocioId, @CuentaAhorroId, 'DEPOSITO', 50.00, @UsuarioId);
    SET @TransaccionId = SCOPE_IDENTITY();

    INSERT INTO dbo.DetalleEfectivoTransaccion (TransaccionId, CodigoDenominacion, Cantidad, Total)
    VALUES (@TransaccionId, 'B50', 1, 50.00);

    INSERT INTO dbo.MovimientosCuenta (CuentaId, Tipo, Monto, SaldoResultante, Concepto, UsuarioId, TransaccionCajaId)
    VALUES (@CuentaAhorroId, 'DEPOSITO', 50.00, 50.00, 'Depósito de prueba del modelo', @UsuarioId, @TransaccionId);

    UPDATE dbo.Cuentas SET Saldo = Saldo + 50.00 WHERE CuentaId = @CuentaAhorroId;

    -- 7. Asiento contable del depósito (partida doble: Caja se debita, Ahorros del socio se acredita)
    INSERT INTO dbo.AsientosContables (CooperativaId, PeriodoContableId, Concepto, UsuarioId, OrigenModulo, OrigenId)
    VALUES (@CoopId, @PeriodoId, 'Depósito de prueba en cuenta de ahorros', @UsuarioId, 'CAJA', CAST(@TransaccionId AS NVARCHAR(50)));
    SET @AsientoId = SCOPE_IDENTITY();

    INSERT INTO dbo.DetalleAsiento (AsientoId, CuentaContableId, TipoAsiento, Valor) VALUES (@AsientoId, @CtaCaja, 'D', 50.00);
    INSERT INTO dbo.DetalleAsiento (AsientoId, CuentaContableId, TipoAsiento, Valor) VALUES (@AsientoId, @CtaAhorros, 'H', 50.00);

    UPDATE dbo.TransaccionesCaja SET AsientoContableId = @AsientoId WHERE TransaccionId = @TransaccionId;
    UPDATE dbo.MovimientosCuenta SET AsientoContableId = @AsientoId WHERE TransaccionCajaId = @TransaccionId;
END
ELSE
    PRINT 'Transacción de depósito de prueba y su asiento contable ya existían (script re-ejecutado) — no se duplican.';

PRINT '=== Fixture de prueba insertado. Verificación abajo. ===';
GO

-- 8. Verificación: integridad + partida doble cuadrada
SELECT 'Socios' AS tabla, COUNT(*) AS filas FROM dbo.Socios WHERE Identificacion = '9999999999'
UNION ALL SELECT 'Cuentas', COUNT(*) FROM dbo.Cuentas c JOIN dbo.Socios s ON s.SocioId = c.SocioId WHERE s.Identificacion = '9999999999'
UNION ALL SELECT 'SolicitudesCredito', COUNT(*) FROM dbo.SolicitudesCredito WHERE SolicitudID = 'SOL-TEST-0001'
UNION ALL SELECT 'Creditos', COUNT(*) FROM dbo.Creditos WHERE CreditoID = 'CRED-TEST-0001'
UNION ALL SELECT 'TablaAmortizacion', COUNT(*) FROM dbo.TablaAmortizacion WHERE CreditoID = 'CRED-TEST-0001'
UNION ALL SELECT 'CalificacionCartera', COUNT(*) FROM dbo.CalificacionCartera WHERE CreditoID = 'CRED-TEST-0001'
UNION ALL SELECT 'DepositosPlazo', COUNT(*) FROM dbo.DepositosPlazo WHERE DepositoID = 'DPF-TEST-0001'
UNION ALL SELECT 'TransaccionesCaja', COUNT(*) FROM dbo.TransaccionesCaja WHERE TipoOperacion = 'DEPOSITO'
UNION ALL SELECT 'AsientosContables', COUNT(*) FROM dbo.AsientosContables WHERE OrigenModulo = 'CAJA';
GO

PRINT '--- Partida doble del asiento de prueba (debe cuadrar) ---';
SELECT a.AsientoId, a.Concepto,
       SUM(CASE WHEN d.TipoAsiento = 'D' THEN d.Valor ELSE 0 END) AS TotalDebe,
       SUM(CASE WHEN d.TipoAsiento = 'H' THEN d.Valor ELSE 0 END) AS TotalHaber
FROM dbo.AsientosContables a
JOIN dbo.DetalleAsiento d ON d.AsientoId = a.AsientoId
WHERE a.OrigenModulo = 'CAJA'
GROUP BY a.AsientoId, a.Concepto;
GO

PRINT '=== 10_prueba_modelo.sql completado. ===';
GO
