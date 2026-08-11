-- 06_caja.sql
-- Base: GUTT_SYSTEM
-- ControlCaja se conserva igual. TransaccionesCaja es nueva: formaliza como tabla
-- propia lo que hoy en SQLGUTPATATE es solo lógica de server.js + filas sueltas
-- de RegistroContable, sin un registro de caja dedicado y consultable.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

IF OBJECT_ID('dbo.ControlCaja', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ControlCaja (
        ControlId       INT IDENTITY(1,1) PRIMARY KEY,
        CooperativaId   INT NOT NULL CONSTRAINT FK_ControlCaja_Cooperativa FOREIGN KEY REFERENCES dbo.Cooperativas(CooperativaId),
        UsuarioId       NVARCHAR(50) NOT NULL,
        Fecha           DATE NOT NULL,
        HoraApertura    DATETIME2(0) NOT NULL,
        HoraCierre      DATETIME2(0) NULL,
        SaldoApertura   DECIMAL(18,2) NOT NULL,
        SaldoCierre     DECIMAL(18,2) NULL,
        Estado          NVARCHAR(20) NOT NULL CHECK (Estado IN ('ABIERTO', 'CERRADO')),
        CONSTRAINT UC_ControlCaja_Usuario_Fecha UNIQUE (UsuarioId, Fecha)
    );
    PRINT 'Tabla dbo.ControlCaja creada.';
END
ELSE
    PRINT 'Tabla dbo.ControlCaja ya existe.';
GO

IF OBJECT_ID('dbo.TransaccionesCaja', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TransaccionesCaja (
        TransaccionId      BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ControlCajaId       INT NOT NULL CONSTRAINT FK_TransaccionesCaja_ControlCaja FOREIGN KEY REFERENCES dbo.ControlCaja(ControlId),
        SocioId             BIGINT NOT NULL CONSTRAINT FK_TransaccionesCaja_Socio FOREIGN KEY REFERENCES dbo.Socios(SocioId),
        -- Solo se llena el FK que aplique según TipoOperacion; los otros quedan NULL.
        CuentaId            INT NULL CONSTRAINT FK_TransaccionesCaja_Cuenta FOREIGN KEY REFERENCES dbo.Cuentas(CuentaId),
        CreditoId           NVARCHAR(50) NULL CONSTRAINT FK_TransaccionesCaja_Credito FOREIGN KEY REFERENCES dbo.Creditos(CreditoID),
        DepositoPlazoId     NVARCHAR(20) NULL CONSTRAINT FK_TransaccionesCaja_DPF FOREIGN KEY REFERENCES dbo.DepositosPlazo(DepositoID),
        TipoOperacion       NVARCHAR(50) NOT NULL,
        Monto               DECIMAL(18,2) NOT NULL,
        Anulado             BIT NOT NULL CONSTRAINT DF_TransaccionesCaja_Anulado DEFAULT(0),
        FechaHora           DATETIME2(0) NOT NULL CONSTRAINT DF_TransaccionesCaja_FechaHora DEFAULT(SYSDATETIME()),
        UsuarioId           NVARCHAR(20) NOT NULL CONSTRAINT FK_TransaccionesCaja_Usuario FOREIGN KEY REFERENCES dbo.Usuarios(UsuarioId),
        -- AsientoContableId se agrega en 09_relaciones_cruzadas.sql (AsientosContables aún no existe aquí).
        AsientoContableId   INT NULL
    );
    PRINT 'Tabla dbo.TransaccionesCaja creada.';
END
ELSE
    PRINT 'Tabla dbo.TransaccionesCaja ya existe.';
GO

IF OBJECT_ID('dbo.Denominaciones', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Denominaciones (
        CodigoDenominacion NVARCHAR(10) PRIMARY KEY,
        Valor               DECIMAL(5,2) NOT NULL,
        Tipo                NVARCHAR(10) NOT NULL CHECK (Tipo IN ('BILLETE', 'MONEDA')),
        Descripcion         NVARCHAR(50) NOT NULL
    );
    INSERT INTO dbo.Denominaciones (CodigoDenominacion, Valor, Tipo, Descripcion) VALUES
        ('B100', 100.00, 'BILLETE', 'Billete de $100'),
        ('B50', 50.00, 'BILLETE', 'Billete de $50'),
        ('B20', 20.00, 'BILLETE', 'Billete de $20'),
        ('B10', 10.00, 'BILLETE', 'Billete de $10'),
        ('B5', 5.00, 'BILLETE', 'Billete de $5'),
        ('B1', 1.00, 'BILLETE', 'Billete de $1'),
        ('M1', 1.00, 'MONEDA', 'Moneda de $1'),
        ('M0.50', 0.50, 'MONEDA', 'Moneda de $0.50'),
        ('M0.25', 0.25, 'MONEDA', 'Moneda de $0.25'),
        ('M0.10', 0.10, 'MONEDA', 'Moneda de $0.10'),
        ('M0.05', 0.05, 'MONEDA', 'Moneda de $0.05'),
        ('M0.01', 0.01, 'MONEDA', 'Moneda de $0.01');
    PRINT 'Tabla dbo.Denominaciones creada e inicializada.';
END
ELSE
    PRINT 'Tabla dbo.Denominaciones ya existe.';
GO

IF OBJECT_ID('dbo.DetalleEfectivoTransaccion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DetalleEfectivoTransaccion (
        DetalleId            INT IDENTITY(1,1) PRIMARY KEY,
        -- Antes referenciaba RegistroContable.AsientoId; con TransaccionesCaja como
        -- tabla propia, el desglose de billetes/monedas cuelga directo de la transacción.
        TransaccionId        BIGINT NOT NULL CONSTRAINT FK_DetalleEfectivo_TransaccionCaja FOREIGN KEY REFERENCES dbo.TransaccionesCaja(TransaccionId) ON DELETE CASCADE,
        CodigoDenominacion   NVARCHAR(10) NOT NULL CONSTRAINT FK_DetalleEfectivo_Denominaciones FOREIGN KEY REFERENCES dbo.Denominaciones(CodigoDenominacion),
        Cantidad             INT NOT NULL,
        Total                DECIMAL(18,2) NOT NULL
    );
    PRINT 'Tabla dbo.DetalleEfectivoTransaccion creada.';
END
ELSE
    PRINT 'Tabla dbo.DetalleEfectivoTransaccion ya existe.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TransaccionesCaja_ControlCaja' AND object_id = OBJECT_ID('dbo.TransaccionesCaja'))
    CREATE INDEX IX_TransaccionesCaja_ControlCaja ON dbo.TransaccionesCaja(ControlCajaId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TransaccionesCaja_Socio' AND object_id = OBJECT_ID('dbo.TransaccionesCaja'))
    CREATE INDEX IX_TransaccionesCaja_Socio ON dbo.TransaccionesCaja(SocioId);
GO

PRINT '=== 06_caja.sql completado. ===';
GO
