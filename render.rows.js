import { state, escHtml, getFieldDefinition, getCustomField, setCustomValue, CONFIDENCE_LEVELS, getCustomValue, getOrderedColumns } from './state.js';
import { isImageUrl, getImageUrlForDisplay, formatCellValue, formatTags, formatVictors, getLevelThumbnailUrls, handleCellImageError } from './render.utils.js';

export function getFieldValue(level, fieldId, idx) {
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

export function buildFieldCell(fieldId, level, idx, badges = '') {
  const fieldDef = getFieldDefinition(fieldId);
  const value = getFieldValue(level, fieldId, idx);

  if (fieldId === 'rank') {
    return `<td class="rank-num rank-pos" data-idx="${idx}" title="${state.settings.enableDragDrop ? 'Click to jump to position' : ''}" style="${state.settings.enableDragDrop ? 'cursor:pointer;' : ''}">${idx + 1} ${badges}</td>`;
  }

  if (fieldId === 'name') {
    return `<td class="cell-editable" contenteditable="true" data-field="name" data-idx="${idx}" title="Edit name">${escHtml(level.name)}</td>`;
  }

  if (fieldId === 'thumbnail') {
    const urls = getLevelThumbnailUrls(level);
    const thumbUrl = urls.primary || urls.fallback;
    if (thumbUrl) {
      return `<td class="cell-image-wrapper" data-field="${fieldId}" data-idx="${idx}" data-original-value="${escHtml(thumbUrl)}" title="Click to edit"><img src="${escHtml(thumbUrl)}" class="cell-image" alt="Thumbnail" loading="lazy" onerror="handleCellImageError.call(this)"></td>`;
    }
    return `<td class="cell-editable" contenteditable="true" data-field="${fieldId}" data-idx="${idx}" title="Edit or paste thumbnail URL">—</td>`;
  }

  if (fieldId === 'showcaseVideo' || fieldId === 'video') {
    return `<td class="cell-editable" contenteditable="true" data-field="${fieldId}" data-idx="${idx}" title="Edit ${escHtml(fieldDef?.label || fieldId)}">${escHtml(value || '')}</td>`;
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
    if (fieldDef.type === 'image' && isImageUrl(value)) {
      const displayUrl = getImageUrlForDisplay(value);
      return `<td class="cell-image-wrapper" data-field="${fieldId}" data-idx="${idx}" data-original-value="${escHtml(value)}" title="Click to edit"><img src="${escHtml(displayUrl)}" class="cell-image" alt="${escHtml(fieldDef.label)}" loading="lazy" onerror="handleCellImageError.call(this)"></td>`;
    }
    return `<td class="cell-editable" contenteditable="true" data-field="${fieldId}" data-idx="${idx}" title="Edit ${escHtml(fieldDef.label)}">${escHtml(value)}</td>`;
  }

  if (fieldId !== 'video' && fieldId !== 'showcaseVideo' && isImageUrl(value)) {
    const displayUrl = getImageUrlForDisplay(value);
    return `<td class="cell-image-wrapper" data-field="${fieldId}" data-idx="${idx}" data-original-value="${escHtml(value)}" title="Click to edit"><img src="${escHtml(displayUrl)}" class="cell-image" alt="${escHtml(fieldDef?.label || fieldId)}" loading="lazy" onerror="handleCellImageError.call(this)"></td>`;
  }

  return `<td class="cell-editable" contenteditable="true" data-field="${fieldId}" data-idx="${idx}" title="Edit ${escHtml(fieldDef?.label || fieldId)}">${escHtml(formatCellValue(value))}</td>`;
}

export function buildRankRow(entry, mid, lo, hi, filter) {
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

  return `<tr class="${rowClass}" data-idx="${idx}" data-id="${level._id}" ${hiddenStyle}>
    <td class="cb-cell"><input type="checkbox" class="row-select" data-id="${level._id}" ${isChecked ? 'checked' : ''}></td>
    <td class="drag-handle" draggable="${canMove}" data-idx="${idx}" title="Drag to reorder">${canMove ? '⠿' : ''}</td>
    ${columnCells}
    <td class="rank-actions">${actionCells}</td>
  </tr>`;
}