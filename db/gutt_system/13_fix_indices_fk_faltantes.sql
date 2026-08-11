-- 13_fix_indices_fk_faltantes.sql
-- Base: GUTT_SYSTEM
-- BUG DE DISEÑO encontrado inspeccionando sys.foreign_key_columns / sys.index_columns:
-- la mayoría de columnas FK del esquema no tienen índice de soporte. En SQL Server esto
-- no es solo un tema de performance de SELECT — cada UPDATE/DELETE sobre la tabla padre
-- (por ej. borrar o actualizar un Socio, una TablaAmortizacion, un Crédito) obliga a un
-- table scan completo de la tabla hija para verificar la FK, y puede escalar a locks de
-- tabla completa en vez de locks de fila. Con volumen real (miles de cuotas de
-- amortización, miles de transacciones de caja) esto se vuelve un problema real.
--
-- El caso más urgente: TablaAmortizacion.CreditoID no tiene índice — es la columna que
-- se consulta constantemente para traer las cuotas de un crédito (vista al detalle del
-- crédito, cálculo de mora, cierre de mes). Sin índice, cada consulta es un scan completo
-- de la tabla.
--
-- Son todos CREATE INDEX aditivos, no tocan ningún CREATE TABLE existente.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

-- Créditos
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TablaAmortizacion_CreditoID' AND object_id = OBJECT_ID('dbo.TablaAmortizacion'))
    CREATE INDEX IX_TablaAmortizacion_CreditoID ON dbo.TablaAmortizacion(CreditoID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Creditos_SolicitudID' AND object_id = OBJECT_ID('dbo.Creditos'))
    CREATE INDEX IX_Creditos_SolicitudID ON dbo.Creditos(SolicitudID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Creditos_CooperativaId' AND object_id = OBJECT_ID('dbo.Creditos'))
    CREATE INDEX IX_Creditos_CooperativaId ON dbo.Creditos(CooperativaId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SolicitudesCredito_CooperativaId' AND object_id = OBJECT_ID('dbo.SolicitudesCredito'))
    CREATE INDEX IX_SolicitudesCredito_CooperativaId ON dbo.SolicitudesCredito(CooperativaId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RubrosCreditos_AmortizacionID' AND object_id = OBJECT_ID('dbo.RubrosCreditos'))
    CREATE INDEX IX_RubrosCreditos_AmortizacionID ON dbo.RubrosCreditos(AmortizacionID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Cuentas_ProductoId' AND object_id = OBJECT_ID('dbo.Cuentas'))
    CREATE INDEX IX_Cuentas_ProductoId ON dbo.Cuentas(ProductoId);
GO

-- Plazo fijo
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DepositosPlazo_CooperativaId' AND object_id = OBJECT_ID('dbo.DepositosPlazo'))
    CREATE INDEX IX_DepositosPlazo_CooperativaId ON dbo.DepositosPlazo(CooperativaId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DepositosPlazo_TasaID' AND object_id = OBJECT_ID('dbo.DepositosPlazo'))
    CREATE INDEX IX_DepositosPlazo_TasaID ON dbo.DepositosPlazo(TasaID);
GO

-- Caja
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ControlCaja_CooperativaId' AND object_id = OBJECT_ID('dbo.ControlCaja'))
    CREATE INDEX IX_ControlCaja_CooperativaId ON dbo.ControlCaja(CooperativaId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TransaccionesCaja_CreditoId' AND object_id = OBJECT_ID('dbo.TransaccionesCaja'))
    CREATE INDEX IX_TransaccionesCaja_CreditoId ON dbo.TransaccionesCaja(CreditoId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TransaccionesCaja_CuentaId' AND object_id = OBJECT_ID('dbo.TransaccionesCaja'))
    CREATE INDEX IX_TransaccionesCaja_CuentaId ON dbo.TransaccionesCaja(CuentaId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TransaccionesCaja_DepositoPlazoId' AND object_id = OBJECT_ID('dbo.TransaccionesCaja'))
    CREATE INDEX IX_TransaccionesCaja_DepositoPlazoId ON dbo.TransaccionesCaja(DepositoPlazoId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TransaccionesCaja_UsuarioId' AND object_id = OBJECT_ID('dbo.TransaccionesCaja'))
    CREATE INDEX IX_TransaccionesCaja_UsuarioId ON dbo.TransaccionesCaja(UsuarioId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TransaccionesCaja_AsientoContableId' AND object_id = OBJECT_ID('dbo.TransaccionesCaja'))
    CREATE INDEX IX_TransaccionesCaja_AsientoContableId ON dbo.TransaccionesCaja(AsientoContableId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DetalleEfectivoTransaccion_TransaccionId' AND object_id = OBJECT_ID('dbo.DetalleEfectivoTransaccion'))
    CREATE INDEX IX_DetalleEfectivoTransaccion_TransaccionId ON dbo.DetalleEfectivoTransaccion(TransaccionId);
GO

-- Contabilidad
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AsientosContables_CooperativaId' AND object_id = OBJECT_ID('dbo.AsientosContables'))
    CREATE INDEX IX_AsientosContables_CooperativaId ON dbo.AsientosContables(CooperativaId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AsientosContables_UsuarioId' AND object_id = OBJECT_ID('dbo.AsientosContables'))
    CREATE INDEX IX_AsientosContables_UsuarioId ON dbo.AsientosContables(UsuarioId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PlanCuentas_CuentaPadreId' AND object_id = OBJECT_ID('dbo.PlanCuentas'))
    CREATE INDEX IX_PlanCuentas_CuentaPadreId ON dbo.PlanCuentas(CuentaPadreId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MovimientosCuenta_TransaccionCajaId' AND object_id = OBJECT_ID('dbo.MovimientosCuenta'))
    CREATE INDEX IX_MovimientosCuenta_TransaccionCajaId ON dbo.MovimientosCuenta(TransaccionCajaId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MovimientosCuenta_AsientoContableId' AND object_id = OBJECT_ID('dbo.MovimientosCuenta'))
    CREATE INDEX IX_MovimientosCuenta_AsientoContableId ON dbo.MovimientosCuenta(AsientoContableId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MovimientosCuenta_UsuarioId' AND object_id = OBJECT_ID('dbo.MovimientosCuenta'))
    CREATE INDEX IX_MovimientosCuenta_UsuarioId ON dbo.MovimientosCuenta(UsuarioId);
GO

-- Auditoría
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditoriaProcesos_CooperativaId' AND object_id = OBJECT_ID('dbo.AuditoriaProcesos'))
    CREATE INDEX IX_AuditoriaProcesos_CooperativaId ON dbo.AuditoriaProcesos(CooperativaId);
GO

-- Socios (tablas hijas normalizadas — se consultan siempre por SocioId al abrir el detalle de un socio)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SocioReferencia_SocioId' AND object_id = OBJECT_ID('dbo.SocioReferencia'))
    CREATE INDEX IX_SocioReferencia_SocioId ON dbo.SocioReferencia(SocioId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SocioCarga_SocioId' AND object_id = OBJECT_ID('dbo.SocioCarga'))
    CREATE INDEX IX_SocioCarga_SocioId ON dbo.SocioCarga(SocioId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SocioUbicacionMapa_SocioId' AND object_id = OBJECT_ID('dbo.SocioUbicacionMapa'))
    CREATE INDEX IX_SocioUbicacionMapa_SocioId ON dbo.SocioUbicacionMapa(SocioId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SocioCroquisTrabajo_SocioId' AND object_id = OBJECT_ID('dbo.SocioCroquisTrabajo'))
    CREATE INDEX IX_SocioCroquisTrabajo_SocioId ON dbo.SocioCroquisTrabajo(SocioId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Socios_UsuarioRegistroId' AND object_id = OBJECT_ID('dbo.Socios'))
    CREATE INDEX IX_Socios_UsuarioRegistroId ON dbo.Socios(UsuarioRegistroId);
GO

PRINT '=== 13_fix_indices_fk_faltantes.sql completado. ===';
GO

-- Verificación: ya no deberían quedar columnas FK sin índice de soporte,
-- salvo DetalleEfectivoTransaccion.CodigoDenominacion (FK a un catálogo chico de 12 filas,
-- donde un índice no aporta nada porque cualquier plan de ejecución igual escanea la
-- tabla completa de denominaciones).
PRINT '--- Columnas FK que siguen sin indice de soporte (se espera solo Denominaciones) ---';
SELECT t.name AS Tabla, c.name AS Columna
FROM sys.foreign_key_columns fkc
JOIN sys.tables t ON t.object_id = fkc.parent_object_id
JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
WHERE NOT EXISTS (
  SELECT 1 FROM sys.index_columns ic
  WHERE ic.object_id = fkc.parent_object_id AND ic.column_id = fkc.parent_column_id AND ic.key_ordinal = 1
)
ORDER BY t.name, c.name;
GO
