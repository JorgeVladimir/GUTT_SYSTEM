-- 26_plan_cuentas_seps.sql
-- Base: SQLGUTPATATE (la base real que sirve server.js / la demo en vivo)
-- Crea el Catálogo Único de Cuentas (CUC) SEPS -- hasta ahora SQLGUTPATATE no tenía
-- ningún plan de cuentas real, solo el código libre en dbo.RegistroContable.CuentaContable.
-- Los datos (1103 cuentas reales) se cargan aparte en 27_cargar_plan_cuentas_seps.js,
-- reutilizando el catálogo ya verificado en vivo contra Informix de Fundación/Crediapoyo
-- (ver db/gutt_system/22_cargar_plan_cuentas_crediapoyo.sql) -- es el mismo catálogo
-- nacional SEPS, no específico de una cooperativa, así que aplica igual aquí.
-- SQLGUTPATATE es de una sola cooperativa (Caja Patate): sin CooperativaId, a diferencia
-- de GUTT_SYSTEM que sí es multi-tenant.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.PlanCuentas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PlanCuentas (
        CuentaContableId INT IDENTITY(1,1) PRIMARY KEY,
        Codigo           NVARCHAR(15) NOT NULL,
        Nombre           NVARCHAR(200) NOT NULL,
        TipoCuenta       NVARCHAR(20) NOT NULL,
        EsAgrupador      BIT NOT NULL CONSTRAINT DF_PlanCuentas_EsAgrupador DEFAULT(0),
        Nivel            AS (LEN(Codigo)) PERSISTED,
        FechaCreacion    DATETIME2 NOT NULL CONSTRAINT DF_PlanCuentas_FechaCreacion DEFAULT(SYSDATETIME()),
        CONSTRAINT UQ_PlanCuentas_Codigo UNIQUE (Codigo),
        CONSTRAINT CK_PlanCuentas_Tipo CHECK (TipoCuenta IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO','CONTINGENTE','ORDEN'))
    );
    PRINT 'Tabla dbo.PlanCuentas creada.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.PlanCuentas ya existe.';
END
GO
