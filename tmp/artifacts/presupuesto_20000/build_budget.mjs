import fs from "node:fs/promises";
import fsSync from "node:fs";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/GUTT_SYSTEM/outputs/presupuesto_20000";
const previewDir = "C:/GUTT_SYSTEM/tmp/artifacts/presupuesto_20000/previews";
const font = "Arial";
const navy = "#17365D";
const blue = "#2F75B5";
const lightBlue = "#D9EAF7";
const green = "#548235";
const lightGreen = "#E2F0D9";
const amber = "#FFF2CC";
const lightGray = "#F2F2F2";
const border = "#C9D2DC";
const darkText = "#1F2937";
const inputBlue = "#0000FF";

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const workbook = Workbook.create();
const budget = workbook.worksheets.add("Presupuesto");
const sources = workbook.worksheets.add("Fuentes");

budget.showGridLines = false;
sources.showGridLines = false;
budget.tabColor = navy;
sources.tabColor = blue;

// Fuentes y supuestos editables
sources.getRange("A2:H2").values = [["Supuestos del presupuesto", "Valor", "Unidad", "Criterio", "Fuente", "Fecha de revisión", "Estado", "Observación"]];
sources.getRange("A3:H10").values = [
  ["Tope del presupuesto", 20000, "USD", "Límite solicitado", "Usuario", new Date(2026, 8, 10), "Vigente", "Incluye impuestos y servicios indicados"],
  ["FODINFA", 0.005, "% sobre CIF", "Estimación de importación", "SENAE", new Date(2026, 8, 10), "Vigente", "Confirmar subpartida con agente de aduana"],
  ["ISD", 0.05, "% sobre pago exterior", "Tarifa general 2026", "SRI", new Date(2026, 8, 10), "Vigente", "Puede variar si aplica beneficio sectorial"],
  ["IVA importación", 0.15, "%", "Escenario conservador", "SENAE", new Date(2026, 8, 10), "Vigente", "SENAE indica 15% para equipos de computación"],
  ["Flete y seguro estimado", 520, "USD", "Reserva logística", "Antecedente de proforma", new Date(2026, 8, 10), "Por cotizar", "Miami a Ecuador"],
  ["Agente y manejo aduanero", 480, "USD", "Reserva logística", "Antecedente de proforma", new Date(2026, 8, 10), "Por cotizar", "No incluye almacenaje extraordinario"],
  ["Tope FOB Dell PowerEdge R360", 11540, "USD", "Configuración sin licencias ni GPU", "Dell + NewServerLife", new Date(2026, 8, 10), "Solicitar cotización", "Negociar como precio máximo para mantener el total bajo USD 20.000"],
  ["Honorario mensual por programador", 700, "USD / mes", "Trabajo virtual", "Usuario", new Date(2026, 8, 10), "Acordado", "El presupuesto inicial incluye el primer mes para dos programadores"],
];

sources.getRange("A12:I12").values = [["ID", "Proveedor / fuente", "Producto o dato", "Precio publicado", "Impuestos", "Disponibilidad", "Uso en presupuesto", "Fecha", "URL / referencia"]];
sources.getRange("A13:I22").values = [
  ["S01", "Dell oficial", "PowerEdge R360 base: Xeon E-2414, 32 GB, 2 TB HDD, 1 año soporte", 6656.03, "Antes de impuestos y envío", "Publicado", "Referencia inferior, no configuración final", new Date(2026, 8, 10), "https://www.dell.com/en-us/shop/ipovw/poweredge-r360"],
  ["S02", "NewServerLife", "Dell PowerEdge R660 10SFF reacondicionado", 12948, "Antes de importación", "Precio inicial", "Comparativo; descartado por presupuesto", new Date(2026, 8, 10), "https://newserverlife.com/configure/dell-poweredge-r660-10sff/"],
  ["S03", "NewServerLife", "R360 8SFF: E-2488, 64 GB, H755, SSD, 10GbE, GPU P4, Windows Server, 2 años", 14792, "FOB", "Cotización vencida 05-sep-2026", "Base para pedir reconfiguración sin GPU ni licencia", new Date(2026, 7, 22), "C:/Users/DELL/Downloads/make (1).pdf - ref. 082226-276986"],
  ["S04", "IDC Mayoristas", "UPS CDP UPO11-3RT online 3000VA / 2700W", 301.97, "Incluye IVA", "Agotado en consulta", "Reserva al último precio visible", new Date(2026, 8, 10), "https://www.idcmayoristas.com/producto/ups-cdp-upo11-3-3000va-2700w-e-s-120v-monofasico-007886-laptops-quito/"],
  ["S05", "IDC Mayoristas", "Switch TP-Link JetStream 24 GE PoE+ y 4 SFP+ 10Gb", 460.69, "Incluye IVA", "En tránsito", "Seleccionado", new Date(2026, 8, 10), "https://www.idcmayoristas.com/producto/tp-link-switch-tplink-jetstream-24-puertos-gigabit-tp-tl-sg3428xmp/"],
  ["S06", "IDC Mayoristas", "Patch panel Newlink Cat6, 24 puertos", 69.63, "Incluye IVA", "En tránsito", "Seleccionado", new Date(2026, 8, 10), "https://www.idcmayoristas.com/producto/generico-patch-panel-cat6-24-puertos-newlink-nl-ppcat624pt/"],
  ["S07", "IDC Mayoristas", "Disco WD Red Pro NAS 8 TB", 388.03, "Incluye IVA", "En tránsito", "2 unidades para RAID 1", new Date(2026, 8, 10), "https://www.idcmayoristas.com/producto/disco-duro-western-digital-8tb-sata-7200rpm-3-5inch-wd8005ffbx-tcws/"],
  ["S08", "Proforma ECLOF", "Router MikroTik RB4011iGS+RM", 399, "Más IVA 15%", "Precio histórico", "Seleccionado con IVA", new Date(2026, 1, 2), "C:/Users/DELL/Downloads/PROFORMA DE CABLEADO ESTRUCTURAL/PRESUPUESTO ECLOF 02022026.pdf"],
  ["S09", "Proforma ECLOF", "NAS Synology DS223j, 2 bahías, sin discos", 265.65, "Más IVA 15%", "Precio histórico", "Seleccionado con IVA", new Date(2026, 1, 2), "C:/Users/DELL/Downloads/PROFORMA DE CABLEADO ESTRUCTURAL/PRESUPUESTO ECLOF 02022026.pdf"],
  ["S10", "SENAE / SRI", "Tributos de importación: FODINFA 0,5%, IVA 15%, ISD general 5%", null, "No aplica", "Normativa consultada", "Cálculo de nacionalización", new Date(2026, 8, 10), "https://www.aduana.gob.ec/servicio-al-ciudadano/para-importar/ | https://www.sri.gob.ec/impuesto-a-la-salida-de-divisas-isd"],
];

// Presupuesto principal
budget.getRange("A2:H2").values = [["Presupuesto de infraestructura GUTT_SYSTEM + GUTT_MOVIL", null, null, null, null, null, null, null]];
budget.getRange("A3:H3").values = [["Escenario de inversión inicial en Ecuador. Valores en USD. Fecha base: 10-sep-2026.", null, null, null, null, null, null, null]];

budget.getRange("A5:H5").values = [["TOTAL ESTIMADO", null, "TOPE", null, "MARGEN", null, "SERVIDOR / TOTAL", null]];
budget.getRange("A6").formulas = [["=F33"]];
budget.getRange("C6").formulas = [["=F34"]];
budget.getRange("E6").formulas = [["=F35"]];
budget.getRange("G6").formulas = [["=F18/F33"]];
budget.getRange("A8:H8").values = [["Resultado", null, null, null, null, null, null, null]];
budget.getRange("A9").formulas = [["=F36"]];

budget.getRange("A11:H11").values = [["Rubro", "Concepto", "Especificación / alcance", "Cant.", "Precio unitario", "Subtotal", "Base del valor", "Proveedor / fuente"]];
budget.getRange("A12:H17").values = [
  ["Servidor", "Dell PowerEdge R360", "E-2488, 64 GB ECC, PERC H755, 2x960 GB SSD RAID 1, 2x1,92 TB SSD RAID 1, 10GbE, doble PSU, iDRAC, rieles y garantía; sin GPU ni software", 1, null, null, "Tope FOB a negociar", "Dell / NewServerLife"],
  ["Servidor", "Flete y seguro", "Transporte Miami-Ecuador y seguro de carga", 1, null, null, "Reserva", "Agente de carga"],
  ["Servidor", "FODINFA", "0,5% aplicado sobre valor CIF estimado", 1, null, null, "Fórmula", "SENAE"],
  ["Servidor", "ISD", "5% sobre el pago al exterior", 1, null, null, "Fórmula", "SRI"],
  ["Servidor", "Agente y manejo aduanero", "Trámite, aforo y manejo ordinario", 1, null, null, "Reserva", "Agente de aduana"],
  ["Servidor", "IVA de importación", "15% sobre CIF + FODINFA, escenario conservador", 1, null, null, "Fórmula", "SENAE"],
];
budget.getRange("E12:E17").formulas = [
  ["='Fuentes'!B9"],
  ["='Fuentes'!B7"],
  ["=ROUND((F12+F13)*'Fuentes'!B4,2)"],
  ["=F12*'Fuentes'!B5"],
  ["='Fuentes'!B8"],
  ["=ROUND((F12+F13+F14)*'Fuentes'!B6+0.000001,2)"],
];
budget.getRange("F12:F17").formulas = [["=D12*E12"], ["=D13*E13"], ["=E14"], ["=E15"], ["=D16*E16"], ["=E17"]];
budget.getRange("A18:H18").values = [["Subtotal servidor puesto en Ecuador", null, null, null, null, null, null, null]];
budget.getRange("F18").formulas = [["=SUM(F12:F17)"]];

budget.getRange("A20:H27").values = [
  ["Infraestructura", "Router MikroTik RB4011", "Router/firewall físico para WAN, VPN y segmentación", 1, 458.85, null, "Precio histórico + IVA", "Proforma ECLOF"],
  ["Infraestructura", "Switch TP-Link TL-SG3428XMP", "24 puertos Gigabit PoE+ y 4 SFP+ 10Gb, administrable", 1, 460.69, null, "Precio web con IVA", "IDC Mayoristas"],
  ["Infraestructura", "UPS online CDP 3000VA", "Doble conversión, 2700W, formato rack/torre", 1, 301.97, null, "Último precio visible con IVA", "IDC Mayoristas"],
  ["Infraestructura", "Rack de piso compatible", "Mínimo 12U y 800 mm de profundidad útil, ventilado", 1, 450, null, "Reserva local", "Cotización pendiente"],
  ["Infraestructura", "Patch panel Cat6 24 puertos", "Terminación y ordenamiento de red", 1, 69.63, null, "Precio web con IVA", "IDC Mayoristas"],
  ["Infraestructura", "NAS Synology DS223j", "Chasis de respaldo de 2 bahías", 1, 305.50, null, "Precio histórico + IVA", "Proforma ECLOF"],
  ["Infraestructura", "WD Red Pro NAS 8 TB", "Dos discos en RAID 1 para respaldos locales", 2, 388.03, null, "Precio web con IVA", "IDC Mayoristas"],
  ["Infraestructura", "PDU, patch cords y consumibles", "Alimentación y conexión dentro del rack", 1, 180, null, "Reserva local", "Cotización pendiente"],
];
budget.getRange("F20:F27").formulas = [["=D20*E20"],["=D21*E21"],["=D22*E22"],["=D23*E23"],["=D24*E24"],["=D25*E25"],["=D26*E26"],["=D27*E27"]];
budget.getRange("A28:H28").values = [["Subtotal infraestructura", null, null, null, null, null, null, null]];
budget.getRange("F28").formulas = [["=SUM(F20:F27)"]];

budget.getRange("A30:H30").values = [["Servicios", "Primer mes de dos programadores virtuales", "Instalación, hardening, despliegue, CI/CD, respaldos, monitoreo, pruebas y entrega técnica. USD 700 mensuales por persona", 2, null, null, "Honorario mensual", "Equipo GUTT"]];
budget.getRange("E30").formulas = [["='Fuentes'!B10"]];
budget.getRange("F30").formulas = [["=D30*E30"]];
budget.getRange("A31:H31").values = [["Subtotal servicios profesionales", null, null, null, null, null, null, null]];
budget.getRange("F31").formulas = [["=F30"]];

budget.getRange("A33:E36").values = [
  ["TOTAL ESTIMADO", null, null, null, null],
  ["TOPE SOLICITADO", null, null, null, null],
  ["MARGEN DISPONIBLE", null, null, null, null],
  ["ESTADO", null, null, null, null],
];
budget.getRange("F33").formulas = [["=F18+F28+F31"]];
budget.getRange("F34").formulas = [["='Fuentes'!B3"]];
budget.getRange("F35").formulas = [["=F34-F33"]];
budget.getRange("F36").formulas = [["=IF(F33<=F34,\"DENTRO DEL TOPE\",\"EXCEDE EL TOPE\")"]];

budget.getRange("A39:H39").values = [["Validación de la selección del servidor", null, null, null, null, null, null, null]];
budget.getRange("A40:H40").values = [["Opción", "Precio de referencia", "Configuración y condición", null, "Impacto", "Decisión", "Fuente", "Nota"]];
budget.getRange("A41:H44").values = [
  ["Dell PowerEdge R360 base", 6656.03, "Nuevo. E-2414, 32 GB, 2 TB HDD y 1 año de soporte", null, "Requiere ampliar RAM, RAID, SSD y soporte", "Punto de partida", "Dell oficial", "No usar tal cual en producción"],
  ["R360 cotizado 22-ago-2026", 14792, "Nuevo / CTO. Incluye GPU P4, Windows Server, 64 GB y 7,68 TB brutos SSD", null, "Supera el espacio disponible al nacionalizar", "Reconfigurar", "NewServerLife", "Cotización vencida"],
  ["R360 recomendado", 11540, "Nuevo / CTO. Sin GPU ni licencias; almacenamiento ajustado a 3,84 TB brutos", null, "Permite cerrar el proyecto cerca de USD 20.000", "Seleccionado", "Tope de negociación", "Solicitar nueva cotización"],
  ["R660 10SFF del enlace", 12948, "Reacondicionado. Precio inicial antes de CPU, RAM y almacenamiento final", null, "Eleva importación y deja poco margen para red y servicios", "Descartado", "NewServerLife", "Útil si aumenta el presupuesto"],
];
budget.mergeCells("C40:D40");
budget.mergeCells("C41:D41");
budget.mergeCells("C42:D42");
budget.mergeCells("C43:D43");
budget.mergeCells("C44:D44");

budget.getRange("A47:H47").values = [["Exclusiones y condiciones", null, null, null, null, null, null, null]];
budget.getRange("A48:H51").values = [
  ["1", "Licencias", "No se incluyen Windows Server, SQL Server, CAL, antivirus comercial ni suscripciones cloud. El cliente debe aportar licencias válidas o aprobar una alternativa tecnológica.", null, null, null, null, null],
  ["2", "Precios por confirmar", "El R360 se presupuestó con un tope FOB de USD 11.540. UPS, rack y referencias históricas deben recotizarse antes de comprar.", null, null, null, null, null],
  ["3", "Importación", "Los tributos se estimaron con FODINFA 0,5%, ISD 5% e IVA 15%. La liquidación final depende de subpartida, CIF y gastos reales.", null, null, null, null, null],
  ["4", "Operación recurrente", "Incluye únicamente el primer mes de dos programadores virtuales a USD 700 por persona. Los meses posteriores, internet, energía, climatización, monitoreo 24/7 y renovación de garantías son costos recurrentes.", null, null, null, null, null],
];

// Formato común
for (const sheet of [budget, sources]) {
  const used = sheet.getUsedRange();
  used.format.font = { name: font, size: 10, color: darkText };
  used.format.verticalAlignment = "center";
}

budget.getRange("A2:H2").format.font = { name: font, size: 16, bold: true, color: navy };
budget.getRange("A3:H3").format.font = { name: font, size: 10, italic: true, color: "#5B6573" };
budget.getRange("A2:H2").format.rowHeight = 26;
budget.getRange("A3:H3").format.rowHeight = 20;

for (const range of ["A5:B5", "C5:D5", "E5:F5", "G5:H5"]) {
  budget.getRange(range).format = { fill: navy, font: { name: font, size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center" };
}
for (const range of ["A6:B6", "C6:D6", "E6:F6", "G6:H6"]) {
  budget.getRange(range).format = { fill: lightBlue, font: { name: font, size: 14, bold: true, color: navy }, horizontalAlignment: "center", verticalAlignment: "center", borders: { preset: "outside", style: "thin", color: border } };
}
budget.getRange("A6").format.numberFormat = "$#,##0.00;[Red]($#,##0.00);-";
budget.getRange("C6").format.numberFormat = "$#,##0.00;[Red]($#,##0.00);-";
budget.getRange("E6").format.numberFormat = "$#,##0.00;[Red]($#,##0.00);-";
budget.getRange("G6").format.numberFormat = "0.0%";
budget.getRange("A8:H8").format = { fill: lightGray, font: { name: font, size: 10, bold: true, color: navy }, borders: { preset: "outside", style: "thin", color: border } };
budget.getRange("A9:H9").format = { fill: lightGreen, font: { name: font, size: 12, bold: true, color: green }, horizontalAlignment: "center", borders: { preset: "outside", style: "medium", color: green } };

for (const range of ["A11:H11", "A40:H40"]) {
  budget.getRange(range).format = { fill: navy, font: { name: font, size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", wrapText: true, borders: { preset: "inside", style: "thin", color: "#FFFFFF" } };
}
for (const range of ["A18:H18", "A28:H28", "A31:H31", "A39:H39", "A47:H47"]) {
  budget.getRange(range).format = { fill: lightBlue, font: { name: font, size: 10, bold: true, color: navy }, borders: { preset: "outside", style: "thin", color: blue } };
}
budget.getRange("A33:F36").format = { fill: lightGray, font: { name: font, size: 11, bold: true, color: darkText }, borders: { preset: "outside", style: "thin", color: border } };
budget.getRange("A33:F33").format.fill = navy;
budget.getRange("A33:F33").format.font = { name: font, size: 12, bold: true, color: "#FFFFFF" };
budget.getRange("F12:F35").format.numberFormat = "$#,##0.00;[Red]($#,##0.00);-";
budget.getRange("E12:E30").format.numberFormat = "$#,##0.00;[Red]($#,##0.00);-";
budget.getRange("B41:B44").format.numberFormat = "$#,##0.00";
budget.getRange("D12:D30").format.numberFormat = "0";
budget.getRange("D12:F35").format.horizontalAlignment = "right";
budget.getRange("A11:H36").format.borders = { insideHorizontal: { style: "thin", color: "#E3E8EE" }, bottom: { style: "thin", color: border } };
budget.getRange("A12:H36").format.wrapText = true;
budget.getRange("A41:H44").format.wrapText = true;
budget.getRange("A48:H51").format.wrapText = true;
budget.getRange("A48:B51").format.font = { name: font, size: 10, bold: true, color: navy };
budget.getRange("C48:C51").format.font = { name: font, size: 10, color: darkText };
budget.getRange("A36:F36").conditionalFormats.addCustom("=$F$36=\"EXCEDE EL TOPE\"", { fill: "#FCE8E6", font: { color: "#C00000", bold: true } });
budget.getRange("A36:F36").conditionalFormats.addCustom("=$F$36=\"DENTRO DEL TOPE\"", { fill: lightGreen, font: { color: green, bold: true } });
budget.getRange("E6:F6").conditionalFormats.addCustom("=$E$6<0", { fill: "#FCE8E6", font: { color: "#C00000", bold: true } });

// Anchos y alturas del presupuesto
budget.getRange("A1:A55").format.columnWidth = 19;
budget.getRange("B1:B55").format.columnWidth = 27;
budget.getRange("C1:C55").format.columnWidth = 58;
budget.getRange("D1:D55").format.columnWidth = 8;
budget.getRange("E1:F55").format.columnWidth = 16;
budget.getRange("G1:G55").format.columnWidth = 23;
budget.getRange("H1:H55").format.columnWidth = 22;
budget.getRange("A11:H11").format.rowHeight = 34;
budget.getRange("A12:H17").format.rowHeight = 44;
budget.getRange("A20:H27").format.rowHeight = 34;
budget.getRange("A30:H30").format.rowHeight = 40;
budget.getRange("A41:H44").format.rowHeight = 46;
budget.getRange("A48:H51").format.rowHeight = 44;

// Formato de Fuentes
sources.getRange("A2:H2").format = { fill: navy, font: { name: font, size: 11, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", wrapText: true };
sources.getRange("A12:I12").format = { fill: navy, font: { name: font, size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", wrapText: true };
sources.getRange("A3:H10").format.borders = { insideHorizontal: { style: "thin", color: "#E3E8EE" }, bottom: { style: "thin", color: border } };
sources.getRange("A13:I22").format.borders = { insideHorizontal: { style: "thin", color: "#E3E8EE" }, bottom: { style: "thin", color: border } };
sources.getRange("B3:B10").format.font = { name: font, size: 10, color: inputBlue };
sources.getRange("B3:B10").format.fill = amber;
sources.getRange("B3").format.numberFormat = "$#,##0.00";
sources.getRange("B4:B6").format.numberFormat = "0.0%";
sources.getRange("B7:B10").format.numberFormat = "$#,##0.00";
sources.getRange("D13:D22").format.numberFormat = "$#,##0.00";
sources.getRange("F3:F10").format.numberFormat = "dd-mmm-yyyy";
sources.getRange("H13:H22").format.numberFormat = "dd-mmm-yyyy";
sources.getRange("A3:I22").format.wrapText = true;
sources.getRange("I13:I22").format.font = { name: font, size: 9, color: blue };
sources.getRange("A1:A24").format.columnWidth = 15;
sources.getRange("B1:B24").format.columnWidth = 25;
sources.getRange("C1:C24").format.columnWidth = 48;
sources.getRange("D1:D24").format.columnWidth = 17;
sources.getRange("E1:E24").format.columnWidth = 23;
sources.getRange("F1:F24").format.columnWidth = 20;
sources.getRange("G1:G24").format.columnWidth = 30;
sources.getRange("H1:H24").format.columnWidth = 15;
sources.getRange("I1:I24").format.columnWidth = 70;
sources.getRange("A12:I12").format.rowHeight = 32;
sources.getRange("A13:I22").format.rowHeight = 48;
sources.freezePanes.freezeRows(12);

workbook.recalculate();

const budgetCheck = await workbook.inspect({ kind: "table", range: "Presupuesto!A1:H51", include: "values,formulas", tableMaxRows: 55, tableMaxCols: 8, maxChars: 18000 });
const sourceCheck = await workbook.inspect({ kind: "table", range: "Fuentes!A2:I22", include: "values,formulas", tableMaxRows: 25, tableMaxCols: 9, maxChars: 14000 });
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 200 }, summary: "final formula error scan", maxChars: 5000 });

console.log(budgetCheck.ndjson);
console.log(sourceCheck.ndjson);
console.log(errors.ndjson);

const budgetPreview = await workbook.render({ sheetName: "Presupuesto", range: "A1:H51", scale: 1, format: "png" });
fsSync.writeFileSync(`${previewDir}/presupuesto.png`, Buffer.from(await budgetPreview.arrayBuffer()));
const sourcePreview = await workbook.render({ sheetName: "Fuentes", range: "A1:I22", scale: 1, format: "png" });
fsSync.writeFileSync(`${previewDir}/fuentes.png`, Buffer.from(await sourcePreview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/Presupuesto_GUTT_20000_sin_licencias.xlsx`);

console.log(JSON.stringify({
  output: `${outputDir}/Presupuesto_GUTT_20000_sin_licencias.xlsx`,
  previews: [`${previewDir}/presupuesto.png`, `${previewDir}/fuentes.png`],
  totalExpected: 19398.05,
}, null, 2));
