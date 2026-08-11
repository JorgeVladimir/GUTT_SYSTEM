-- 19_fix_solicitudescredito_decision.sql
-- Base: GUTT_SYSTEM
-- BUG DE DISEÑO: dbo.SolicitudesCredito registra el Estado final ('APROBADO',
-- 'RECHAZADO', etc.) pero no QUIÉN tomó esa decisión ni CUÁNDO. server.js (legacy)
-- nunca lo persiste tampoco — arma un texto libre ("Aprobado por: X") solo para el
-- detalle de dbo.AuditoriaProcesos (ver server.js líneas ~1530 y ~2050), y
-- AuditoriaProcesos es un log de eventos, no el registro maestro: no tiene ninguna
-- restricción que impida que se acumulen varias filas de auditoría para la misma
-- solicitud (reintentos, correcciones), así que consultar "quién aprobó esta
-- solicitud" hoy exige adivinar cuál fila de auditoría es la buena. La aprobación o
-- el rechazo de un crédito es una decisión regulatoria (SEPS exige trazabilidad de
-- quién autoriza cada crédito) y debe quedar en el registro maestro, no solo en el log.
--
-- Fix: dos columnas nuevas, nullables (SOLICITADO todavía no tiene decisión), más FK
-- hacia Usuarios y el mismo CHECK de consistencia multi-cooperativa que ya usa el
-- resto del esquema (12_fix_consistencia_cooperativa.sql). Aditivo: no reemplaza ni
-- reduce lo que ya registra AuditoriaProcesos, coexiste con eso.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'UsuarioDecisionId')
    ALTER TABLE dbo.SolicitudesCredito ADD UsuarioDecisionId NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'FechaDecision')
    ALTER TABLE dbo.SolicitudesCredito ADD FechaDecision DATETIME2(0) NULL;
GO

PRINT 'Columnas UsuarioDecisionId / FechaDecision agregadas a dbo.SolicitudesCredito.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudesCredito_UsuarioDecision')
    ALTER TABLE dbo.SolicitudesCredito WITH CHECK
        ADD CONSTRAINT FK_SolicitudesCredito_UsuarioDecision FOREIGN KEY (UsuarioDecisionId) REFERENCES dbo.Usuarios(UsuarioId);
GO

-- Mismo patrón de consistencia multi-cooperativa que 12_fix_consistencia_cooperativa.sql:
-- si hay UsuarioDecisionId, tiene que ser de la MISMA cooperativa que la solicitud.
-- fn_CooperativaDeUsuario ya existe (creada en 12_...sql), se reutiliza tal cual.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_SolicitudesCredito_CoopConsistente_UsuarioDecision')
    ALTER TABLE dbo.SolicitudesCredito WITH CHECK
        ADD CONSTRAINT CK_SolicitudesCredito_CoopConsistente_UsuarioDecision
            CHECK (UsuarioDecisionId IS NULL OR CooperativaId = dbo.fn_CooperativaDeUsuario(UsuarioDecisionId));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SolicitudesCredito_UsuarioDecisionId' AND object_id = OBJECT_ID('dbo.SolicitudesCredito'))
    CREATE INDEX IX_SolicitudesCredito_UsuarioDecisionId ON dbo.SolicitudesCredito(UsuarioDecisionId);
GO

PRINT '=== 19_fix_solicitudescredito_decision.sql completado. ===';
GO

-- Verificación 1: columnas nuevas existen, son nullable, y las filas ya insertadas por
-- rondas anteriores (10_, 11_, 15_) no se rompieron (quedan con NULL, esperado: nunca se
-- registró quién las aprobó porque la columna no existía).
PRINT '--- SolicitudesCredito de prueba: Estado vs. columnas de decisión (NULL esperado, no se puede reconstruir retroactivo) ---';
SELECT SolicitudID, CooperativaId, Estado, UsuarioDecisionId, FechaDecision
FROM dbo.SolicitudesCredito
WHERE SolicitudID LIKE 'SOL-TEST%';
GO

-- Verificación 2: simular una decisión real sobre la solicitud de prueba de 10_prueba_modelo.sql
-- (ya está en estado APROBADO, así que esto es solo completar el rastro que faltaba, no
-- cambiar el Estado). Usa el mismo usuario/cooperativa de esa solicitud -> debe aceptarse.
IF EXISTS (SELECT 1 FROM dbo.SolicitudesCredito WHERE SolicitudID = 'SOL-TEST-0001')
BEGIN
    UPDATE dbo.SolicitudesCredito
    SET UsuarioDecisionId = 'test.admin', FechaDecision = SYSDATETIME()
    WHERE SolicitudID = 'SOL-TEST-0001';
    PRINT 'OK: decisión retroactiva de prueba registrada sobre SOL-TEST-0001.';
END
GO

-- Verificación 3: el CHECK de consistencia multi-cooperativa debe RECHAZAR marcar la
-- decisión con un usuario de OTRA cooperativa (test.admin2 es de TEST-COOP-2, la solicitud
-- de prueba es de CooperativaId=1). Se intenta, se confirma el rechazo.
IF EXISTS (SELECT 1 FROM dbo.Usuarios WHERE UsuarioId = 'test.admin2') AND EXISTS (SELECT 1 FROM dbo.SolicitudesCredito WHERE SolicitudID = 'SOL-TEST-0001')
BEGIN
    BEGIN TRY
        UPDATE dbo.SolicitudesCredito SET UsuarioDecisionId = 'test.admin2' WHERE SolicitudID = 'SOL-TEST-0001';
        PRINT '*** SIGUE FALLANDO: se aceptó un UsuarioDecisionId de otra cooperativa. ***';
        UPDATE dbo.SolicitudesCredito SET UsuarioDecisionId = 'test.admin' WHERE SolicitudID = 'SOL-TEST-0001';
    END TRY
    BEGIN CATCH
        PRINT 'FIX CONFIRMADO: UsuarioDecisionId de otra cooperativa fue rechazado. Mensaje: ' + ERROR_MESSAGE();
    END CATCH
END
ELSE
    PRINT 'No se encontró test.admin2 / SOL-TEST-0001 (correr primero 11_prueba_aislamiento_multicooperativa.sql y 10_prueba_modelo.sql).';
GO

PRINT '=== Verificación de 19_fix_solicitudescredito_decision.sql completada. ===';
GO
