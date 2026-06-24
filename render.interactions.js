import { state, escHtml, getCustomField, setCustomValue, CONFIDENCE_LEVELS, findDuplicateLevel } from './state.js';
import { saveSession, showToast } from './logic.js';
import { moveLevel, moveLevelUp, moveLevelDown, moveToPosition, deleteLevel, reevaluateRanked } from './logic.js';
import { openEditModal } from './render.modals.js';

export function setupColumnDragHandlers(orderedColumns) {
  let draggedColumn = null;

  const headers = document.querySelectorAll('.draggable-header');
  headers.forEach(header => {
    header.addEventListener('dragstart', (e) => {
      draggedColumn = header.dataset.column;
      header.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
    });

    header.addEventListener('dragend', () => {
      headers.forEach(h => h.style.opacity = '1');
      draggedColumn = null;
    });

    header.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (!draggedColumn || draggedColumn === header.dataset.column) return;

      const rect = header.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      const isAfter = e.clientX > midpoint;

      header.style.borderLeft = !isAfter ? '3px solid #0ea5e9' : 'none';
      header.style.borderRight = isAfter ? '3px solid #0ea5e9' : 'none';
    });

    header.addEventListener('dragleave', () => {
      header.style.borderLeft = 'none';
      header.style.borderRight = 'none';
    });

    header.addEventListener('drop', (e) => {
      e.preventDefault();
      header.style.borderLeft = 'none';
      header.style.borderRight = 'none';

      if (!draggedColumn || draggedColumn === header.dataset.column) return;

      const targetColumn = header.dataset.column;
      const draggedIndex = orderedColumns.indexOf(draggedColumn);
      const targetIndex = orderedColumns.indexOf(targetColumn);

      if (draggedIndex === -1 || targetIndex === -1) return;

      const rect = header.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      const isAfter = e.clientX > midpoint;

      const newPosition = isAfter ? targetIndex + 1 : targetIndex;

      if (draggedIndex !== newPosition) {

        import('./state.js').then(mod => {
          mod.reorderColumn(draggedColumn, newPosition < draggedIndex ? newPosition : newPosition - 1);
          saveSession();
          document.dispatchEvent(new CustomEvent('dl:render'));
        });
      }
    });
  });
}

export function updateBulkToolbar() {
  const toolbar = document.getElementById('bulk-toolbar');
  const countEl = document.getElementById('bulk-count');
  if (!toolbar) return;
  const count = state.selectedLevels.size;
  toolbar.classList.toggle('hidden', count === 0);
  if (countEl) countEl.textContent = `${count} selected`;

  const selectAllCb = document.getElementById('select-all-rows');
  if (selectAllCb) {
    const total = state.rankedList.length;
    selectAllCb.checked = count > 0 && count === total;
    selectAllCb.indeterminate = count > 0 && count < total;
  }
}

export function setupBulkToolbarHandlers() {
  const already = document.body.dataset.bulkSetup;
  if (already) return;
  document.body.dataset.bulkSetup = '1';

  const bulkReevalBtn = document.getElementById('bulk-reeval-btn');
  if (bulkReevalBtn) {
    bulkReevalBtn.addEventListener('click', () => {
      const ids = Array.from(state.selectedLevels);
      if (ids.length === 0) return;
      const names = ids.map(id => state.levelMap.get(id)?.name).filter(Boolean);
      if (!confirm(`Move ${ids.length} level(s) back to pending for re-ranking?\n\n${names.slice(0, 5).join(', ')}${names.length > 5 ? ` …and ${names.length - 5} more` : ''}`)) return;
      ids.forEach(id => {
        const lvl = state.levelMap.get(id);
        if (lvl) reevaluateRanked(id);
      });
      state.selectedLevels.clear();
      updateBulkToolbar();
    });
  }

  const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', () => {
      const ids = Array.from(state.selectedLevels);
      if (ids.length === 0) return;
      const names = ids.map(id => state.levelMap.get(id)?.name).filter(Boolean);
      if (!confirm(`Permanently delete ${ids.length} level(s)? This cannot be undone.\n\n${names.slice(0, 5).join(', ')}${names.length > 5 ? ` …and ${names.length - 5} more` : ''}`)) return;
      ids.forEach(id => deleteLevel(id));
      state.selectedLevels.clear();
      updateBulkToolbar();
    });
  }

  const bulkClearBtn = document.getElementById('bulk-clear-btn');
  if (bulkClearBtn) {
    bulkClearBtn.addEventListener('click', () => {
      state.selectedLevels.clear();
      document.dispatchEvent(new CustomEvent('dl:render'));
    });
  }
}

export function renderRankingsSummary() {
  const el = document.getElementById('rankings-summary');
  if (!el) return;

  const ranked = state.rankedList.length;
  const pending = state.pendingLevels.length;

  if (ranked === 0 && pending === 0) {
    el.innerHTML = '';
    return;
  }

  const contras = state.contradictions.length;

  el.innerHTML = [
    `<span class="summary-pill">📊 ${ranked} ranked</span>`,
    pending > 0 ? `<span class="summary-pill summary-pill-pending">⏳ ${pending} pending</span>` : '',
    contras > 0 ? `<span class="summary-pill summary-pill-danger">⚠ ${contras} contradiction${contras !== 1 ? 's' : ''}</span>` : '',
  ].filter(Boolean).join('');
}

export function saveEditableCell(el) {
  if (!el || !el.dataset.field) return;
  const idx = parseInt(el.dataset.idx, 10);
  if (Number.isNaN(idx)) return;
  const field = el.dataset.field;
  const level = state.rankedList[idx];
  if (!level) return;

  const value = el.tagName === 'SELECT' ? el.value : el.textContent.trim();

  if (field === 'name') {
    const duplicate = findDuplicateLevel(
      { ...level, name: value },
      state.rawLevels.filter(l => l._id !== level._id)
    );
    if (duplicate) {
      showToast(`A level with the same name or ID already exists: "${duplicate.name || duplicate.id || duplicate._id}".`, 'danger');
      document.dispatchEvent(new CustomEvent('dl:render'));
      return;
    }
  }

  if (field === 'tags') {
    level.tags = value || null;
  } else if (field === 'confidence') {
    level.confidence = value;
    level.lowConfidence = value !== CONFIDENCE_LEVELS.CERTAIN;
  } else if (field.startsWith('custom_')) {
    const fieldId = field.substring(7);
    const fieldDef = getCustomField(fieldId);
    setCustomValue(level, fieldId, value, fieldDef);
  } else {
    level[field] = value || null;
  }

  level.lastEdited = new Date().toISOString();
  saveSession();
  document.dispatchEvent(new CustomEvent('dl:render'));
}

export function showPositionEditor(cell, fromIdx) {
  const total = state.rankedList.length;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = fromIdx + 1;
  input.min = 1;
  input.max = total;
  input.className = 'pos-input';

  cell.innerHTML = '';
  cell.appendChild(input);
  input.focus();
  input.select();

  function apply() {
    const pos = parseInt(input.value);
    if (!isNaN(pos) && pos >= 1 && pos <= total) {
      moveToPosition(fromIdx, pos - 1);
    } else {
      document.dispatchEvent(new CustomEvent('dl:render'));
    }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); apply(); }
    else if (e.key === 'Escape') document.dispatchEvent(new CustomEvent('dl:render'));
  });
  input.addEventListener('blur', apply);
}

export function setupRankingsInteraction(tbody) {
  tbody.addEventListener('click', e => {
    if (e.target.classList.contains('row-select')) return;

    const btn = e.target.closest('[data-action]');
    if (btn) {
      const idx = parseInt(btn.dataset.idx);
      const action = btn.dataset.action;
      if (action === 'up') { moveLevelUp(idx); return; }
      if (action === 'down') { moveLevelDown(idx); return; }
      if (action === 'edit') { openEditModal(state.rankedList[idx]?._id); return; }
      if (action === 'reeval') {
        const lvl = state.rankedList[idx];
        if (lvl && confirm(`Move "${lvl.name}" back to pending for re-ranking?`)) {
          reevaluateRanked(lvl._id);
        }
        return;
      }
      if (action === 'delete') {
        const lvl = state.rankedList[idx];
        if (lvl && (!state.settings.confirmDelete ||
          confirm(`Delete "${lvl.name}"? This cannot be undone.`))) {
          deleteLevel(lvl._id);
        }
        return;
      }
    }

    if (state.insertionSession) return;

    const posCell = e.target.closest('.rank-pos');
    if (posCell && state.settings.enableDragDrop) {
      showPositionEditor(posCell, parseInt(posCell.dataset.idx));
      return;
    }

    const imageCell = e.target.closest('.cell-image-wrapper');
    if (imageCell && !imageCell.classList.contains('editing')) {
      const fieldId = imageCell.dataset.field;
      const idx = parseInt(imageCell.dataset.idx);
      const currentValue = imageCell.dataset.originalValue;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentValue;
      input.className = 'cell-image-input';
      input.placeholder = `Enter URL or YouTube link...`;

      imageCell.classList.add('editing');
      imageCell.innerHTML = '';
      imageCell.appendChild(input);
      input.focus();
      input.select();

      const saveEdit = () => {
        imageCell.classList.remove('editing');
        input.remove();

        if (input.value !== currentValue) {
          const level = state.rankedList[idx];
          if (level) {
            if (fieldId.startsWith('custom_')) {
              const customId = fieldId.replace('custom_', '');
              setCustomValue(level, customId, input.value);
            } else {
              level[fieldId] = input.value || null;
            }
            level.lastEdited = new Date().toISOString();
            saveSession();
            document.dispatchEvent(new CustomEvent('dl:render'));
          }
        } else {
          document.dispatchEvent(new CustomEvent('dl:render'));
        }
      };

      input.addEventListener('blur', saveEdit);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        } else if (e.key === 'Escape') {
          imageCell.classList.remove('editing');
          input.remove();
          document.dispatchEvent(new CustomEvent('dl:render'));
        }
      });
      return;
    }

    const editableCell = e.target.closest('.cell-editable');
    if (editableCell && state.settings.inlineEditMode === 'single') {
      editableCell.focus();
    }
  });

  tbody.addEventListener('change', e => {
    const cb = e.target.closest('.row-select');
    if (cb) {
      const id = cb.dataset.id;
      if (cb.checked) {
        state.selectedLevels.add(id);
      } else {
        state.selectedLevels.delete(id);
      }
      updateBulkToolbar();
      return;
    }

    const field = e.target.closest('select[data-field]');
    if (field) saveEditableCell(field);
  });

  tbody.addEventListener('dblclick', e => {
    const editableCell = e.target.closest('.cell-editable');
    if (editableCell && state.settings.inlineEditMode === 'double') {
      editableCell.focus();
    }
  });

  tbody.addEventListener('focusout', e => {
    const editable = e.target.closest('[data-field]');
    if (editable && (editable.isContentEditable || editable.tagName === 'SELECT')) {
      saveEditableCell(editable);
    }
  });

  tbody.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest('[contenteditable]')) {
      e.preventDefault();
      e.target.blur();
    }
  });

  const table = tbody.closest('.rankings-table');
  if (table) {
    const header = table.querySelector('thead');
    header?.addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      const column = th.dataset.sort;
      if (state.rankingsSort.column === column) {
        state.rankingsSort.direction = state.rankingsSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.rankingsSort.column = column;
        state.rankingsSort.direction = 'asc';
      }
      document.dispatchEvent(new CustomEvent('dl:render'));
    });
  }

  tbody.addEventListener('dragstart', e => {
    if (state.insertionSession) return;
    const row = e.target.closest('tr[data-idx]');
    if (!row) return;
    state.dragSrcIdx = parseInt(row.dataset.idx);
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });

  tbody.addEventListener('dragover', e => {
    if (state.insertionSession) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('tr[data-idx]');
    if (row) {
      tbody.querySelectorAll('.drag-over-row').forEach(r => r.classList.remove('drag-over-row'));
      row.classList.add('drag-over-row');
    }
  });

  tbody.addEventListener('dragleave', e => {
    if (!tbody.contains(e.relatedTarget)) {
      tbody.querySelectorAll('.drag-over-row').forEach(r => r.classList.remove('drag-over-row'));
    }
  });

  tbody.addEventListener('drop', e => {
    if (state.insertionSession) return;
    e.preventDefault();
    tbody.querySelectorAll('.drag-over-row, .dragging').forEach(r => {
      r.classList.remove('drag-over-row', 'dragging');
    });
    const row = e.target.closest('tr[data-idx]');
    if (!row || state.dragSrcIdx === null) return;
    const toIdx = parseInt(row.dataset.idx);
    if (state.dragSrcIdx !== toIdx) moveLevel(state.dragSrcIdx, toIdx);
    state.dragSrcIdx = null;
  });

  tbody.addEventListener('dragend', () => {
    state.dragSrcIdx = null;
    tbody.querySelectorAll('.drag-over-row, .dragging').forEach(r => {
      r.classList.remove('drag-over-row', 'dragging');
    });
  });
}
