export const CONFIG_TEMPLATES = {
  minimal: {
    name: 'Minimal Setup',
    config: {
      appTitle: 'External List Editor',
      comparison: {
        voteButtonText: 'This one is harder',
        certaintyLabel: 'How certain are you?',
      },
      confidenceLevels: [
        { id: 'certain', label: 'Certain', emoji: '🔥' },
        { id: 'unsure', label: 'Unsure', emoji: '❓' },
      ],
      presetSources: [],
      fields: {
        namePlaceholder: 'Item name',
        creatorsPlaceholder: 'Creator(s)',
        videoPlaceholder: 'Video URL',
        listIdPlaceholder: 'ID',
        notesPlaceholder: 'Notes',
        victorsPlaceholder: '[]',
        filterPlaceholder: 'Filter...',
      },
      defaultVisibleColumns: ['rank', 'name', 'creators'],
      defaultSettings: {
        confirmDelete: true,
        confirmReset: true,
        confirmImportOverwrite: true,
        enableDragDrop: true,
        inlineEditMode: 'single',
        defaultNewStatus: 'pending',
      },
    }
  },
  standard: {
    name: 'Standard Setup',
    config: {
      appTitle: 'External List Editor',
      comparison: {
        voteButtonText: 'This one is harder',
        certaintyLabel: 'How certain are you?',
      },
      confidenceLevels: [
        { id: 'certain', label: 'Certain', emoji: '🔥' },
        { id: 'leaning', label: 'Leaning', emoji: '🤔' },
        { id: 'equal', label: 'Equal', emoji: '⚖' },
        { id: 'unsure', label: 'Unsure', emoji: '❓' },
      ],
      presetSources: [],
      fields: {
        namePlaceholder: 'Level name',
        creatorsPlaceholder: 'Creator(s)',
        videoPlaceholder: 'https://youtu.be/…',
        listIdPlaceholder: 'Original list ID',
        notesPlaceholder: 'Optional notes about placement...',
        victorsPlaceholder: '[{"name": "Player", "date": "YYYY-MM-DD", "time": "Hh Mm Ss", "attempts": 123, "video": "https://..."}]',
        filterPlaceholder: 'Filter by name...',
      },
      defaultVisibleColumns: ['rank', 'name', 'creators', 'tags', 'confidence'],
      defaultSettings: {
        confirmDelete: true,
        confirmReset: true,
        confirmImportOverwrite: true,
        enableDragDrop: true,
        inlineEditMode: 'single',
        defaultNewStatus: 'pending',
      },
    }
  }
};

export const DEFAULT_CONFIG = {
  appTitle: '',
  comparison: {
    voteButtonText: '',
    certaintyLabel: '',
  },
  confidenceLevels: [],
  presetSources: [],
  fields: {
    namePlaceholder: '',
    creatorsPlaceholder: '',
    videoPlaceholder: '',
    listIdPlaceholder: '',
    notesPlaceholder: '',
    victorsPlaceholder: '',
    filterPlaceholder: '',
  },
  defaultVisibleColumns: [],
  defaultSettings: {
    confirmDelete: true,
    confirmReset: true,
    confirmImportOverwrite: true,
    enableDragDrop: true,
    inlineEditMode: 'single',
    defaultNewStatus: 'pending',
  },
};

export let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

export let CONFIDENCE_LEVELS = Object.fromEntries(
  DEFAULT_CONFIG.confidenceLevels.map(c => [c.id.toUpperCase(), c.id])
);

export const STORAGE_KEY = 'demonListSession';
export const SETTINGS_KEY = 'demonListSettings';
export const IMPORT_TEMPLATES_KEY = 'importSchemaTemplates';
export const CONFIG_TEMPLATES_KEY = 'configTemplates';
export const CONFIG_TEMPLATE_KEY = 'selectedConfigTemplate';

export const state = {
  rawLevels: [],
  levelMap: new Map(),
  rankedList: [],
  pendingLevels: [],
  insertionSession: null,
  compCount: 0,
  placementHistory: [],
  rankingFilter: '',
  comparisonGraph: new Map(),
  contradictions: [],
  selectedConfidence: null,
  toastTimer: null,
  customValues: [],
  modalMode: null,
  modalLevelId: null,
  rankingsSort: { column: 'rank', direction: 'asc' },
  dragSrcIdx: null,
  detectedColumns: [],
  detectedColumnsOrder: {},
  hiddenColumns: [],
  selectedLevels: new Set(),
  dynamicFields: [],
  settings: { ...DEFAULT_CONFIG.defaultSettings },
};

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

export function applyUserConfig(userConfig) {
  if (!userConfig || typeof userConfig !== 'object') return;
  if (userConfig.appTitle) config.appTitle = userConfig.appTitle;
  if (userConfig.comparison && typeof userConfig.comparison === 'object') {
    Object.assign(config.comparison, userConfig.comparison);
  }
  if (Array.isArray(userConfig.confidenceLevels) && userConfig.confidenceLevels.length > 0) {
    config.confidenceLevels = userConfig.confidenceLevels;
  }
  if (Array.isArray(userConfig.presetSources)) {
    config.presetSources = userConfig.presetSources;
  }
  if (userConfig.fields && typeof userConfig.fields === 'object') {
    Object.assign(config.fields, userConfig.fields);
  }
  if (Array.isArray(userConfig.defaultVisibleColumns) && userConfig.defaultVisibleColumns.length > 0) {
    config.defaultVisibleColumns = userConfig.defaultVisibleColumns;
  }
  if (userConfig.defaultSettings && typeof userConfig.defaultSettings === 'object') {
    Object.assign(config.defaultSettings, userConfig.defaultSettings);
  }

  CONFIDENCE_LEVELS = Object.fromEntries(
    config.confidenceLevels.map(c => [c.id.toUpperCase(), c.id])
  );

  Object.assign(state.settings, config.defaultSettings);
  state.selectedConfidence = config.confidenceLevels[0]?.id ?? state.selectedConfidence;
}

export function listAvailableTemplates() {
  const userTemplates = listConfigTemplates();
  return {
    builtin: CONFIG_TEMPLATES,
    custom: userTemplates,
  };
}

export function applyConfigTemplate(templateName) {
  if (CONFIG_TEMPLATES[templateName]) {
    applyUserConfig(CONFIG_TEMPLATES[templateName].config);
    try {
      localStorage.setItem(CONFIG_TEMPLATE_KEY, templateName);
    } catch (e) {
      console.error('Failed to save selected template:', e);
    }
    return true;
  }

  const customTemplates = listConfigTemplates();
  if (customTemplates[templateName]) {
    applyUserConfig(customTemplates[templateName]);
    try {
      localStorage.setItem(CONFIG_TEMPLATE_KEY, templateName);
    } catch (e) {
      console.error('Failed to save selected template:', e);
    }
    return true;
  }

  return false;
}

export function saveConfigTemplate(name, configObj) {
  if (!name || !configObj) return false;
  const templates = listConfigTemplates();
  templates[name.trim()] = JSON.parse(JSON.stringify(configObj));
  try {
    localStorage.setItem(CONFIG_TEMPLATES_KEY, JSON.stringify(templates));
    return true;
  } catch (e) {
    console.error('Failed to save config template:', e);
    return false;
  }
}

export function listConfigTemplates() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_TEMPLATES_KEY) || '{}');
  } catch (e) {
    console.error('Failed to load config templates:', e);
    return {};
  }
}

export function deleteConfigTemplate(name) {
  const templates = listConfigTemplates();
  delete templates[name];
  try {
    localStorage.setItem(CONFIG_TEMPLATES_KEY, JSON.stringify(templates));
    return true;
  } catch (e) {
    console.error('Failed to delete config template:', e);
    return false;
  }
}

export function getSelectedTemplate() {
  try {
    return localStorage.getItem(CONFIG_TEMPLATE_KEY);
  } catch (e) {
    console.error('Failed to get selected template:', e);
    return null;
  }
}

export const BUILTIN_FIELD_DEFINITIONS = [
  { id: 'rank', label: 'Rank', type: 'rank', sortable: true, filterable: false, groupable: true, conditional: false },
  { id: 'name', label: 'Name', type: 'text', sortable: true, filterable: true, groupable: false, conditional: false },
  { id: 'creators', label: 'Creator', type: 'text', sortable: true, filterable: true, groupable: true, conditional: false },
  { id: 'tags', label: 'Tags', type: 'text', sortable: true, filterable: true, groupable: true, conditional: false },
  { id: 'confidence', label: 'Confidence', type: 'enum', sortable: true, filterable: true, groupable: true, conditional: false },
  { id: 'lastEdited', label: 'Last edited', type: 'datetime', sortable: true, filterable: false, groupable: false, conditional: false },
  { id: 'id', label: 'ID', type: 'text', sortable: true, filterable: false, groupable: false, conditional: false },
  { id: 'victors', label: 'Victors', type: 'text', sortable: false, filterable: false, groupable: false, conditional: false },
  { id: 'showcaseVideo', label: 'Video URL', type: 'text', sortable: false, filterable: false, groupable: false, conditional: false },
];

export const FIELD_ID_SET = new Set(BUILTIN_FIELD_DEFINITIONS.map(field => field.id));

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

export function getAllFieldDefinitions() {
  return [...BUILTIN_FIELD_DEFINITIONS, ...state.dynamicFields];
}

export function getAllColumns(includeHidden = false) {
  if (includeHidden) return state.detectedColumns.slice();
  return getOrderedColumns();
}

export function getAllColumnDefinitions() {
  return getOrderedColumns().map(getFieldDefinition).filter(Boolean);
}

export function compKey(a, b) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

export function makeLevelId(nameOrLevel, index = 0) {
  if (nameOrLevel && typeof nameOrLevel === 'object') {
    const actualId = nameOrLevel._id ?? nameOrLevel.id ?? nameOrLevel.levelId ?? nameOrLevel.levelID ?? nameOrLevel.gdId ?? null;
    if (actualId != null && String(actualId).trim()) {
      const normalized = String(actualId).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      return `level_${normalized}`;
    }
    return makeLevelId(nameOrLevel.name ?? '', index);
  }

  const slug = String(nameOrLevel).toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
  return `${slug}_${index}_${Date.now()}`;
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

export function normalizeLevelObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return { name: String(obj || '').trim(), pending: true };
  }

  const rawName = [obj.name, obj.level, obj.title].find(value => value != null && String(value).trim() !== '');
  const name = rawName ? String(rawName).trim() : '';
  const rawId = obj.id ?? obj.levelID ?? null;
  const rawRank = obj.rank ?? null;
  const parsedRank = rawRank != null
    ? (Number.isFinite(Number(rawRank)) ? Number(rawRank) : parseInt(String(rawRank).replace(/[^0-9]/g, ''), 10) || null)
    : null;
  const rawGdId = obj.gdId ?? obj.levelId ?? obj.levelID ?? null;
  const parsedGdId = rawGdId != null
    ? (Number.isFinite(Number(rawGdId)) ? Number(rawGdId) : parseInt(String(rawGdId).replace(/[^0-9]/g, ''), 10) || null)
    : null;

  const result = { ...obj, name };

  if (obj.creators || obj.creator || obj.author) {
    result.creators = obj.creators || obj.creator || obj.author;
  }

  if (obj.showcaseVideo || obj.video) {
    result.showcaseVideo = obj.showcaseVideo || obj.video;
  }

  if (rawId != null && String(rawId).trim()) {
    result.id = rawId;
  }

  if (parsedRank !== null) {
    result.rank = parsedRank;
  }

  if (Array.isArray(obj.tags) ? obj.tags.length > 0 : obj.tags != null && String(obj.tags).trim()) {
    result.tags = obj.tags;
  }

  result.pending = obj.pending ?? (rawId == null && parsedRank == null);

  if (obj.confidence != null && obj.confidence !== '') {
    result.confidence = obj.confidence;
  }

  if (obj.lastEdited != null && obj.lastEdited !== '') {
    result.lastEdited = obj.lastEdited;
  }

  if (obj.thumbnail || obj.image || obj.img) {
    result.thumbnail = obj.thumbnail || obj.image || obj.img;
  }

  if (obj.customValues && typeof obj.customValues === 'object' && Object.keys(obj.customValues).length > 0) {
    result.customValues = { ...obj.customValues };
  }

  if (obj._id != null && String(obj._id).trim()) {
    result._id = obj._id;
  }

  return result;
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

export function getCustomField(fieldId) {
  return state.customValues.find(v => v.id === fieldId) || null;
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

export function detectColumnsFromLevels() {
  const defaultVisible = Array.isArray(config.defaultVisibleColumns) ? config.defaultVisibleColumns : [];
  const seenProperties = new Set();
  const propertyOrder = [];

  state.rawLevels.forEach(level => {
    Object.keys(level).forEach(key => {
      if (!['_id', 'customValues', 'pending'].includes(key) && !seenProperties.has(key)) {
        seenProperties.add(key);
        propertyOrder.push(key);
      }
    });
  });

  const visibleFields = propertyOrder.filter(key => !FIELD_ID_SET.has(key));
  const restored = state.detectedColumns.length > 0
    ? [...new Set([...state.detectedColumns, ...defaultVisible, ...visibleFields])]
    : [...new Set([...defaultVisible, ...visibleFields])];

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

  _invalidateColumnsCache();
}

let _orderedColumnsCache = null;
let _orderedColumnsCacheVersion = -1;
let _detectedColumnsVersion = 0;

function _invalidateColumnsCache() {
  _detectedColumnsVersion++;
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

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(state.settings, JSON.parse(raw));
  } catch (_) { }
}

export function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (_) { }
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