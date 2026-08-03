import { state } from './state.js';
import { FIELD_ID_SET, getFieldDefinition } from './state.fields.js';
import { config } from './state.config.js';

let _orderedColumnsCache = null;
let _orderedColumnsCacheVersion = -1;
let _detectedColumnsVersion = 0;

function _invalidateColumnsCache() {
  _detectedColumnsVersion++;
}

export function addCustomColumn(customId) {
  const columnName = `custom_${customId}`;
  if (!state.detectedColumns.includes(columnName)) {
    state.detectedColumns.push(columnName);
    state.detectedColumnsOrder[columnName] = state.detectedColumns.length - 1;
    _invalidateColumnsCache();
  }
}

export function removeDetectedColumn(columnName) {
  const idx = state.detectedColumns.indexOf(columnName);
  if (idx !== -1) {
    state.detectedColumns.splice(idx, 1);
    delete state.detectedColumnsOrder[columnName];
    _invalidateColumnsCache();
  }
}

export function addDetectedColumn(columnName) {
  if (!state.detectedColumns.includes(columnName)) {
    state.detectedColumns.push(columnName);
    state.detectedColumnsOrder[columnName] = state.detectedColumns.length - 1;
    _invalidateColumnsCache();
  }
}

export function reorderColumn(columnName, newPosition) {
  const ordered = getOrderedColumns();
  const currentIndex = ordered.indexOf(columnName);
  if (currentIndex === -1) return;
  if (newPosition < currentIndex) {
    for (let i = newPosition; i < currentIndex; i++) {
      state.detectedColumnsOrder[ordered[i]] = (state.detectedColumnsOrder[ordered[i]] ?? i) + 1;
    }
  } else if (newPosition > currentIndex) {
    for (let i = currentIndex + 1; i <= newPosition; i++) {
      state.detectedColumnsOrder[ordered[i]] = (state.detectedColumnsOrder[ordered[i]] ?? i) - 1;
    }
  }
  state.detectedColumnsOrder[columnName] = newPosition;
  _invalidateColumnsCache();
}

export function removeCustomColumn(customId) {
  removeDetectedColumn(`custom_${customId}`);
  state.hiddenColumns = state.hiddenColumns.filter(col => col !== `custom_${customId}`);
}

export function hasColumn(columnName) {
  return state.detectedColumns.includes(columnName) && !state.hiddenColumns.includes(columnName);
}

export function hideColumn(columnName) {
  if (!state.detectedColumns.includes(columnName) || state.hiddenColumns.includes(columnName)) return;
  state.hiddenColumns.push(columnName);
  _invalidateColumnsCache();
}

export function showColumn(columnName) {
  const idx = state.hiddenColumns.indexOf(columnName);
  if (idx === -1) return;
  state.hiddenColumns.splice(idx, 1);
  _invalidateColumnsCache();
}

export function isColumnHidden(columnName) {
  return state.hiddenColumns.includes(columnName);
}

export function getCustomFieldColumnId(customId) {
  return `custom_${customId}`;
}

export function getCustomFieldIdFromColumn(columnName) {
  if (!columnName?.startsWith('custom_')) return null;
  return columnName.substring(7);
}

export function getVisibleColumns() {
  return getOrderedColumns();
}

export function getAllColumns(includeHidden = false) {
  if (includeHidden) return state.detectedColumns.slice();
  return getOrderedColumns();
}

export function getAllColumnDefinitions() {
  return getOrderedColumns().map(getFieldDefinition).filter(Boolean);
}

export function detectColumnsFromLevels() {
  const defaultVisible = Array.isArray(config.defaultVisibleColumns) ? config.defaultVisibleColumns : [];

  const blockedAutoDetect = new Set(['creators', 'victors', 'showcaseVideo', 'thumbnail', 'notes', 'video', 'lastEdited', 'author']);

  const seenProperties = new Set();
  const propertyOrder = [];

  state.rawLevels.forEach(level => {
    Object.keys(level).forEach(key => {
      if (!['_id', 'customValues', 'pending'].includes(key) && !blockedAutoDetect.has(key) && !seenProperties.has(key)) {
        seenProperties.add(key);
        propertyOrder.push(key);
      }
    });
  });

  const visibleFields = propertyOrder.filter(key => !FIELD_ID_SET.has(key));
  const builtinVisibleFields = propertyOrder.filter(key => FIELD_ID_SET.has(key));

  const previouslyDetected = state.detectedColumns.filter(col => !blockedAutoDetect.has(col));

  const restored = previouslyDetected.length > 0
    ? [...new Set([...previouslyDetected, ...defaultVisible, ...visibleFields, ...builtinVisibleFields])]
    : [...new Set([...defaultVisible, ...visibleFields, ...builtinVisibleFields])];

  const builtinColumns = config.defaultVisibleColumns && Array.isArray(config.defaultVisibleColumns)
    ? config.defaultVisibleColumns.filter(col => FIELD_ID_SET.has(col))
    : [];

  state.detectedColumns = [];
  state.detectedColumnsOrder = {};
  [...builtinColumns, ...restored].forEach((col, idx) => {
    if (!state.detectedColumns.includes(col)) {
      state.detectedColumns.push(col);
      state.detectedColumnsOrder[col] = state.detectedColumns.length - 1;
    }
  });

  state.customValues.forEach(field => {
    const customId = `custom_${field.id}`;
    if (!state.detectedColumns.includes(customId)) {
      state.detectedColumns.push(customId);
      state.detectedColumnsOrder[customId] = state.detectedColumns.length - 1;
    }
  });

  const builtinFieldsPresent = propertyOrder.filter(key => FIELD_ID_SET.has(key));
  builtinFieldsPresent.forEach(key => {
    if (!state.detectedColumns.includes(key)) {
      state.detectedColumns.push(key);
      state.detectedColumnsOrder[key] = state.detectedColumns.length - 1;
    }
  });

  const existingDynIds = new Set(state.dynamicFields.map(f => f.id));

  propertyOrder
    .filter(key => !FIELD_ID_SET.has(key))
    .filter(key => !state.customValues.some(field => `custom_${field.id}` === key))
    .forEach(key => {
      if (!existingDynIds.has(key)) {
        state.dynamicFields.push({
          id: key,
          label: String(key).replace(/\./g, ' › ').replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim(),
          type: 'text',
          sortable: true,
          filterable: true,
          groupable: false,
          conditional: false,
        });
        existingDynIds.add(key);
      }
    });

  blockedAutoDetect.forEach(blockedCol => {
    if (state.detectedColumns.includes(blockedCol) && !state.hiddenColumns.includes(blockedCol)) {
      state.hiddenColumns.push(blockedCol);
    }
  });

  _invalidateColumnsCache();
}

export function getOrderedColumns() {
  if (_orderedColumnsCacheVersion === _detectedColumnsVersion && _orderedColumnsCache !== null) {
    return _orderedColumnsCache;
  }
  _orderedColumnsCache = state.detectedColumns
    .filter(col => !state.hiddenColumns.includes(col))
    .slice()
    .sort((a, b) => {
      const orderA = state.detectedColumnsOrder[a] ?? 999;
      const orderB = state.detectedColumnsOrder[b] ?? 999;
      return orderA - orderB;
    });
  _orderedColumnsCacheVersion = _detectedColumnsVersion;
  return _orderedColumnsCache;
}
