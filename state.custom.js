import { state, getCustomField } from './state.js';
import { addCustomColumn, removeCustomColumn } from './state.columns.js';

export { getCustomField } from './state.js';

export function getCustomValue(level, valueId) {
  const raw = level.customValues?.[valueId];
  return raw == null ? '' : String(raw);
}

export function formatCustomFieldValue(level, field) {
  const raw = level.customValues?.[field.id];
  if (raw == null) return '';
  if (field.type === 'boolean') {
    return raw === true || raw === 'true' || raw === '1' ? 'true' : 'false';
  }
  if (field.type === 'number') {
    return Number.isFinite(raw) ? String(raw) : String(raw || '');
  }
  return String(raw);
}

export function setCustomValue(level, valueId, value, field) {
  if (!level.customValues) level.customValues = {};
  if (value === '' || value == null) {
    delete level.customValues[valueId];
    return;
  }

  if (field?.type === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      delete level.customValues[valueId];
    } else {
      level.customValues[valueId] = parsed;
    }
    return;
  }

  if (field?.type === 'boolean') {
    level.customValues[valueId] = value === 'true' || value === true || value === '1';
    return;
  }

  level.customValues[valueId] = String(value).trim();
}

export function addCustomValue(name, type, options = [], filterable = true, sortable = true, exportable = true) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Name cannot be empty');
  if (state.customValues.some(v => v.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`A custom value named "${trimmed}" already exists`);
  }

  const normalizedType = ['text', 'number', 'enum', 'boolean'].includes(type) ? type : 'text';
  const parsedOptions = normalizedType === 'enum'
    ? (Array.isArray(options) ? options.map(String).map(opt => opt.trim()).filter(Boolean) : String(options || '').split(',').map(opt => opt.trim()).filter(Boolean))
    : [];

  const id = `cv_${trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
  state.customValues.push({
    id,
    name: trimmed,
    type: normalizedType,
    options: parsedOptions,
    filterable: Boolean(filterable),
    sortable: Boolean(sortable),
    exportable: Boolean(exportable),
  });
  addCustomColumn(id);
}

export function updateCustomValue(fieldId, updates) {
  const idx = state.customValues.findIndex(v => v.id === fieldId);
  if (idx === -1) return;
  const current = state.customValues[idx];
  const normalizedType = updates.type && ['text', 'number', 'enum', 'boolean'].includes(updates.type)
    ? updates.type
    : current.type;
  const merged = {
    ...current,
    ...updates,
    type: normalizedType,
  };

  if (merged.type === 'enum') {
    merged.options = Array.isArray(updates.options)
      ? updates.options.map(String).map(opt => opt.trim()).filter(Boolean)
      : current.options;
  } else {
    merged.options = [];
  }

  state.customValues[idx] = merged;
}

export function removeCustomValue(valueId) {
  state.customValues = state.customValues.filter(v => v.id !== valueId);
  state.rawLevels.forEach(level => {
    if (level.customValues) delete level.customValues[valueId];
  });
  removeCustomColumn(valueId);
}
