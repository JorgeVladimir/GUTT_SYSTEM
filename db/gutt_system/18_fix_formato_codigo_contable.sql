-- 18_fix_formato_codigo_contable.sql
-- Base: GUTT_SYSTEM
-- BUG DE DISEÑO documentado como hueco pendiente en el encabezado de
-- 16_prueba_plazo_fijo_cancelacion.sql: el código de cuenta contable existía en TRES
-- formatos distintos, sin FK real entre ninguno:
--   - ProductosFinancieros.Cuenta*      -> 8 dígitos sin puntos   ('31030505')
--   - TasasPlazoFijo.CuentaContableDPF  -> formato SEPS punteado  ('2.1.03.05')
--   - PlanCuentas.Codigo (solo fixtures)-> 6 dígitos sin puntos   ('210305')
-- Sin catálogo real detrás, un asiento contable de Créditos/Plazo Fijo/Caja podía
-- escribir cualquier texto en una columna "cuenta contable" sin que el motor
-- verificara que esa cuenta existe en dbo.PlanCuentas — el hueco que bloqueaba a
-- gutt-system-adaptacion-queries para contabilizar esos módulos contra un catálogo real.
--
-- FORMATO CANÓNICO ELEGIDO: dígitos concatenados SIN puntos, largo variable,
-- NVARCHAR(15) — el mismo que ya usa dbo.PlanCuentas.Codigo y el mismo que ya usa
-- ProductosFinancieros (2 de las 3 tablas ya lo usaban antes de este fix). Motivo:
--   1. Es el formato que db/informix/modulos/MODULO_REPORTES_SEPS.md documenta como el
--      código REAL del Catálogo Único de Cuentas SEPS tal como vive en bcaccco.ccco_cod_ccon
--      (ej. '110105', '1401', '2101' — sin puntos). El punteado ('2.1.03.05') es solo el
--      formato de PRESENTACIÓN en reportes impresos/balance regulatorio, no el dato crudo.
--   2. El esquema de agrupación jerárquica (1 dígito elemento . 1 dígito grupo . 2 dígitos
--      subgrupo . 2 dígitos cuenta . 2 dígitos subcuenta . ...) es el mismo en los tres
--      formatos encontrados — son la MISMA numeración a distinta profundidad, no tres
--      catálogos distintos. Concatenar sin puntos es una normalización, no una invención.
--   3. Ya era mayoría en el esquema (ProductosFinancieros + PlanCuentas) antes de este fix;
--      el punteado de TasasPlazoFijo/DepositosPlazo era la minoría a corregir.
--
-- Cambios:
--   1. Normaliza los valores punteados existentes en TasasPlazoFijo.CuentaContableDPF,
--      DepositosPlazo.CuentaContableDPF y el único registro de PlanCuentas.Codigo que
--      había quedado punteado ('2.1.03.10', insertado por 16_...sql).
--   2. Iguala el ANCHO de columna a NVARCHAR(15) en los tres lados (ProductosFinancieros.
--      Cuenta*, TasasPlazoFijo.CuentaContableDPF, DepositosPlazo.CuentaContableDPF) para
--      calzar con PlanCuentas.Codigo — SQL Server exige el mismo largo/escala en ambos
--      lados de una FK nvarchar (mismo hallazgo que documentó 14_fix_fk_usuario_faltantes.sql,
--      confirmado de nuevo acá con una prueba directa contra la instancia antes de escribir
--      este script: un FK entre nvarchar(20) y nvarchar(15) fue rechazado por el motor con
--      "Could not create constraint or index").
--   3. Siembra en dbo.PlanCuentas los códigos que ProductosFinancieros/TasasPlazoFijo ya
--      usaban pero que nunca se habían dado de alta ahí (catálogo real, no dato de prueba —
--      igual que el seed de ProductosFinancieros en 03_cuentas_productos.sql). Se siembra
--      para AMBAS cooperativas que hoy tienen productos/tasas (CooperativaId=1 Caja Patate
--      real, CooperativaId=2 TEST-COOP-2 ficticia de 11_prueba_aislamiento_multicooperativa.sql).
--   4. CHECK que fuerza a PlanCuentas.Codigo a ser solo dígitos de ahora en más (blinda el
--      formato canónico contra que vuelva a colarse un código punteado).
--   5. FK real compuesta (CooperativaId, Cuenta*) -> PlanCuentas(CooperativaId, Codigo) en
--      ProductosFinancieros, TasasPlazoFijo y DepositosPlazo. Compuesta y no simple porque
--      el mismo Codigo se repite entre cooperativas (multi-tenencia) — PlanCuentas.Codigo
--      NO es único por sí solo, solo lo es el par (CooperativaId, Codigo)
--      (UQ_PlanCuentas_Cooperativa_Codigo, ya existía desde 07_contabilidad.sql).
--
-- No reescribe ningún CREATE TABLE existente: todo es ALTER TABLE / UPDATE aditivo sobre
-- tablas que ya tienen datos de rondas anteriores (10_, 11_, 16_).
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

-- 1. Normalizar valores punteados existentes a formato canónico sin puntos.
UPDATE dbo.TasasPlazoFijo
SET CuentaContableDPF = REPLACE(CuentaContableDPF, '.', '')
WHERE CuentaContableDPF LIKE '%.%';

UPDATE dbo.DepositosPlazo
SET CuentaContableDPF = REPLACE(CuentaContableDPF, '.', '')
WHERE CuentaContableDPF LIKE '%.%';

UPDATE dbo.PlanCuentas
SET Codigo = REPLACE(Codigo, '.', '')
WHERE Codigo LIKE '%.%';

PRINT 'Códigos de cuenta contable normalizados (puntos removidos).';
GO

-- 2. Igualar el ancho de columna a NVARCHAR(15) en los tres lados, para calzar con
-- dbo.PlanCuentas.Codigo (ya NVARCHAR(15) desde 07_contabilidad.sql). Se verificó antes
-- (sys.columns) que ninguna columna tiene índice, CHECK ni DEFAULT que bloquee el ALTER.
ALTER TABLE dbo.ProductosFinancieros ALTER COLUMN CuentaActiva              NVARCHAR(15) NOT NULL;
GO
ALTER TABLE dbo.ProductosFinancieros ALTER COLUMN CuentaInactiva            NVARCHAR(15) NOT NULL;
GO
ALTER TABLE dbo.ProductosFinancieros ALTER COLUMN CuentaGasto               NVARCHAR(15) NULL;
GO
ALTER TABLE dbo.ProductosFinancieros ALTER COLUMN CuentaProvision           NVARCHAR(15) NULL;
GO
ALTER TABLE dbo.ProductosFinancieros ALTER COLUMN CuentaDepositosConfirmar  NVARCHAR(15) NULL;
GO
ALTER TABLE dbo.TasasPlazoFijo       ALTER COLUMN CuentaContableDPF         NVARCHAR(15) NOT NULL;
GO
ALTER TABLE dbo.DepositosPlazo       ALTER COLUMN CuentaContableDPF         NVARCHAR(15) NOT NULL;
GO

PRINT 'Columnas de código de cuenta contable igualadas a NVARCHAR(15).';
GO

-- 3. Sembrar en PlanCuentas los códigos reales que ProductosFinancieros/TasasPlazoFijo ya
-- usan y que todavía no estaban dados de alta ahí. TipoCuenta sigue la convención SEPS que
-- ya usaban los códigos existentes (dígito líder: 1=ACTIVO, 2=PASIVO, 3=PATRIMONIO,
-- 4=GASTO, 5=INGRESO), consistente con las filas insertadas antes por 10_ y 16_.

-- CooperativaId = 1 (Caja Patate, real)
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = 1 AND Codigo = '210315')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (1, '210315', 'Depósitos a Plazo 91-180 días', 'PASIVO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = 1 AND Codigo = '210320')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (1, '210320', 'Depósitos a Plazo 181-360 días', 'PASIVO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = 1 AND Codigo = '210325')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (1, '210325', 'Depósitos a Plazo más de 360 días', 'PASIVO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = 1 AND Codigo = '31030505')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (1, '31030505', 'Certificados de Aportación', 'PATRIMONIO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = 1 AND Codigo = '21013505')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (1, '21013505', 'Depósitos de Ahorro a la Vista - Auxiliar Producto', 'PASIVO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = 1 AND Codigo = '41019001')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (1, '41019001', 'Gastos por Productos Financieros', 'GASTO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = 1 AND Codigo = '25019001')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (1, '25019001', 'Provisión sobre Productos Financieros', 'PASIVO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = 1 AND Codigo = '21015015')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (1, '21015015', 'Depósitos por Confirmar', 'PASIVO');

-- CooperativaId = 2 (TEST-COOP-2, ficticia de 11_...sql) — mismos códigos que su único
-- producto (Ahorro a la Vista) referencia. Sin esto, la FK de la sección 5 rechazaría el
-- producto ya insertado por 11_prueba_aislamiento_multicooperativa.sql.
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = 2 AND Codigo = '21013505')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (2, '21013505', 'Depósitos de Ahorro a la Vista - Auxiliar Producto', 'PASIVO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = 2 AND Codigo = '41019001')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (2, '41019001', 'Gastos por Productos Financieros', 'GASTO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = 2 AND Codigo = '25019001')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (2, '25019001', 'Provisión sobre Productos Financieros', 'PASIVO');
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = 2 AND Codigo = '21015015')
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (2, '21015015', 'Depósitos por Confirmar', 'PASIVO');

PRINT 'PlanCuentas sembrado con los códigos reales que ProductosFinancieros/TasasPlazoFijo ya usaban.';
GO

-- 4. Blindar el formato canónico: de ahora en más, PlanCuentas.Codigo solo admite dígitos
-- (sin puntos, sin espacios, sin letras). Se agrega DESPUÉS de normalizar (paso 1), para
-- que no falle contra datos ya existentes.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_PlanCuentas_Codigo_SoloDigitos')
    ALTER TABLE dbo.PlanCuentas WITH CHECK
        ADD CONSTRAINT CK_PlanCuentas_Codigo_SoloDigitos CHECK (Codigo NOT LIKE '%[^0-9]%');
GO

-- 5. FK real compuesta (CooperativaId, Cuenta*) -> PlanCuentas(CooperativaId, Codigo).
-- Compuesta porque Codigo se repite entre cooperativas; solo el par es único
-- (UQ_PlanCuentas_Cooperativa_Codigo). Las columnas nullable (CuentaGasto, CuentaProvision,
-- CuentaDepositosConfirmar) siguen semántica MATCH SIMPLE de SQL Server: si esa columna es
-- NULL, la fila no se valida contra la FK (comportamiento estándar, no requiere nada extra).
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ProductosFinancieros_CuentaActiva_PlanCuentas')
    ALTER TABLE dbo.ProductosFinancieros WITH CHECK
        ADD CONSTRAINT FK_ProductosFinancieros_CuentaActiva_PlanCuentas FOREIGN KEY (CooperativaId, CuentaActiva) REFERENCES dbo.PlanCuentas(CooperativaId, Codigo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ProductosFinancieros_CuentaInactiva_PlanCuentas')
    ALTER TABLE dbo.ProductosFinancieros WITH CHECK
        ADD CONSTRAINT FK_ProductosFinancieros_CuentaInactiva_PlanCuentas FOREIGN KEY (CooperativaId, CuentaInactiva) REFERENCES dbo.PlanCuentas(CooperativaId, Codigo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ProductosFinancieros_CuentaGasto_PlanCuentas')
    ALTER TABLE dbo.ProductosFinancieros WITH CHECK
        ADD CONSTRAINT FK_ProductosFinancieros_CuentaGasto_PlanCuentas FOREIGN KEY (CooperativaId, CuentaGasto) REFERENCES dbo.PlanCuentas(CooperativaId, Codigo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ProductosFinancieros_CuentaProvision_PlanCuentas')
    ALTER TABLE dbo.ProductosFinancieros WITH CHECK
        ADD CONSTRAINT FK_ProductosFinancieros_CuentaProvision_PlanCuentas FOREIGN KEY (CooperativaId, CuentaProvision) REFERENCES dbo.PlanCuentas(CooperativaId, Codigo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ProductosFinancieros_CuentaDepConfirmar_PlanCuentas')
    ALTER TABLE dbo.ProductosFinancieros WITH CHECK
        ADD CONSTRAINT FK_ProductosFinancieros_CuentaDepConfirmar_PlanCuentas FOREIGN KEY (CooperativaId, CuentaDepositosConfirmar) REFERENCES dbo.PlanCuentas(CooperativaId, Codigo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_TasasPlazoFijo_CuentaContableDPF_PlanCuentas')
    ALTER TABLE dbo.TasasPlazoFijo WITH CHECK
        ADD CONSTRAINT FK_TasasPlazoFijo_CuentaContableDPF_PlanCuentas FOREIGN KEY (CooperativaId, CuentaContableDPF) REFERENCES dbo.PlanCuentas(CooperativaId, Codigo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_DepositosPlazo_CuentaContableDPF_PlanCuentas')
    ALTER TABLE dbo.DepositosPlazo WITH CHECK
        ADD CONSTRAINT FK_DepositosPlazo_CuentaContableDPF_PlanCuentas FOREIGN KEY (CooperativaId, CuentaContableDPF) REFERENCES dbo.PlanCuentas(CooperativaId, Codigo);
GO

PRINT 'FKs compuestas Cuenta* -> PlanCuentas(CooperativaId, Codigo) agregadas.';
GO

-- Índices de soporte para las FKs compuestas nuevas en las dos tablas que más van a crecer
-- (TasasPlazoFijo y DepositosPlazo son configuración chica; ProductosFinancieros es un
-- catálogo de un puñado de filas por cooperativa — no justifica índice propio).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DepositosPlazo_Coop_CuentaContableDPF' AND object_id = OBJECT_ID('dbo.DepositosPlazo'))
    CREATE INDEX IX_DepositosPlazo_Coop_CuentaContableDPF ON dbo.DepositosPlazo(CooperativaId, CuentaContableDPF);
GO

PRINT '=== 18_fix_formato_codigo_contable.sql completado. ===';
GO

-- Verificación 1: ya no debe quedar ningún código con punto en ninguna de las tres tablas.
PRINT '--- Códigos con punto remanentes (debe devolver 0 filas) ---';
SELECT 'TasasPlazoFijo' AS Tabla, CuentaContableDPF AS Codigo FROM dbo.TasasPlazoFijo WHERE CuentaContableDPF LIKE '%.%'
UNION ALL SELECT 'DepositosPlazo', CuentaContableDPF FROM dbo.DepositosPlazo WHERE CuentaContableDPF LIKE '%.%'
UNION ALL SELECT 'PlanCuentas', Codigo FROM dbo.PlanCuentas WHERE Codigo LIKE '%.%';
GO

-- Verificación 2: todo código usado en ProductosFinancieros/TasasPlazoFijo/DepositosPlazo
-- ahora resuelve a una fila real de PlanCuentas de la MISMA cooperativa.
PRINT '--- Cuentas de ProductosFinancieros resueltas contra PlanCuentas ---';
SELECT pf.CooperativaId, pf.Nombre AS Producto, pf.CuentaActiva, pcA.Nombre AS NombreCuentaActiva, pcA.TipoCuenta
FROM dbo.ProductosFinancieros pf
JOIN dbo.PlanCuentas pcA ON pcA.CooperativaId = pf.CooperativaId AND pcA.Codigo = pf.CuentaActiva
ORDER BY pf.CooperativaId, pf.ProductoId;
GO

PRINT '--- Tasas de plazo fijo resueltas contra PlanCuentas ---';
SELECT t.CooperativaId, t.CodigoRango, t.DescripcionRango, t.CuentaContableDPF, pc.Nombre, pc.TipoCuenta
FROM dbo.TasasPlazoFijo t
JOIN dbo.PlanCuentas pc ON pc.CooperativaId = t.CooperativaId AND pc.Codigo = t.CuentaContableDPF
ORDER BY t.CooperativaId, t.CodigoRango;
GO

-- Verificación 3: la FK debe RECHAZAR un código de cuenta contable que no existe en
-- PlanCuentas para esa cooperativa. Se intenta, se confirma el rechazo, no queda persistido.
BEGIN TRY
    UPDATE dbo.TasasPlazoFijo SET CuentaContableDPF = '999999' WHERE CooperativaId = 1 AND CodigoRango = '210305';
    PRINT '*** SIGUE FALLANDO: se aceptó un código de cuenta contable inexistente en PlanCuentas. ***';
    UPDATE dbo.TasasPlazoFijo SET CuentaContableDPF = '210305' WHERE CooperativaId = 1 AND CodigoRango = '210305';
END TRY
BEGIN CATCH
    PRINT 'FIX CONFIRMADO: código de cuenta contable inexistente fue rechazado por la FK. Mensaje: ' + ERROR_MESSAGE();
END CATCH
GO

-- Verificación 4: CHECK de solo-dígitos debe rechazar un intento de volver a insertar un
-- código punteado en PlanCuentas.
BEGIN TRY
    INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) VALUES (1, '9.9.99', 'No debería aceptarse (punteado)', 'ACTIVO');
    PRINT '*** SIGUE FALLANDO: se aceptó un código punteado en PlanCuentas. ***';
    DELETE FROM dbo.PlanCuentas WHERE CooperativaId = 1 AND Codigo = '9.9.99';
END TRY
BEGIN CATCH
    PRINT 'FIX CONFIRMADO: código punteado rechazado por CK_PlanCuentas_Codigo_SoloDigitos. Mensaje: ' + ERROR_MESSAGE();
END CATCH
GO

PRINT '=== Verificación de 18_fix_formato_codigo_contable.sql completada. ===';
GO
