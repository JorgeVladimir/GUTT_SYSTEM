---
name: tecnifin-tablero
description: Actualiza el Tablero de Avances del proyecto TECNIFIN (artifact compartido con base de datos propia). Esquema de las colecciones, como republicar sin romperlo, como verificarlo sin capturas y como pasarlo despues al subdominio. Usala cada vez que haya que marcar avance, cambiar fechas, desembolsos, hitos o el texto del tablero.
---

# Tablero de Avances (artifact)

URL: `https://claude.ai/artifact/BWxQdZqmkFvTQFusVJeE1R` (misma URL siempre). Capacidades declaradas: `{db:{}, artifact:{}}`
(declarar las dos: pasar solo una borra la otra). Fuente local historica: `C:\GUTT_SYSTEM\tmp\contrato_sas\` (`tablero_avance.html`,
`dashboard.html`, `scope_css.mjs`, `sonda_tablero.mjs`).

## Que cambia con datos y que cambia con HTML
- **Solo ESTADO vive en la base (sin republicar):** `estado`, `acta`, `nota`, `ejecutado`, `hechos` de un hito. Usar `ArtifactData`
  con `update`/`set` e `if_version`; varias escrituras juntas con `batch`. Lo ve todo el mundo al instante.
- **Todo lo que se MUESTRA sale de las semillas del HTML** (`FASES_SEED`, `MODULOS_SEED`, `TRACKS_SEED`, `HITOS_SEED`, `DESEMB_SEED`):
  nombres, fechas, montos, rangos, textos, lista de filas. Escribir `meta`, `nombre` o `fecha` en la base **no cambia nada en pantalla**
  (error real del 20-sep: se actualizo `tracks/trackD` en la base y no se veia). Para cambiarlos hay que republicar el HTML.
- **Republicar:** leer el artifact vivo **completo** (`Artifact` action `read`, luego `Read` de TODAS las lineas del archivo guardado;
  son ~2.500), editar una copia local y publicar con `url`. Una publicacion sin haber leido la version viva es rechazada.
  Receta reproducible: `C:\GUTT_SYSTEM\tmp\contrato_sas\construir_tablero_v9.mjs` (parte de `tablero_vivo_*.html`, reemplaza por marcadores
  unicos con `uno()` y `entre()`) y su sonda `sonda_tablero_v9.mjs`. Ojo: en la sonda, insertar antes del **ultimo** `</body>` (el lienzo
  movil trae ese texto dentro de una cadena).
- El estado del lienzo movil vive **dentro del HTML** (`<script id="estado-lienzo">`): al republicar se conserva porque se parte de la
  version viva, nunca de una copia vieja.
- Con ids nuevos en una coleccion: borrar los documentos viejos con `ArtifactData` (`if_version`); la pantalla itera las semillas y los ignora.

## Colecciones (`ArtifactData`)
| Coleccion | Documento | Campos |
|---|---|---|
| `fases` | `f1`..`f7` | `numero, nombre, meses, entrega (ISO), estado, acta, nota` |
| `modulos` | `m0`..`m7` | `numero, nombre, responsable, endpoints, lineas, params, rango, dep, etapa, estado, nota` |
| `desembolsos` | `d1`.. | `numero, etiqueta, fecha (ISO), monto, tipo, ejecutado` + `categoria` (desarrolladores / christian / dominio / servidor / otros) |
| `tracks` | `trackB/C/D` | `nombre, estado, meta, nota, responsable` |
| `hitos` (nueva) | `h1`.. | `nombre, meta (ISO), estado, checklist[{item, hecho}], nota` |

Estados de fases y modulos: `pendiente -> en-curso -> aceptada -> observada`. Tracks: `sin-dimensionar -> dimensionando -> dimensionado`.

## Reglas que ya costaron caro
1. **Nunca sembrar avance que nadie verifico**: todo entra como `pendiente` / `ejecutado:false`; lo marca el comite.
2. **Ningun total hardcodeado** en el script: se calcula de las colecciones (antes `TOTAL = 24569.45` quedo obsoleto).
3. Paletas: el tablero usa la de gobierno (navy `#1F3864`, cian `#00BCD4`); el panel de diseno movil usa la del producto (`#002B67`/`#03CED4`).
   Al fusionar paneles, prefijar cada selector con `#panel...` (`scope_css.mjs`) y renombrar los `id` repetidos.
4. Un fragmento sin `</body>` rompe una sonda que inserta antes de `</body>`: envolverlo en un HTML completo para probar.
5. Cambiar datos que otros editan: pasar `if_version`; si falla, releer y rehacer, no sobrescribir.

## Verificacion (sin capturas)
- `get_page_text` / `find` / `read_page` sobre el DOM; nunca capturas salvo pedido expreso.
- Sonda en Chrome headless: sin scroll horizontal a 1280 y 400 px en ambos temas; `getComputedStyle(...).getPropertyValue('--navy')` por panel
  sin fuga entre paneles.
- Releer las colecciones con `ArtifactData` y comprobar los totales.

## Paso al subdominio
El script debe hablar con los datos por una sola capa (hoy `db` del artifact) para cambiarla por un endpoint cuando exista
`tablero.tecnifin.com` (privado). No se hace hasta contratar dominio y hosting.
