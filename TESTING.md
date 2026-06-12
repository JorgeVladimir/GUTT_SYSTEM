# Guía de Pruebas de Integración y Arquitectura Digital (Engram)

Este documento sirve como memoria técnica ("Engram") para preservar las reglas de negocio, la estructura de base de datos y la ejecución de pruebas del portal digital y banca en línea de la Caja de Ahorro Patate.

---

## 1. Arquitectura de Activación de Banca en Línea

La activación digital opera a través de dos tablas sincronizadas en SQL Server:
1. **`dbo.RegistroSocios`**: Almacena el correo del socio (`Email`) y su confirmación original (`EmailConfirmado`).
2. **`dbo.ActivacionBancaLinea`** (Nueva): Mapea de forma segura al socio por `SocioId` con su `PIN` inicial de registro, el código de confirmación de 6 dígitos enviado a su correo electrónico (`CodigoVerificacion`), el estado de la banca (`Activo`), y las marcas de aceptación de términos y condiciones de privacidad (`AceptoDatosPersonales`, `FechaAceptacionDatos`).

---

## 2. Suite de Pruebas Automáticas (`test-integration-flows.js`)

Se ha implementado un script de regresión de punta a punta (`test-integration-flows.js`) que realiza llamadas HTTP a la API y consulta la base de datos para validar todas las reglas del sistema.

### ¿Qué evalúa el script?
* **Limpieza de Datos:** Remueve cualquier residuo del socio de pruebas (`9999999999`).
* **Paso 1 (Registro):** Llama a `/api/socios/registrar`, valida la creación en `RegistroSocios` e `ActivacionBancaLinea`, y simula el correo.
* **Paso 2 (Bloqueo Inicial):** Llama a `/api/auth/socio-login` y valida que devuelva `emailConfirmed: false` (banca bloqueada) y devuelva el código generado.
* **Paso 3 (Activación de Banca):** Llama a `/api/socios/verificar-email` con el código correcto y valida que se activen las banderas `Activo = 1` y `EmailConfirmado = 1`.
* **Paso 4 (Modal de Ley requerido):** Llama a `/api/auth/socio-login` y valida que devuelva `emailConfirmed: true` pero `aceptoDatosPersonales: false`, indicando que se debe mostrar el modal de privacidad.
* **Paso 5 (Aceptación de la Ley):** Llama a `/api/socios/aceptar-terminos` y valida que se registre la fecha y hora de aceptación en base de datos.
* **Paso 6 (Ingreso Directo):** Realiza un login final y valida que devuelva `emailConfirmed: true` y `aceptoDatosPersonales: true`, dando acceso directo al Dashboard.

### Cómo ejecutar las pruebas:
Asegúrate de que la API y base de datos estén activas y ejecuta el siguiente comando desde la raíz del proyecto `APP-CAJA-PATATE`:

```bash
node test-integration-flows.js
```

---

## 3. Estructura de Datos (Esquema de Activación)

```sql
CREATE TABLE dbo.ActivacionBancaLinea (
    ActivacionId INT IDENTITY(1,1) PRIMARY KEY,
    SocioId BIGINT NOT NULL FOREIGN KEY REFERENCES dbo.RegistroSocios(SOCIOID) ON DELETE CASCADE,
    PIN NVARCHAR(4) NOT NULL,
    CodigoVerificacion NVARCHAR(10) NOT NULL,
    FechaRegistro DATETIME2(0) NOT NULL DEFAULT(SYSDATETIME()),
    AceptoDatosPersonales BIT NOT NULL DEFAULT(0),
    FechaAceptacionDatos DATETIME2(0) NULL,
    Activo BIT NOT NULL DEFAULT(0)
);
```
