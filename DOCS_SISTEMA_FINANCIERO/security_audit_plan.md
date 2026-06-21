# Registro de Auditoría de Seguridad y Pentesting Lógico

Este plan y registro detalla los vectores de ataque analizados en la lógica de negocios del sistema de créditos de la **Caja de Ahorro Patate**, sus mecanismos de defensa y la suite de pruebas automatizadas.

---

## 1. Vectores de Ataque Analizados y Mitigaciones

### Vector 1: Bypass de Rol en Aprobación / Desembolso (Escalada de Privilegios)
* **Descripción del Ataque**: Un usuario con rol de Asesor de Crédito (`CREDIT_OFFICER`) realiza una solicitud POST directamente a los endpoints `/api/socios/loans/approve` o `/api/socios/loans/disburse` intentando eludir el flujo y aprobar o desembolsar sus propios créditos o los de terceros.
* **Mitigación en Servidor**: El backend no confía en los roles enviados por el cliente. Al recibir la solicitud, consulta directamente la base de datos utilizando el `usuarioId` adjunto en la sesión/cuerpo.
  * Si el rol del usuario en la tabla `dbo.Usuarios` es `CREDIT_OFFICER`, el servidor aborta la transacción inmediatamente y responde con código HTTP `403 Forbidden`.
  * Adicionalmente, si el aprobador es un Jefe de Crédito (`MANAGER`), el sistema restringe el monto máximo de aprobación a **$50,000.00 USD**. Todo valor superior requiere un rol de `ADMIN` o `SUPER_USER`.

### Vector 2: Inyección de Datos Financieros (Avalúo Prendario Inconsistente o Negativo)
* **Descripción del Ataque**: Manipulación de parámetros en el payload de creación del crédito (`POST /api/socios/loans`). Un atacante envía un valor negativo (ej. `-500.00`) o inconsistente en el campo de avalúo de la garantía prendaria (`garantiaInfo.prendaria.avaluo` o `garantiaInfo.avaluoMonto`). Esto puede corromper el cálculo de cobertura (`valorCobertura`) o subvertir validaciones matemáticas en cascada en la base de datos.
* **Mitigación en Servidor**: Se añadió validación en `server.js` dentro del bloque de procesamiento de garantías de tipo `PRENDARIA`.
  * Se extrae el valor del avalúo y se analiza mediante `parseFloat`.
  * Si el valor resultante es `NaN` o es menor a cero (`parsedAvaluo < 0`), la API rechaza la solicitud de crédito con código `400 Bad Request` y el mensaje de error: *'El valor de la prenda (avaluo) no puede ser negativo o inconsistente.'*

### Vector 3: Seguridad de Sesión y Privilegios
* **Descripción del Ataque**: Persistencia de privilegios o "secuestro de sesión" en el cliente después de que un usuario abandona la estación o hace clic en "Salir". Si el token o privilegios no son eliminados del estado del cliente o si el servidor acepta peticiones sin remitente válido.
* **Mitigación**: 
  * **Front-end**: Al cerrar sesión (`handleLogout`), el estado `currentUser` en `App.tsx` se define como `null` y se resetean todas las variables temporales en memoria de forma inmediata.
  * **Back-end**: Toda petición sensible requiere obligatoriamente un `usuarioId`. Si este parámetro no es provisto o es vacío, el servidor asume de manera preventiva el rol de menor privilegio (`asesor` / `CREDIT_OFFICER`), denegando la transacción automáticamente y devolviendo un error `403`.

---

## 2. Suite de Pruebas de Seguridad (`security_test_suite.js`)

Se ha creado y desplegado la suite de auditoría automatizada en el archivo [security_test_suite.js](file:///c:/Users/DELL/APP-CAJA-PATATE/security_test_suite.js). Esta suite simula peticiones de pentesting lógico al servidor local en puerto 8080:

1. **Bypass de Aprobación**: Envía un intento de aprobación utilizando un `usuarioId` con privilegios de Asesor. Debe ser bloqueado con HTTP 403.
2. **Bypass de Desembolso**: Envía un intento de desembolso utilizando un `usuarioId` con privilegios de Asesor. Debe ser bloqueado con HTTP 403.
3. **Inyección de Garantía Prendaria**: Envía una solicitud con avalúo de \(-500.00\) USD. Debe ser rechazada con HTTP 400.
4. **Seguridad de Sesión (Denegación por Defecto)**: Envía una petición de aprobación omitiendo el parámetro `usuarioId`. Debe ser rechazada con HTTP 403 al caer al rol restrictivo por defecto.

### Comandos de Ejecución

Para ejecutar las pruebas de seguridad de forma local en la terminal de desarrollo:

```powershell
node security_test_suite.js
```
