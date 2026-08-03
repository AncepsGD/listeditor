import * as stateUtils from './state.utils.js';
import * as stateLevels from './state.levels.js';
import * as stateSettings from './state.settings.js';
import * as stateConfig from './state.config.js';
import * as stateColumns from './state.columns.js';
import * as stateCustom from './state.custom.js';
import * as stateFields from './state.fields.js';
import * as stateSchema from './state.schema.js';

export const state = {
  rawLevels: [],
  rankedList: [],
  pendingLevels: [],
  levelMap: new Map(),
  comparisonGraph: new Map(),
  contradictions: [],
  insertionSession: null,
  placementHistory: [],
  compCount: 0,
  toastTimer: null,
  selectedConfidence: undefined,
  selectedLevels: new Set(),
  customValues: [],
  dynamicFields: [],
  detectedColumns: [],
  detectedColumnsOrder: {},
  hiddenColumns: [],
  settings: {},
  columnLabels: {},
  rankingsScrollState: null,
  rankingFilter: '',
};

export const {
  compKey,
  escHtml,
  ytId,
  thumbUrl,
  gdThumbUrl,
  looksLikePlainText,
  looksLikeCSV,
  parsePlainText,
  parseCSV,
  flattenRecord,
  inferFieldType,
} = stateUtils;

export const {
  makeLevelId,
  normalizeLevelObject,
  normalizeLevelName,
  getLevelUniqueIds,
  isDuplicateLevel,
  findDuplicateLevel,
  removeDuplicateLevels,
  computeDataHash,
  fetchPresetData,
  generateUpdateDiff,
} = stateLevels;

export const {
  loadSettings,
  saveSettings,
} = stateSettings;

export const {
  CONFIG_TEMPLATES,
  DEFAULT_CONFIG,
  config,
  CONFIDENCE_LEVELS,
  STORAGE_KEY,
  SETTINGS_KEY,
  IMPORT_TEMPLATES_KEY,
  CONFIG_TEMPLATES_KEY,
  CONFIG_TEMPLATE_KEY,
  applyUserConfig,
  listAvailableTemplates,
  applyConfigTemplate,
  saveConfigTemplate,
  listConfigTemplates,
  deleteConfigTemplate,
  getSelectedTemplate,
} = stateConfig;

export const {
  addCustomColumn,
  removeDetectedColumn,
  addDetectedColumn,
  reorderColumn,
  removeCustomColumn,
  hasColumn,
  hideColumn,
  showColumn,
  isColumnHidden,
  getCustomFieldColumnId,
  getCustomFieldIdFromColumn,
  getVisibleColumns,
  getAllColumns,
  getAllColumnDefinitions,
  detectColumnsFromLevels,
  getOrderedColumns,
} = stateColumns;

export const {
  getCustomValue,
  formatCustomFieldValue,
  setCustomValue,
  addCustomValue,
  updateCustomValue,
  removeCustomValue,
} = stateCustom;

export const {
  BUILTIN_FIELD_DEFINITIONS,
  FIELD_ID_SET,
  setFieldLabel,
  removeFieldLabel,
  getFieldDefinition,
  getFieldLabel,
  isKnownField,
  getAllFieldDefinitions,
} = stateFields;

export const {
  buildSchemaFromRecords,
  applySchemaToRecord,
  saveImportTemplate,
  listImportTemplates,
  loadImportTemplate,
  deleteImportTemplate,
} = stateSchema;

export function getCustomField(customId) {
  return state.customValues.find(field => field.id === customId);
}
