-- 01_cooperativas_usuarios.sql
-- Base: GUTT_SYSTEM
-- Raíz de multi-tenencia (Cooperativas) + formalización de dbo.Usuarios, que en
-- SQLGUTPATATE nunca tuvo script de creación (se creó directo en SSMS).
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

-- 1. Cooperativas — raíz del aislamiento multi-cliente
IF OBJECT_ID('dbo.Cooperativas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Cooperativas (
        CooperativaId   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        RazonSocial     NVARCHAR(200) NOT NULL,
        RUC             NVARCHAR(13)  NOT NULL,
        CodigoSEPS      NVARCHAR(20)  NULL,
        NombreComercial NVARCHAR(100) NOT NULL,
        ColorPrimario   NVARCHAR(9)   NOT NULL CONSTRAINT DF_Cooperativas_ColorPrimario DEFAULT('#14532D'),
        ColorAcento     NVARCHAR(9)   NOT NULL CONSTRAINT DF_Cooperativas_ColorAcento DEFAULT('#FACC15'),
        LogoUrl         NVARCHAR(300) NULL,
        Activa          BIT           NOT NULL CONSTRAINT DF_Cooperativas_Activa DEFAULT(1),
        FechaAlta       DATETIME2(0)  NOT NULL CONSTRAINT DF_Cooperativas_FechaAlta DEFAULT(SYSDATETIME()),
        CONSTRAINT UQ_Cooperativas_RUC UNIQUE (RUC)
    );
    PRINT 'Tabla dbo.Cooperativas creada.';
END
ELSE
    PRINT 'Tabla dbo.Cooperativas ya existe.';
GO

-- 2. Seed: Caja Patate como Cooperativa #1 (para no romper FKs de todo lo demás)
IF NOT EXISTS (SELECT 1 FROM dbo.Cooperativas WHERE NombreComercial = 'Caja Patate')
BEGIN
    INSERT INTO dbo.Cooperativas (RazonSocial, RUC, NombreComercial, ColorPrimario, ColorAcento, Activa)
    VALUES ('Cooperativa de Ahorro y Crédito Caja Patate', '1800000000001', 'Caja Patate', '#14532D', '#FACC15', 1);
    PRINT 'Cooperativa Caja Patate insertada como CooperativaId = 1.';
END
GO

-- 3. Usuarios — formalización real (columnas verificadas contra server.js y 14_crear_superuser.sql / 21_crear_usuario_caja.sql de SQLGUTPATATE)
IF OBJECT_ID('dbo.Usuarios', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Usuarios (
        UsuarioId               NVARCHAR(20)  NOT NULL PRIMARY KEY,
        CooperativaId           INT           NOT NULL CONSTRAINT FK_Usuarios_Cooperativa FOREIGN KEY REFERENCES dbo.Cooperativas(CooperativaId),
        NombreCompleto           NVARCHAR(150) NOT NULL,
        Pin                      NVARCHAR(4)   NULL,
        PasswordHash             NVARCHAR(200) NOT NULL,
        Rol                      NVARCHAR(30)  NOT NULL,
        Activo                   BIT           NOT NULL CONSTRAINT DF_Usuarios_Activo DEFAULT(1),
        ImpresoraPredeterminada  NVARCHAR(100) NULL,
        RequiereCambioPin        BIT           NOT NULL CONSTRAINT DF_Usuarios_RequiereCambioPin DEFAULT(0),
        FechaRegistro            DATE          NULL,
        FechaCreacion            DATETIME2(0)  NOT NULL CONSTRAINT DF_Usuarios_FechaCreacion DEFAULT(SYSDATETIME()),
        FechaActualizacion       DATETIME2(0)  NOT NULL CONSTRAINT DF_Usuarios_FechaActualizacion DEFAULT(SYSDATETIME()),
        CONSTRAINT CK_Usuarios_Rol CHECK (Rol IN ('SUPER_USER','ADMIN','MANAGER','CREDIT_OFFICER','TELLER','MEMBER'))
    );
    PRINT 'Tabla dbo.Usuarios creada.';
END
ELSE
    PRINT 'Tabla dbo.Usuarios ya existe.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Usuarios_Cooperativa' AND object_id = OBJECT_ID('dbo.Usuarios'))
    CREATE INDEX IX_Usuarios_Cooperativa ON dbo.Usuarios(CooperativaId);
GO

PRINT '=== 01_cooperativas_usuarios.sql completado. ===';
GO
