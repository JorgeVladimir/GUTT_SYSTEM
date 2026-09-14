// ─────────────────────────────────────────────────────────────────────────────
// services/mailer.js
//
// Un solo punto de salida de correo. Antes cada funcion que mandaba mail armaba
// su propio transporter y, si algo fallaba, lo escribia en consola y devolvia
// como si hubiera enviado. Ese silencio es justo lo que hacia imposible saber
// por que "el correo de recuperacion no sale": el endpoint respondia ok:true
// pasara lo que pasara.
//
// Aqui el envio devuelve SIEMPRE un resultado explicito
//   { enviado:boolean, motivo:string, messageId?:string, error?:string }
// y quien llama decide que hacer. Nada se traga.
//
// Configuracion (api/.env):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_NAME, SMTP_FROM_EMAIL
//   SMTP_SECURE=true|false   (por defecto: true solo si el puerto es 465)
//
// Gmail: SMTP_PASS debe ser una App Password de 16 caracteres (con verificacion
// en dos pasos activada en la cuenta), NO la contrasena normal. Google rechaza
// la contrasena normal con "Username and Password not accepted".
// ─────────────────────────────────────────────────────────────────────────────
import nodemailer from 'nodemailer';

let transporterCache = null;
let firmaCache = null;

/** Lee la configuracion SMTP del entorno. No expone nunca la contrasena. */
export function configuracionSmtp() {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = (process.env.SMTP_USER || '').trim();
  const pass = process.env.SMTP_PASS || '';
  const secureEnv = (process.env.SMTP_SECURE || '').trim().toLowerCase();
  const secure = secureEnv ? secureEnv === 'true' : port === 465;

  const faltantes = [];
  if (!host) faltantes.push('SMTP_HOST');
  if (!user) faltantes.push('SMTP_USER');
  if (!pass) faltantes.push('SMTP_PASS');

  return {
    host, port, user, secure,
    tienePass: !!pass,
    fromName: process.env.SMTP_FROM_NAME || 'Gutt System',
    fromEmail: process.env.SMTP_FROM_EMAIL || user,
    configurado: faltantes.length === 0,
    faltantes,
  };
}

/** Transporter reutilizado. Se reconstruye solo si cambia la configuracion. */
function obtenerTransporter() {
  const cfg = configuracionSmtp();
  if (!cfg.configurado) return null;
  const firma = `${cfg.host}|${cfg.port}|${cfg.user}|${cfg.secure}|${(process.env.SMTP_PASS || '').length}`;
  if (transporterCache && firmaCache === firma) return transporterCache;
  transporterCache = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: process.env.SMTP_PASS },
    // Sin estos topes un SMTP caido deja la peticion HTTP colgada minutos.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  firmaCache = firma;
  return transporterCache;
}

/**
 * Traduce los errores tipicos de SMTP a algo accionable. El mensaje crudo de
 * nodemailer ("Invalid login: 535-5.7.8") no le dice nada a quien opera el sistema.
 */
export function explicarErrorSmtp(err) {
  const texto = String((err && err.message) || err || '');
  const codigo = (err && err.code) || '';
  if (/Invalid login|535|Username and Password not accepted/i.test(texto)) {
    return 'SMTP rechazo las credenciales. Si el proveedor es Gmail, SMTP_PASS debe ser una App Password de 16 caracteres generada con la verificacion en dos pasos activa, no la contrasena de la cuenta.';
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(texto) || codigo === 'ENOTFOUND') {
    return `No se pudo resolver el host SMTP (${process.env.SMTP_HOST}). Revise SMTP_HOST y la salida DNS del servidor.`;
  }
  if (/ETIMEDOUT|ECONNREFUSED|Greeting never received/i.test(texto) || codigo === 'ETIMEDOUT') {
    return `No hubo respuesta de ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}. Normalmente es el firewall de salida bloqueando el puerto, o SMTP_SECURE mal puesto (465 requiere secure=true, 587 requiere secure=false).`;
  }
  if (/self signed certificate|unable to verify/i.test(texto)) {
    return 'El certificado TLS del servidor SMTP no valida. Si es un servidor interno, use el host con certificado valido o el puerto 587 con STARTTLS.';
  }
  return texto || 'Error SMTP sin detalle';
}

/**
 * Verifica que el SMTP acepte la conexion y las credenciales, sin enviar nada.
 * Es lo que hay que correr despues de pegar la App Password.
 */
export async function verificarSmtp() {
  const cfg = configuracionSmtp();
  if (!cfg.configurado) {
    return {
      ok: false, configurado: false, faltantes: cfg.faltantes,
      error: `SMTP no configurado. Falta definir en api/.env: ${cfg.faltantes.join(', ')}.`,
    };
  }
  try {
    await obtenerTransporter().verify();
    return { ok: true, configurado: true, host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user };
  } catch (err) {
    return {
      ok: false, configurado: true, host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user,
      error: explicarErrorSmtp(err), errorCrudo: String((err && err.message) || err),
    };
  }
}

/**
 * Envia un correo. Nunca lanza: devuelve el resultado para que quien llama
 * decida si eso es un fallo del caso de uso o no.
 */
export async function enviarCorreo({ para, asunto, html, texto }) {
  const cfg = configuracionSmtp();
  if (!cfg.configurado) {
    return {
      enviado: false, motivo: 'SMTP_NO_CONFIGURADO',
      error: `SMTP no configurado (falta ${cfg.faltantes.join(', ')} en api/.env). El contenido se registro en consola.`,
    };
  }
  try {
    const info = await obtenerTransporter().sendMail({
      from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to: para, subject: asunto, html, text: texto,
    });
    return { enviado: true, motivo: 'ENVIADO', messageId: info.messageId, aceptados: info.accepted, rechazados: info.rejected };
  } catch (err) {
    return { enviado: false, motivo: 'ERROR_SMTP', error: explicarErrorSmtp(err), errorCrudo: String((err && err.message) || err) };
  }
}

/** Plantilla comun: cabecera verde, cuerpo, pie de correo automatico. */
export function plantillaCorreo(titulo, cuerpoHtml) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
      <h2 style="color: #002B67; text-align: center; margin-top: 0;">GUTT SYSTEM</h2>
      <h3 style="color: #002B67; font-size: 16px;">${titulo}</h3>
      ${cuerpoHtml}
      <p style="font-size: 12px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px;">
        Este es un correo automatico, por favor no responda a este mensaje.
      </p>
    </div>
  `;
}
