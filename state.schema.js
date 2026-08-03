import { IMPORT_TEMPLATES_KEY } from './state.config.js';
import { FIELD_ID_SET } from './state.fields.js';
import { flattenRecord, inferFieldType } from './state.utils.js';

export function buildSchemaFromRecords(records) {
  const keyValuesMap = new Map();
  const keyInsertOrder = new Map();
  let insertIdx = 0;

  for (const rec of records) {
    const normalized = (rec !== null && typeof rec === 'object' && !Array.isArray(rec)) ? rec : { value: rec };
    const flat = flattenRecord(normalized);
    for (const [key, value] of Object.entries(flat)) {
      if (!keyValuesMap.has(key)) {
        keyValuesMap.set(key, []);
        keyInsertOrder.set(key, insertIdx++);
      }
      if (value !== null && value !== undefined) {
        keyValuesMap.get(key).push(value);
      }
    }
  }

  const schema = [];
  for (const [key, values] of keyValuesMap) {
    const type = inferFieldType(values);

    const rawLabel = key
      .replace(/\./g, ' › ')
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim();
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

    const enumOptions = type === 'enum'
      ? [...new Set(values.map(v => String(v).trim()))].filter(Boolean).sort()
      : [];

    const sampleValues = values.slice(0, 3).map(v => {
      if (Array.isArray(v)) return `[${v.slice(0, 3).map(String).join(', ')}]`;
      if (typeof v === 'object' && v !== null) return JSON.stringify(v).slice(0, 60);
      return String(v).slice(0, 60);
    });

    const isBuiltin = FIELD_ID_SET.has(key);

    schema.push({
      id: key,
      label,
      type,
      visible: true,
      sortable: !['json', 'tags'].includes(type),
      filterable: type !== 'json',
      enumOptions,
      sampleValues,
      isBuiltin,
    });
  }

  return schema.sort((a, b) => (keyInsertOrder.get(a.id) ?? 0) - (keyInsertOrder.get(b.id) ?? 0));
}

export function applySchemaToRecord(rec, schema) {
  const normalized = (rec !== null && typeof rec === 'object' && !Array.isArray(rec)) ? rec : { value: rec };
  const flat = flattenRecord(normalized);
  const result = {};

  for (const field of schema) {
    if (!field.visible) continue;
    const val = flat[field.id];
    if (val === undefined) continue;

    if (field.type === 'number') {
      const n = Number(val);
      result[field.id] = isFinite(n) ? n : null;
    } else if (field.type === 'boolean') {
      result[field.id] = val === true || val === 1 || String(val).toLowerCase() === 'true';
    } else if (field.type === 'tags') {
      result[field.id] = Array.isArray(val) ? val : String(val).split(',').map(s => s.trim()).filter(Boolean);
    } else if (field.type === 'json') {
      result[field.id] = val;
    } else {
      result[field.id] = val === null ? null : String(val);
    }
  }

  return result;
}

export function saveImportTemplate(name, schema) {
  if (!name?.trim()) return false;
  const templates = listImportTemplates();
  templates[name.trim()] = schema.map(f => ({
    id: f.id,
    label: f.label,
    type: f.type,
    visible: f.visible,
    sortable: f.sortable,
    filterable: f.filterable,
    enumOptions: f.enumOptions || [],
  }));
  try {
    localStorage.setItem(IMPORT_TEMPLATES_KEY, JSON.stringify(templates));
    return true;
  } catch (_) {
    return false;
  }
}

export function listImportTemplates() {
  try {
    return JSON.parse(localStorage.getItem(IMPORT_TEMPLATES_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

export function loadImportTemplate(name) {
  const templates = listImportTemplates();
  return templates[name] || null;
}

export function deleteImportTemplate(name) {
  const templates = listImportTemplates();
  if (!(name in templates)) return false;
  delete templates[name];
  try {
    localStorage.setItem(IMPORT_TEMPLATES_KEY, JSON.stringify(templates));
    return true;
  } catch (_) {
    return false;
  }
}
