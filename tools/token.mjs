// Emite un JWT válido para probar endpoints protegidos de server.js (puerto 5005).
//
//   node tools/token.mjs                 -> usuario admin, rol ADMIN
//   node tools/token.mjs cartera CARTERA
//
// Firma con el mismo JWT_SECRET de api/.env que usa server.js, así que el token es aceptado
// por requireAuth/requireAdmin sin pasar por /api/auth/login.php.
// (Sucesor de scratch/mint_token.mjs, que apuntaba al backend nuevo del puerto 5006.)
import jwt from 'jsonwebtoken';
import './_env.mjs';

const usuarioId = process.argv[2] || 'admin';
const rol = process.argv[3] || 'ADMIN';

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en api/.env');
  process.exit(1);
}

console.log(jwt.sign({ usuarioId, rol }, process.env.JWT_SECRET, { expiresIn: '10h' }));
