-- 15_prueba_credito_rechazo_mora.sql
-- Base: GUTT_SYSTEM
-- Objetivo: probar el ciclo de crédito fuera del caso feliz.
--   a) Una solicitud que se RECHAZA y nunca llega a convertirse en fila de dbo.Creditos.
--   b) Un crédito vigente con una cuota vencida en TablaAmortizacion (Estado='VENCIDO',
--      FechaPago en el pasado) y su fila correspondiente en CalificacionCartera con
--      DiasMora > 0 y una categoría peor que A1 (con su porcentaje/valor de provisión),
--      para confirmar que el modelo de provisiones SEPS sostiene un caso real de mora.
-- Datos ficticios marcados: usa el socio de prueba de 10_prueba_modelo.sql (identificación
-- 9999999999, CooperativaId=1) y IDs con sufijo TEST-RECHAZO / TEST-MORA.
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
DECLARE @SolicitudRechazoId NVARCHAR(50) = 'SOL-TEST-RECHAZO-0001';
DECLARE @SolicitudMoraId NVARCHAR(50) = 'SOL-TEST-MORA-0001';
DECLARE @CreditoMoraId NVARCHAR(50) = 'CRED-TEST-MORA-0001';
DECLARE @AmortId INT;

SELECT @SocioId = SocioId FROM dbo.Socios WHERE CooperativaId = @CoopId AND Identificacion = '9999999999';
IF @SocioId IS NULL
BEGIN
    PRINT 'ERROR: no existe el socio de prueba (9999999999). Correr primero 10_prueba_modelo.sql.';
    RETURN;
END

-- a) Solicitud rechazada — se queda en SolicitudesCredito, jamás genera fila en Creditos.
IF NOT EXISTS (SELECT 1 FROM dbo.SolicitudesCredito WHERE SolicitudID = @SolicitudRechazoId)
    INSERT INTO dbo.SolicitudesCredito (SolicitudID, CooperativaId, SocioID, Identificacion, Monto, Saldo, Tasa, Plazo, Tipo, Estado, Observaciones, Origen)
    VALUES (@SolicitudRechazoId, @CoopId, @SocioId, '9999999999', 5000.00, 5000.00, 18.00, 24, 'CONSUMO', 'RECHAZADO', 'Capacidad de pago insuficiente (prueba)', 'PRUEBA_RECHAZO');

-- b) Crédito con mora: solicitud aprobada -> crédito vigente -> cuota 1 vencida -> calificación con mora.
IF NOT EXISTS (SELECT 1 FROM dbo.SolicitudesCredito WHERE SolicitudID = @SolicitudMoraId)
    INSERT INTO dbo.SolicitudesCredito (SolicitudID, CooperativaId, SocioID, Identificacion, Monto, Saldo, Tasa, Plazo, Tipo, Estado, Origen)
    VALUES (@SolicitudMoraId, @CoopId, @SocioId, '9999999999', 1200.00, 1200.00, 15.00, 12, 'CONSUMO', 'APROBADO', 'PRUEBA_MORA');

IF NOT EXISTS (SELECT 1 FROM dbo.Creditos WHERE CreditoID = @CreditoMoraId)
    INSERT INTO dbo.Creditos (CreditoID, CooperativaId, SolicitudID, SocioID, Monto, Saldo, Tasa, Plazo, Tipo, Estado)
    VALUES (@CreditoMoraId, @CoopId, @SolicitudMoraId, @SocioId, 1200.00, 1120.00, 15.00, 12, 'CONSUMO', 'VIGENTE');

-- Cuota 1: ya pagada (referencia, no es la que está en mora)
IF NOT EXISTS (SELECT 1 FROM dbo.TablaAmortizacion WHERE CreditoID = @CreditoMoraId AND NumeroCuota = 1)
    INSERT INTO dbo.TablaAmortizacion (CreditoID, NumeroCuota, FechaPago, Capital, Interes, InteresDevengado, InteresPagado, SeguroDesgravamen, ContribucionSOLCA, GastosAdministrativos, Total, Estado)
    VALUES (@CreditoMoraId, 1, CONVERT(NVARCHAR(10), DATEADD(MONTH, -2, GETDATE()), 120), 95.00, 15.00, 15.00, 15.00, 1.50, 0.30, 0.50, 112.30, 'PAGADO');

-- Cuota 2: VENCIDA (fecha de pago en el pasado, nunca se pagó) — origina la mora que se califica abajo
IF NOT EXISTS (SELECT 1 FROM dbo.TablaAmortizacion WHERE CreditoID = @CreditoMoraId AND NumeroCuota = 2)
BEGIN
    INSERT INTO dbo.TablaAmortizacion (CreditoID, NumeroCuota, FechaPago, Capital, Interes, InteresDevengado, InteresPagado, SeguroDesgravamen, ContribucionSOLCA, GastosAdministrativos, Total, Estado)
    VALUES (@CreditoMoraId, 2, CONVERT(NVARCHAR(10), DATEADD(DAY, -45, GETDATE()), 120), 80.00, 14.00, 14.00, 0.00, 1.50, 0.30, 0.50, 96.30, 'VENCIDO');
    SET @AmortId = SCOPE_IDENTITY();
END
ELSE
    SELECT @AmortId = AmortizacionID FROM dbo.TablaAmortizacion WHERE CreditoID = @CreditoMoraId AND NumeroCuota = 2;

-- Cuota 3: todavía pendiente, no vencida
IF NOT EXISTS (SELECT 1 FROM dbo.TablaAmortizacion WHERE CreditoID = @CreditoMoraId AND NumeroCuota = 3)
    INSERT INTO dbo.TablaAmortizacion (CreditoID, NumeroCuota, FechaPago, Capital, Interes, InteresDevengado, InteresPagado, SeguroDesgravamen, ContribucionSOLCA, GastosAdministrativos, Total, Estado)
    VALUES (@CreditoMoraId, 3, CONVERT(NVARCHAR(10), DATEADD(DAY, 15, GETDATE()), 120), 82.00, 13.00, 0.00, 0.00, 1.50, 0.30, 0.50, 97.30, 'PENDIENTE');

-- Calificación de cartera con mora real: 45 días de atraso -> categoría B1 (peor que A1),
-- con porcentaje de provisión mayor al de un crédito al día (se usa un valor SEPS de
-- referencia razonable para el tramo 31-60 días; el catálogo real de porcentajes por
-- categoría se carga aparte, esto es solo para probar que el modelo sostiene el caso).
IF NOT EXISTS (SELECT 1 FROM dbo.CalificacionCartera WHERE CreditoID = @CreditoMoraId AND FechaCorte = CAST(GETDATE() AS DATE))
    INSERT INTO dbo.CalificacionCartera (CreditoID, FechaCorte, SaldoCapital, DiasMora, Categoria, PorcentajeProvision, ValorProvision)
    VALUES (@CreditoMoraId, CAST(GETDATE() AS DATE), 1120.00, 45, 'B1', 10.00, 112.00);

PRINT '=== Datos de rechazo y mora insertados. ===';
GO

-- Verificación 1: la solicitud rechazada NO tiene fila hermana en Creditos.
PRINT '--- Solicitud rechazada: debe existir en SolicitudesCredito y NO existir en Creditos ---';
SELECT sc.SolicitudID, sc.Estado AS EstadoSolicitud,
       (SELECT COUNT(*) FROM dbo.Creditos cr WHERE cr.SolicitudID = sc.SolicitudID) AS CreditosGenerados
FROM dbo.SolicitudesCredito sc
WHERE sc.SolicitudID = 'SOL-TEST-RECHAZO-0001';
GO

-- Verificación 2: cuotas del crédito en mora, con su estado real
PRINT '--- Tabla de amortización del crédito en mora ---';
SELECT NumeroCuota, FechaPago, Total, Estado
FROM dbo.TablaAmortizacion
WHERE CreditoID = 'CRED-TEST-MORA-0001'
ORDER BY NumeroCuota;
GO

-- Verificación 3: calificación de cartera con mora, categoría y provisión
PRINT '--- Calificación de cartera del crédito en mora ---';
SELECT CreditoID, FechaCorte, SaldoCapital, DiasMora, Categoria, PorcentajeProvision, ValorProvision
FROM dbo.CalificacionCartera
WHERE CreditoID = 'CRED-TEST-MORA-0001';
GO

-- Verificación 4: comparativo caso feliz (A1, CRED-TEST-0001 de 10_prueba_modelo.sql)
-- vs. caso en mora (B1, este script) — confirma que el modelo distingue ambos casos.
PRINT '--- Comparativo: crédito al día vs. crédito en mora ---';
SELECT CreditoID, DiasMora, Categoria, PorcentajeProvision, ValorProvision
FROM dbo.CalificacionCartera
WHERE CreditoID IN ('CRED-TEST-0001', 'CRED-TEST-MORA-0001')
ORDER BY DiasMora;
GO

PRINT '=== 15_prueba_credito_rechazo_mora.sql completado. ===';
GO
