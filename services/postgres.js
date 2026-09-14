import pg from 'pg';

// No modificar parsers globales: server.js tambien usa un espejo PostgreSQL.
const types = {
  getTypeParser(oid, format) {
    if (format !== 'binary' && [1082, 1114, 1184].includes(oid)) return value => value;
    return pg.types.getTypeParser(oid, format);
  },
};

export function postgresConfig(env = process.env) {
  // Prefijo dedicado: nunca conectar por accidente al espejo legacy de Neon.
  if (!env.GUTT_PG_HOST || !env.GUTT_PG_DATABASE || !env.GUTT_PG_USER || !env.GUTT_PG_PASSWORD) {
    throw new Error('Configurar GUTT_PG_HOST, GUTT_PG_DATABASE, GUTT_PG_USER y GUTT_PG_PASSWORD en api/.env');
  }
  const port = Number(env.GUTT_PG_PORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('GUTT_PG_PORT invalido');
  if (env.GUTT_PG_SSL && !['true', 'false'].includes(env.GUTT_PG_SSL)) throw new Error('GUTT_PG_SSL debe ser true o false');
  return {
    host: env.GUTT_PG_HOST, database: env.GUTT_PG_DATABASE,
    user: env.GUTT_PG_USER, password: env.GUTT_PG_PASSWORD, port,
    ssl: env.GUTT_PG_SSL === 'true' ? { rejectUnauthorized: true } : false,
    application_name: 'gutt-system-postgres', max: 10,
    connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, types,
  };
}

// Lexer: los @param solo se sustituyen fuera de literales y comentarios.
export function bindNamed(text, params = {}) {
  const values = [], positions = new Map();
  let result = '', i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const dollar = rest.match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/);
    if (dollar) {
      const end = text.indexOf(dollar[0], i + dollar[0].length);
      if (end < 0) throw new Error('Literal dollar-quoted sin cerrar');
      const next = end + dollar[0].length;
      result += text.slice(i, next); i = next; continue;
    }
    if (rest.startsWith('--')) {
      let end = text.indexOf('\n', i); if (end < 0) end = text.length;
      result += text.slice(i, end); i = end; continue;
    }
    if (rest.startsWith('/*')) {
      let depth = 1, end = i + 2;
      while (end < text.length && depth) {
        if (text.startsWith('/*', end)) { depth++; end += 2; }
        else if (text.startsWith('*/', end)) { depth--; end += 2; }
        else end++;
      }
      if (depth) throw new Error('Comentario sin cerrar');
      result += text.slice(i, end); i = end; continue;
    }
    const escaped = /^[eE]'/.test(rest) && (i === 0 || !/[\w$]/.test(text[i-1]));
    if (text[i] === "'" || text[i] === '"' || escaped) {
      const quote = escaped ? "'" : text[i];
      let end = i + (escaped ? 2 : 1), closed = false;
      while (end < text.length) {
        if (escaped && text[end] === '\\') { end += 2; continue; }
        if (text[end] === quote) {
          if (text[end+1] === quote) { end += 2; continue; }
          end++; closed = true; break;
        }
        end++;
      }
      if (!closed) throw new Error('Literal o identificador sin cerrar');
      result += text.slice(i,end); i = end; continue;
    }
    const param = rest.match(/^@([A-Za-z_][A-Za-z_0-9]*)/);
    if (param && text[i-1] !== '@') {
      const name = param[1];
      if (!Object.hasOwn(params, name) || params[name] === undefined) throw new Error(`Falta parametro @${name}`);
      if (!positions.has(name)) { values.push(params[name]); positions.set(name, values.length); }
      result += '$' + positions.get(name); i += param[0].length; continue;
    }
    if (/^\$\d+/.test(rest)) throw new Error('No mezclar parametros posicionales y nombrados');
    result += text[i++];
  }
  return { text: result, values };
}

export function createDatabase(pool) {
  const queryOn = target => (text, params) => target.query(bindNamed(text, params));
  return {
    query: queryOn(pool),
    async transaction(work) {
      const client = await pool.connect();
      let broken;
      try {
        await client.query('BEGIN');
        const value = await work({ query: queryOn(client) });
        await client.query('COMMIT');
        return value;
      } catch (error) {
        try { await client.query('ROLLBACK'); }
        catch (rollbackError) { broken = rollbackError; }
        throw error;
      } finally { client.release(broken); }
    },
    close: () => pool.end(),
    stats: () => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }),
  };
}

export function connectPostgres(env = process.env) {
  const pool = new pg.Pool(postgresConfig(env));
  pool.on('error', error => console.error('PostgreSQL: error de conexion ociosa', error.code || 'sin codigo'));
  return createDatabase(pool);
}
