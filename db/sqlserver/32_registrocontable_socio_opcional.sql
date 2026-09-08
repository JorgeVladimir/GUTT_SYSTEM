/* ============================================================================
   32_registrocontable_socio_opcional.sql
   ----------------------------------------------------------------------------
   dbo.RegistroContable.SocioId era NOT NULL con FK a dbo.RegistroSocios, asi que
   TODO asiento tenia que pertenecer a un socio. Eso funcionaba mientras el unico
   origen de asientos eran operaciones de ventanilla, pero deja fuera a los
   asientos AGREGADOS de los procesos de cierre --reclasificacion de cartera,
   constitucion de provisiones-- que son de la institucion, no de un socio.

   El primer intento fue asentar con SocioId = 0; la FK lo rechazo, con razon: no
   existe el socio 0. Inventar un "socio tecnico" habria metido una fila falsa en
   el padron de socios, que es justo lo que una revision SEPS no debe encontrar.

   La columna pasa a NULLABLE y la FK se conserva (una FK acepta NULL). El codigo
   que cruza asientos con socios ya usaba LEFT JOIN y hasta filtraba
   "WHERE rc.SocioId IS NOT NULL" en la matriz UAFE, asi que no hay lector que
   asuma lo contrario.
   ============================================================================ */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'RegistroContable'
      AND COLUMN_NAME = 'SocioId' AND IS_NULLABLE = 'NO'
)
BEGIN
    ALTER TABLE dbo.RegistroContable ALTER COLUMN SocioId BIGINT NULL;
    PRINT 'dbo.RegistroContable.SocioId ahora acepta NULL (asientos institucionales).';
END
ELSE
    PRINT 'dbo.RegistroContable.SocioId ya aceptaba NULL. Sin cambios.';
GO

/* Verificacion: la columna debe quedar nullable y la FK debe seguir existiendo. */
SELECT
    (SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'RegistroContable' AND COLUMN_NAME = 'SocioId') AS SocioIdNullable,
    (SELECT COUNT(*) FROM sys.foreign_keys WHERE name = 'FK_RegistroContable_Socio')                AS FKConservada;
GO
