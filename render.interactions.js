import { state } from './state.js';
import { saveSession } from './logic.js';
import { moveLevel, deleteLevel, reevaluateRanked, getOrdinaryRankedEntries } from './logic.js';
import { openEditModal, openDuplicateModal } from './render.modals.js';

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
    `<span class="summary-pill">${ranked} ranked</span>`,
    pending > 0 ? `<span class="summary-pill summary-pill-pending">⏳ ${pending} pending</span>` : '',
    contras > 0 ? `<span class="summary-pill summary-pill-danger">⚠ ${contras} contradiction${contras !== 1 ? 's' : ''}</span>` : '',
  ].filter(Boolean).join('');
}

export function setupRankingsInteraction(list) {
  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (btn && list.contains(btn)) {
      const action = btn.dataset.action;
      const level = state.levelMap.get(btn.dataset.id);
      if (!level) return;
      if (action === 'edit') { openEditModal(level._id); return; }
      if (action === 'duplicate') { openDuplicateModal(level._id); return; }
      if (action === 'reeval') {
        if (confirm(`Move "${level.name}" back to pending for re-ranking?`)) {
          reevaluateRanked(level._id);
        }
        return;
      }
      if (action === 'delete') {
        if (!state.settings.confirmDelete ||
          confirm(`Delete "${level.name}"? This cannot be undone.`)) {
          deleteLevel(level._id);
        }
        return;
      }
    }
  });

  list.addEventListener('dragstart', e => {
    if (state.insertionSession || !state.settings.enableDragDrop) return;
    const handle = e.target.closest('.rank-list-drag');
    const card = handle?.closest('.rank-list-card');
    if (!card || handle.getAttribute('draggable') !== 'true') {
      e.preventDefault();
      return;
    }
    state.dragSrcIdx = parseInt(card.dataset.idx, 10);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });

  list.addEventListener('dragover', e => {
    if (state.insertionSession || state.dragSrcIdx == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = e.target.closest('.rank-list-card');
    if (card && !card.classList.contains('rank-list-variant')) {
      list.querySelectorAll('.drag-over-row').forEach(item => item.classList.remove('drag-over-row'));
      card.classList.add('drag-over-row');
    }
  });

  list.addEventListener('dragleave', e => {
    if (!list.contains(e.relatedTarget)) {
      list.querySelectorAll('.drag-over-row').forEach(card => card.classList.remove('drag-over-row'));
    }
  });

  list.addEventListener('drop', e => {
    if (state.insertionSession) return;
    e.preventDefault();
    list.querySelectorAll('.drag-over-row, .dragging').forEach(card => {
      card.classList.remove('drag-over-row', 'dragging');
    });
    const card = e.target.closest('.rank-list-card');
    if (!card || card.classList.contains('rank-list-variant') || state.dragSrcIdx == null) return;
    const targetIdx = parseInt(card.dataset.idx, 10);
    if (state.dragSrcIdx !== targetIdx) moveLevel(state.dragSrcIdx, targetIdx);
    state.dragSrcIdx = null;
  });

  list.addEventListener('dragend', () => {
    state.dragSrcIdx = null;
    list.querySelectorAll('.drag-over-row, .dragging').forEach(card => {
      card.classList.remove('drag-over-row', 'dragging');
    });
  });
}