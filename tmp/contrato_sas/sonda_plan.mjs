import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIR = 'C:/GUTT_SYSTEM/tmp/contrato_sas';
let h = fs.readFileSync(`${DIR}/plan_gestion.html`, 'utf8');
h = h.replace(/'__LOGO__'/g, `'${DIR}/logo_limpio.png'`);
const probe = `<script>window.addEventListener("load",()=>{setTimeout(()=>{
  const r=[...document.querySelectorAll(".hoja")].map((h,i)=>{
    const inner = h.querySelector(".cuerpo, .cover-body");
    const bad = inner && inner.scrollHeight > inner.clientHeight + 1;
    return (i+1)+":"+(bad?("DESBORDA+"+(inner.scrollHeight-inner.clientHeight)):"ok");
  });
  document.title="CHK "+r.join(" | ");
},300)});<\/script>`;
fs.writeFileSync(`${DIR}/plan_gestion.check.html`, h.replace('</body>', probe + '</body>'));
const dom = execFileSync(CHROME, ['--headless=new','--disable-gpu','--allow-file-access-from-files','--virtual-time-budget=8000','--dump-dom', `file:///${DIR}/plan_gestion.check.html`], { encoding: 'utf8', maxBuffer: 1<<28 });
console.log((dom.match(/<title>([^<]*)<\/title>/)||[])[1]);
