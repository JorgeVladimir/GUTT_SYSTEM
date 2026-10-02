import fs from 'node:fs';
const DIR = 'C:/GUTT_SYSTEM/tmp/contrato_sas';
let h = fs.readFileSync(`${DIR}/tablero_avance.html`, 'utf8');
const probe = `<script>window.addEventListener("load",()=>{setTimeout(()=>{
  const fases = document.querySelectorAll("#listaFases .fase").length;
  const des = document.querySelectorAll("#listaDesembolsos .des").length;
  const scrollX = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  document.title = "SONDA|fases="+fases+"|des="+des+"|scrollX="+(scrollX?"SI":"no")+"|numFases="+document.getElementById('numFases').textContent+"|numPresu="+document.getElementById('numPresu').textContent;
},600)});<\/script>`;
fs.writeFileSync(`${DIR}/tablero.check.html`,
  '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<style>body{margin:0;background:#faf9f5}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' +
  h + probe + '</body></html>');
