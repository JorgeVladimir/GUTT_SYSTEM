-- 12_fix_consistencia_cooperativa.sql
-- Base: GUTT_SYSTEM
-- BUG DE DISEÑO encontrado en 11_prueba_aislamiento_multicooperativa.sql: varias tablas
-- guardan su propio CooperativaId como columna Y ADEMÁS una FK hacia otra tabla que
-- también tiene CooperativaId (Socios, Usuarios, ProductosFinancieros, TasasPlazoFijo,
-- PeriodosContables). Nada obligaba a que ambos coincidan: se pudo insertar una
-- SolicitudesCredito con CooperativaId=1 apuntando a un Socio de otra cooperativa.
--
-- Fix: funciones escalares que resuelven la CooperativaId "real" a través del FK, más
-- CHECK constraints que la comparan contra la CooperativaId declarada en la fila. Es un
-- patrón conocido en SQL Server (CHECK constraint que invoca una función escalar que
-- consulta otra tabla) — no reemplaza la responsabilidad de la app de filtrar bien sus
-- queries, pero convierte el aislamiento multi-tenencia en algo que el motor garantiza,
-- no solo una convención que un desarrollador puede olvidar.
--
-- No reescribe ningún CREATE TABLE existente: son ALTER TABLE aditivos sobre tablas que
-- ya pueden tener datos de rondas anteriores (10_prueba_modelo.sql, 11_...).
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

-- 1. Funciones escalares de resolución de CooperativaId por FK.
-- OJO: NO usar "CREATE OR ALTER" acá — una vez que el CHECK constraint de más abajo
-- queda creado referenciando la función, SQL Server bloquea cualquier ALTER de esa
-- función ("Cannot ALTER 'fn_...' because it is being referenced by object 'CK_...'"),
-- así que en una re-corrida del script el CREATE OR ALTER fallaría. Se usa el mismo
-- patrón IF OBJECT_ID(...) IS NULL que el resto del esquema: crear una sola vez.
IF OBJECT_ID('dbo.fn_CooperativaDeSocio', 'FN') IS NULL
EXEC('CREATE FUNCTION dbo.fn_CooperativaDeSocio(@SocioId BIGINT)
RETURNS INT
AS
BEGIN
    DECLARE @CoopId INT;
    SELECT @CoopId = CooperativaId FROM dbo.Socios WHERE SocioId = @SocioId;
    RETURN @CoopId;
END');
GO

IF OBJECT_ID('dbo.fn_CooperativaDeUsuario', 'FN') IS NULL
EXEC('CREATE FUNCTION dbo.fn_CooperativaDeUsuario(@UsuarioId NVARCHAR(50))
RETURNS INT
AS
BEGIN
    DECLARE @CoopId INT;
    SELECT @CoopId = CooperativaId FROM dbo.Usuarios WHERE UsuarioId = @UsuarioId;
    RETURN @CoopId;
END');
GO

IF OBJECT_ID('dbo.fn_CooperativaDeProducto', 'FN') IS NULL
EXEC('CREATE FUNCTION dbo.fn_CooperativaDeProducto(@ProductoId INT)
RETURNS INT
AS
BEGIN
    DECLARE @CoopId INT;
    SELECT @CoopId = CooperativaId FROM dbo.ProductosFinancieros WHERE ProductoId = @ProductoId;
    RETURN @CoopId;
END');
GO

IF OBJECT_ID('dbo.fn_CooperativaDeTasaPlazoFijo', 'FN') IS NULL
EXEC('CREATE FUNCTION dbo.fn_CooperativaDeTasaPlazoFijo(@TasaId INT)
RETURNS INT
AS
BEGIN
    DECLARE @CoopId INT;
    SELECT @CoopId = CooperativaId FROM dbo.TasasPlazoFijo WHERE TasaID = @TasaId;
    RETURN @CoopId;
END');
GO

IF OBJECT_ID('dbo.fn_CooperativaDePeriodo', 'FN') IS NULL
EXEC('CREATE FUNCTION dbo.fn_CooperativaDePeriodo(@PeriodoId INT)
RETURNS INT
AS
BEGIN
    DECLARE @CoopId INT;
    SELECT @CoopId = CooperativaId FROM dbo.PeriodosContables WHERE PeriodoId = @PeriodoId;
    RETURN @CoopId;
END');
GO

PRINT 'Funciones fn_CooperativaDe* creadas (o ya existian de una corrida anterior).';
GO

-- 2. CHECK constraints: la CooperativaId propia de la fila debe coincidir con la de sus FKs.
-- SolicitudesCredito / Creditos / DepositosPlazo: CooperativaId debe coincidir con la del Socio.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_SolicitudesCredito_CoopConsistente')
    ALTER TABLE dbo.SolicitudesCredito WITH CHECK
        ADD CONSTRAINT CK_SolicitudesCredito_CoopConsistente CHECK (CooperativaId = dbo.fn_CooperativaDeSocio(SocioID));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Creditos_CoopConsistente')
    ALTER TABLE dbo.Creditos WITH CHECK
        ADD CONSTRAINT CK_Creditos_CoopConsistente CHECK (CooperativaId = dbo.fn_CooperativaDeSocio(SocioID));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_DepositosPlazo_CoopConsistente_Socio')
    ALTER TABLE dbo.DepositosPlazo WITH CHECK
        ADD CONSTRAINT CK_DepositosPlazo_CoopConsistente_Socio CHECK (CooperativaId = dbo.fn_CooperativaDeSocio(SocioID));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_DepositosPlazo_CoopConsistente_Tasa')
    ALTER TABLE dbo.DepositosPlazo WITH CHECK
        ADD CONSTRAINT CK_DepositosPlazo_CoopConsistente_Tasa CHECK (CooperativaId = dbo.fn_CooperativaDeTasaPlazoFijo(TasaID));
GO

-- ControlCaja: CooperativaId debe coincidir con la del Usuario que abre caja.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ControlCaja_CoopConsistente')
    ALTER TABLE dbo.ControlCaja WITH CHECK
        ADD CONSTRAINT CK_ControlCaja_CoopConsistente CHECK (CooperativaId = dbo.fn_CooperativaDeUsuario(UsuarioId));
GO

-- AsientosContables: CooperativaId debe coincidir con la del período contable y con la del usuario.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_AsientosContables_CoopConsistente_Periodo')
    ALTER TABLE dbo.AsientosContables WITH CHECK
        ADD CONSTRAINT CK_AsientosContables_CoopConsistente_Periodo CHECK (CooperativaId = dbo.fn_CooperativaDePeriodo(PeriodoContableId));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_AsientosContables_CoopConsistente_Usuario')
    ALTER TABLE dbo.AsientosContables WITH CHECK
        ADD CONSTRAINT CK_AsientosContables_CoopConsistente_Usuario CHECK (CooperativaId = dbo.fn_CooperativaDeUsuario(UsuarioId));
GO

-- Cuentas no tiene columna CooperativaId propia (se deriva de SocioId) — no hay duplicación
-- que verificar ahí. Pero sí puede pasar que el ProductoId de la cuenta sea de OTRA
-- cooperativa que la del Socio dueño de la cuenta. Se valida cruzando ambos FKs.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Cuentas_ProductoCoopConsistente')
    ALTER TABLE dbo.Cuentas WITH CHECK
        ADD CONSTRAINT CK_Cuentas_ProductoCoopConsistente CHECK (dbo.fn_CooperativaDeSocio(SocioId) = dbo.fn_CooperativaDeProducto(ProductoId));
GO

PRINT 'CHECK constraints de consistencia multi-cooperativa agregados.';
GO

-- 3. Verificación: repetir el INSERT cruzado de 11_prueba_aislamiento_multicooperativa.sql
-- (CooperativaId=1 con Socio de TEST-COOP-2). Ahora debe ser RECHAZADO por el motor.
DECLARE @Socio2IdChk BIGINT;
SELECT @Socio2IdChk = SocioId FROM dbo.Socios WHERE CooperativaId = (SELECT CooperativaId FROM dbo.Cooperativas WHERE NombreComercial = 'TEST-COOP-2') AND Identificacion = '8888888888';

IF @Socio2IdChk IS NOT NULL
BEGIN
    BEGIN TRY
        INSERT INTO dbo.SolicitudesCredito (SolicitudID, CooperativaId, SocioID, Identificacion, Monto, Saldo, Tasa, Plazo, Tipo, Estado, Origen)
        VALUES ('SOL-TEST-BUG-CROSSCOOP-2', 1, @Socio2IdChk, '8888888888', 1.00, 1.00, 1.00, 1, 'CONSUMO', 'SOLICITADO', 'PRUEBA_BUG_AISLAMIENTO');

        PRINT '*** SIGUE FALLANDO: el INSERT cruzado se aceptó a pesar del CHECK constraint. ***';
        DELETE FROM dbo.SolicitudesCredito WHERE SolicitudID = 'SOL-TEST-BUG-CROSSCOOP-2';
    END TRY
    BEGIN CATCH
        PRINT 'FIX CONFIRMADO: el INSERT cruzado fue rechazado. Mensaje del motor: ' + ERROR_MESSAGE();
    END CATCH
END
ELSE
    PRINT 'No se encontró el socio de TEST-COOP-2 (correr primero 11_prueba_aislamiento_multicooperativa.sql).';
GO

-- 4. Confirmar que los datos legítimos de ambas cooperativas (fixture 10 y 11) siguen
-- pasando el CHECK sin problema (WITH CHECK ya validó esto al crear la constraint, pero
-- se deja la consulta como evidencia explícita).
PRINT '--- Créditos existentes, todos deben ser consistentes (no debe arrojar error) ---';
SELECT CreditoID, CooperativaId, SocioID FROM dbo.Creditos WHERE CreditoID LIKE 'CRED-TEST%';
GO

PRINT '=== 12_fix_consistencia_cooperativa.sql completado. ===';
GO
