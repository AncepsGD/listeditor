import { state, escHtml, makeLevelId, getCustomField, findDuplicateLevel } from './state.js';
import { startInsertion, saveSession } from './logic.js';
import { showToast, deleteLevel, reevaluateRanked, resolveContradiction } from './logic.js';
import { thumbUrl, gdThumbUrl } from './state.js';
import { setThumbElement } from './render.utils.js';
import { addCustomValue, removeCustomValue, updateCustomValue, listImportTemplates, saveImportTemplate, loadImportTemplate, deleteImportTemplate } from './state.js';

let _importPreviewData = { records: [], schema: [], type: 'main' };

export function openEditModal(levelId) {
  const level = state.levelMap.get(levelId);
  if (!level) return;

  state.modalMode = 'edit';
  state.modalLevelId = levelId;

  document.getElementById('modal-title').textContent = 'Edit Level';
  document.getElementById('modal-name').value = level.name || '';
  document.getElementById('modal-creators').value = level.creators || '';
  document.getElementById('modal-video').value = level.showcaseVideo || '';
  document.getElementById('modal-listid').value = level.originalName ?? (level.id != null ? String(level.id) : '');
  const editNotesInput = document.getElementById('modal-notes');
  if (editNotesInput) editNotesInput.value = level.notes || '';
  document.getElementById('modal-victors').value = level.victors ? JSON.stringify(level.victors, null, 2) : '';
  const editStatusGroup = document.getElementById('modal-status-group');
  if (editStatusGroup) editStatusGroup.style.display = 'none';

  updateModalThumb();
  document.getElementById('level-modal').classList.add('active');
  setTimeout(() => document.getElementById('modal-name').focus(), 50);
}

export function openAddModal() {
  state.modalMode = 'add';
  state.modalLevelId = null;

  document.getElementById('modal-title').textContent = 'Add New Level';
  document.getElementById('modal-name').value = '';
  document.getElementById('modal-creators').value = '';
  document.getElementById('modal-video').value = '';
  document.getElementById('modal-listid').value = '';
  const addNotesInput = document.getElementById('modal-notes');
  if (addNotesInput) addNotesInput.value = '';
  document.getElementById('modal-victors').value = '';
  const addStatusGroup = document.getElementById('modal-status-group');
  if (addStatusGroup) addStatusGroup.style.display = 'block';

  const defaultStatusRadio = document.querySelector(
    `input[name="modal-status"][value="${state.settings.defaultNewStatus}"]`
  );
  if (defaultStatusRadio) defaultStatusRadio.checked = true;

  updateModalThumb();
  document.getElementById('level-modal').classList.add('active');
  setTimeout(() => document.getElementById('modal-name').focus(), 50);
}

export function closeModal() {
  document.getElementById('level-modal').classList.remove('active');
  state.modalMode = null;
  state.modalLevelId = null;
}

export function updateModalThumb() {
  const videoVal = document.getElementById('modal-video')?.value ?? '';
  const listidVal = document.getElementById('modal-listid')?.value ?? '';
  const gdId = listidVal && /^\d+$/.test(listidVal.trim()) ? parseInt(listidVal.trim(), 10) : null;
  const ytUrl = thumbUrl(videoVal);
  const gdUrl = gdId ? gdThumbUrl(gdId) : null;
  const primary = gdUrl || ytUrl;
  const fallback = gdUrl && ytUrl ? ytUrl : null;

  const preview = document.getElementById('modal-thumb-preview');
  if (!preview) return;

  if (!primary) {
    preview.style.display = 'none';
    preview.innerHTML = '';
    return;
  }

  preview.style.display = 'block';
  preview.innerHTML = '';
  const img = document.createElement('img');
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
  img.src = primary;
  if (fallback) {
    img.onerror = () => { img.src = fallback; img.onerror = () => { preview.style.display = 'none'; }; };
  } else {
    img.onerror = () => { preview.style.display = 'none'; };
  }
  preview.appendChild(img);
}

export function submitModal() {
  const nameInput = document.getElementById('modal-name');
  const name = nameInput.value.trim();

  if (!name) {
    nameInput.classList.add('error');
    nameInput.focus();
    setTimeout(() => nameInput.classList.remove('error'), 600);
    return;
  }

  const listReferenceValue = document.getElementById('modal-listid').value.trim();
  const numericId = listReferenceValue && /^\d+$/.test(listReferenceValue) ? parseInt(listReferenceValue, 10) : null;

  const data = {
    name,
    creators: document.getElementById('modal-creators').value.trim() || null,
    showcaseVideo: document.getElementById('modal-video').value.trim() || null,
    id: numericId,
    originalName: listReferenceValue || null,
    notes: (() => {
      const notesInput = document.getElementById('modal-notes');
      return notesInput ? notesInput.value.trim() || null : null;
    })(),
    victors: (() => {
      const victorsInput = document.getElementById('modal-victors');
      const victorsStr = victorsInput ? victorsInput.value.trim() : '';
      if (!victorsStr) return null;
      try {
        return JSON.parse(victorsStr);
      } catch (e) {
        showToast('Invalid victors JSON', 'danger');
        return null;
      }
    })(),
  };

  const duplicate = findDuplicateLevel(
    { ...data, _id: state.modalLevelId ?? undefined },
    state.rawLevels.filter(l => l._id !== state.modalLevelId)
  );

  if (duplicate) {
    showToast(`A level with the same name already exists: "${duplicate.name || name}".`, 'danger');
    return;
  }

  if (state.modalMode === 'edit' && state.modalLevelId) {
    const level = state.levelMap.get(state.modalLevelId);
    if (level) {
      Object.assign(level, data);
      level.lastEdited = new Date().toISOString();
      saveSession();
      document.dispatchEvent(new CustomEvent('dl:render'));
      showToast(`"${name}" updated`);
    }
  } else if (state.modalMode === 'add') {
    const statusEl = document.querySelector('input[name="modal-status"]:checked');
    const status = statusEl ? statusEl.value : 'pending';
    const _id = makeLevelId(data, state.rawLevels.length);
    const level = { ...data, _id, pending: true, customValues: {} };
    state.rawLevels.push(level);
    state.levelMap.set(_id, level);

    if (status === 'ranked') {
      level.pending = false;
      state.rankedList.push(level);
      saveSession();
      document.dispatchEvent(new CustomEvent('dl:render'));
      showToast(`"${name}" added to ranked list`);
    } else if (status === 'immediate') {
      state.pendingLevels.push(level);
      saveSession();
      document.dispatchEvent(new CustomEvent('dl:render'));
      showToast(`"${name}" added — starting placement`);
      closeModal();
      startInsertion(level);
      return;
    } else {
      state.pendingLevels.push(level);
      saveSession();
      document.dispatchEvent(new CustomEvent('dl:render'));
      showToast(`"${name}" added to pending`);
    }
  }

  closeModal();
}

export function openSettingsModal() {
  document.getElementById('confirm-delete').checked = state.settings.confirmDelete;
  document.getElementById('confirm-reset').checked = state.settings.confirmReset;
  document.getElementById('confirm-import-overwrite').checked = state.settings.confirmImportOverwrite;
  document.getElementById('enable-drag-drop').checked = state.settings.enableDragDrop;

  document.querySelectorAll('input[name="inline-edit-mode"]').forEach(radio => {
    radio.checked = radio.value === state.settings.inlineEditMode;
  });
  document.querySelectorAll('input[name="default-new-status"]').forEach(radio => {
    radio.checked = radio.value === state.settings.defaultNewStatus;
  });

  document.getElementById('settings-modal').classList.add('active');
  setTimeout(() => document.querySelector('#settings-modal input')?.focus(), 50);
}

export function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('active');
}

export function saveSettingsModal() {
  state.settings.confirmDelete = document.getElementById('confirm-delete').checked;
  state.settings.confirmReset = document.getElementById('confirm-reset').checked;
  state.settings.confirmImportOverwrite = document.getElementById('confirm-import-overwrite').checked;
  state.settings.enableDragDrop = document.getElementById('enable-drag-drop').checked;
  state.settings.inlineEditMode = document.querySelector('input[name="inline-edit-mode"]:checked')?.value || 'single';
  state.settings.defaultNewStatus = document.querySelector('input[name="default-new-status"]:checked')?.value || 'pending';

  saveSettings();
  closeSettingsModal();
  document.dispatchEvent(new CustomEvent('dl:render'));
  showToast('Settings saved');
}

export function openCustomValuesModal() {
  renderCustomValuesList();
  document.getElementById('custom-values-modal').classList.add('active');
  setTimeout(() => document.getElementById('new-custom-value-name')?.focus(), 50);
}

export function closeCustomValuesModal() {
  document.getElementById('custom-values-modal').classList.remove('active');
}

export function renderCustomValuesList() {
  const listEl = document.getElementById('custom-values-list');
  if (!listEl) return;

  const builtinTemplates = [
    { id: 'rank', label: 'Rank' },
    { id: 'tags', label: 'Tags' },
  ];

  const templateHtml = `
    <div class="custom-values-section">
      <div class="custom-values-templates">
        <div class="custom-values-templates-header">Field templates</div>
        <div class="custom-values-templates-list">
          ${builtinTemplates.map(template => `
            <button type="button" class="btn btn-secondary template-btn" data-template-id="${template.id}" ${hasColumn(template.id) ? 'disabled' : ''}>
              ${escHtml(template.label)} ${hasColumn(template.id) ? '✓' : 'Add'}
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  if (state.customValues.length === 0) {
    listEl.innerHTML = `${templateHtml}<p class="no-custom-values">No custom fields defined yet.</p>`;
  } else {
    listEl.innerHTML = `${templateHtml}${state.customValues.map(value => `
      <div class="custom-value-item">
        <div class="custom-value-meta">
          <span class="custom-value-name">${escHtml(value.name)}</span>
          <span class="custom-value-type">${escHtml(value.type)}</span>
          ${value.type === 'enum' ? `<span class="custom-value-options">(${escHtml(value.options.join(', '))})</span>` : ''}
        </div>
        <div class="custom-value-controls">
          <label><input type="checkbox" class="custom-value-toggle" data-value-id="${value.id}" data-prop="filterable" ${value.filterable ? 'checked' : ''}>Filter</label>
          <label><input type="checkbox" class="custom-value-toggle" data-value-id="${value.id}" data-prop="sortable" ${value.sortable ? 'checked' : ''}>Sort</label>
          <label><input type="checkbox" class="custom-value-toggle" data-value-id="${value.id}" data-prop="exportable" ${value.exportable ? 'checked' : ''}>Export</label>
          <button class="custom-value-remove" data-value-id="${value.id}" title="Remove ${escHtml(value.name)}">×</button>
        </div>
      </div>
    `).join('')}`;
  }

  listEl.querySelectorAll('.template-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const templateId = btn.dataset.templateId;
      if (!templateId || hasColumn(templateId)) return;
      addDetectedColumn(templateId);
      saveSession();
      document.dispatchEvent(new CustomEvent('dl:render'));
      renderCustomValuesList();
      showToast(`${templateId.charAt(0).toUpperCase() + templateId.slice(1)} field added`);
    });
  });

  listEl.querySelectorAll('.custom-value-toggle').forEach(input => {
    input.addEventListener('change', () => {
      const valueId = input.dataset.valueId;
      const prop = input.dataset.prop;
      updateCustomValue(valueId, { [prop]: input.checked });
      saveSession();
      document.dispatchEvent(new CustomEvent('dl:render'));
    });
  });

  listEl.querySelectorAll('.custom-value-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const valueId = btn.dataset.valueId;
      const valueName = state.customValues.find(v => v.id === valueId)?.name ?? valueId;
      if (confirm(`Remove custom field "${valueName}"? This deletes all data for this field from all levels.`)) {
        removeCustomValue(valueId);
        saveSession();
        renderCustomValuesList();
        document.dispatchEvent(new CustomEvent('dl:render'));
        showToast('Custom field removed');
      }
    });
  });
}

export function addCustomValueFromModal() {
  const nameInput = document.getElementById('new-custom-value-name');
  const typeSelect = document.getElementById('new-custom-value-type');
  const optionsInput = document.getElementById('new-custom-value-options');
  const filterableInput = document.getElementById('new-custom-value-filterable');
  const sortableInput = document.getElementById('new-custom-value-sortable');
  const exportableInput = document.getElementById('new-custom-value-exportable');
  const name = nameInput?.value.trim() ?? '';
  const type = typeSelect?.value ?? 'text';
  const options = optionsInput?.value ?? '';
  const filterable = filterableInput?.checked ?? true;
  const sortable = sortableInput?.checked ?? true;
  const exportable = exportableInput?.checked ?? true;

  if (!name) {
    showToast('Please enter a name for the custom field', 'danger');
    nameInput?.focus();
    return;
  }

  if (type === 'enum' && !options.trim()) {
    showToast('Enum fields require at least one option', 'danger');
    optionsInput?.focus();
    return;
  }

  try {
    addCustomValue(name, type, options, filterable, sortable, exportable);
    saveSession();
    if (nameInput) nameInput.value = '';
    if (optionsInput) optionsInput.value = '';
    renderCustomValuesList();
    document.dispatchEvent(new CustomEvent('dl:render'));
    showToast(`Custom field "${name}" added`);
  } catch (error) {
    showToast(error.message, 'danger');
    nameInput?.focus();
  }
}

function saveSettings() {
  try {
    localStorage.setItem('demonListSettings', JSON.stringify(state.settings));
  } catch (_) { }
}

export function showImportPanel(panelId) {
  document.querySelectorAll('#import-tab .import-panel').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById(panelId);
  if (target) target.classList.remove('hidden');
}

export function showImportError(type, msg) {
  const el = document.querySelector(`.import-error[data-type="${type}"]`);
  if (el) el.textContent = msg;
}

function ensureImportPreviewPanel() {
  let panel = document.getElementById('import-preview-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'import-preview-panel';
    panel.className = 'import-panel hidden';
    panel.setAttribute('data-panel', 'preview');
    const importTab = document.getElementById('import-tab');
    if (importTab) importTab.appendChild(panel);
  }
  return panel;
}

export function buildSchemaRowHtml(field, i) {
  const TYPE_OPTIONS = ['text', 'number', 'boolean', 'enum', 'date', 'url', 'tags', 'json'];
  const typeLabel = {
    text: '📝', number: '#', boolean: '☑', enum: '📋', date: '📅', url: '🔗', tags: '🏷', json: '{ }'
  };
  const sample = field.sampleValues.slice(0, 2).join(' · ');
  const sampleDisplay = sample.length > 70 ? sample.slice(0, 70) + '…' : sample;
  const enumHint = field.type === 'enum' && field.enumOptions.length
    ? `<span class="schema-enum-hint" title="${escHtml(field.enumOptions.join(', '))}">options: ${escHtml(field.enumOptions.slice(0, 4).join(', '))}${field.enumOptions.length > 4 ? '…' : ''}</span>`
    : '';

  return `<tr class="schema-row${!field.visible ? ' schema-row-hidden' : ''}" data-idx="${i}" draggable="true">
    <td class="schema-drag-cell" title="Drag to reorder">⠿</td>
    <td class="schema-visible-cell">
      <input type="checkbox" class="schema-cb schema-field-visible" data-idx="${i}" ${field.visible ? 'checked' : ''} title="Show this field">
    </td>
    <td class="schema-key-cell" title="${escHtml(field.id)}">
      <code class="schema-key-code">${escHtml(field.id)}</code>
      ${field.isBuiltin ? '<span class="schema-builtin-badge" title="Built-in field">★</span>' : ''}
    </td>
    <td class="schema-label-cell">
      <input type="text" class="schema-field-label field-input" data-idx="${i}" value="${escHtml(field.label)}" placeholder="Display label">
    </td>
    <td class="schema-type-cell">
      <select class="schema-field-type field-input" data-idx="${i}">
        ${TYPE_OPTIONS.map(t => `<option value="${t}"${field.type === t ? ' selected' : ''}>${typeLabel[t] || ''} ${t}</option>`).join('')}
      </select>
    </td>
    <td class="schema-flag-cell">
      <input type="checkbox" class="schema-cb schema-field-sortable" data-idx="${i}" ${field.sortable ? 'checked' : ''} title="Sortable">
    </td>
    <td class="schema-flag-cell">
      <input type="checkbox" class="schema-cb schema-field-filterable" data-idx="${i}" ${field.filterable ? 'checked' : ''} title="Filterable">
    </td>
    <td class="schema-sample-cell" title="${escHtml(sample)}">
      <span class="schema-sample-text">${escHtml(sampleDisplay)}</span>
      ${enumHint}
    </td>
  </tr>`;
}

export function renderImportPreview() {
  const panel = ensureImportPreviewPanel();
  const { records, schema, type } = _importPreviewData;

  const templates = listImportTemplates();
  const templateNames = Object.keys(templates);
  const visibleCount = schema.filter(f => f.visible).length;

  const backPanelId = type === 'pending' ? 'import-pending-panel'
    : type === 'replace' ? 'replace-main-panel'
      : 'import-main-panel';

  const typeLabels = { main: 'Main List', pending: 'Pending Queue', replace: 'Replace Main' };

  panel.innerHTML = `
    <div class="import-header">
      <h2>Configure Schema</h2>
      <p>${records.length} record${records.length !== 1 ? 's' : ''} detected &mdash; importing to: <strong>${typeLabels[type] || type}</strong></p>
    </div>

    <div class="schema-templates-bar">
      <div class="schema-template-row">
        <select id="schema-template-select" class="field-input">
          <option value="">Load a saved template&hellip;</option>
          ${templateNames.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('')}
        </select>
        <button id="schema-load-template-btn" class="btn btn-primary"${!templateNames.length ? ' disabled' : ''}>Apply</button>
        <button id="schema-delete-template-btn" class="btn btn-danger"${!templateNames.length ? ' disabled' : ''}>Delete</button>
      </div>
      <div class="schema-template-row">
        <input type="text" id="schema-template-name-input" class="field-input" placeholder="New template name&hellip;">
        <button id="schema-save-template-btn" class="btn">💾 Save Template</button>
      </div>
    </div>
  `;
}