import {
  loadJSON, reset, vote, undo, cancelInsertion,
  moveLevel, moveLevelUp, moveLevelDown, moveToPosition,
  reevaluateRanked, reevaluateRange, deleteLevel,
  loadSession, getRankingsExport, showToast,
  showImportError, hideImportError, getMid,
  checkContradictions, clearSession, saveSession,
} from './logic.js';
import {
  renderAll, openEditModal, openAddModal, closeModal, submitModal, updateModalThumb,
  openSettingsModal, closeSettingsModal, saveSettingsModal,
  openCustomValuesModal, closeCustomValuesModal, addCustomValueFromModal,
} from './render.js';
import {
  state, config, applyUserConfig,
  loadSettings, saveSettings, removeDetectedColumn,
  CONFIG_TEMPLATES, listAvailableTemplates, applyConfigTemplate,
  listConfigTemplates, saveConfigTemplate, getSelectedTemplate,
} from './state.js';

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
  const isConfigured = config.appTitle || config.confidenceLevels.length > 0;

  if (!isConfigured) {
    initializeTemplateSelection();
  } else {
    loadSettings();
    applyConfigToDOM();
    initializeUI();
  }
});

function initializeTemplateSelection() {
  const modal = document.getElementById('config-template-modal');
  const templateOptions = document.getElementById('template-options');
  const configJsonInput = document.getElementById('config-json-input');
  const configApplyJsonBtn = document.getElementById('config-apply-json-btn');
  const configSkipBtn = document.getElementById('config-skip-btn');

  if (!modal || !templateOptions) return;

  const templates = listAvailableTemplates();

  Object.entries(templates.builtin).forEach(([key, template]) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-success';
    btn.style.cssText = 'width: 100%; text-align: left; padding: 0.75rem;';
    btn.innerHTML = `<strong>${template.name}</strong><br><small style="color: #666;">Built-in template</small>`;
    btn.addEventListener('click', () => {
      applyConfigTemplate(key);
      loadSettings();
      applyConfigToDOM();
      modal.classList.remove('active');
      initializeUI();
    });
    templateOptions.appendChild(btn);
  });

  if (Object.keys(templates.custom).length > 0) {
    const customLabel = document.createElement('div');
    customLabel.style.cssText = 'margin-top: 1rem; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.9rem; color: #666;';
    customLabel.textContent = 'Custom Templates';
    templateOptions.appendChild(customLabel);

    Object.entries(templates.custom).forEach(([key, customTemplate]) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.cssText = 'width: 100%; text-align: left; padding: 0.75rem;';
      btn.innerHTML = `<strong>${key}</strong><br><small style="color: #666;">Custom</small>`;
      btn.addEventListener('click', () => {
        applyConfigTemplate(key);
        loadSettings();
        applyConfigToDOM();
        modal.classList.add('hidden');
        initializeUI();
      });
      templateOptions.appendChild(btn);
    });
  }

  if (configApplyJsonBtn) {
    configApplyJsonBtn.addEventListener('click', () => {
      try {
        const customConfig = JSON.parse(configJsonInput.value);
        applyUserConfig(customConfig);
        loadSettings();
        applyConfigToDOM();
        modal.classList.remove('active');
        initializeUI();
      } catch (e) {
        showToast(`Invalid JSON: ${e.message}`, 'danger');
      }
    });
  }

  if (configSkipBtn) {
    configSkipBtn.addEventListener('click', () => {
      modal.classList.remove('active');
      initializeUI();
    });
  }

  modal.classList.add('active');
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
      loadJSON(text);
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
  const replaceMainBtn = document.getElementById('replace-main-btn');
  const importPendingBtn = document.getElementById('import-pending-btn');
  const backFromPendingBtn = document.getElementById('back-from-pending-btn');
  const backFromReplaceBtn = document.getElementById('back-from-replace-btn');

  if (cancelBtn) cancelBtn.addEventListener('click', cancelInsertion);
  if (resetBtn) resetBtn.addEventListener('click', reset);
  if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
  if (customValuesBtn) customValuesBtn.addEventListener('click', openCustomValuesModal);
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
        removeDetectedColumn(columnName);
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
}