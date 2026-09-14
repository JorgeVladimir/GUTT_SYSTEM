-- Vistas de origen con identificadores exactos.
CREATE   VIEW "dbo"."vw_AuditoriaAhorros" AS
    SELECT * FROM "dbo"."AuditoriaProcesos" WHERE "Proceso" = 'AHORROS';

CREATE   VIEW "dbo"."vw_AuditoriaCaja" AS
    SELECT * FROM "dbo"."AuditoriaProcesos" WHERE "Proceso" = 'CAJA';

CREATE   VIEW "dbo"."vw_AuditoriaContabilidad" AS
    SELECT * FROM "dbo"."AuditoriaProcesos" WHERE "Proceso" = 'CONTABILIDAD';

CREATE   VIEW "dbo"."vw_AuditoriaCreditos" AS
    SELECT * FROM "dbo"."AuditoriaProcesos" WHERE "Proceso" = 'CREDITOS';

CREATE   VIEW "dbo"."vw_AuditoriaPlazoFijo" AS
    SELECT * FROM "dbo"."AuditoriaProcesos" WHERE "Proceso" = 'PLAZO_FIJO';

CREATE   VIEW "dbo"."vw_AuditoriaReportesSeps" AS
    SELECT * FROM "dbo"."AuditoriaProcesos" WHERE "Proceso" = 'REPORTES_SEPS';

CREATE   VIEW "dbo"."vw_AuditoriaSeguridad" AS
    SELECT * FROM "dbo"."AuditoriaProcesos" WHERE "Proceso" = 'SEGURIDAD';

CREATE   VIEW "dbo"."vw_AuditoriaSocios" AS
    SELECT * FROM "dbo"."AuditoriaProcesos" WHERE "Proceso" = 'SOCIOS';

CREATE   VIEW "dbo"."vw_ClientesInformixParaApp"
AS
SELECT
    "ClienteInformixId",
    "OrigenSistema",
    "OrigenClienteId",
    "CodigoTipoCliente",
    "NumeroCliente",
    "CodigoOficina",
    "CodigoTipoIdentificacion",
    "Identificacion",
    "Apellidos",
    "Nombres",
    "NombreCompleto",
    "FechaNacimiento",
    "CodigoSector",
    "DireccionDomicilio",
    "FechaUltimaActualizacion",
    "FechaIngreso",
    "FechaSalida",
    "Email",
    "NaturalezaJuridica",
    "EstadoCliente",
    "CodigoCalificacion",
    "RepresentanteLegal",
    "IdentificacionRepresentante",
    "TipoIdentificacionRepresentante",
    "CodigoPais",
    "CodigoUsuario",
    "CodigoOficinaTrabajo",
    "ReferenciaDireccion",
    "CodigoCocu",
    "EstadoAdicional",
    "CodigoDiscapacidad",
    "CodigoTipoVivienda",
    "ValorVivienda",
    "NumeroCargas",
    "CodigoTipoCargaSocio",
    "CodigoAuid",
    "FechaAsamblea",
    "CodigoProfesion",
    "BanderaPeps",
    "CodigoTipoVinculacion",
    "BanderaGrupo",
    "CodigoGrupo",
    "CodigoTipoResidencia",
    "PaisResidencia",
    "BanderaPdpe",
    "HuellaDactilar",
    "FechaCreacion",
    "FechaActualizacion"
FROM "dbo"."ClientesInformix"
WHERE "OrigenSistema" = 'INFORMIX_AFC';

CREATE VIEW "dbo"."vw_ICE_Creditos" AS
SELECT
    "s"."SolicitudID",
    "s"."Identificacion",
    "rs"."PrimerNombre" || ' ' || "rs"."Apellidos" AS "NombreSocio",
    "s"."Monto",
    "s"."Tasa",
    "s"."Plazo",
    "s"."Estado",
    "s"."ICEPorcentaje",
    "s"."ICEEstado",
    "s"."ICECuotaMensual",
    "s"."ICEIngresoNeto",
    "s"."ICEDeudaExterna",
    "s"."FechaSolicitud",
    CASE
        WHEN "s"."ICEPorcentaje" IS NULL     THEN 'SIN CÁLCULO'
        WHEN "s"."ICEPorcentaje" <= 40.00    THEN 'CAPACIDAD ADECUADA (≤40%)'
        WHEN "s"."ICEPorcentaje" <= 50.00    THEN 'EN LÍMITE (41-50%)'
        ELSE                                  'SOBREENDEUDAMIENTO (>50%)'
    END AS "ICEDescripcion"
FROM "dbo"."SolicitudesCredito" "s"
LEFT JOIN "dbo"."RegistroSocios" "rs" ON "rs"."Identificacion" = "s"."Identificacion";

CREATE   VIEW "dbo"."vw_RegistroSociosConsultas"
AS
SELECT
    "rs"."SOCIOID",
    "rs"."TipoPersona",
    "rs"."TipoIdentificacion",
    "rs"."Identificacion",
    "rs"."PrimerNombre",
    "rs"."SegundoNombre",
    "rs"."PrimerApellido",
    "rs"."SegundoApellido",
    "rs"."Apellidos",
    
    COALESCE("rs"."PrimerNombre", '') || 
      CASE WHEN "rs"."SegundoNombre" IS NOT NULL AND "rs"."SegundoNombre" <> '' THEN ' ' || "rs"."SegundoNombre" ELSE '' END ||
      ' ' || COALESCE("rs"."Apellidos", '') AS "NombreCompleto",
    "rs"."Email",
    "rs"."Telefono",
    "rs"."FechaNacimiento",
    "rs"."EstadoCivil",
    "rs"."PaisNacimiento",
    "rs"."ProvinciaNacimiento",
    "rs"."CantonNacimiento",
    "rs"."ParroquiaNacimiento",
    "rs"."PaisResidencia",
    "rs"."ProvinciaResidencia",
    "rs"."CantonResidencia",
    "rs"."ParroquiaResidencia",
    "rs"."DireccionDomicilio",
    "rs"."LugarTrabajo",
    "rs"."ProvinciaTrabajo",
    "rs"."CantonTrabajo",
    "rs"."ParroquiaTrabajo",
    "rs"."NumeroSocio",
    "rs"."FechaRegistro",
    "rs"."UsuarioRegistro",
    "rs"."Estado",
    
    CASE WHEN "sm"."UbicacionMapaID" IS NOT NULL THEN 1 ELSE 0 END AS "TieneMapaUbicacion",
    CASE WHEN "ct"."CroquisTrabajoID" IS NOT NULL THEN 1 ELSE 0 END AS "TieneCroquisTrabajo",
    
    "sm"."RutaImagen" AS "RutaImagenMapa",
    "ct"."RutaImagen" AS "RutaImagenCroquis"
FROM "dbo"."RegistroSocios" "rs"
LEFT JOIN "dbo"."SocioUbicacionMapa" "sm" ON "sm"."SOCIOID" = "rs"."SOCIOID"
LEFT JOIN "dbo"."SocioCroquisTrabajo" "ct" ON "ct"."SOCIOID" = "rs"."SOCIOID"
WHERE "rs"."Estado" = 'ACTIVO';

CREATE   VIEW "dbo"."vw_UsuariosInformixParaApp"
AS
SELECT
    "UsuarioId",
    "NombreCompleto",
    "Rol",
    "Activo",
    "FechaRegistro",
    "OrigenUsuarioId",
    "CodigoEmpleado",
    "CodigoPerfil",
    "FechaUltimoAcceso",
    "NumeroAgencia",
    "ImpresoraPredeterminada"
FROM "dbo"."Usuarios"
WHERE "OrigenSistema" = 'INFORMIX_AFC';
