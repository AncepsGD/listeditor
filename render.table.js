import { state, escHtml } from './state.js';
import { getMid, isRankedVariant } from './logic.js';
import { setupRankingsInteraction, renderRankingsSummary } from './render.interactions.js';
import { thumbInlineHtml } from './render.utils.js';

const INTERNAL_FIELDS = new Set(['_id', 'pending', 'lowConfidence', 'confidence', 'lastEdited', 'customValues']);

function formatFieldValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return value || '""';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getCardFields(level) {
  return Object.entries(level).filter(([key]) => !INTERNAL_FIELDS.has(key));
}

function getRankPositionColor(index, rankedCount) {
  const progress = rankedCount > 1 ? index / (rankedCount - 1) : 0;
  const hue = 330 * progress;
  return `hsl(${hue} 85% 62%)`;
}

function getVariantTargetName(level) {
  if (!isRankedVariant(level)) return '';
  return level.duplicateOf;
}

function renderRankCard(level, idx, displayRank, options = {}) {
  const {
    variant = false,
    matches = true,
    children = '',
    detailOpenById,
    mid,
    lo,
    hi,
    ordinaryRankedCount,
    logicalIndex,
  } = options;
  const fields = getCardFields(level);
  const fieldList = fields.map(([key, value]) => `
        <div class="rank-list-field">
          <dt>${escHtml(key)}</dt>
          <dd>${escHtml(formatFieldValue(value))}</dd>
        </div>`).join('');
  const contradiction = state.contradictions.some(
    item => item.harder?._id === level._id || item.easier?._id === level._id
  );
  const classes = [
    'rank-list-card',
    variant ? 'rank-list-variant' : '',
    !variant && logicalIndex === mid ? 'rank-mid' : (!variant && lo !== -1 && logicalIndex >= lo && logicalIndex < hi ? 'rank-in-range' : ''),
    contradiction ? 'row-contradiction' : '',
  ].filter(Boolean).join(' ');
  const thumbnail = state.settings.showRankingThumbnails !== false ? thumbInlineHtml(level) : '';
  const draggable = !variant && !state.insertionSession && state.settings.enableDragDrop;
  const detailsOpen = detailOpenById.has(level._id)
    ? detailOpenById.get(level._id)
    : state.settings.expandRankingDetails === true;
  const positionColor = variant ? '' : getRankPositionColor(displayRank - 1, ordinaryRankedCount);
  const position = variant
    ? '<span class="rank-list-variant-label">Variant</span>'
    : `<span class="rank-list-position" style="--rank-position-color:${positionColor}">${displayRank}</span>`;

  return `<article class="${classes}" data-idx="${idx}" data-id="${escHtml(level._id)}"${matches ? '' : ' hidden'}>
        <div class="rank-list-heading">
          ${position}
          <span class="rank-list-drag" draggable="${draggable}" title="${draggable ? 'Drag to reorder' : ''}" aria-label="Drag to reorder">${draggable ? '⠿' : ''}</span>
          ${thumbnail ? `<span class="rank-list-thumbnail thumb-wrap has-thumb">${thumbnail}</span>` : ''}
          <h4 title="${escHtml(level.name || 'Untitled')}">${escHtml(level.name || 'Untitled')}</h4>
          <div class="rank-list-actions">
            <button class="btn btn-xs" type="button" data-action="edit" data-id="${escHtml(level._id)}">Edit</button>
            <button class="btn btn-xs" type="button" data-action="duplicate" data-id="${escHtml(level._id)}">Duplicate</button>
            ${variant ? '' : `<button class="btn btn-xs" type="button" data-action="reeval" data-id="${escHtml(level._id)}">Re-rank</button>`}
            <button class="btn btn-xs btn-danger" type="button" data-action="delete" data-id="${escHtml(level._id)}">Delete</button>
          </div>
        </div>
        ${children}
        <details class="rank-list-details"${detailsOpen ? ' open' : ''}>
          <summary>${fields.length} data field${fields.length === 1 ? '' : 's'}</summary>
          <dl>${fieldList || '<div class="rank-list-empty-fields">No editable data fields</div>'}</dl>
        </details>
      </article>`;
}

export function renderRankings() {
  const list = document.getElementById('rankings-body');
  if (!list) return;

  const detailOpenById = state.resetRankingDetailsToDefault
    ? new Map()
    : new Map(
        Array.from(list.querySelectorAll('.rank-list-card')).map(card => [
          card.dataset.id,
          card.querySelector('.rank-list-details')?.open,
        ])
      );
  state.resetRankingDetailsToDefault = false;
  const filter = String(state.rankingFilter ?? '').trim().toLowerCase();
  const mid = state.insertionSession ? getMid() : -1;
  const lo = state.insertionSession?.lo ?? -1;
  const hi = state.insertionSession?.hi ?? -1;

  const ordinaryEntries = state.rankedList.map((level, idx) => ({ level, idx }));
  const rankedVariantEntries = state.rawLevels
    .map((level, rawIndex) => ({ level, rawIndex }))
    .filter(({ level }) => !level.pending && isRankedVariant(level))
    .sort((a, b) => {
      const aRank = Number.isFinite(a.level.rank) ? a.level.rank : Number.POSITIVE_INFINITY;
      const bRank = Number.isFinite(b.level.rank) ? b.level.rank : Number.POSITIVE_INFINITY;
      return aRank - bRank || a.rawIndex - b.rawIndex;
    })
    .map(({ level }) => ({ level, idx: -1 }));
  const variantsByTarget = new Map();
  const ordinaryByName = new Map();
  ordinaryEntries.forEach(({ level }) => {
    const name = level.name;
    if (typeof name === 'string' && name.length > 0 && !ordinaryByName.has(name)) {
      ordinaryByName.set(name, level);
    }
  });
  const unassignedVariants = [];

  rankedVariantEntries.forEach(entry => {
    const targetName = getVariantTargetName(entry.level);
    if (!targetName) return;
    const target = ordinaryByName.get(targetName);
    if (!target) {
      unassignedVariants.push(entry);
      return;
    }
    if (!variantsByTarget.has(target._id)) variantsByTarget.set(target._id, []);
    variantsByTarget.get(target._id).push(entry);
  });
  variantsByTarget.forEach(variants => variants.sort((a, b) => a.idx - b.idx));

  if (!ordinaryEntries.length && !unassignedVariants.length) {
    list.innerHTML = '<div class="rankings-empty">No ranked levels yet. Import a list or add a level to get started.</div>';
  } else {
    const ordinaryRanks = new Map(ordinaryEntries.map((entry, index) => [entry.level._id, index + 1]));
    const renderVariant = ({ level, idx }) => {
      const fields = getCardFields(level);
      const searchable = JSON.stringify(fields).toLowerCase();
      return renderRankCard(level, idx, 0, {
        ordinaryRankedCount: ordinaryEntries.length,
        variant: true,
        matches: !filter || searchable.includes(filter),
        detailOpenById,
        mid,
        lo,
        hi,
      });
    };
    const mainCards = ordinaryEntries.map(({ level, idx }, logicalIndex) => {
      const fields = getCardFields(level);
      const searchable = JSON.stringify(fields).toLowerCase();
      const variants = variantsByTarget.get(level._id) ?? [];
      const variantSearchMatches = variants.some(({ level: variant }) =>
        JSON.stringify(getCardFields(variant)).toLowerCase().includes(filter)
      );
      const matches = !filter || searchable.includes(filter) || variantSearchMatches;
      const children = variants.length
        ? `<div class="rank-list-variants">${variants.map(renderVariant).join('')}</div>`
        : '';
      return renderRankCard(level, idx, ordinaryRanks.get(level._id), {
        ordinaryRankedCount: ordinaryEntries.length,
        logicalIndex,
        matches,
        children,
        detailOpenById,
        mid,
        lo,
        hi,
      });
    });
    const orphanCards = unassignedVariants.length
      ? `<section class="rank-list-unassigned-variants">
          <h4>Unassigned variants</h4>
          ${unassignedVariants.map(renderVariant).join('')}
        </section>`
      : '';
    list.innerHTML = `${mainCards.join('')}${orphanCards}`;
  }

  renderRankingsSummary();

  if (!state.rankingsInteractionSetup) {
    setupRankingsInteraction(list);
    state.rankingsInteractionSetup = true;
  }
}
