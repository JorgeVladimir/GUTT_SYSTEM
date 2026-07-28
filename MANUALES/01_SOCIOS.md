# 01 — Socios / Clientes

Módulo de **alta (registro), consulta/búsqueda y edición de perfil de socios**. Cubre el flujo de
autoservicio de registro (`components/Register.tsx`), la ficha de perfil editable por el propio socio
(`components/ProfileView.tsx`) y el motor de búsqueda de socios que consumen `Dashboard`, `TellerView`,
`Transfers`, `SavingsView`, `PlazoFijoView`, `ReportsView` y `CreditOfficerApproval` (`GET
/api/socios/buscar`, server.js). Complementa al módulo de reportes SEPS (`ReportsView.tsx`, fuera de este
manual), que es donde hoy se captura la ficha ampliada KYC/UAFE (PEPS, patrimonio, vivienda,
autoidentificación, discapacidad).

> **Advertencia previa a leer este manual**: la revisión encontró que **cualquier persona sin sesión
> iniciada puede leer el PIN bancario en texto plano de todos los socios activos**, y que **cualquiera
> que conozca la cédula de un socio puede modificar su perfil (incluida su condición de PEP) sin
> autenticarse**. Este manual describe el sistema tal como funciona hoy, incluyendo esos defectos, para
> que quien opere el sistema sepa exactamente qué controles existen y cuáles no. Ver sección 5.

---

## 1. Qué es y quién lo usa

| Pantalla | Componente | Quién la usa | Qué hace |
|---|---|---|---|
| Registro / alta de socio | `components/Register.tsx` | Socio nuevo (autoservicio, sin sesión previa) | Captura cédula, nombres, apellidos, email y PIN de 4 dígitos; crea el socio en `dbo.RegistroSocios` |
| Perfil del socio | `components/ProfileView.tsx` | Socio autenticado (`AppView.PROFILE`) | Edita identidad básica, localización, actividad laboral, cargas familiares y referencias personales; imprime la "Ficha Integral de Socio" |
| Búsqueda de socios | `GET /api/socios/buscar` (server.js:2489) | Todo el personal interno (caja, crédito, contabilidad, reportes) a través de `Dashboard`/`TellerView`/`Transfers`/etc., y también `App.tsx` en cada carga de la aplicación | Trae el socio por cédula/número de socio/nombre desde SQL Server; si no existe aún en SQL Server, hace fallback en vivo a Informix (`buscarClienteInformix`, solo lectura) |

El registro (alta) llega al backend vía `POST /api/socios/registrar` (server.js:748), que ejecuta el
stored procedure `dbo.usp_RegistrarSocio` (`db/sqlserver/06_registro_socios_app.sql`, actualizado por
`db/sqlserver/07_auditoria_y_registro_socios_update.sql`). La tabla destino es `dbo.RegistroSocios`, con
restricción `UNIQUE (Identificacion)` — es la única barrera real contra duplicados exactos de cédula.

---

## 2. Cómo se opera paso a paso

### 2.1 Registro de un socio nuevo (autoservicio)

1. El aspirante abre `Register.tsx` (sin haber iniciado sesión).
2. Ingresa cédula (10 dígitos). El frontend calcula el dígito verificador ecuatoriano
   (`validateEcuadorianId`, Register.tsx:38-54) tras un retraso artificial de 8 segundos etiquetado como
   "Simulación de consulta a Registro Civil" (Register.tsx:64) — **no hay ninguna consulta real a un
   servicio externo**, es únicamente el cálculo local del dígito verificador con un `setTimeout`.
3. Ingresa primer nombre (obligatorio), segundo nombre (opcional, salvo que marque "poseo un solo
   nombre legal"), apellidos completos (un solo campo de texto libre), email y PIN de 4 dígitos.
4. Acepta el débito de $5.00 por activación (checkbox obligatorio).
5. Al enviar, `App.tsx → handleRegister()` (App.tsx:363-445):
   - Revisa duplicados **contra el estado local `users`** ya cargado en el navegador (`users.some(u =>
     u.id === cleanId)`) — es solo una verificación de UX, no autoritativa (ver hallazgo H5).
   - Reconstruye nombre/apellido a partir del string completo con `name.trim().split(/\s+/)`: la primera
     palabra es `primerNombre`, el resto entero (incluyendo el segundo nombre que el socio sí capturó por
     separado en el formulario) se envía como `primerApellido` — ver hallazgo H6.
   - Envía `soloUnNombre: 1` y `soloUnApellido: 1` **siempre**, sin importar lo que el socio marcó en el
     formulario.
   - Envía `fechaNacimiento` = **la fecha de hoy** y `estadoCivil: 'SOLTERO'` fijos — Register.tsx nunca
     pregunta estos datos — ver hallazgo H3.
   - Envía `emailConfirmado: 1` de una vez, aunque el correo de verificación con código de 6 dígitos se
     dispara en el backend (`sendVerificationEmail`, server.js:909) y nunca se le pide al socio
     ingresarlo — ver hallazgo H4.
6. El backend valida solo que existan `identificacion`, `primerNombre`, `primerApellido`, `pin` y `email`
   (server.js:793-795) — **no vuelve a validar el dígito verificador de la cédula ni la longitud del PIN**
   — ver hallazgo H2.
7. El backend chequea duplicados por `Identificacion` con `Estado = 'ACTIVO'` (server.js:809-816) y luego
   ejecuta `usp_RegistrarSocio`, que asigna `NumeroSocio = 'P' + siguiente valor de la secuencia
   Seq_NumeroSocio` (arranca en 1000) y guarda el PIN **tal como llegó, en texto plano** en la columna
   `PIN NVARCHAR(4)`.
8. Se crea también una fila en `dbo.ActivacionBancaLinea` con el mismo PIN duplicado.
9. Si el socio declaró excepción de cédula (`idConExcepcion`), se guardan fotos de ambas caras del
   documento como archivos en `/uploads/` y su ruta en `dbo.SocioDocumentoExcepcion`.
10. Respuesta `ok: true` con `socioId`, `numeroSocio`, `codigoActivacion` → el frontend consulta el
    perfil completo (`DataService.getUserFullData`) y navega al Dashboard. El socio queda operando de
    inmediato, sin haber demostrado control de su correo ni verificado su cédula contra ninguna fuente
    externa real.

### 2.2 Edición de perfil (socio autenticado)

1. El socio entra a "Mi Perfil" (`ProfileView.tsx`), con pestañas IDENTIDAD / LOCALIZACIÓN / ACTIVIDAD /
   OTROS / REPORTE.
2. Edita nombre, email, dirección, croquis de domicilio (fotos), lugar de trabajo, profesión, cargas
   familiares y referencias personales.
3. Al presionar "GUARDAR CAMBIOS SEPS", `handleUpdate()` (ProfileView.tsx:53-62) simula un guardado con
   `setTimeout` de 1 segundo, llama a `onUpdateUser(editingUser)` y muestra el mensaje **"¡Perfil
   actualizado con éxito en el núcleo bancario!"**.
4. **Ese mensaje es falso**: `onUpdateUser` termina en `App.tsx → handleUpdateUser()` (App.tsx:448-457),
   que solo actualiza el arreglo `users` en memoria de React. No hay ningún `fetch` al backend en esta
   ruta. El endpoint que sí existe para esto (`POST /api/socios/update-profile`, server.js:2191) **no lo
   invoca ningún componente del sistema** — está huérfano. En el siguiente `reloadAllUsers()` (recarga de
   página, cambio de vista que dispare recarga, etc.) el cambio desaparece sin aviso. Ver hallazgo H1
   (el más crítico de UX/integridad del módulo).
5. La pestaña "REPORTE" solo imprime la Ficha Integral de Socio (`FichaDeSocio`, ProfileView.tsx:139-193)
   con los datos ya cargados; no edita nada.
6. Los campos KYC/UAFE ampliados (PEPS, patrimonio e ingresos, tipo/valor de vivienda, discapacidad,
   autoidentificación étnico-cultural, consentimiento de tratamiento de datos) **no existen en
   `ProfileView.tsx`** — se editan únicamente desde `ReportsView.tsx` (`POST
   /api/socios/update-report-profile`, fuera de este módulo), presumiblemente por personal interno, no
   por el propio socio en autoservicio. Confirmar con negocio si esa separación es intencional.

### 2.3 Búsqueda de socios

`GET /api/socios/buscar?q=<texto>` (server.js:2489-2658): busca por cédula exacta, número de socio
exacto, o apellido/primer nombre con `LIKE %q%`, filtrando `Estado = 'ACTIVO'`. Si no hay resultados en
SQL Server, hace fallback de solo lectura a Informix (`buscarClienteInformix`, server.js:249) y a créditos
legacy (`buscarCreditosInformix`, server.js:295). **Si `q` viene vacío, devuelve TODOS los socios
activos** — este es el modo en que lo invoca `App.tsx` en cada carga de la aplicación
(`reloadAllUsers()`, App.tsx:236-253), incluso antes de iniciar sesión. Ver hallazgo H1 (Sección 5).

---

## 3. Reglas de negocio y validaciones aplicadas

| Regla | Dónde se aplica | Observación |
|---|---|---|
| Cédula ecuatoriana con dígito verificador válido (algoritmo módulo 10, provincia 01-24) | Solo frontend (`Register.tsx`) | El backend no la revalida — ver H2 |
| Cédula única por socio | `UNIQUE (Identificacion)` en `dbo.RegistroSocios` + chequeo previo `Estado='ACTIVO'` en server.js | El chequeo previo es "check-then-insert" (no atómico); el `UNIQUE` de BD es la barrera real. Ver H7 |
| PIN de 4 dígitos numéricos | Solo frontend (`maxLength={4}`, regex `\D` al tipear) | Backend no valida longitud mínima ni que sea numérico, solo el ancho de columna `NVARCHAR(4)` |
| Email con formato válido | Solo frontend (regex simple) | Backend no valida formato |
| Autorización de débito de $5.00 (checkbox) | Solo frontend, checkbox obligatorio | No se ve una validación equivalente server-side; el backend no recibe ni usa este campo, no queda registrado que el socio autorizó el débito |
| Datos cónyuge obligatorios si `maritalStatus` es CASADO/UNIÓN DE HECHO | Solo `ProfileView.tsx` (UI condicional) | No se valida server-side; y como el registro inicial siempre fija `estadoCivil: 'SOLTERO'` (H3), este bloque nunca aparece hasta que alguien corrija el estado civil manualmente |
| Campos PEPS/patrimonio/vivienda/discapacidad (SEPS/UAFE) | `ReportsView.tsx` + `update-report-profile` (fuera de este módulo) | Ausentes de `ProfileView.tsx` — ver Sección 2.2 punto 6 |

---

## 4. Qué queda en auditoría hoy (y qué no)

Tabla `dbo.AuditoriaProcesos` (helper `registrarAuditoriaProceso()`, server.js:226-246, ver
`db/sqlserver/23_auditoria_procesos.sql`), ya usada en créditos, caja, contabilidad y seguridad.

| Evento del módulo Socios | ¿Auditado en `AuditoriaProcesos` hoy? |
|---|---|
| Alta de socio (`POST /api/socios/registrar`) | **No** |
| Edición de perfil (`POST /api/socios/update-profile`) | **No** (además el endpoint nunca se invoca — Sección 2.2) |
| Edición de ficha ampliada / PEPS / patrimonio (`POST /api/socios/update-report-profile`) | **No** |
| Confirmación de email (`POST /api/socios/verificar-email`) | **No** |
| Búsqueda/consulta de socio | No aplica (solo lectura) |

Ninguno de los tres endpoints de escritura del módulo llama a `registrarAuditoriaProceso()` (confirmado
por revisión de las ~15 invocaciones existentes en `server.js`, ninguna cae en los rangos 748-925 ni
2191-2283). Para una cooperativa regulada por SEPS/UAFE, esto significa que un cambio en la condición de
PEP de un socio, o en su patrimonio declarado, **no deja rastro de quién lo hizo ni cuándo**, más allá de
que el valor cambió en la tabla `RegistroSocios` sin historial.

---

## 5. Hallazgos de seguridad e integridad (resumen para quien opera el sistema)

- **El PIN bancario de todos los socios activos puede leerse en texto plano sin iniciar sesión**, junto
  con cédula, dirección, teléfono, fecha de nacimiento, cónyuge, condición PEP y patrimonio declarado —
  con solo abrir la pantalla de login (o hacer una petición HTTP directa). Es el hallazgo más grave del
  sistema completo.
- **Cualquiera que sepa la cédula de un socio puede cambiar su email, teléfono, dirección, estado civil,
  o su declaración PEPS/patrimonio**, sin haber iniciado sesión como nadie.
- **El botón de guardar cambios de perfil del socio no guarda nada en el servidor** — el mensaje de éxito
  que ve el socio es falso.
- La fecha de nacimiento se guarda con la fecha del día del registro (un dato KYC crítico queda
  falsificado desde el alta) y el estado civil siempre queda "SOLTERO", salvo corrección manual posterior.
- El proceso de "verificación de email" envía un código pero nunca lo exige; el correo queda marcado como
  confirmado sin que el socio lo haya demostrado.
- Ni el alta de un socio ni la edición de su perfil quedan en la bitácora de auditoría estructurada que sí
  usan otros módulos del sistema.

Ver el reporte completo con severidad, ubicación exacta de línea y parches propuestos en la respuesta de
esta revisión (no reproducido aquí para mantener este manual enfocado en operación).

---

## 6. Recomendaciones operativas mientras se corrigen los hallazgos técnicos

1. **Restringir de inmediato el acceso de red** a `GET /api/socios/buscar` y a
   `POST /api/socios/update-profile` / `update-report-profile` solo a las estaciones internas de la
   cooperativa (firewall/VPN), mientras no exista `requireAuth` en estos endpoints.
2. **No confiar en el botón "Guardar cambios" de `ProfileView.tsx`** para actualizar datos de contacto o
   dirección de un socio hasta que el wiring al backend esté corregido: hoy hay que actualizar esos datos
   por otra vía (p. ej. `ReportsView.tsx`, que sí persiste) o directamente en base de datos.
3. **Corregir manualmente la fecha de nacimiento** de todo socio registrado por el flujo de autoservicio
   (`Register.tsx`) antes de usarla en cualquier reporte SEPS que dependa de edad.
4. **Verificar telefónicamente o en ventanilla** el correo electrónico de los socios registrados por
   autoservicio, dado que la confirmación por código no se aplica realmente hoy.
5. Cambiar el PIN de cualquier socio cuyo registro se sospeche pudo haber sido consultado por terceros
   mientras el hallazgo de exposición de `GET /api/socios/buscar` siga sin corregir.
