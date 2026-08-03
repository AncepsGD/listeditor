import { state } from './state.js';

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
      presetSources: [
        { label: 'THAL - Achievements', url: 'https://fastly.jsdelivr.net/gh/The-Hardest-Achievements-List/The-Hardest-Achievements-List@main/data/achievements.json' },
        { label: 'THAL - Pending', url: 'https://fastly.jsdelivr.net/gh/The-Hardest-Achievements-List/The-Hardest-Achievements-List@main/data/pending.json' },
        { label: 'THAL - Timeline', url: 'https://fastly.jsdelivr.net/gh/The-Hardest-Achievements-List/The-Hardest-Achievements-List@main/data/timeline.json' },
        { label: 'THAL - Platformer Pending', url: 'https://fastly.jsdelivr.net/gh/The-Hardest-Achievements-List/The-Hardest-Achievements-List@main/data/platformerpending.json' },
        { label: 'THAL - Platformer Timeline', url: 'https://fastly.jsdelivr.net/gh/The-Hardest-Achievements-List/The-Hardest-Achievements-List@main/data/platformertimeline.json' },
        { label: 'THAL - Legacy', url: 'https://fastly.jsdelivr.net/gh/The-Hardest-Achievements-List/The-Hardest-Achievements-List@main/data/legacy.json' },
        { label: 'Practice Mode List - Levels', url: 'https://fastly.jsdelivr.net/gh/AncepsGD/practice-mode-list@main/levels.json' },
        { label: 'Practice Mode List - Verifications', url: 'https://fastly.jsdelivr.net/gh/AncepsGD/practice-mode-list@main/verifications.json' },
        { label: 'Old Impossible Levels List', url: 'https://fastly.jsdelivr.net/gh/AncepsGD/old-impossible-levels-list@main/levels.json' },
      ],
      fields: {
        namePlaceholder: 'Item name',
        creatorsPlaceholder: 'Creator(s)',
        videoPlaceholder: 'Video URL',
        listIdPlaceholder: 'ID',
        notesPlaceholder: 'Notes',
        victorsPlaceholder: '[]',
        filterPlaceholder: 'Filter...',
      },
      defaultVisibleColumns: ['rank', 'name'],
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
      presetSources: [
        { label: 'THAL - Achievements', url: 'https://fastly.jsdelivr.net/gh/The-Hardest-Achievements-List/The-Hardest-Achievements-List@main/data/achievements.json' },
        { label: 'THAL - Pending', url: 'https://fastly.jsdelivr.net/gh/The-Hardest-Achievements-List/The-Hardest-Achievements-List@main/data/pending.json' },
        { label: 'THAL - Timeline', url: 'https://fastly.jsdelivr.net/gh/The-Hardest-Achievements-List/The-Hardest-Achievements-List@main/data/timeline.json' },
        { label: 'THAL - Platformer Pending', url: 'https://fastly.jsdelivr.net/gh/The-Hardest-Achievements-List/The-Hardest-Achievements-List@main/data/platformerpending.json' },
        { label: 'THAL - Platformer Timeline', url: 'https://fastly.jsdelivr.net/gh/The-Hardest-Achievements-List/The-Hardest-Achievements-List@main/data/platformertimeline.json' },
        { label: 'THAL - Legacy', url: 'https://fastly.jsdelivr.net/gh/The-Hardest-Achievements-List/The-Hardest-Achievements-List@main/data/legacy.json' },
        { label: 'Practice Mode List - Levels', url: 'https://fastly.jsdelivr.net/gh/AncepsGD/practice-mode-list@main/levels.json' },
        { label: 'Practice Mode List - Verifications', url: 'https://fastly.jsdelivr.net/gh/AncepsGD/practice-mode-list@main/verifications.json' },
        { label: 'Old Impossible Levels List', url: 'https://fastly.jsdelivr.net/gh/AncepsGD/old-impossible-levels-list@main/levels.json' },
      ],
      fields: {
        namePlaceholder: 'Level name',
        creatorsPlaceholder: 'Creator(s)',
        videoPlaceholder: 'https://youtu.be/…',
        listIdPlaceholder: 'Original list name',
        notesPlaceholder: 'Optional notes about placement...',
        victorsPlaceholder: '[{"name": "Player", "date": "YYYY-MM-DD", "time": "Hh Mm Ss", "attempts": 123, "video": "https://..."}]',
        filterPlaceholder: 'Filter by name...',
      },
      defaultVisibleColumns: ['rank', 'name'],
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
