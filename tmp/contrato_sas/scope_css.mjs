import fs from 'node:fs';

const SCOPE = '#panelMovil';
const html = fs.readFileSync('lienzo_fragment.html', 'utf8');
const styleOpen = html.indexOf('<style>');
const styleClose = html.indexOf('</style>');
const before = html.slice(0, styleOpen + '<style>'.length);
const css = html.slice(styleOpen + '<style>'.length, styleClose);
const after = html.slice(styleClose);

// Divide por comas respetando paréntesis anidados (para :where(a,b,c), :not(...), etc.)
function splitTopLevelCommas(sel) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function scopeOne(s) {
  s = s.trim();
  if (!s) return s;
  if (s === 'body') return SCOPE;
  // :root, :root:not([data-theme="light"]), :root[data-theme="dark"], opcionalmente seguido
  // de un descendiente real (" .warn", " .tag--venta", etc.)
  const rootMatch = s.match(/^:root((?::not\(\[[^\]]*\]\))?(?:\[[^\]]*\])?)(\s+.*)?$/);
  if (rootMatch) {
    const themeSuffix = rootMatch[1] || '';
    const rest = rootMatch[2] || '';
    if (!rest) return `:root${themeSuffix} ${SCOPE}`.trim();
    return `:root${themeSuffix} ${SCOPE}${rest}`;
  }
  return `${SCOPE} ${s}`;
}

function scopeSelectorList(selList) {
  return splitTopLevelCommas(selList).map(scopeOne).join(', ');
}

let out = '';
let i = 0;
while (i < css.length) {
  const mediaHeaderMatch = css.slice(i).match(/^\s*((?:\/\*[\s\S]*?\*\/\s*)*)(@media[^{]*)\{/);
  if (mediaHeaderMatch) {
    out += mediaHeaderMatch[1] + mediaHeaderMatch[2] + '{';
    i += mediaHeaderMatch[0].length;
    let depth = 1, inner = '';
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') { depth--; if (depth === 0) { i++; break; } }
      inner += css[i];
      i++;
    }
    out += processRules(inner) + '}';
    continue;
  }
  const ruleMatch = css.slice(i).match(/^\s*((?:\/\*[\s\S]*?\*\/\s*)*)([^{}@]+)\{([^{}]*)\}/);
  if (ruleMatch) {
    const [full, leadingComment, selectors, body] = ruleMatch;
    out += leadingComment + scopeSelectorList(selectors) + '{' + body + '}';
    i += full.length;
    continue;
  }
  out += css[i];
  i++;
}

function processRules(text) {
  let r = '', j = 0;
  while (j < text.length) {
    const m = text.slice(j).match(/^\s*((?:\/\*[\s\S]*?\*\/\s*)*)([^{}@]+)\{([^{}]*)\}/);
    if (m) {
      const [full, leadingComment, selectors, body] = m;
      r += leadingComment + scopeSelectorList(selectors) + '{' + body + '}';
      j += full.length;
      continue;
    }
    r += text[j];
    j++;
  }
  return r;
}

fs.writeFileSync('lienzo_fragment_scoped.html', before + out + after);
console.log('Total reglas con scope:', (out.match(/#panelMovil/g)||[]).length);
