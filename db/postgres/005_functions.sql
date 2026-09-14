-- Funciones nativas; se llaman con SELECT desde el backend PostgreSQL.
-- Base limpia: una imagen actual por socio, consistente con la logica de guardado.
ALTER TABLE dbo."SocioUbicacionMapa" ADD CONSTRAINT "UQ_Mapa_Socio" UNIQUE ("SOCIOID");
ALTER TABLE dbo."SocioCroquisTrabajo" ADD CONSTRAINT "UQ_Croquis_Socio" UNIQUE ("SOCIOID");

CREATE FUNCTION dbo."usp_GuardarMapaUbicacion"(
  p_socioid bigint, p_imagen bytea, p_lat varchar(50), p_lng varchar(50),
  p_direccion varchar(200), p_ruta varchar(250) DEFAULT NULL
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO dbo."SocioUbicacionMapa" AS actual
    ("SOCIOID", "ImagenMapa", "CoordenadaLat", "CoordenadaLng", "DireccionCapturada", "RutaImagen")
  VALUES (p_socioid, p_imagen, p_lat, p_lng, p_direccion, p_ruta)
  ON CONFLICT ("SOCIOID") DO UPDATE SET
    "ImagenMapa" = EXCLUDED."ImagenMapa", "CoordenadaLat" = EXCLUDED."CoordenadaLat",
    "CoordenadaLng" = EXCLUDED."CoordenadaLng", "DireccionCapturada" = EXCLUDED."DireccionCapturada",
    "RutaImagen" = COALESCE(EXCLUDED."RutaImagen", actual."RutaImagen"), "FechaCaptura" = LOCALTIMESTAMP;
$$;

CREATE FUNCTION dbo."usp_GuardarCroquisTrabajo"(
  p_socioid bigint, p_imagen bytea, p_descripcion varchar(500), p_ruta varchar(250) DEFAULT NULL
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO dbo."SocioCroquisTrabajo" AS actual ("SOCIOID", "ImagenCroquis", "Descripcion", "RutaImagen")
  VALUES (p_socioid, p_imagen, p_descripcion, p_ruta)
  ON CONFLICT ("SOCIOID") DO UPDATE SET "ImagenCroquis" = EXCLUDED."ImagenCroquis",
    "Descripcion" = EXCLUDED."Descripcion", "RutaImagen" = COALESCE(EXCLUDED."RutaImagen", actual."RutaImagen"),
    "FechaCaptura" = LOCALTIMESTAMP;
$$;

CREATE FUNCTION dbo."usp_GenerarIDDepositoPlazo"() RETURNS varchar(20) LANGUAGE plpgsql AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM LOCALTIMESTAMP);
  v_month integer := EXTRACT(MONTH FROM LOCALTIMESTAMP);
  v_number integer;
BEGIN
  INSERT INTO dbo."SecuenciaDPF" AS actual ("Anio", "Mes", "UltimoN") VALUES (v_year, v_month, 1)
  ON CONFLICT ("Anio", "Mes") DO UPDATE SET "UltimoN" = actual."UltimoN" + 1
  RETURNING "UltimoN" INTO v_number;
  -- No truncar el contador al superar 9999: el ID debe seguir siendo unico.
  RETURN 'DPF-' || v_year::text || lpad(v_month::text, 2, '0') || '-' ||
    lpad(v_number::text, greatest(4, length(v_number::text)), '0');
END $$;

CREATE TABLE dbo."SecuenciaPersona" (
  "TipoPersona" varchar(20) PRIMARY KEY,
  "UltimoN" bigint NOT NULL CHECK ("UltimoN" > 0)
);

CREATE FUNCTION dbo."usp_RegistrarSocio"(p_data jsonb)
RETURNS TABLE ("SOCIOID" bigint, "NumeroSocio" varchar(20)) LANGUAGE plpgsql AS $$
DECLARE
  r dbo."RegistroSocios"%ROWTYPE;
  v_number bigint;
  v_id bigint;
  v_code varchar(20);
BEGIN
  r := jsonb_populate_record(NULL::dbo."RegistroSocios", p_data);
  IF r."TipoPersona" IS NULL OR r."TipoPersona" NOT IN ('SOCIO', 'CLIENTE', 'CLIENTE_EXTERNO') THEN
    RAISE EXCEPTION 'TipoPersona invalido' USING ERRCODE = '22023';
  END IF;
  INSERT INTO dbo."SecuenciaPersona" AS actual ("TipoPersona", "UltimoN") VALUES (r."TipoPersona", 1)
  ON CONFLICT ("TipoPersona") DO UPDATE SET "UltimoN" = actual."UltimoN" + 1
  RETURNING "UltimoN" INTO v_number;
  v_code := CASE r."TipoPersona" WHEN 'SOCIO' THEN 'S-00' WHEN 'CLIENTE' THEN 'CL-00' ELSE 'CE-00' END || v_number::text;
  r."SoloUnNombre" := COALESCE(r."SoloUnNombre", false);
  r."SoloUnApellido" := COALESCE(r."SoloUnApellido", false);
  r."EmailConfirmado" := COALESCE(r."EmailConfirmado", false);
  r."Apellidos" := r."PrimerApellido" || CASE
    WHEN r."SoloUnApellido" OR r."SegundoApellido" IS NULL OR r."SegundoApellido" = '' THEN ''
    ELSE ' ' || r."SegundoApellido" END;

  INSERT INTO dbo."RegistroSocios" (
    "TipoPersona", "TipoIdentificacion", "Identificacion", "PrimerNombre", "SegundoNombre",
    "PrimerApellido", "SegundoApellido", "SoloUnNombre", "SoloUnApellido", "Apellidos",
    "Email", "Telefono", "FechaNacimiento", "EstadoCivil", "PIN", "PaisNacimiento",
    "ProvinciaNacimiento", "CantonNacimiento", "ParroquiaNacimiento", "PaisResidencia",
    "ProvinciaResidencia", "CantonResidencia", "ParroquiaResidencia", "DireccionDomicilio",
    "LugarTrabajo", "ProvinciaTrabajo", "CantonTrabajo", "ParroquiaTrabajo", "CedulaConyuge",
    "NombreConyuge", "TelefonoConyuge", "Etnia", "Genero", "NivelInstruccion", "Profesion",
    "ReferenciasPersonales", "CargasFamiliares", "NumeroSocio", "UsuarioRegistro",
    "CodigoActivacion", "EmailConfirmado", "Estado"
  ) VALUES (
    r."TipoPersona", r."TipoIdentificacion", r."Identificacion", r."PrimerNombre", r."SegundoNombre",
    r."PrimerApellido", r."SegundoApellido", r."SoloUnNombre", r."SoloUnApellido", r."Apellidos",
    r."Email", r."Telefono", r."FechaNacimiento", r."EstadoCivil", r."PIN", r."PaisNacimiento",
    r."ProvinciaNacimiento", r."CantonNacimiento", r."ParroquiaNacimiento", r."PaisResidencia",
    r."ProvinciaResidencia", r."CantonResidencia", r."ParroquiaResidencia", r."DireccionDomicilio",
    r."LugarTrabajo", r."ProvinciaTrabajo", r."CantonTrabajo", r."ParroquiaTrabajo", r."CedulaConyuge",
    r."NombreConyuge", r."TelefonoConyuge", r."Etnia", r."Genero", r."NivelInstruccion", r."Profesion",
    r."ReferenciasPersonales", r."CargasFamiliares", v_code, r."UsuarioRegistro",
    r."CodigoActivacion", r."EmailConfirmado", 'ACTIVO'
  ) RETURNING dbo."RegistroSocios"."SOCIOID" INTO v_id;

  INSERT INTO dbo."CuentasAhorro" ("SocioId", "NumeroCuenta", "CodigoProducto", "Saldo")
  SELECT v_id, p."CodigoProducto"::text || lpad(v_id::text, greatest(8, length(v_id::text)), '0'),
    p."CodigoProducto", 0.00
  FROM dbo."parametrosproductos" p WHERE r."TipoPersona" = 'SOCIO' OR NOT p."EsCertificado";
  RETURN QUERY SELECT v_id, v_code;
END $$;
