import { renderComparison, renderPendingSelector, renderRankings, renderContradictions, renderStats } from './render.split.js';

export function renderAll() {
  renderComparison();
  renderPendingSelector();
  renderRankings();
  renderContradictions();
  renderStats();
}

document.addEventListener('dl:render', renderAll);
export default { renderAll };