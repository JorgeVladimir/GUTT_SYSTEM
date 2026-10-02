import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIR = 'C:/GUTT_SYSTEM/tmp/contrato_sas';
const html = fs.readFileSync(`${DIR}/tablero_v9.html`, 'utf8');
const sonda = `<script>
window.__err=[]; window.addEventListener('error',e=>window.__err.push(e.message));
window.addEventListener('load',()=>setTimeout(()=>{ try {
  const g=id=>document.getElementById(id); const tx=id=>g(id)?g(id).textContent:null;
  const r={err:window.__err, w:innerWidth,
    h1:tx('numH1'), mod:tx('numMod'), fases:tx('numFases'), pagado:tx('numPresu'), total:tx('numTotal'), gap:tx('numGap'), footGap:tx('footGap'),
    hitos:document.querySelectorAll('.hito').length, checks:document.querySelectorAll('[data-hito]').length,
    filasDes:document.querySelectorAll('.des').length, filasFase:document.querySelectorAll('.fase').length,
    filasMod:document.querySelectorAll('.mod').length, tracks:document.querySelectorAll('.track').length,
    brecha:tx('boxBrecha'), overflow:{}, navy:{}};
  ['Avance','Dinero','Contrato','Movil','Web'].forEach(n=>{
    g('tabBtn'+n).click();
    r.overflow[n]=document.documentElement.scrollWidth-innerWidth;
    r.navy[n]=getComputedStyle(g('panel'+n)).getPropertyValue('--navy').trim();
    r['visible_'+n]=!g('panel'+n).hidden;
  });
  const pre=document.createElement('pre');pre.id='__r';pre.textContent=JSON.stringify(r);document.body.appendChild(pre);
} catch(e){ const p=document.createElement('pre');p.id='__r';p.textContent='EXC '+e.message;document.body.appendChild(p);} },600));
<\/script>`;
const envuelto0 = html.replace('<head>', '<head><script>window.claude={use:()=>Promise.resolve(null)};<\/script>');
const k = envuelto0.lastIndexOf('</body>');
const envuelto = envuelto0.slice(0,k) + sonda + envuelto0.slice(k);
fs.writeFileSync(`${DIR}/tablero_v9.check.html`, envuelto);
for (const [ancho, tema] of [[1280, 'light'], [400, 'light'], [1280, 'dark'], [400, 'dark']]) {
  const args = ['--headless=new', '--disable-gpu', `--window-size=${ancho},900`, '--virtual-time-budget=6000', '--dump-dom',
    ...(tema === 'dark' ? ['--force-dark-mode', '--enable-features=WebContentsForceDark'] : []), `file:///${DIR}/tablero_v9.check.html`];
  const dom = execFileSync(CHROME, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  const m = (dom.match(/<pre id="__r">([^<]*)<\/pre>/) || [])[1];
  console.log(`--- ${ancho}px ${tema}`); console.log(m ? m.replaceAll('&quot;', '"') : 'sin lectura');
}
