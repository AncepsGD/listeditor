import {
  loadJSON, reset, vote, undo, cancelInsertion,
  moveLevel, moveLevelUp, moveLevelDown, moveToPosition,
  reevaluateRanked, reevaluateRange, deleteLevel,
  loadSession, getRankingsExport, showToast,
  showImportError, hideImportError, getMid,
  checkContradictions, clearSession, saveSession,
  mergeUpdates, dismissUpdate,
} from './logic.js';
import { renderAll } from './render.main.js';
import {
  openEditModal, openAddModal, closeModal, submitModal, updateModalThumb,
  openSettingsModal, closeSettingsModal, saveSettingsModal,
  openCustomValuesModal, closeCustomValuesModal, addCustomValueFromModal,
} from './render.modals.js';
import {
  state, config, applyUserConfig,
  loadSettings, saveSettings, hideColumn, escHtml,
  CONFIG_TEMPLATES, listAvailableTemplates, applyConfigTemplate,
  listConfigTemplates, saveConfigTemplate, getSelectedTemplate,
} from './state.js';
import {
  addDetectedColumn,
  getOrderedColumns,
  hideColumn as hideColumnByName,
  showColumn,
  removeDetectedColumn,
  reorderColumn,
} from './state.columns.js';
import { BUILTIN_FIELD_DEFINITIONS, getFieldDefinition, getFieldLabel, setFieldLabel } from './state.fields.js';

window.demonListUI = {
  loadJSON, reset, vote, undo, cancelInsertion,
  moveLevel, moveLevelUp, moveLevelDown, moveToPosition,
  openEditModal, openAddModal, deleteLevel, reevaluateRanked, reevaluateRange,
};

function csvEscapeValue(val) {
  if (val == null) return '';
  const str = Array.isArray(val)
    ? val.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join('; ')
    : typeof val === 'object'
      ? JSON.stringify(val)
      : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function buildCSV(rankings) {
  if (rankings.length === 0) return '';
  const allKeys = new Set();
  rankings.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
  const headers = Array.from(allKeys);
  const rows = [
    headers.map(csvEscapeValue).join(','),
    ...rankings.map(r => headers.map(h => csvEscapeValue(r[h])).join(','))
  ];
  return rows.join('\n');
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.exportRankingsJSON = async (download = false) => {
  const rankings = getRankingsExport();
  if (rankings.length === 0) { showToast('No rankings to export', 'danger'); return; }
  const json = JSON.stringify(rankings, null, 2);
  if (download) {
    downloadFile(json, 'rankings.json', 'application/json');
    showToast(`Downloaded ${rankings.length} rankings as JSON`);
  } else {
    await copyToClipboard(json);
    showToast(`Copied ${rankings.length} rankings to clipboard`);
  }
};

window.exportRankingsCSV = async (download = false) => {
  const rankings = getRankingsExport();
  if (rankings.length === 0) { showToast('No rankings to export', 'danger'); return; }
  const csv = buildCSV(rankings);
  if (download) {
    downloadFile(csv, 'rankings.csv', 'text/csv');
    showToast(`Downloaded ${rankings.length} rankings as CSV`);
  } else {
    await copyToClipboard(csv);
    showToast(`Copied ${rankings.length} rankings as CSV`);
  }
};

function applyConfigToDOM() {
  document.title = config.appTitle;
  const logoTitle = document.querySelector('.logo-title');
  if (logoTitle) logoTitle.textContent = config.appTitle;

  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  if (btnLeft) btnLeft.textContent = config.comparison.voteButtonText;
  if (btnRight) btnRight.textContent = config.comparison.voteButtonText;

  const presetSelect = document.getElementById('import-preset-select');
  if (presetSelect) {
    while (presetSelect.options.length > 1) presetSelect.remove(1);
    config.presetSources.forEach(source => {
      const opt = document.createElement('option');
      opt.value = source.url;
      opt.textContent = source.label;
      presetSelect.appendChild(opt);
    });
  }

  const nameInput = document.getElementById('modal-name');
  if (nameInput) nameInput.placeholder = config.fields.namePlaceholder;

  const creatorsInput = document.getElementById('modal-creators');
  if (creatorsInput) creatorsInput.placeholder = config.fields.creatorsPlaceholder;

  const videoInput = document.getElementById('modal-video');
  if (videoInput) videoInput.placeholder = config.fields.videoPlaceholder;

  const listIdInput = document.getElementById('modal-listid');
  if (listIdInput) listIdInput.placeholder = config.fields.listIdPlaceholder;

  const notesInput = document.getElementById('modal-notes');
  if (notesInput) notesInput.placeholder = config.fields.notesPlaceholder;

  const victorsInput = document.getElementById('modal-victors');
  if (victorsInput) victorsInput.placeholder = config.fields.victorsPlaceholder;

  const filterInput = document.getElementById('filter-input');
  if (filterInput) filterInput.placeholder = config.fields.filterPlaceholder;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!config.appTitle) {
    applyConfigTemplate('minimal');
  }
  loadSettings();
  applyConfigToDOM();
  initializeUI();
});

function initializeTemplateSelection() {
  applyConfigTemplate('minimal');
  loadSettings();
  applyConfigToDOM();
  initializeUI();
}

function renderColumnsList() {
  const listEl = document.getElementById('columns-list');
  const addSelect = document.getElementById('column-add-select');
  if (!listEl) return;

  const availableColumns = [];
  const detectedColumns = [...state.detectedColumns];
  const allFields = [
    ...BUILTIN_FIELD_DEFINITIONS,
    ...state.dynamicFields,
    ...state.customValues.map(field => ({ id: `custom_${field.id}`, label: field.name, custom: true })),
  ];

  allFields.forEach(field => {
    if (!detectedColumns.includes(field.id)) {
      availableColumns.push(field);
    }
  });

  if (addSelect) {
    addSelect.innerHTML = '<option value="">Add a column…</option>' + availableColumns.map(field => `<option value="${field.id}">${escHtml(field.label)}</option>`).join('');
  }

  listEl.innerHTML = detectedColumns.map(column => {
    const fieldDef = getFieldDefinition(column);
    const label = getFieldLabel(column);
    const hidden = state.hiddenColumns.includes(column);
    return `
      <div class="column-manager-item ${hidden ? 'is-hidden' : ''}">
        <div class="column-manager-main">
          <div class="column-manager-name">${escHtml(label)}</div>
          <div class="column-manager-meta">${escHtml(fieldDef?.type || 'field')} • ${hidden ? 'Hidden' : 'Visible'}</div>
        </div>
        <div class="column-manager-controls">
          <input type="text" class="field-input column-rename-input" data-column="${column}" value="${escHtml(label)}" placeholder="Rename column">
          <button class="btn btn-xs column-action-btn" data-action="toggle" data-column="${column}">${hidden ? 'Show' : 'Hide'}</button>
          <button class="btn btn-xs btn-danger column-action-btn" data-action="remove" data-column="${column}">Remove</button>
        </div>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.column-rename-input').forEach(input => {
    input.addEventListener('change', () => {
      const { column } = input.dataset;
      const label = input.value.trim();
      if (!column) return;
      setFieldLabel(column, label);
      saveSettings();
      renderAll();
      renderColumnsList();
    });
  });
}

function openColumnsModal() {
  renderColumnsList();
  const modal = document.getElementById('columns-modal');
  if (modal) modal.classList.add('active');
}

function closeColumnsModal() {
  const modal = document.getElementById('columns-modal');
  if (modal) modal.classList.remove('active');
}

function initializeUI() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  function activateTab(tabName) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    tabContents.forEach(content => {
      const matches = content.id === `${tabName}-tab`;
      content.classList.toggle('active', matches);
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });

  document.addEventListener('dl:tabswitch', e => {
    activateTab(e.detail.tab);
  });

  const importPanelIds = ['import-main-panel', 'import-pending-panel', 'replace-main-panel'];

  function showImportSubPanel(panelId) {
    const target = panelId ?? 'import-main-panel';
    importPanelIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== target);
    });
  }

  function setupPanelImport(panelType, forceMode) {
    const fileInput = document.getElementById(`file-input-${panelType}`);
    if (fileInput) fileInput.value = '';
    hideImportError(panelType);

    const dropZone = document.getElementById(`drop-zone-${panelType}`);
    const pasteBtn = document.getElementById(`paste-btn-${panelType}`);
    const submitPasteBtn = document.getElementById(`submit-paste-${panelType}`);
    const cancelPasteBtn = document.getElementById(`cancel-paste-${panelType}`);
    const pasteArea = document.getElementById(`paste-area-${panelType}`);
    const pasteTextarea = document.getElementById(`paste-textarea-${panelType}`);

    function readFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => loadJSON(ev.target.result, forceMode);
      reader.onerror = () => showImportError('Could not read the file.', panelType);
      reader.readAsText(file);
    }

    if (fileInput) {
      fileInput.addEventListener('change', e => readFile(e.target.files[0]));
    }

    if (dropZone) {
      dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        readFile(e.dataTransfer.files[0]);
      });
      dropZone.addEventListener('click', () => fileInput?.click());
    }

    if (pasteBtn) {
      pasteBtn.addEventListener('click', () => {
        pasteArea?.classList.remove('hidden');
        pasteTextarea?.focus();
      });
    }

    if (submitPasteBtn) {
      submitPasteBtn.addEventListener('click', () => {
        if (pasteTextarea) {
          loadJSON(pasteTextarea.value, forceMode);
          pasteTextarea.value = '';
        }
        pasteArea?.classList.add('hidden');
      });
    }

    if (cancelPasteBtn) {
      cancelPasteBtn.addEventListener('click', () => {
        pasteArea?.classList.add('hidden');
        if (pasteTextarea) pasteTextarea.value = '';
      });
    }
  }

  setupPanelImport('main', 'replace');
  setupPanelImport('pending', 'append');
  setupPanelImport('replace', 'replace');

  const importPresetBtn = document.getElementById('import-preset-btn');
  const importPresetSelect = document.getElementById('import-preset-select');

  async function loadPresetSource(url) {
    if (!url) {
      showImportError('Please enter or select a URL first.', 'main');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      showImportError('URL must start with http:// or https://', 'main');
      return;
    }
    hideImportError('main');
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      loadJSON(text, null, url);
    } catch (error) {
      showImportError(`Could not load URL: ${error.message}`, 'main');
    }
  }

  if (importPresetBtn) {
    importPresetBtn.addEventListener('click', () => {
      loadPresetSource(importPresetSelect?.value ?? '');
    });
  }

  const importUrlBtn = document.getElementById('import-url-btn');
  const importUrlInput = document.getElementById('import-url-input');
  if (importUrlBtn && importUrlInput) {
    importUrlBtn.addEventListener('click', () => {
      loadPresetSource(importUrlInput.value.trim());
    });
    importUrlInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadPresetSource(importUrlInput.value.trim());
      }
    });
  }

  const exportMainBtn = document.getElementById('export-main-btn');
  const exportMenu = document.getElementById('export-menu');

  if (exportMainBtn && exportMenu) {
    exportMainBtn.addEventListener('click', e => {
      e.stopPropagation();
      exportMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => exportMenu.classList.add('hidden'));
    exportMenu.addEventListener('click', e => e.stopPropagation());

    document.getElementById('export-json-copy')?.addEventListener('click', () => {
      exportMenu.classList.add('hidden');
      window.exportRankingsJSON(false);
    });
    document.getElementById('export-json-download')?.addEventListener('click', () => {
      exportMenu.classList.add('hidden');
      window.exportRankingsJSON(true);
    });
    document.getElementById('export-csv-copy')?.addEventListener('click', () => {
      exportMenu.classList.add('hidden');
      window.exportRankingsCSV(false);
    });
    document.getElementById('export-csv-download')?.addEventListener('click', () => {
      exportMenu.classList.add('hidden');
      window.exportRankingsCSV(true);
    });
  }

  const resetBtn = document.getElementById('reset-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const undoBtn = document.getElementById('undo-btn');
  const cancelBtn = document.getElementById('skip-btn');
  const addLevelBtn = document.getElementById('add-level-btn');
  const customValuesBtn = document.getElementById('custom-values-btn');
  const columnsBtn = document.getElementById('columns-btn');
  const replaceMainBtn = document.getElementById('replace-main-btn');
  const importPendingBtn = document.getElementById('import-pending-btn');
  const backFromPendingBtn = document.getElementById('back-from-pending-btn');
  const backFromReplaceBtn = document.getElementById('back-from-replace-btn');

  if (cancelBtn) cancelBtn.addEventListener('click', cancelInsertion);
  if (resetBtn) resetBtn.addEventListener('click', reset);
  if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
  if (customValuesBtn) customValuesBtn.addEventListener('click', openCustomValuesModal);
  if (columnsBtn) columnsBtn.addEventListener('click', openColumnsModal);
  if (undoBtn) undoBtn.addEventListener('click', undo);
  if (addLevelBtn) addLevelBtn.addEventListener('click', openAddModal);

  if (replaceMainBtn) {
    replaceMainBtn.addEventListener('click', () => {
      activateTab('import');
      showImportSubPanel('replace-main-panel');
    });
  }

  if (importPendingBtn) {
    importPendingBtn.addEventListener('click', () => {
      activateTab('import');
      showImportSubPanel('import-pending-panel');
    });
  }

  if (backFromPendingBtn) {
    backFromPendingBtn.addEventListener('click', () => showImportSubPanel(null));
  }

  const removeColumnSelect = document.getElementById('remove-column-select');
  if (removeColumnSelect) {
    removeColumnSelect.addEventListener('change', (e) => {
      const columnName = e.target.value;
      if (columnName) {
        hideColumn(columnName);
        renderAll();
        saveSession();
        e.target.value = '';
      }
    });
  }

  if (backFromReplaceBtn) {
    backFromReplaceBtn.addEventListener('click', () => showImportSubPanel(null));
  }

  const modalCloseBtn = document.getElementById('modal-close-btn');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);

  const modalCancelBtn = document.getElementById('modal-cancel');
  if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);

  const modalSaveBtn = document.getElementById('modal-save');
  if (modalSaveBtn) modalSaveBtn.addEventListener('click', submitModal);

  const modalOverlay = document.getElementById('level-modal');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', e => {
      if (e.target === modalOverlay) closeModal();
    });
    modalOverlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
        submitModal();
      }
    });
  }

  const settingsModalCloseBtn = document.getElementById('settings-modal-close-btn');
  if (settingsModalCloseBtn) settingsModalCloseBtn.addEventListener('click', closeSettingsModal);

  const settingsCancelBtn = document.getElementById('settings-cancel');
  if (settingsCancelBtn) settingsCancelBtn.addEventListener('click', closeSettingsModal);

  const settingsSaveBtn = document.getElementById('settings-save');
  if (settingsSaveBtn) settingsSaveBtn.addEventListener('click', saveSettingsModal);

  const settingsModalOverlay = document.getElementById('settings-modal');
  if (settingsModalOverlay) {
    settingsModalOverlay.addEventListener('click', e => {
      if (e.target === settingsModalOverlay) closeSettingsModal();
    });
    settingsModalOverlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSettingsModal();
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
        saveSettingsModal();
      }
    });
  }

  const customValuesModalCloseBtn = document.getElementById('custom-values-modal-close-btn');
  if (customValuesModalCloseBtn) customValuesModalCloseBtn.addEventListener('click', closeCustomValuesModal);

  const columnsModalCloseBtn = document.getElementById('columns-modal-close-btn');
  if (columnsModalCloseBtn) columnsModalCloseBtn.addEventListener('click', closeColumnsModal);

  const columnsCloseBtn = document.getElementById('columns-close');
  if (columnsCloseBtn) columnsCloseBtn.addEventListener('click', closeColumnsModal);

  const columnsModalOverlay = document.getElementById('columns-modal');
  if (columnsModalOverlay) {
    columnsModalOverlay.addEventListener('click', e => {
      if (e.target === columnsModalOverlay) closeColumnsModal();
    });
  }

  const columnsAddBtn = document.getElementById('column-add-btn');
  const columnsAddSelect = document.getElementById('column-add-select');
  if (columnsAddBtn && columnsAddSelect) {
    columnsAddBtn.addEventListener('click', () => {
      const value = columnsAddSelect.value;
      if (!value) return;
      addDetectedColumn(value);
      saveSession();
      renderAll();
      renderColumnsList();
      columnsAddSelect.value = '';
      showToast('Column added');
    });
  }

  const customValuesCloseBtn = document.getElementById('custom-values-close');
  if (customValuesCloseBtn) customValuesCloseBtn.addEventListener('click', closeCustomValuesModal);

  const addCustomValueBtn = document.getElementById('add-custom-value-btn');
  if (addCustomValueBtn) addCustomValueBtn.addEventListener('click', addCustomValueFromModal);

  const newCustomValueNameInput = document.getElementById('new-custom-value-name');
  if (newCustomValueNameInput) {
    newCustomValueNameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addCustomValueFromModal(); }
    });
  }

  const newCustomValueTypeSelect = document.getElementById('new-custom-value-type');
  const newCustomValueOptions = document.getElementById('new-custom-value-options');
  if (newCustomValueTypeSelect && newCustomValueOptions) {
    newCustomValueTypeSelect.addEventListener('change', () => {
      newCustomValueOptions.style.display = newCustomValueTypeSelect.value === 'enum' ? 'inline-block' : 'none';
    });
  }

  const customValuesModalOverlay = document.getElementById('custom-values-modal');
  if (customValuesModalOverlay) {
    customValuesModalOverlay.addEventListener('click', e => {
      if (e.target === customValuesModalOverlay) closeCustomValuesModal();
    });
    customValuesModalOverlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeCustomValuesModal();
    });
  }

  document.addEventListener('click', e => {
    if (e.target.classList.contains('column-action-btn')) {
      const action = e.target.dataset.action;
      const column = e.target.dataset.column;
      if (action === 'toggle') {
        if (state.hiddenColumns.includes(column)) {
          showColumn(column);
        } else {
          hideColumnByName(column);
        }
        saveSession();
        renderAll();
        renderColumnsList();
      } else if (action === 'remove') {
        removeDetectedColumn(column);
        saveSession();
        renderAll();
        renderColumnsList();
      }
    }
  });

  const modalVideoInput = document.getElementById('modal-video');
  if (modalVideoInput) modalVideoInput.addEventListener('input', updateModalThumb);

  const modalListidInput = document.getElementById('modal-listid');
  if (modalListidInput) modalListidInput.addEventListener('input', updateModalThumb);

  const modalNameInput = document.getElementById('modal-name');
  if (modalNameInput) {
    modalNameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); submitModal(); }
    });
    modalNameInput.addEventListener('input', () => modalNameInput.classList.remove('error'));
  }

  const reevalRangeBtn = document.getElementById('reeval-range-btn');
  const reevalPanel = document.getElementById('reeval-panel');

  if (reevalRangeBtn && reevalPanel) {
    reevalRangeBtn.addEventListener('click', () => {
      reevalPanel.classList.toggle('hidden');
      if (!reevalPanel.classList.contains('hidden')) {
        document.getElementById('reeval-from')?.focus();
      }
    });
  }

  function updateReevalInfo() {
    const infoEl = document.getElementById('reeval-info');
    if (!infoEl) return;
    const from = parseInt(document.getElementById('reeval-from')?.value);
    const to = parseInt(document.getElementById('reeval-to')?.value);
    if (!isNaN(from) && !isNaN(to) && from >= 1 && to >= from) {
      const count = Math.min(to, state.rankedList.length) - Math.max(1, from) + 1;
      infoEl.textContent = count > 0 ? `${count} level(s) affected` : 'No levels in that range';
    } else {
      infoEl.textContent = '';
    }
  }

  document.getElementById('reeval-from')?.addEventListener('input', updateReevalInfo);
  document.getElementById('reeval-to')?.addEventListener('input', updateReevalInfo);

  const reevalConfirm = document.getElementById('reeval-confirm');
  if (reevalConfirm) {
    reevalConfirm.addEventListener('click', () => {
      const from = parseInt(document.getElementById('reeval-from').value);
      const to = parseInt(document.getElementById('reeval-to').value);
      if (isNaN(from) || isNaN(to) || from < 1 || to < from) {
        showToast('Invalid range — enter valid positions', 'danger');
        return;
      }
      const count = Math.min(to, state.rankedList.length) - Math.max(1, from) + 1;
      if (count <= 0) { showToast('No levels in that range', 'danger'); return; }
      if (confirm(`Move ${count} level(s) at positions ${from}–${to} to pending for re-ranking?`)) {
        reevaluateRange(from, to);
        reevalPanel?.classList.add('hidden');
        const fromEl = document.getElementById('reeval-from');
        const toEl = document.getElementById('reeval-to');
        const infoEl = document.getElementById('reeval-info');
        if (fromEl) fromEl.value = '';
        if (toEl) toEl.value = '';
        if (infoEl) infoEl.textContent = '';
      }
    });
  }

  const reevalCancel = document.getElementById('reeval-cancel');
  if (reevalCancel) {
    reevalCancel.addEventListener('click', () => reevalPanel?.classList.add('hidden'));
  }

  const filterInput = document.getElementById('filter-input');
  if (filterInput) {
    filterInput.addEventListener('input', e => {
      state.rankingFilter = e.target.value.toLowerCase();
      renderAll();
    });
  }

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (document.getElementById('level-modal')?.classList.contains('active')) return;
    if (document.getElementById('settings-modal')?.classList.contains('active')) return;
    if (document.getElementById('custom-values-modal')?.classList.contains('active')) return;
    if (e.key === 'ArrowLeft') document.getElementById('btn-left')?.click();
    else if (e.key === 'ArrowRight') document.getElementById('btn-right')?.click();
    else if (e.key === 'Escape') cancelInsertion();
    else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
  });

  if (loadSession()) {
    const sessionPanel = document.getElementById('session-panel');
    if (sessionPanel) sessionPanel.classList.remove('hidden');
    const rb = document.getElementById('reset-btn');
    if (rb) rb.classList.remove('hidden');
    activateTab('comparison');
    renderAll();
  }

  const updatePreviewCloseBtn = document.getElementById('update-preview-close-btn');
  if (updatePreviewCloseBtn) updatePreviewCloseBtn.addEventListener('click', dismissUpdate);

  const updatePreviewMergeBtn = document.getElementById('update-preview-merge');
  if (updatePreviewMergeBtn) updatePreviewMergeBtn.addEventListener('click', () => {
    mergeUpdates();
    document.getElementById('update-preview-modal')?.classList.add('hidden');
  });

  const updatePreviewDismissBtn = document.getElementById('update-preview-dismiss');
  if (updatePreviewDismissBtn) updatePreviewDismissBtn.addEventListener('click', () => {
    dismissUpdate();
    document.getElementById('update-preview-modal')?.classList.add('hidden');
  });

  const updatePreviewOverlay = document.getElementById('update-preview-modal');
  if (updatePreviewOverlay) {
    updatePreviewOverlay.addEventListener('click', e => {
      if (e.target === updatePreviewOverlay) dismissUpdate();
    });
    updatePreviewOverlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') dismissUpdate();
    });
  }
}