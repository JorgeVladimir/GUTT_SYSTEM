-- Equivalente de SQL Server 34_; catalogo destino, sin modificar el origen.
UPDATE dbo."TasasPlazoFijo" SET "CuentaContableDPF" = '210305', "DescripcionRango" = 'De 1 a 30 dias'
WHERE "TasaID" = 1 AND "DiasDesde" = 1 AND "DiasHasta" = 30;
UPDATE dbo."TasasPlazoFijo" SET "CuentaContableDPF" = '210310', "DescripcionRango" = 'De 31 a 90 dias'
WHERE "TasaID" = 2 AND "DiasDesde" = 31 AND "DiasHasta" = 90;
UPDATE dbo."TasasPlazoFijo" SET "CuentaContableDPF" = '210315', "DescripcionRango" = 'De 91 a 180 dias'
WHERE "TasaID" = 3 AND "DiasDesde" = 91 AND "DiasHasta" = 180;
UPDATE dbo."TasasPlazoFijo" SET "CuentaContableDPF" = '210320', "DescripcionRango" = 'De 181 a 360 dias'
WHERE "TasaID" = 4 AND "DiasDesde" = 181 AND "DiasHasta" = 360;
UPDATE dbo."TasasPlazoFijo" SET "CuentaContableDPF" = '210325', "DescripcionRango" = 'De mas de 360 dias'
WHERE "TasaID" = 5 AND "DiasDesde" = 361;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM dbo."TasasPlazoFijo" t
    LEFT JOIN dbo."PlanCuentas" p ON p."Codigo" = t."CuentaContableDPF"
    WHERE t."Activo" AND p."Codigo" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cuenta DPF activa inexistente en PlanCuentas';
  END IF;
END $$;
