# Manuales de funcionamiento — GUTT SYSTEM

Esta carpeta contiene los manuales operativos del sistema, dirigidos al usuario final (cajero, asesor
de crédito, contador, administrador, socio), **no** documentación técnica de desarrollador. La
documentación técnica de la base de datos legacy Informix vive en `db/informix/modulos/`; el detalle
de scripts SQL Server vive en `db/sqlserver/`.

Cada manual describe, para su módulo: qué es, quién lo usa (rol), cómo se opera paso a paso, qué
validaciones/reglas de negocio aplica, y cómo queda registrado en auditoría (`dbo.AuditoriaProcesos`,
ver `db/sqlserver/23_auditoria_procesos.sql`).

## Índice de módulos

| Manual | Módulo | Estado |
|---|---|---|
| [01_SOCIOS.md](01_SOCIOS.md) | Socios / Clientes | Pendiente |
| [02_CREDITOS.md](02_CREDITOS.md) | Créditos (solicitud, aprobación, desembolso, cobranza) | Pendiente |
| [03_AHORROS.md](03_AHORROS.md) | Ahorros a la vista | Pendiente |
| [04_PLAZO_FIJO.md](04_PLAZO_FIJO.md) | Depósitos a Plazo Fijo (DPF) | Pendiente |
| [05_CONTABILIDAD.md](05_CONTABILIDAD.md) | Contabilidad / Libro Diario | Pendiente |
| [06_CAJA_TELLER.md](06_CAJA_TELLER.md) | Caja / Ventanilla (Teller) | Pendiente |
| [07_REPORTES_SEPS.md](07_REPORTES_SEPS.md) | Reportes regulatorios SEPS | Pendiente |
| [08_ADMIN_SEGURIDAD.md](08_ADMIN_SEGURIDAD.md) | Administración / Seguridad / Usuarios | Pendiente |
| [09_CARTERA_CREDITO.md](09_CARTERA_CREDITO.md) | Cartera de Crédito (reporte ejecutivo vigente/vencido/demandado/castigado) | Completo |
| [10_PLAZO_FIJO.md](10_PLAZO_FIJO.md) | Cartera de Plazo Fijo (reporte ejecutivo vigente/vencida/cancelada, distinto de `04_PLAZO_FIJO.md` operativo) | Completo |
| [11_UTILIDAD_RENTABILIDAD.md](11_UTILIDAD_RENTABILIDAD.md) | Utilidad y Rentabilidad (CUC-SEPS, ROA/ROE aproximados) | Completo |

Se completan progresivamente conforme cada módulo se revisa (ver plan de trabajo activo).
