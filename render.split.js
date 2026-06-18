import { setThumbElement, thumbInlineHtml, formatTags, formatVictors, formatTimestamp, isImageUrl, getImageUrlForDisplay, formatCellValue, getLevelThumbnailUrls } from './render.utils.js';
import { state, escHtml, getCustomValue, setCustomValue, getCustomField, getOrderedColumns, getFieldDefinition, hasColumn, addDetectedColumn, CONFIDENCE_LEVELS, ytId } from './state.js';
import { getMid, vote, startInsertion, moveLevel, moveLevelUp, moveLevelDown, moveToPosition, deleteLevel, reevaluateRanked, showToast, resolveContradiction, saveSession } from './logic.js';

import { openEditModal } from './render.modals.js';
import { renderRankings } from './render.table.js';

export function renderComparison() {
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

export function renderPendingSelector() {
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

export function renderContradictions() {
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

export function renderStats() {
  const compEl = document.getElementById('comp-count');
  const skipEl = document.getElementById('skip-count');
  const activeEl = document.getElementById('active-count');
  const queueEl = document.getElementById('queue-count');
  if (compEl) compEl.textContent = state.compCount;
  if (skipEl) skipEl.textContent = state.placementHistory.length;
  if (activeEl) activeEl.textContent = state.rankedList.length;
  if (queueEl) queueEl.textContent = state.pendingLevels.length;
}
export { renderRankings };