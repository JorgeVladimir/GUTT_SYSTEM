/* ============================================================================
   34_dpf_cuenta_contable_catalogo.sql
   ----------------------------------------------------------------------------
   dbo.TasasPlazoFijo.CuentaContableDPF guardaba codigos en formato punteado
   legado ('2.1.03.05', '2.1.03.10', ...), el mismo formato que ya se migro en
   el resto del sistema al Catalogo Unico sin puntos ('210305', '210310', ...).
   Como el codigo punteado no existe en dbo.PlanCuentas, el asiento de apertura
   de un DPF nunca calzaba contra una cuenta real y no llegaba a los reportes
   (Balance de Comprobacion, Estado de Situacion Financiera).

   Se corrige a los codigos reales del Catalogo Unico para la familia 2103
   (DEPOSITOS A PLAZO), uno por cada tramo de dias ya definido en
   dbo.TasasPlazoFijo. De paso se corrige la mojibake en DescripcionRango
   (quedo con "dÃ­as" por una carga con codificacion incorrecta).
   ============================================================================ */
SET QUOTED_IDENTIFIER ON;
GO

UPDATE dbo.TasasPlazoFijo SET CuentaContableDPF = '210305', DescripcionRango = 'De 1 a 30 dias'      WHERE TasaID = 1 AND DiasDesde = 1   AND DiasHasta = 30;
UPDATE dbo.TasasPlazoFijo SET CuentaContableDPF = '210310', DescripcionRango = 'De 31 a 90 dias'     WHERE TasaID = 2 AND DiasDesde = 31  AND DiasHasta = 90;
UPDATE dbo.TasasPlazoFijo SET CuentaContableDPF = '210315', DescripcionRango = 'De 91 a 180 dias'    WHERE TasaID = 3 AND DiasDesde = 91  AND DiasHasta = 180;
UPDATE dbo.TasasPlazoFijo SET CuentaContableDPF = '210320', DescripcionRango = 'De 181 a 360 dias'   WHERE TasaID = 4 AND DiasDesde = 181 AND DiasHasta = 360;
UPDATE dbo.TasasPlazoFijo SET CuentaContableDPF = '210325', DescripcionRango = 'De mas de 360 dias'  WHERE TasaID = 5 AND DiasDesde = 361;
GO

/* Verificacion: todo CuentaContableDPF activo debe existir en el Catalogo Unico. */
SELECT t.TasaID, t.CuentaContableDPF, p.Nombre AS CuentaEnCatalogo
FROM dbo.TasasPlazoFijo t
LEFT JOIN dbo.PlanCuentas p ON p.Codigo = t.CuentaContableDPF
WHERE t.Activo = 1;
GO
