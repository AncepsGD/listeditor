export function compKey(a, b) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ESC_MAP[c]);
}

export function ytId(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

export function thumbUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const value = url.trim();
  const id = ytId(value) || (/^[A-Za-z0-9_-]{11}$/.test(value) ? value : null);
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
}

export function gdThumbUrl(gdId) {
  if (gdId == null) return null;
  return `https://gdbrowser.com/assets/level/${gdId}`;
}

export function looksLikePlainText(data) {
  if (typeof data !== 'string') return false;
  const trimmed = data.trim();
  if (!trimmed) return false;
  try { JSON.parse(trimmed); return false; } catch { return true; }
}

export function looksLikeCSV(data) {
  const firstLine = (data.trim().split('\n')[0] || '');
  const commaCount = (firstLine.match(/,/g) || []).length;
  return commaCount >= 1 && commaCount < 20;
}

export function parsePlainText(data) {
  return data.trim().split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(name => ({ name, pending: true }));
}

export function parseCSV(data) {
  const lines = data.trim().split('\n').filter(Boolean);
  if (!lines.length) return [];

  const firstCells = lines[0].split(',').map(h => h.trim().toLowerCase());
  const knownHeaders = ['name', 'level', 'title', 'creators', 'creator', 'tags', 'notes'];
  const hasHeaderRow = knownHeaders.some(h => firstCells.includes(h));

  if (hasHeaderRow) {
    const headers = firstCells;
    const nameIdx = ['name', 'level', 'title'].map(h => headers.indexOf(h)).find(i => i !== -1) ?? 0;
    const creatorsIdx = ['creators', 'creator'].map(h => headers.indexOf(h)).find(i => i !== -1) ?? -1;
    const tagsIdx = headers.indexOf('tags');
    const notesIdx = headers.indexOf('notes');

    return lines.slice(1).map(line => {
      const parts = line.split(',');
      const level = { name: (parts[nameIdx] || '').trim(), pending: true };
      if (creatorsIdx !== -1) {
        const creators = (parts[creatorsIdx] || '').trim();
        if (creators) level.creators = creators;
      }
      if (tagsIdx !== -1) {
        const tags = (parts[tagsIdx] || '').trim();
        if (tags) level.tags = tags;
      }
      if (notesIdx !== -1) {
        const notes = (parts[notesIdx] || '').trim();
        if (notes) level.notes = notes;
      }
      return level;
    }).filter(l => l.name);
  }

  return lines.map(line => {
    const parts = line.split(',');
    const level = { name: (parts[0] || '').trim(), pending: true };
    const creators = (parts[1] || '').trim();
    if (creators) level.creators = creators;
    return level;
  }).filter(l => l.name);
}

export function flattenRecord(obj, prefix = '', result = {}) {
  if (obj === null || obj === undefined) {
    if (prefix) result[prefix] = obj;
    return result;
  }
  if (typeof obj !== 'object') {
    if (prefix) result[prefix] = obj;
    return result;
  }
  if (Array.isArray(obj)) {
    if (prefix) result[prefix] = obj;
    return result;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    if (prefix) result[prefix] = obj;
    return result;
  }
  for (const key of keys) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val !== null && val !== undefined && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0) {
      flattenRecord(val, fullKey, result);
    } else {
      result[fullKey] = val;
    }
  }
  return result;
}

export function inferFieldType(values) {
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
  if (!nonNull.length) return 'text';

  if (nonNull.every(v => typeof v === 'boolean')) return 'boolean';
  if (nonNull.every(v => typeof v === 'boolean' || (typeof v === 'string' && ['true', 'false'].includes(v.toLowerCase())))) return 'boolean';

  if (nonNull.every(v => typeof v === 'number' && isFinite(v))) return 'number';
  if (nonNull.every(v => (typeof v === 'number' && isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v.trim())) && isFinite(Number(v.trim()))))) return 'number';

  if (nonNull.every(v => Array.isArray(v))) {
    const allPrimitive = nonNull.every(arr =>
      arr.every(el => el === null || el === undefined || typeof el !== 'object')
    );
    return allPrimitive ? 'tags' : 'json';
  }

  if (nonNull.every(v => typeof v === 'object' && v !== null && !Array.isArray(v))) return 'json';

  if (nonNull.some(v => typeof v === 'object')) return 'text';

  const strs = nonNull.map(v => String(v).trim()).filter(Boolean);
  if (!strs.length) return 'text';

  const dateRe = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  if (strs.every(v => dateRe.test(v))) return 'date';

  if (strs.every(v => /^https?:\/\//i.test(v))) return 'url';

  const unique = new Set(strs);
  if (strs.length >= 4 && unique.size >= 2 && unique.size <= 12 && unique.size <= Math.ceil(strs.length * 0.4)) return 'enum';

  return 'text';
}
