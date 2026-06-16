import {
  state, ytId, thumbUrl, gdThumbUrl, escHtml, makeLevelId,
  CONFIDENCE_LEVELS, getCustomValue, formatCustomFieldValue, setCustomValue, getCustomField,
  addCustomValue, removeCustomValue, updateCustomValue,
  getOrderedColumns, reorderColumn, addDetectedColumn, hasColumn,
  getFieldDefinition, BUILTIN_FIELD_DEFINITIONS, FIELD_ID_SET,
  flattenRecord, buildSchemaFromRecords, applySchemaToRecord, inferFieldType,
  saveImportTemplate, loadImportTemplate, listImportTemplates, deleteImportTemplate,
  normalizeLevelObject, parsePlainText, parseCSV, looksLikePlainText, looksLikeCSV,
  detectColumnsFromLevels,
} from './state.js';
import {
  getMid, vote, startInsertion, moveLevel, moveLevelUp, moveLevelDown, moveToPosition,
  deleteLevel, reevaluateRanked, saveSession, showToast, checkContradictions, resolveContradiction,
} from './logic.js';

document.addEventListener('dl:render', renderAll);

const ROW_HEIGHT = 64;
let rankingsInteractionSetup = false;
let bulkToolbarSetup = false;

let _importPreviewData = { records: [], schema: [], type: 'main' };

export function renderAll() {
  renderComparison();
  renderPendingSelector();
  renderRankings();
  renderContradictions();
  renderStats();
}

function getLevelThumbnailUrls(level) {
  const customUrl = level.thumbnail || level.image || level.img || level.photo || null;
  const ytUrl = level.showcaseVideo ? thumbUrl(level.showcaseVideo) : null;
  const gdUrl = level.gdId != null ? gdThumbUrl(level.gdId) : null;
  const primary = customUrl || gdUrl || ytUrl;
  const fallback = primary === customUrl ? (gdUrl || ytUrl) :
    primary === gdUrl ? ytUrl :
      null;
  return { primary, fallback };
}

function setThumbElement(thumbEl, level) {
  const { primary, fallback } = getLevelThumbnailUrls(level);
  thumbEl.innerHTML = '';
  if (!primary) { thumbEl.classList.remove('has-thumb'); return; }
  thumbEl.classList.add('has-thumb');
  const img = document.createElement('img');
  img.className = 'thumb-img';
  img.src = primary;
  img.loading = 'lazy';
  if (fallback) {
    img.onerror = () => {
      img.src = fallback;
      img.onerror = () => { thumbEl.classList.remove('has-thumb'); };
    };
  } else {
    img.onerror = () => { thumbEl.classList.remove('has-thumb'); };
  }
  thumbEl.appendChild(img);
}

function thumbInlineHtml(level) {
  const { primary, fallback } = getLevelThumbnailUrls(level);
  if (!primary) return '';
  const fallbackAttr = fallback ? `data-fallback="${escHtml(fallback)}"` : '';
  const onerrorJs = fallback
    ? `if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.closest('.thumb-wrap')?.classList.remove('has-thumb');}`
    : `this.closest('.thumb-wrap')?.classList.remove('has-thumb');`;
  return `<img src="${escHtml(primary)}" ${fallbackAttr} onerror="${onerrorJs}" class="thumb-img" loading="lazy">`;
}

function formatTags(tags) {
  if (!tags) return '';
  if (Array.isArray(tags)) return tags.filter(Boolean).join(', ');
  return String(tags).trim();
}

function formatVictors(victors) {
  if (!victors) return '';
  if (Array.isArray(victors)) {
    return victors.map(v => v.name).filter(Boolean).join(', ');
  }
  return String(victors).trim();
}

function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escHtml(String(value));
  return date.toLocaleString([], {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatCellValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map(v => {
      if (typeof v === 'object') {
        if (v.label) return String(v.label);
        return JSON.stringify(v);
      }
      return String(v);
    }).join(', ');
  }
  if (typeof value === 'object') {
    if (value.label) return String(value.label);
    return JSON.stringify(value);
  }
  return String(value);
}

function getRankingsView() {
  const rows = state.rankedList.map((level, idx) => ({ level, idx }));
  const { column, direction } = state.rankingsSort || { column: 'rank', direction: 'asc' };

  if (column === 'rank') {
    return direction === 'desc' ? rows.slice().reverse() : rows;
  }

  const textCollator = new Intl.Collator([], { numeric: true, sensitivity: 'base' });
  const confidenceOrder = {
    [CONFIDENCE_LEVELS.CERTAIN]: 4,
    [CONFIDENCE_LEVELS.LEANING]: 3,
    [CONFIDENCE_LEVELS.EQUAL]: 2,
    [CONFIDENCE_LEVELS.UNSURE]: 1,
  };

  rows.sort((a, b) => {
    const left = a.level;
    const right = b.level;
    let result = 0;

    switch (column) {
      case 'name':
        result = textCollator.compare(left.name || '', right.name || '');
        break;
      case 'creators':
        result = textCollator.compare(left.creators || '', right.creators || '');
        break;
      case 'tags':
        result = textCollator.compare(formatTags(left.tags), formatTags(right.tags));
        break;
      case 'confidence': {
        const aConf = left.confidence ?? (left.lowConfidence ? CONFIDENCE_LEVELS.LEANING : CONFIDENCE_LEVELS.CERTAIN);
        const bConf = right.confidence ?? (right.lowConfidence ? CONFIDENCE_LEVELS.LEANING : CONFIDENCE_LEVELS.CERTAIN);
        result = (confidenceOrder[aConf] ?? 0) - (confidenceOrder[bConf] ?? 0);
        break;
      }
      case 'lastEdited': {
        const aDate = new Date(left.lastEdited || 0).getTime();
        const bDate = new Date(right.lastEdited || 0).getTime();
        result = aDate - bDate;
        break;
      }
      default:
        if (column.startsWith('custom_')) {
          const customValueId = column.substring(7);
          const fieldDef = getCustomField(customValueId);
          const leftVal = getCustomValue(left, customValueId);
          const rightVal = getCustomValue(right, customValueId);
          if (fieldDef?.type === 'number') {
            result = (Number(leftVal) || 0) - (Number(rightVal) || 0);
          } else if (fieldDef?.type === 'boolean') {
            const aBool = leftVal === 'true';
            const bBool = rightVal === 'true';
            result = (aBool === bBool) ? 0 : (aBool ? 1 : -1);
          } else {
            result = textCollator.compare(leftVal, rightVal);
          }
        } else {
          const fieldDef = getFieldDefinition(column);
          const aVal = left[column];
          const bVal = right[column];

          if (fieldDef?.type === 'number') {
            result = (Number(aVal) || 0) - (Number(bVal) || 0);
          } else if (fieldDef?.type === 'boolean') {
            const aBool = aVal === true || aVal === 'true' || aVal === 1 || aVal === '1';
            const bBool = bVal === true || bVal === 'true' || bVal === 1 || bVal === '1';
            result = (aBool === bBool) ? 0 : (aBool ? 1 : -1);
          } else if (column === 'tags') {
            result = textCollator.compare(formatTags(aVal), formatTags(bVal));
          } else {
            const aStr = Array.isArray(aVal) ? aVal.join(', ') : (aVal ? String(aVal) : '');
            const bStr = Array.isArray(bVal) ? bVal.join(', ') : (bVal ? String(bVal) : '');
            result = textCollator.compare(aStr, bStr);
          }
        }
    }

    return direction === 'desc' ? -result : result;
  });

  return rows;
}

function getFieldValue(level, fieldId, idx) {
  if (fieldId === 'rank') {
    return idx + 1;
  }
  if (fieldId === 'confidence') {
    return level.confidence ?? (level.lowConfidence ? CONFIDENCE_LEVELS.LEANING : CONFIDENCE_LEVELS.CERTAIN);
  }
  if (fieldId === 'tags') {
    return formatTags(level.tags);
  }
  if (fieldId === 'victors') {
    return formatVictors(level.victors);
  }
  if (fieldId.startsWith('custom_')) {
    return getCustomValue(level, fieldId.substring(7));
  }
  return level[fieldId];
}

function buildFieldCell(fieldId, level, idx, badges = '') {
  const fieldDef = getFieldDefinition(fieldId);
  const value = getFieldValue(level, fieldId, idx);

  if (fieldId === 'rank') {
    return `<td class="rank-num rank-pos" data-idx="${idx}" title="${state.settings.enableDragDrop ? 'Click to jump to position' : ''}" style="${state.settings.enableDragDrop ? 'cursor:pointer;' : ''}">${idx + 1} ${badges}</td>`;
  }

  if (fieldId === 'name') {
    const inner = thumbInlineHtml(level);
    const thumbBlock = inner ? `<div class="rank-thumb-wrap thumb-wrap has-thumb">${inner}</div>` : '';
    return `<td class="cell-editable" contenteditable="true" data-field="name" data-idx="${idx}" title="Edit name">${escHtml(level.name)} ${thumbBlock}</td>`;
  }

  if (fieldId === 'confidence') {
    return `<td class="cell-confidence">
      <select data-field="confidence" data-idx="${idx}" title="Set confidence">
        <option value="certain"${value === CONFIDENCE_LEVELS.CERTAIN ? ' selected' : ''}>certain</option>
        <option value="leaning"${value === CONFIDENCE_LEVELS.LEANING ? ' selected' : ''}>leaning</option>
        <option value="equal"${value === CONFIDENCE_LEVELS.EQUAL ? ' selected' : ''}>equal</option>
        <option value="unsure"${value === CONFIDENCE_LEVELS.UNSURE ? ' selected' : ''}>unsure</option>
      </select>
    </td>`;
  }

  if (fieldId === 'lastEdited') {
    return `<td class="cell-last-edited">${formatTimestamp(value)}</td>`;
  }

  if (fieldId === 'tags') {
    return `<td class="cell-editable" contenteditable="true" data-field="tags" data-idx="${idx}" title="Edit tags">${escHtml(value)}</td>`;
  }

  if (fieldId === 'victors') {
    return `<td class="cell-victors" title="Victors">${escHtml(value)}</td>`;
  }

  if (fieldDef?.custom) {
    if (fieldDef.type === 'boolean') {
      return `<td>
        <select data-field="${fieldId}" data-idx="${idx}" title="Set ${escHtml(fieldDef.label)}">
          <option value="">—</option>
          <option value="true"${value === 'true' ? ' selected' : ''}>true</option>
          <option value="false"${value === 'false' ? ' selected' : ''}>false</option>
        </select>
      </td>`;
    }
    if (fieldDef.type === 'enum') {
      const optionsHtml = fieldDef.options.map(opt => `
          <option value="${escHtml(opt)}"${value === opt ? ' selected' : ''}>${escHtml(opt)}</option>`).join('');
      return `<td>
        <select data-field="${fieldId}" data-idx="${idx}" title="Set ${escHtml(fieldDef.label)}">
          <option value="">—</option>${optionsHtml}
        </select>
      </td>`;
    }
    return `<td class="cell-editable" contenteditable="true" data-field="${fieldId}" data-idx="${idx}" title="Edit ${escHtml(fieldDef.label)}">${escHtml(value)}</td>`;
  }

  return `<td class="cell-editable" contenteditable="true" data-field="${fieldId}" data-idx="${idx}" title="Edit ${escHtml(fieldDef?.label || fieldId)}">${escHtml(formatCellValue(value))}</td>`;
}

function buildRankRow(entry, mid, lo, hi, filter) {
  const { level, idx } = entry;
  const canMove = !state.insertionSession && state.settings.enableDragDrop;
  const isMid = idx === mid;
  const inRange = lo !== -1 && idx >= lo && idx < hi;
  const hasContra = state.contradictions.some(
    c => c.harder?._id === level._id || c.easier?._id === level._id
  );

  const rowClass = [
    isMid ? 'rank-mid' : (inRange ? 'rank-in-range' : ''),
    hasContra ? 'row-contradiction' : '',
  ].filter(Boolean).join(' ');
  const orderedColumns = getOrderedColumns();
  let filterSearchText = '';
  orderedColumns.forEach(col => {
    const value = getFieldValue(level, col, idx);
    if (value) {
      if (Array.isArray(value)) {
        filterSearchText += ' ' + value.join(' ').toLowerCase();
      } else {
        filterSearchText += ' ' + String(value).toLowerCase();
      }
    }
  });

  const matchesFilter = !filter || filterSearchText.includes(filter);
  const hiddenStyle = !matchesFilter ? 'style="display:none"' : '';

  const badges = [
    hasContra ? `<span class="badge badge-contradiction" title="Contradiction — placement conflicts with a past comparison">⚠</span>` : '',
  ].join('');
  const columnCells = orderedColumns.map(colName => buildFieldCell(colName, level, idx, badges)).join('');

  const actionCells = canMove ? `
    <button class="move-btn" data-action="up" data-idx="${idx}" title="Move up"${idx === 0 ? ' disabled' : ''}>↑</button>
    <button class="move-btn" data-action="down" data-idx="${idx}" title="Move down"${idx === state.rankedList.length - 1 ? ' disabled' : ''}>↓</button>
    <button class="action-btn action-btn-edit" data-action="edit" data-idx="${idx}" title="Edit level">✏</button>
    <button class="action-btn action-btn-reeval" data-action="reeval" data-idx="${idx}" title="Move back to pending">↺</button>
    <button class="action-btn action-btn-delete" data-action="delete" data-idx="${idx}" title="Delete level">✕</button>
  ` : '';

  const isChecked = state.selectedLevels.has(level._id);

  return `<tr class="${rowClass}" data-idx="${idx}" data-id="${level._id}" draggable="${canMove}" ${hiddenStyle}>
    <td class="cb-cell"><input type="checkbox" class="row-select" data-id="${level._id}" ${isChecked ? 'checked' : ''}></td>
    <td class="drag-handle" title="Drag to reorder">${canMove ? '⠿' : ''}</td>
    ${columnCells}
    <td class="rank-actions">${actionCells}</td>
  </tr>`;
}

function saveEditableCell(el) {
  if (!el || !el.dataset.field) return;
  const idx = parseInt(el.dataset.idx, 10);
  if (Number.isNaN(idx)) return;
  const field = el.dataset.field;
  const level = state.rankedList[idx];
  if (!level) return;

  const value = el.tagName === 'SELECT' ? el.value : el.textContent.trim();

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
  renderAll();
}

function renderComparison() {
  const arena = document.getElementById('arena');
  const emptyState = document.getElementById('empty');
  const undoBtn = document.getElementById('undo-btn');
  const progressEl = document.getElementById('insertion-progress');
  const confidenceBar = document.getElementById('confidence-bar');
  const confidenceHint = document.getElementById('confidence-hint');

  const canUndo =
    (state.insertionSession && state.insertionSession.stepHistory.length > 0) ||
    (!state.insertionSession && state.placementHistory.length > 0);
  if (undoBtn) undoBtn.disabled = !canUndo;

  if (!arena) return;

  if (!state.insertionSession) {
    arena.style.display = 'none';
    if (confidenceBar) confidenceBar.style.display = 'none';
    if (progressEl) progressEl.textContent = '';
    if (emptyState) {
      emptyState.style.display = state.pendingLevels.length === 0 && state.rankedList.length > 0
        ? 'block' : 'none';
    }
    return;
  }

  arena.style.display = 'grid';
  if (confidenceBar) confidenceBar.style.display = 'flex';
  if (emptyState) emptyState.style.display = 'none';

  const conf = state.selectedConfidence;
  const isNonDirectional = conf === CONFIDENCE_LEVELS.EQUAL || conf === CONFIDENCE_LEVELS.UNSURE;

  if (confidenceHint) {
    if (conf === CONFIDENCE_LEVELS.EQUAL) {
      confidenceHint.textContent = 'Either button places the level tied with the current reference.';
    } else if (conf === CONFIDENCE_LEVELS.UNSURE) {
      confidenceHint.textContent = 'Either button places the level tentatively here for later review.';
    } else if (conf === CONFIDENCE_LEVELS.LEANING) {
      confidenceHint.textContent = 'Placement will be flagged as low confidence.';
    } else {
      confidenceHint.textContent = '';
    }
  }

  const mid = getMid();
  const midLevel = state.rankedList[mid];
  if (!midLevel) return;

  const newLevel = state.insertionSession.level;
  const sides = [
    { id: 'left', level: newLevel },
    { id: 'right', level: midLevel },
  ];

  sides.forEach(({ id, level }) => {
    const nameEl = document.getElementById(`${id}-name`);
    const creatorEl = document.getElementById(`${id}-creator`);
    const thumbEl = document.getElementById(`${id}-thumb`);
    const linkEl = document.getElementById(`${id}-link`);
    const btn = document.getElementById(`btn-${id}`);

    if (nameEl) nameEl.textContent = level.name;
    if (creatorEl) creatorEl.textContent = level.creators || 'Unknown creator';
    if (thumbEl) setThumbElement(thumbEl, level);
    if (linkEl) {
      const vid = ytId(level.showcaseVideo);
      linkEl.href = level.showcaseVideo || '#';
      linkEl.style.display = vid ? 'inline-flex' : 'none';
    }
    if (btn) {
      btn.classList.toggle('btn-nondirectional', isNonDirectional);
      btn.onclick = () => {
        btn.classList.add('btn-flash');
        setTimeout(() => btn.classList.remove('btn-flash'), 300);
        vote(level, conf);
      };
    }
  });

  if (progressEl) {
    const { lo, hi } = state.insertionSession;
    const range = hi - lo;
    const stepsLeft = Math.ceil(Math.log2(range + 1));
    progressEl.textContent = `Placing "${newLevel.name}" — range: #${lo + 1}–${hi} (~${stepsLeft} step${stepsLeft !== 1 ? 's' : ''} left)`;
  }
}

function renderPendingSelector() {
  const container = document.getElementById('pending-selector');
  if (!container) return;

  if (state.insertionSession) { container.style.display = 'none'; return; }
  container.style.display = 'block';

  if (state.pendingLevels.length === 0) {
    container.innerHTML = '<p class="no-pending">No pending levels. Use ＋ Add Level to create one.</p>';
    return;
  }

  container.innerHTML = `
    <div class="pending-header">
      <h3 class="pending-title">Select a pending level to place:</h3>
      <button id="random-pending-btn" class="btn btn-primary" title="Select a random pending level">🎲 Random</button>
    </div>
    <div class="pending-grid">
      ${state.pendingLevels.map(level => {
    const hasThumb = !!(level.thumbnail || level.image || level.img || level.photo || level.gdId != null || level.showcaseVideo);
    const inner = thumbInlineHtml(level);
    return `<div class="pending-card" data-id="${level._id}" role="button" tabindex="0">
          <div class="pending-thumb thumb-wrap ${hasThumb ? 'has-thumb' : 'no-thumb'}">${inner}</div>
          <div class="pending-info">
            <div class="pending-name">${escHtml(level.name)}</div>
            <div class="pending-creator">${escHtml(level.creators || 'Unknown creator')}</div>
          </div>
          <div class="pending-card-actions">
            <button class="pending-card-btn pending-card-btn-edit"
              data-action="edit-pending" data-id="${level._id}" title="Edit level">✏</button>
            <button class="pending-card-btn pending-card-btn-delete"
              data-action="delete-pending" data-id="${level._id}" title="Delete level">✕</button>
          </div>
        </div>`;
  }).join('')}
    </div>
  `;

  container.querySelectorAll('.pending-card').forEach(card => {
    card.addEventListener('click', e => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        const { action, id } = actionBtn.dataset;
        if (action === 'edit-pending') {
          openEditModal(id);
        } else if (action === 'delete-pending') {
          const lvl = state.levelMap.get(id);
          if (lvl && (!state.settings.confirmDelete ||
            confirm(`Delete "${lvl.name}" from the list? This cannot be undone.`))) {
            deleteLevel(id);
          }
        }
        return;
      }
      const level = state.pendingLevels.find(l => l._id === card.dataset.id);
      if (level) startInsertion(level);
    });

    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const level = state.pendingLevels.find(l => l._id === card.dataset.id);
        if (level) startInsertion(level);
      }
    });
  });

  const randomBtn = container.querySelector('#random-pending-btn');
  if (randomBtn) {
    randomBtn.addEventListener('click', () => {
      if (state.pendingLevels.length > 0) {
        const randomLevel = state.pendingLevels[Math.floor(Math.random() * state.pendingLevels.length)];
        startInsertion(randomLevel);
      }
    });
  }
}

function setupColumnDragHandlers(orderedColumns) {
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
        reorderColumn(draggedColumn, newPosition < draggedIndex ? newPosition : newPosition - 1);
        saveSession();
        renderAll();
      }
    });
  });
}

function updateBulkToolbar() {
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

function setupBulkToolbarHandlers() {
  if (bulkToolbarSetup) return;
  bulkToolbarSetup = true;

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
      renderAll();
    });
  }
}

function renderRankingsSummary() {
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

function renderRankings() {
  const tbody = document.getElementById('rankings-body');
  const thead = document.querySelector('.rankings-table thead tr');
  const wrapper = document.getElementById('rankings-table-wrapper');
  if (!tbody || !thead) return;
  const orderedColumns = getOrderedColumns();
  const detectedHeaders = orderedColumns
    .map(col => {
      const fieldDef = getFieldDefinition(col);
      const displayName = fieldDef?.label || col.charAt(0).toUpperCase() + col.slice(1);
      const sortAttr = fieldDef?.sortable ? ` data-sort="${col}"` : '';
      return `<th${sortAttr} data-column="${col}" draggable="true" class="draggable-header">${escHtml(displayName)}</th>`;
    })
    .join('');

  thead.innerHTML =
    `<th class="cb-cell"><input type="checkbox" id="select-all-rows" title="Select all"></th>` +
    `<th></th>` +
    detectedHeaders +
    `<th>Actions</th>`;

  const selectAllCb = document.getElementById('select-all-rows');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', () => {
      if (selectAllCb.checked) {
        state.rankedList.forEach(l => state.selectedLevels.add(l._id));
      } else {
        state.selectedLevels.clear();
      }
      tbody.querySelectorAll('.row-select').forEach(cb => {
        cb.checked = selectAllCb.checked;
      });
      updateBulkToolbar();
    });
  }

  setupColumnDragHandlers(orderedColumns);
  const removeColumnSelect = document.getElementById('remove-column-select');
  if (removeColumnSelect) {
    removeColumnSelect.innerHTML = '<option value="">Remove Column...</option>' +
      orderedColumns.map(col => {
        const fieldDef = getFieldDefinition(col);
        const displayName = fieldDef?.label || col.charAt(0).toUpperCase() + col.slice(1);
        return `<option value="${col}">${escHtml(displayName)}</option>`;
      }).join('');
  }

  const mid = state.insertionSession ? getMid() : -1;
  const lo = state.insertionSession?.lo ?? -1;
  const hi = state.insertionSession?.hi ?? -1;
  const filter = state.rankingFilter.toLowerCase();
  const viewRows = getRankingsView();
  const totalColumns = 2 + orderedColumns.length + 1;

  const useVirtual = !filter && !state.insertionSession && state.rankedList.length >= 80 && wrapper;

  if (useVirtual) {
    const scrollTop = wrapper.scrollTop;
    const clientHeight = wrapper.clientHeight || 560;
    const BUFFER = 8;
    const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
    const endRow = Math.min(viewRows.length - 1, Math.ceil((scrollTop + clientHeight) / ROW_HEIGHT) + BUFFER);
    const rows = [];
    if (startRow > 0) {
      rows.push(`<tr class="vscroll-spacer" style="height:${startRow * ROW_HEIGHT}px"><td colspan="${totalColumns}"></td></tr>`);
    }
    for (let i = startRow; i <= endRow; i++) {
      rows.push(buildRankRow(viewRows[i], mid, lo, hi, filter));
    }
    const tailCount = viewRows.length - 1 - endRow;
    if (tailCount > 0) {
      rows.push(`<tr class="vscroll-spacer" style="height:${tailCount * ROW_HEIGHT}px"><td colspan="${totalColumns}"></td></tr>`);
    }
    tbody.innerHTML = rows.join('');

    if (!wrapper.dataset.scrollBound) {
      wrapper.dataset.scrollBound = '1';
      let raf = null;
      wrapper.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = null; renderRankings(); });
      }, { passive: true });
    }
  } else {
    tbody.innerHTML = viewRows.map(entry => buildRankRow(entry, mid, lo, hi, filter)).join('');
  }

  thead.querySelectorAll('th[data-sort]').forEach(th => {
    const sorted = th.dataset.sort === state.rankingsSort.column;
    th.classList.toggle('sorted-asc', sorted && state.rankingsSort.direction === 'asc');
    th.classList.toggle('sorted-desc', sorted && state.rankingsSort.direction === 'desc');
  });

  updateBulkToolbar();
  renderRankingsSummary();
  setupBulkToolbarHandlers();

  if (!rankingsInteractionSetup) {
    setupRankingsInteraction(tbody);
    rankingsInteractionSetup = true;
  }
}

function renderContradictions() {
  const panel = document.getElementById('contradiction-panel');
  if (!panel) return;

  if (state.contradictions.length === 0) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  panel.style.display = 'block';
  const shown = state.contradictions.slice(0, 10);

  panel.innerHTML = `
    <div class="contradiction-header">
      <span class="contradiction-icon">⚠</span>
      <strong>${state.contradictions.length} contradiction${state.contradictions.length !== 1 ? 's' : ''} detected</strong>
      <span class="contradiction-sub">Manual moves conflict with past comparison results</span>
    </div>
    <div class="contradiction-list">
      ${shown.map(c => `
        <div class="contradiction-item">
          <div class="contradiction-pair">
            <span class="contradiction-level">${escHtml(c.harder?.name ?? '?')}</span>
            <span class="contradiction-arrow"> was harder than </span>
            <span class="contradiction-level">${escHtml(c.easier?.name ?? '?')}</span>
            <span class="contradiction-conf badge badge-${c.confidence === 'certain' ? 'contradiction' : 'low-conf'}">${c.confidence}</span>
          </div>
          <div class="contradiction-actions">
            ${c.harder ? `<button class="btn btn-xs btn-gold" data-resolve="${c.harder._id}">Re-rank "${escHtml(c.harder.name)}"</button>` : ''}
            ${c.easier ? `<button class="btn btn-xs btn-gold" data-resolve="${c.easier._id}">Re-rank "${escHtml(c.easier.name)}"</button>` : ''}
          </div>
        </div>
      `).join('')}
      ${state.contradictions.length > 10 ? `<p class="contradiction-more">…and ${state.contradictions.length - 10} more</p>` : ''}
    </div>
  `;

  panel.querySelectorAll('[data-resolve]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lvl = state.levelMap.get(btn.dataset.resolve);
      if (lvl && confirm(`Re-rank "${lvl.name}"? It moves to pending and its comparison history clears.`)) {
        resolveContradiction(lvl._id);
      }
    });
  });
}

function renderStats() {
  const compEl = document.getElementById('comp-count');
  const skipEl = document.getElementById('skip-count');
  const activeEl = document.getElementById('active-count');
  const queueEl = document.getElementById('queue-count');
  if (compEl) compEl.textContent = state.compCount;
  if (skipEl) skipEl.textContent = state.placementHistory.length;
  if (activeEl) activeEl.textContent = state.rankedList.length;
  if (queueEl) queueEl.textContent = state.pendingLevels.length;
}

function setupRankingsInteraction(tbody) {
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
      renderRankings();
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

function showPositionEditor(cell, fromIdx) {
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
      renderRankings();
    }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); apply(); }
    else if (e.key === 'Escape') renderRankings();
  });
  input.addEventListener('blur', apply);
}

export function openEditModal(levelId) {
  const level = state.levelMap.get(levelId);
  if (!level) return;

  state.modalMode = 'edit';
  state.modalLevelId = levelId;

  document.getElementById('modal-title').textContent = 'Edit Level';
  document.getElementById('modal-name').value = level.name || '';
  document.getElementById('modal-creators').value = level.creators || '';
  document.getElementById('modal-video').value = level.showcaseVideo || '';
  document.getElementById('modal-listid').value = level.id != null ? level.id : '';
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
  const gdId = listidVal ? (parseInt(listidVal) || null) : null;
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

  const data = {
    name,
    creators: document.getElementById('modal-creators').value.trim() || null,
    showcaseVideo: document.getElementById('modal-video').value.trim() || null,
    id: document.getElementById('modal-listid').value !== ''
      ? parseInt(document.getElementById('modal-listid').value) || null
      : null,
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
        showToast('Invalid victors JSON');
        return null;
      }
    })(),
  };

  if (state.modalMode === 'edit' && state.modalLevelId) {
    const level = state.levelMap.get(state.modalLevelId);
    if (level) {
      Object.assign(level, data);
      level.lastEdited = new Date().toISOString();
      saveSession();
      renderAll();
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
      renderAll();
      showToast(`"${name}" added to ranked list`);
    } else if (status === 'immediate') {
      state.pendingLevels.push(level);
      saveSession();
      renderAll();
      showToast(`"${name}" added — starting placement`);
      closeModal();
      startInsertion(level);
      return;
    } else {
      state.pendingLevels.push(level);
      saveSession();
      renderAll();
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
  renderAll();
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
      renderAll();
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
      renderAll();
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
        renderAll();
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
    renderAll();
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

function showImportPanel(panelId) {
  document.querySelectorAll('#import-tab .import-panel').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById(panelId);
  if (target) target.classList.remove('hidden');
}

function showImportError(type, msg) {
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

function buildSchemaRowHtml(field, i) {
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

function renderImportPreview() {
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

    <div class="schema-table-scroll">
      <table class="schema-table">
        <thead>
          <tr>
            <th class="schema-drag-cell"></th>
            <th class="schema-visible-cell" title="Visible">👁</th>
            <th class="schema-key-cell">JSON Key</th>
            <th class="schema-label-cell">Display Label</th>
            <th class="schema-type-cell">Type</th>
            <th class="schema-flag-cell" title="Sortable">↕</th>
            <th class="schema-flag-cell" title="Filterable">🔍</th>
            <th class="schema-sample-cell">Sample Values</th>
          </tr>
        </thead>
        <tbody id="schema-tbody">
          ${schema.map((f, i) => buildSchemaRowHtml(f, i)).join('')}
        </tbody>
      </table>
    </div>

    <div class="schema-field-count" id="schema-field-count">${visibleCount} of ${schema.length} fields visible</div>

    <div class="import-panel-actions">
      <button id="schema-back-btn" class="btn">← Back</button>
      <button id="schema-confirm-btn" class="btn btn-primary">⬇ Import ${records.length} record${records.length !== 1 ? 's' : ''}</button>
    </div>
  `;

  injectSchemaPreviewStyles();
  showImportPanel('import-preview-panel');
  setupSchemaPreviewHandlers(backPanelId);
  setupSchemaRowDrag();
}

function setupSchemaPreviewHandlers(backPanelId) {
  const panel = document.getElementById('import-preview-panel');
  if (!panel) return;

  panel.querySelector('#schema-back-btn')?.addEventListener('click', () => {
    showImportPanel(backPanelId);
  });

  panel.querySelector('#schema-confirm-btn')?.addEventListener('click', () => {
    confirmImport();
  });

  panel.querySelector('#schema-save-template-btn')?.addEventListener('click', () => {
    const nameInput = panel.querySelector('#schema-template-name-input');
    const name = nameInput?.value.trim();
    if (!name) { showToast('Enter a name for the template', 'danger'); nameInput?.focus(); return; }
    if (saveImportTemplate(name, _importPreviewData.schema)) {
      showToast(`Template "${name}" saved`);
      if (nameInput) nameInput.value = '';
      renderImportPreview();
    } else {
      showToast('Failed to save template', 'danger');
    }
  });

  panel.querySelector('#schema-load-template-btn')?.addEventListener('click', () => {
    const select = panel.querySelector('#schema-template-select');
    const name = select?.value;
    if (!name) { showToast('Select a template first', 'danger'); return; }
    const tmpl = loadImportTemplate(name);
    if (!tmpl) { showToast('Template not found', 'danger'); return; }
    _importPreviewData.schema = mergeTemplateWithSchema(tmpl, _importPreviewData.schema);
    renderImportPreview();
    showToast(`Template "${name}" applied`);
  });

  panel.querySelector('#schema-delete-template-btn')?.addEventListener('click', () => {
    const select = panel.querySelector('#schema-template-select');
    const name = select?.value;
    if (!name) { showToast('Select a template first', 'danger'); return; }
    if (!confirm(`Delete template "${name}"?`)) return;
    deleteImportTemplate(name);
    renderImportPreview();
    showToast(`Template "${name}" deleted`);
  });

  const tbody = panel.querySelector('#schema-tbody');
  if (!tbody) return;

  tbody.addEventListener('change', e => {
    const idx = parseInt(e.target.dataset.idx);
    if (isNaN(idx) || !_importPreviewData.schema[idx]) return;
    const field = _importPreviewData.schema[idx];

    if (e.target.classList.contains('schema-field-visible')) {
      field.visible = e.target.checked;
      e.target.closest('tr')?.classList.toggle('schema-row-hidden', !field.visible);
    } else if (e.target.classList.contains('schema-field-type')) {
      field.type = e.target.value;
    } else if (e.target.classList.contains('schema-field-sortable')) {
      field.sortable = e.target.checked;
    } else if (e.target.classList.contains('schema-field-filterable')) {
      field.filterable = e.target.checked;
    }

    const countEl = document.getElementById('schema-field-count');
    if (countEl) {
      const vis = _importPreviewData.schema.filter(f => f.visible).length;
      countEl.textContent = `${vis} of ${_importPreviewData.schema.length} fields visible`;
    }
  });

  tbody.addEventListener('input', e => {
    const idx = parseInt(e.target.dataset.idx);
    if (isNaN(idx) || !_importPreviewData.schema[idx]) return;
    if (e.target.classList.contains('schema-field-label')) {
      _importPreviewData.schema[idx].label = e.target.value;
    }
  });
}

function setupSchemaRowDrag() {
  const tbody = document.getElementById('schema-tbody');
  if (!tbody) return;
  let dragSrc = null;

  tbody.addEventListener('dragstart', e => {
    const row = e.target.closest('.schema-row');
    if (!row) return;
    dragSrc = row;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => row.style.opacity = '0.4', 0);
  });

  tbody.addEventListener('dragend', () => {
    if (dragSrc) dragSrc.style.opacity = '';
    tbody.querySelectorAll('.schema-row').forEach(r => r.classList.remove('schema-drag-over'));
    dragSrc = null;
  });

  tbody.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.schema-row');
    if (!row || row === dragSrc) return;
    tbody.querySelectorAll('.schema-drag-over').forEach(r => r.classList.remove('schema-drag-over'));
    row.classList.add('schema-drag-over');
  });

  tbody.addEventListener('dragleave', e => {
    if (!tbody.contains(e.relatedTarget)) {
      tbody.querySelectorAll('.schema-drag-over').forEach(r => r.classList.remove('schema-drag-over'));
    }
  });

  tbody.addEventListener('drop', e => {
    e.preventDefault();
    tbody.querySelectorAll('.schema-drag-over').forEach(r => r.classList.remove('schema-drag-over'));
    const targetRow = e.target.closest('.schema-row');
    if (!targetRow || !dragSrc || targetRow === dragSrc) return;

    const allRows = Array.from(tbody.querySelectorAll('.schema-row'));
    const fromIdx = parseInt(dragSrc.dataset.idx);
    const toIdx = parseInt(targetRow.dataset.idx);

    if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;

    const moved = _importPreviewData.schema.splice(fromIdx, 1)[0];
    _importPreviewData.schema.splice(toIdx, 0, moved);

    renderImportPreview();
  });
}

function mergeTemplateWithSchema(template, currentSchema) {
  const tmplMap = new Map(template.map(f => [f.id, f]));
  return currentSchema.map(field => {
    const tmpl = tmplMap.get(field.id);
    if (!tmpl) return field;
    return {
      ...field,
      label: tmpl.label ?? field.label,
      type: tmpl.type ?? field.type,
      visible: tmpl.visible ?? field.visible,
      sortable: tmpl.sortable ?? field.sortable,
      filterable: tmpl.filterable ?? field.filterable,
      enumOptions: tmpl.enumOptions?.length ? tmpl.enumOptions : field.enumOptions,
    };
  });
}

function confirmImport() {
  const { records, schema, type } = _importPreviewData;
  const visibleSchema = schema.filter(f => f.visible);

  if (!visibleSchema.length) {
    showToast('No fields are visible — enable at least one field', 'danger');
    return;
  }

  const processedRecords = records.map((rec, recIdx) => {
    const normalized = (rec !== null && typeof rec === 'object' && !Array.isArray(rec)) ? rec : { value: rec };
    const flat = flattenRecord(normalized);
    const out = {};

    for (const field of visibleSchema) {
      const val = flat[field.id];
      if (val === undefined || val === null) continue;

      if (field.type === 'number') {
        const n = Number(val);
        if (isFinite(n)) out[field.id] = n;
      } else if (field.type === 'boolean') {
        out[field.id] = val === true || val === 1 || String(val).toLowerCase() === 'true';
      } else if (field.type === 'tags') {
        out[field.id] = Array.isArray(val)
          ? val.map(String).filter(Boolean)
          : String(val).split(',').map(s => s.trim()).filter(Boolean);
      } else if (field.type === 'json') {
        out[field.id] = val;
      } else {
        out[field.id] = String(val);
      }
    }

    return out;
  });

  const newLevels = processedRecords.map((rec, i) => {
    const level = normalizeLevelObject(rec);
    if (type === 'pending') level.pending = true;
    level._id = level._id ?? makeLevelId(level, state.rawLevels.length + i);
    if (!level.customValues || typeof level.customValues !== 'object') level.customValues = {};
    return level;
  });

  if (type === 'replace') {
    if (state.rawLevels.length > 0 && state.settings.confirmImportOverwrite) {
      if (!confirm(`Replace all ${state.rawLevels.length} existing records with ${newLevels.length} new records? This cannot be undone.`)) return;
    }
    state.rawLevels = [];
    state.levelMap.clear();
    state.rankedList = [];
    state.pendingLevels = [];
    state.compCount = 0;
    state.placementHistory = [];
    state.comparisonGraph = new Map();
    state.contradictions = [];
    state.dynamicFields = [];
    state.detectedColumns = [];
    state.detectedColumnsOrder = {};
  } else if (type === 'main' && state.rawLevels.length > 0 && state.settings.confirmImportOverwrite) {
    if (!confirm(`Add ${newLevels.length} records to the existing list?`)) return;
  }

  const existingDynIds = new Set(state.dynamicFields.map(f => f.id));

  for (const field of visibleSchema) {
    if (FIELD_ID_SET.has(field.id)) continue;
    if (existingDynIds.has(field.id)) {
      const existing = state.dynamicFields.find(f => f.id === field.id);
      if (existing) {
        existing.label = field.label;
        existing.type = field.type;
        existing.sortable = field.sortable;
        existing.filterable = field.filterable;
      }
    } else {
      state.dynamicFields.push({
        id: field.id,
        label: field.label,
        type: field.type,
        sortable: field.sortable,
        filterable: field.filterable,
        groupable: false,
        conditional: false,
      });
      existingDynIds.add(field.id);
    }
  }

  newLevels.forEach(level => {
    state.rawLevels.push(level);
    state.levelMap.set(level._id, level);
    if (level.pending || type === 'pending') {
      state.pendingLevels.push(level);
    } else {
      state.rankedList.push(level);
    }
  });

  if (state.rankedList.some(l => l.rank != null)) {
    state.rankedList.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  }

  detectColumnsFromLevels();
  saveSession();

  showImportPanel(type === 'pending' ? 'import-pending-panel' : 'import-main-panel');
  _importPreviewData = { records: [], schema: [], type: 'main' };

  document.querySelector('[data-tab="comparison"]')?.click();
  renderAll();
  showToast(`${newLevels.length} record${newLevels.length !== 1 ? 's' : ''} imported`);
}

function handleRawImport(text, type) {
  showImportError(type, '');
  let records;

  const trimmed = text.trim();
  if (!trimmed) { showImportError(type, 'No data provided.'); return; }

  try {
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      records = Array.isArray(parsed) ? parsed : [parsed];
    } else if (looksLikeCSV(trimmed)) {
      records = parseCSV(trimmed);
    } else {
      records = parsePlainText(trimmed);
    }
  } catch (err) {
    showImportError(type, `Parse error: ${err.message}`);
    return;
  }

  if (!records?.length) { showImportError(type, 'No records found in the data.'); return; }

  const schema = buildSchemaFromRecords(records);
  _importPreviewData = { records, schema, type };
  renderImportPreview();
}

async function handleUrlImport(url, type) {
  if (!url?.trim()) return;
  showImportError(type, '');
  try {
    const res = await fetch(url.trim());
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    handleRawImport(text, type);
  } catch (err) {
    showImportError(type, `Failed to load URL: ${err.message}`);
  }
}

export function initImportPipeline() {
  document.querySelectorAll('.file-input').forEach(input => {
    input.addEventListener('change', async e => {
      e.stopImmediatePropagation();
      const file = e.target.files?.[0];
      if (!file) return;
      const importType = input.dataset.type || 'main';
      try {
        const text = await file.text();
        handleRawImport(text, importType);
      } catch (err) {
        showImportError(importType, `Could not read file: ${err.message}`);
      }
      input.value = '';
    }, true);
  });

  document.querySelectorAll('.drop-zone').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const importType = zone.dataset.type || 'main';
      try {
        const text = await file.text();
        handleRawImport(text, importType);
      } catch (err) {
        showImportError(importType, `Could not read file: ${err.message}`);
      }
    });
  });

  document.querySelectorAll('.paste-submit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopImmediatePropagation();
      const importType = btn.dataset.type || 'main';
      const textarea = document.getElementById(`paste-textarea-${importType}`);
      if (!textarea?.value.trim()) return;
      handleRawImport(textarea.value, importType);
    }, true);
  });

  const urlBtn = document.getElementById('import-url-btn');
  if (urlBtn) {
    urlBtn.addEventListener('click', e => {
      e.stopImmediatePropagation();
      const url = document.getElementById('import-url-input')?.value.trim();
      if (url) handleUrlImport(url, 'main');
    }, true);
  }

  const presetBtn = document.getElementById('import-preset-btn');
  if (presetBtn) {
    presetBtn.addEventListener('click', e => {
      e.stopImmediatePropagation();
      const url = document.getElementById('import-preset-select')?.value;
      if (url) handleUrlImport(url, 'main');
    }, true);
  }
}

function injectSchemaPreviewStyles() {
  if (document.getElementById('schema-preview-styles')) return;
  const style = document.createElement('style');
  style.id = 'schema-preview-styles';
  style.textContent = `
    .schema-templates-bar { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; padding: 12px; background: var(--surface-2, rgba(255,255,255,0.04)); border-radius: 8px; }
    .schema-template-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .schema-template-row .field-input { flex: 1; min-width: 160px; }
    .schema-table-scroll { overflow-x: auto; max-height: 420px; overflow-y: auto; border: 1px solid var(--border, rgba(255,255,255,0.1)); border-radius: 6px; }
    .schema-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .schema-table thead th { position: sticky; top: 0; background: var(--surface-1, #1e1e2e); padding: 8px 10px; text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; white-space: nowrap; z-index: 1; }
    .schema-table tbody tr { border-top: 1px solid var(--border, rgba(255,255,255,0.06)); transition: background 0.1s; }
    .schema-table tbody tr:hover { background: var(--surface-hover, rgba(255,255,255,0.03)); }
    .schema-row-hidden { opacity: 0.4; }
    .schema-drag-over { outline: 2px solid #0ea5e9; outline-offset: -2px; }
    .schema-drag-cell { width: 28px; cursor: grab; text-align: center; color: rgba(255,255,255,0.3); padding: 8px 4px; user-select: none; }
    .schema-visible-cell { width: 36px; text-align: center; padding: 8px 4px; }
    .schema-key-cell { min-width: 140px; max-width: 200px; padding: 8px 10px; }
    .schema-key-code { font-family: 'Share Tech Mono', monospace; font-size: 0.8rem; opacity: 0.8; word-break: break-all; }
    .schema-builtin-badge { font-size: 0.6rem; color: #f59e0b; margin-left: 4px; vertical-align: super; }
    .schema-label-cell { min-width: 140px; padding: 4px 6px; }
    .schema-label-cell .field-input { width: 100%; min-width: 120px; }
    .schema-type-cell { min-width: 130px; padding: 4px 6px; }
    .schema-type-cell .field-input { width: 100%; }
    .schema-flag-cell { width: 36px; text-align: center; padding: 8px 4px; }
    .schema-cb { cursor: pointer; width: 15px; height: 15px; }
    .schema-sample-cell { min-width: 160px; max-width: 260px; padding: 8px 10px; }
    .schema-sample-text { opacity: 0.55; font-size: 0.8rem; font-family: 'Share Tech Mono', monospace; }
    .schema-enum-hint { display: block; font-size: 0.7rem; opacity: 0.5; margin-top: 2px; }
    .schema-field-count { text-align: right; font-size: 0.8rem; opacity: 0.5; margin: 8px 0; }
  `;
  document.head.appendChild(style);
}