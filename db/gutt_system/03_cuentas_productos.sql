-- 03_cuentas_productos.sql
-- Base: GUTT_SYSTEM
-- ProductosFinancieros y Cuentas se conservan casi igual a SQLGUTPATATE
-- (parametrosproductos / CuentasAhorro). Se agrega MovimientosCuenta, que hoy
-- no existe como tabla propia — el historial de depósitos/retiros se reconstruye
-- indirectamente en vez de quedar escrito por diseño.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

IF OBJECT_ID('dbo.ProductosFinancieros', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProductosFinancieros (
        ProductoId                  INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CooperativaId               INT NOT NULL CONSTRAINT FK_ProductosFinancieros_Cooperativa FOREIGN KEY REFERENCES dbo.Cooperativas(CooperativaId),
        CodigoProducto               INT NOT NULL, -- 1 = certificados, 2 = ahorros (mismo criterio que hoy)
        Nombre                       NVARCHAR(100) NOT NULL,
        TipoDeposito                 NVARCHAR(100) NOT NULL,
        EsCertificado                BIT NOT NULL CONSTRAINT DF_ProductosFinancieros_EsCertificado DEFAULT(0),
        CuentaActiva                 NVARCHAR(20) NOT NULL,
        CuentaInactiva               NVARCHAR(20) NOT NULL,
        CuentaGasto                  NVARCHAR(20) NULL,
        CuentaProvision              NVARCHAR(20) NULL,
        CuentaDepositosConfirmar     NVARCHAR(20) NULL,
        NumCtas4Dig                  INT NOT NULL CONSTRAINT DF_ProductosFinancieros_NumCtas4Dig DEFAULT(28),
        PermiteDepositos             BIT NOT NULL CONSTRAINT DF_ProductosFinancieros_PermiteDepositos DEFAULT(1),
        PermiteRetiros                BIT NOT NULL CONSTRAINT DF_ProductosFinancieros_PermiteRetiros DEFAULT(1),
        PermiteDebitos                BIT NOT NULL CONSTRAINT DF_ProductosFinancieros_PermiteDebitos DEFAULT(1),
        PermiteCreditos               BIT NOT NULL CONSTRAINT DF_ProductosFinancieros_PermiteCreditos DEFAULT(1),
        PermiteTransferencias         BIT NOT NULL CONSTRAINT DF_ProductosFinancieros_PermiteTransferencias DEFAULT(1),
        Tasa                          NVARCHAR(50) NOT NULL CONSTRAINT DF_ProductosFinancieros_Tasa DEFAULT('TASA NOMINAL'),
        FormaPago                     NVARCHAR(100) NOT NULL CONSTRAINT DF_ProductosFinancieros_FormaPago DEFAULT('MOVIMIENTO HISTORICO PONDERADO BASE'),
        MesesAcreditacion             NVARCHAR(100) NOT NULL CONSTRAINT DF_ProductosFinancieros_MesesAcreditacion DEFAULT('Diciembre'),
        CONSTRAINT UQ_ProductosFinancieros_Cooperativa_Codigo UNIQUE (CooperativaId, CodigoProducto)
    );
    PRINT 'Tabla dbo.ProductosFinancieros creada.';
END
ELSE
    PRINT 'Tabla dbo.ProductosFinancieros ya existe.';
GO

-- Seed inicial, igual al de SQLGUTPATATE, para CooperativaId = 1 (Caja Patate)
IF NOT EXISTS (SELECT 1 FROM dbo.ProductosFinancieros WHERE CooperativaId = 1 AND CodigoProducto = 1)
BEGIN
    INSERT INTO dbo.ProductosFinancieros (
        CooperativaId, CodigoProducto, Nombre, TipoDeposito, EsCertificado,
        CuentaActiva, CuentaInactiva, CuentaGasto, CuentaProvision, CuentaDepositosConfirmar,
        NumCtas4Dig, PermiteDepositos, PermiteRetiros, PermiteDebitos, PermiteCreditos, PermiteTransferencias,
        Tasa, FormaPago, MesesAcreditacion
    )
    VALUES (
        1, 1, 'CERTIFICADOS DE APORTACION', 'AHORRO A LA VISTA', 1,
        '31030505', '31030505', '41019001', '25019001', '21015015',
        28, 1, 0, 1, 1, 1,
        'TASA NOMINAL', 'MOVIMIENTO HISTORICO PONDERADO BASE', 'Diciembre'
    );
    PRINT 'Producto Certificados de Aportación insertado para CooperativaId=1.';
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.ProductosFinancieros WHERE CooperativaId = 1 AND CodigoProducto = 2)
BEGIN
    INSERT INTO dbo.ProductosFinancieros (
        CooperativaId, CodigoProducto, Nombre, TipoDeposito, EsCertificado,
        CuentaActiva, CuentaInactiva, CuentaGasto, CuentaProvision, CuentaDepositosConfirmar,
        NumCtas4Dig, PermiteDepositos, PermiteRetiros, PermiteDebitos, PermiteCreditos, PermiteTransferencias,
        Tasa, FormaPago, MesesAcreditacion
    )
    VALUES (
        1, 2, 'AHORRO A LA VISTA', 'AHORRO A LA VISTA', 0,
        '21013505', '21013505', '41019001', '25019001', '21015015',
        28, 1, 1, 1, 1, 1,
        'TASA NOMINAL', 'MOVIMIENTO HISTORICO PONDERADO BASE', 'Diciembre'
    );
    PRINT 'Producto Ahorro a la Vista insertado para CooperativaId=1.';
END
GO

IF OBJECT_ID('dbo.Cuentas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Cuentas (
        CuentaId        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SocioId         BIGINT NOT NULL CONSTRAINT FK_Cuentas_Socio FOREIGN KEY REFERENCES dbo.Socios(SocioId),
        NumeroCuenta    NVARCHAR(20) NOT NULL UNIQUE,
        ProductoId      INT NOT NULL CONSTRAINT FK_Cuentas_Producto FOREIGN KEY REFERENCES dbo.ProductosFinancieros(ProductoId),
        Saldo           DECIMAL(18,2) NOT NULL CONSTRAINT DF_Cuentas_Saldo DEFAULT(0.00),
        FechaApertura   DATETIME2(0) NOT NULL CONSTRAINT DF_Cuentas_FechaApertura DEFAULT(SYSDATETIME()),
        Estado          NVARCHAR(20) NOT NULL CONSTRAINT DF_Cuentas_Estado DEFAULT('ACTIVA')
    );
    PRINT 'Tabla dbo.Cuentas creada.';
END
ELSE
    PRINT 'Tabla dbo.Cuentas ya existe.';
GO

IF OBJECT_ID('dbo.MovimientosCuenta', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MovimientosCuenta (
        MovimientoId       BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CuentaId           INT NOT NULL CONSTRAINT FK_MovimientosCuenta_Cuenta FOREIGN KEY REFERENCES dbo.Cuentas(CuentaId),
        Tipo               NVARCHAR(30) NOT NULL,
        Monto              DECIMAL(18,2) NOT NULL,
        SaldoResultante    DECIMAL(18,2) NOT NULL,
        Concepto           NVARCHAR(200) NULL,
        Fecha              DATETIME2(0) NOT NULL CONSTRAINT DF_MovimientosCuenta_Fecha DEFAULT(SYSDATETIME()),
        UsuarioId          NVARCHAR(20) NOT NULL CONSTRAINT FK_MovimientosCuenta_Usuario FOREIGN KEY REFERENCES dbo.Usuarios(UsuarioId),
        -- FKs a TransaccionesCaja / AsientosContables se agregan en 09_relaciones_cruzadas.sql
        -- (esas tablas todavía no existen en este punto del script).
        TransaccionCajaId  BIGINT NULL,
        AsientoContableId  INT NULL,
        CONSTRAINT CK_MovimientosCuenta_Tipo CHECK (Tipo IN ('DEPOSITO','RETIRO','TRANSFERENCIA_ENTRADA','TRANSFERENCIA_SALIDA','AJUSTE'))
    );
    PRINT 'Tabla dbo.MovimientosCuenta creada.';
END
ELSE
    PRINT 'Tabla dbo.MovimientosCuenta ya existe.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Cuentas_Socio' AND object_id = OBJECT_ID('dbo.Cuentas'))
    CREATE INDEX IX_Cuentas_Socio ON dbo.Cuentas(SocioId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MovimientosCuenta_Cuenta_Fecha' AND object_id = OBJECT_ID('dbo.MovimientosCuenta'))
    CREATE INDEX IX_MovimientosCuenta_Cuenta_Fecha ON dbo.MovimientosCuenta(CuentaId, Fecha DESC);
GO

PRINT '=== 03_cuentas_productos.sql completado. ===';
GO
