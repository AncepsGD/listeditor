import { state, getCustomField } from './state.js';

export const BUILTIN_FIELD_DEFINITIONS = [
  { id: 'rank', label: 'Rank', type: 'rank', sortable: true, filterable: false, groupable: true, conditional: false },
  { id: 'name', label: 'Name', type: 'text', sortable: true, filterable: true, groupable: false, conditional: false },
  { id: 'creators', label: 'Creator', type: 'text', sortable: true, filterable: true, groupable: true, conditional: false },
  { id: 'tags', label: 'Tags', type: 'text', sortable: true, filterable: true, groupable: true, conditional: false },
  { id: 'confidence', label: 'Confidence', type: 'enum', sortable: true, filterable: true, groupable: true, conditional: false },
  { id: 'lastEdited', label: 'Last edited', type: 'datetime', sortable: true, filterable: false, groupable: false, conditional: false },
  { id: 'id', label: 'ID', type: 'text', sortable: true, filterable: false, groupable: false, conditional: false },
  { id: 'victors', label: 'Victors', type: 'text', sortable: false, filterable: false, groupable: false, conditional: false },
  { id: 'showcaseVideo', label: 'Showcase Video URL', type: 'text', sortable: false, filterable: false, groupable: false, conditional: false },
  { id: 'video', label: 'Video URL', type: 'text', sortable: false, filterable: false, groupable: false, conditional: false },
];

export const FIELD_ID_SET = new Set(BUILTIN_FIELD_DEFINITIONS.map(field => field.id));

export function setFieldLabel(fieldId, label) {
  if (!state.settings.columnLabels) state.settings.columnLabels = {};
  if (!fieldId) return;
  const trimmed = String(label ?? '').trim();
  if (!trimmed) {
    delete state.settings.columnLabels[fieldId];
  } else {
    state.settings.columnLabels[fieldId] = trimmed;
  }
}

export function removeFieldLabel(fieldId) {
  if (state.settings.columnLabels) {
    delete state.settings.columnLabels[fieldId];
  }
}

export function getFieldDefinition(fieldId) {
  if (fieldId?.startsWith?.('custom_')) {
    const customField = getCustomField(fieldId.substring(7));
    if (!customField) return null;
    return {
      id: fieldId,
      label: customField.name,
      type: customField.type,
      sortable: Boolean(customField.sortable),
      filterable: Boolean(customField.filterable),
      groupable: false,
      conditional: false,
      custom: true,
    };
  }
  const builtIn = BUILTIN_FIELD_DEFINITIONS.find(f => f.id === fieldId);
  if (builtIn) return builtIn;
  return state.dynamicFields.find(f => f.id === fieldId) || null;
}

export function getFieldLabel(fieldId) {
  if (state.settings.columnLabels && fieldId && state.settings.columnLabels[fieldId]) {
    return state.settings.columnLabels[fieldId];
  }
  const def = getFieldDefinition(fieldId);
  if (def) return def.label;
  return String(fieldId || '').replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

export function isKnownField(fieldId) {
  return FIELD_ID_SET.has(fieldId) || state.dynamicFields.some(f => f.id === fieldId) || fieldId?.startsWith?.('custom_');
}

export function getAllFieldDefinitions() {
  return [...BUILTIN_FIELD_DEFINITIONS, ...state.dynamicFields];
}
