import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIR = 'C:/GUTT_SYSTEM/tmp/contrato_sas';
const SALIDA = 'C:/Users/DELL/Documents/TRABAJOS ADICIONALES/GUTT COMPANY SAS';

const logo = 'data:image/png;base64,' + fs.readFileSync(`${DIR}/logo_limpio.png`).toString('base64');

// selector del contenedor de página según el documento
const docs = [
  { src: 'contrato.html', out: 'Contrato_Socios_GUTT_COMPANY_SAS', pagina: '.page' },
  { src: 'membrete.html', out: 'Hoja_Membretada_GUTT_COMPANY', pagina: '.hoja' },
  { src: 'plan_gestion.html', out: 'Plan_Gestion_Proyecto_SISTEMA_FINANCIERO_EPS', pagina: '.hoja' },
];

for (const d of docs) {
  let h = fs.readFileSync(`${DIR}/${d.src}`, 'utf8');

  // el logo se inyecta una sola vez, en el CSS
  h = h.replace(/ style="background-image:url\('__LOGO__'\)"/g, '');
  if (h.includes("background-image:url('__LOGO__')")) {
    h = h.replace("background-image:url('__LOGO__')", `background-image:url("${logo}")`);
  } else {
    h = h.replace('.logo, .mark{ background-repeat:no-repeat;',
                  `.logo, .mark{ background-image:url("${logo}"); background-repeat:no-repeat;`);
  }
  if (h.includes('__LOGO__')) throw new Error(`${d.src}: quedaron marcadores __LOGO__`);
  fs.writeFileSync(`${DIR}/${d.out}.final.html`, h);

  // comprobación de desbordes antes de imprimir
  const probe = `<script>window.addEventListener("load",()=>{const r=[...document.querySelectorAll("${d.pagina}")]` +
    `.map((p,i)=>(p.scrollHeight>p.clientHeight+1?(i+1)+":DESBORDA+"+(p.scrollHeight-p.clientHeight):(i+1)+":ok"));` +
    `document.title="CHK "+r.join(" | ");});<\/script>`;
  fs.writeFileSync(`${DIR}/${d.out}.check.html`, h.replace('</body>', probe + '</body>'));
  const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--virtual-time-budget=8000',
    '--dump-dom', `file:///${DIR}/${d.out}.check.html`], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const chk = (dom.match(/<title>([^<]*)<\/title>/) || [])[1] || '(sin lectura)';
  console.log(`${d.out} → ${chk}`);

  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    `--print-to-pdf=${SALIDA}/${d.out}.pdf`, `file:///${DIR}/${d.out}.final.html`],
    { stdio: 'ignore' });
  fs.copyFileSync(`${DIR}/${d.src}`, `${SALIDA}/${d.out}.fuente.html`);
  console.log(`   PDF: ${(fs.statSync(`${SALIDA}/${d.out}.pdf`).size / 1024).toFixed(0)} KB`);
}

// el logo limpio también se entrega como recurso reutilizable
fs.copyFileSync(`${DIR}/logo_limpio.png`, `${SALIDA}/LOGO_GUTT_COMPANY_limpio.png`);
console.log('logo limpio copiado a la carpeta de entrega');
