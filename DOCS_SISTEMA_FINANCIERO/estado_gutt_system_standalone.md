# Estado real de GUTT_SYSTEM como sistema standalone (sin integración Informix)

Este documento reemplaza, para efectos de evaluar si el sistema está listo para vender,
al enfoque anterior de "GUTT_SYSTEM como puente hacia el core Informix del cliente".
La venta hoy es del sistema nuevo en sí mismo — base de datos `GUTT_SYSTEM` (SQL Server) +
`server.gutt_system.js` — no de una integración con el core legado de la cooperativa
compradora. Este documento evalúa el sistema bajo esa premisa.

Fecha de este corte: 2026-08-12.

---

## 1. Veredicto

**Actualización 2026-08-13:** desde la versión original de este documento se cerraron
los dos gaps funcionales más grandes — el frontend real SÍ se conecta a
`server.gutt_system.js` (confirmado en vivo, login + navegación + reportes con datos
reales), la reportería SEPS/cartera está reconstruida sobre datos propios (ya no
depende de Informix), y `CooperativaId` dejó de estar hardcodeado — esta instancia
sirve realmente a Crediapoyo, con su catálogo contable real de 1,103 cuentas cargado.

Sigue sin ser un "instalar y listo" sin más: falta despliegue real fuera del equipo de
desarrollo (decisión del usuario: proveedor/dominio/costo) y una pasada de QA
sistemática — todo lo probado hasta ahora fue ad-hoc, endpoint por endpoint, no una
suite formal. Pero ya no es "no viable" en el sentido de junio/agosto temprano — es
"falta empaquetarlo y probarlo a fondo", una distancia mucho más corta.

---

## 2. Lo que sí está terminado y verificado

### 2.1 Esquema de datos (`GUTT_SYSTEM`, SQL Server local)
- 30 tablas, multi-tenant desde el diseño (`CooperativaId` en cada tabla de negocio,
  con `CooperativaId=1` sembrado para Caja Patate) — a diferencia de `SQLGUTPATATE`, que
  no tiene ninguna noción de cliente múltiple.
- Contabilidad rediseñada con patrón cabecera + detalle real (`AsientosContables` +
  `DetalleAsiento`), verificado con partida doble cuadrada sobre datos de prueba
  ($6,484.89 = $6,484.89 tras limpiar residuos de pruebas viejas).
- FKs de consistencia multi-cooperativa forzadas a nivel de motor (`12_fix_consistencia_cooperativa.sql`)
  — se encontró y cerró una fuga real donde un crédito de una cooperativa podía quedar
  vinculado a un socio de otra.
- Scripts en `db/gutt_system/01_...` a `19_...`, todos re-ejecutables (`IF OBJECT_ID(...) IS NULL`).

### 2.2 Backend (`server.gutt_system.js`)
Seis módulos portados desde `server.js` y probados contra la base real, con datos de
prueba marcados (prefijos 777/888/999/test):

| Módulo | Endpoints | Estado |
|---|---|---|
| Socios | registrar, buscar, consultas, siguiente-numero, guardar-mapa, guardar-croquis | Probado end-to-end |
| Cuentas | admin/productos, ahorros/resumen, ahorros/movimientos, transferir | Probado |
| Créditos | loans (get/all/rates/crear/actualizar/aprobar/desembolsar/rechazar/anular/anular-pago/update-status), scoring, pay-dividend | Probado end-to-end, con partida doble corregida (ver §4) |
| Plazo Fijo | tasas, resumen, vencimientos, list, get, crear, liquidar, cancelar, renovar | Probado, con auth en escrituras (mejora real sobre el sistema viejo) |
| Caja | control (estado/abrir/cerrar/historial), transaccion, transaccion/anular | Probado, con auth en abrir/cerrar/transaccion (mejora real sobre el sistema viejo) |
| Contabilidad | libro-diario, balance-comprobacion | Probado (solo lectura) |
| Auth/Seguridad | login.php, update_password, users/update_printer, get_profile.php | Probado |

### 2.3 Seguridad
7 endpoints que estaban sin autenticación (heredados del `server.js` viejo, replicados
al portar) se cerraron el 2026-08-12: `socios/buscar`, `socios/consultas`,
`admin/productos` (GET/POST), `socios/transferir`, `socios/loans` (crear), y
`socios/loans/pay-dividend` — este último además dejó de atribuir movimientos a un
usuario `'caja'` fijo y ahora usa el usuario real de la sesión.

---

## 3. Lo que falta, en orden de bloqueo real

1. **Frontend conectado al sistema nuevo — bloqueante crítico.** Ningún componente
   `.tsx` habla con `server.gutt_system.js`; toda la UI actual sigue apuntando al
   `server.js` viejo (atado a `SQLGUTPATATE`/Informix). Hoy no hay ninguna pantalla que
   un cliente pueda ver funcionando del sistema nuevo. Sin esto, no hay nada que
   demostrar ni entregar.
2. **Reportería (`/api/reportes/*`, reportes SEPS en PDF) sin portar** — y no se pueden
   simplemente "portar": el sistema viejo los resolvía consultando Informix en vivo.
   Sin Informix de por medio, hay que reconstruirlos desde cero sobre datos propios de
   `GUTT_SYSTEM`. Es trabajo nuevo, no migración.
3. **Flujos de autoservicio del socio no portados**: `socio-login` (login de socio
   distinto del login de personal), `verificar-email`, `aceptar-terminos`,
   `update-report-profile`.
4. **Sin despliegue real** — sigue en la instancia SQL Server local del equipo de
   desarrollo, sin servidor dedicado, sin dominio, sin respaldo automatizado.
5. **`ManualEntry.tsx` (asiento manual) sigue sin backend real** — ni en el sistema
   viejo ni en el nuevo. Decisión pendiente del usuario: implementarlo o retirarlo de
   la UI.

---

## 4. Bugs reales encontrados y corregidos durante la verificación

No estaban en el plan original — aparecieron al probar el sistema de punta a punta, y
quedan documentados porque habrían llegado a un cliente si no se hubieran probado:

- **Créditos**: pago de cuota en efectivo debitaba dos veces (Caja + cuenta de ahorros
  del socio por el mismo monto); el asiento de pago de cuota no acreditaba seguro de
  desgravamen/SOLCA/gastos administrativos, dejando parte del cobro sin contrapartida;
  códigos contables con formato punteado que violaban el CHECK de formato agregado en
  paralelo por otro frente de trabajo.
- **Plazo Fijo**: cancelar un DPF debitaba el interés neto en vez del bruto (descuadraba
  por el monto de la penalización); renovar cerraba el depósito viejo sin reabrir el
  capital en el nuevo; bug de redondeo de centavos que podía descuadrar cualquier asiento
  por $0.01.
- **Esquema**: `Cuentas.ProductoId` no tenía FK real a `ProductosFinancieros` (quedó
  como "referencia lógica" en el primer diseño); huecos de auth ya listados en §2.3.

Ninguno de estos bugs habría aparecido con una revisión solo de esquema — todos salieron
de correr el flujo real contra la base real.

---

## 5. Próximos pasos recomendados, en orden

1. Adaptar el frontend (o al menos un subconjunto demostrable: Socios + Cuentas + Créditos)
   para hablar con `server.gutt_system.js` en vez del `server.js` viejo. Es el bloqueante
   real para tener algo vendible.
2. Reconstruir la reportería mínima demostrable (cartera de crédito, balance de
   comprobación) sobre datos propios de `GUTT_SYSTEM`.
3. Decidir y resolver `ManualEntry.tsx`.
4. Recién ahí: manuales de usuario — no antes, porque documentarían una interfaz que
   todavía no existe.
5. Despliegue real (dominio, servidor dedicado, respaldo) — coordinar con el trabajo ya
   existente de `gutt-system-operaciones`.
