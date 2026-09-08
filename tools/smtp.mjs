// Diagnostico del servidor de correo, sin levantar el backend.
//
//   node tools/smtp.mjs                       -> muestra la configuracion y verifica la conexion
//   node tools/smtp.mjs destino@dominio.com   -> ademas envia un correo real de prueba
//
// Existe porque "el correo de recuperacion no sale" era un sintoma sin instrumento:
// el envio vivia dentro de un try/catch que solo escribia en consola del servidor.
// Este script separa las tres cosas que pueden fallar --configuracion, conexion,
// envio-- y dice cual es.
import { loadDotEnv, REPO_ROOT } from './_env.mjs';
import { join } from 'path';
import { configuracionSmtp, verificarSmtp, enviarCorreo, plantillaCorreo } from '../services/mailer.js';

loadDotEnv(join(REPO_ROOT, 'api', '.env'));

const VERDE = '\x1b[32m', ROJO = '\x1b[31m', AMARILLO = '\x1b[33m', GRIS = '\x1b[90m', RESET = '\x1b[0m';
const ok = (t) => console.log(`${VERDE}  OK  ${RESET} ${t}`);
const mal = (t) => console.log(`${ROJO} FALLA${RESET} ${t}`);
const aviso = (t) => console.log(`${AMARILLO} AVISO${RESET} ${t}`);

console.log('');
console.log('  Diagnostico SMTP — Gutt System');
console.log('  ' + '-'.repeat(60));

// 1. Configuracion
const cfg = configuracionSmtp();
console.log(`${GRIS}  SMTP_HOST      ${RESET} ${cfg.host || '(sin definir)'}`);
console.log(`${GRIS}  SMTP_PORT      ${RESET} ${cfg.port}`);
console.log(`${GRIS}  SMTP_SECURE    ${RESET} ${cfg.secure}  ${GRIS}(465 => true, 587 => false)${RESET}`);
console.log(`${GRIS}  SMTP_USER      ${RESET} ${cfg.user || '(sin definir)'}`);
console.log(`${GRIS}  SMTP_PASS      ${RESET} ${cfg.tienePass ? '(definida)' : '(sin definir)'}`);
console.log(`${GRIS}  Remitente      ${RESET} ${cfg.fromName} <${cfg.fromEmail || '?'}>`);
console.log('');

if (!cfg.configurado) {
  mal(`Configuracion incompleta. Falta en api/.env: ${cfg.faltantes.join(', ')}`);
  console.log('');
  console.log('  Para Gmail:');
  console.log('    1. Active la verificacion en dos pasos en la cuenta.');
  console.log('    2. Genere una App Password en https://myaccount.google.com/apppasswords');
  console.log('    3. En api/.env:');
  console.log(`${GRIS}       SMTP_HOST=smtp.gmail.com`);
  console.log('       SMTP_PORT=587');
  console.log('       SMTP_SECURE=false');
  console.log('       SMTP_USER=lacuenta@gmail.com');
  console.log('       SMTP_PASS=xxxxxxxxxxxxxxxx   (16 caracteres, sin espacios)');
  console.log(`       SMTP_FROM_NAME=Gutt System${RESET}`);
  console.log('');
  process.exit(1);
}
ok('Configuracion completa');

// 2. Conexion y credenciales
const verificacion = await verificarSmtp();
if (verificacion.ok) {
  ok(`Conexion y credenciales aceptadas por ${cfg.host}:${cfg.port}`);
} else {
  mal(verificacion.error);
  if (verificacion.errorCrudo && verificacion.errorCrudo !== verificacion.error) {
    console.log(`${GRIS}        detalle: ${verificacion.errorCrudo}${RESET}`);
  }
  console.log('');
  process.exit(1);
}

// 3. Envio real (opcional)
const destino = process.argv[2];
if (!destino) {
  aviso('No se envio correo de prueba. Para enviarlo: node tools/smtp.mjs destino@dominio.com');
  console.log('');
  process.exit(0);
}

const resultado = await enviarCorreo({
  para: destino,
  asunto: 'Prueba de configuracion de correo — Gutt System',
  texto: `Prueba de SMTP enviada desde tools/smtp.mjs el ${new Date().toISOString()}.`,
  html: plantillaCorreo('Prueba de configuracion de correo', `
    <p>Si esta leyendo esto, el servidor de correo de <strong>Gutt System</strong> quedo correctamente configurado.</p>
    <p style="margin:0;"><strong>Origen:</strong> tools/smtp.mjs</p>
    <p style="margin:0;"><strong>Fecha:</strong> ${new Date().toISOString()}</p>
  `),
});

if (resultado.enviado) {
  ok(`Correo enviado a ${destino} (messageId ${resultado.messageId})`);
  if (resultado.rechazados && resultado.rechazados.length) {
    aviso(`El servidor rechazo estos destinos: ${resultado.rechazados.join(', ')}`);
  }
  console.log('');
  process.exit(0);
}

mal(resultado.error);
console.log('');
process.exit(1);
