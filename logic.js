import {
  state, CONFIDENCE_LEVELS, compKey, makeLevelId,
  normalizeLevelObject, parsePlainText, parseCSV,
  looksLikePlainText, looksLikeCSV,
  STORAGE_KEY, saveSettings, detectColumnsFromLevels,
  removeDuplicateLevels, computeDataHash, fetchPresetData,
  generateUpdateDiff, normalizeLevelName,
} from './state.js';

function triggerRender() {
  document.dispatchEvent(new CustomEvent('dl:render'));
}

function switchToTab(tabName) {
  document.dispatchEvent(new CustomEvent('dl:tabswitch', { detail: { tab: tabName } }));
}

export function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  if (state.toastTimer) clearTimeout(state.toastTimer);
  el.textContent = msg;
  el.className = `active${type === 'danger' ? ' toast-danger' : type === 'gold' ? ' toast-gold' : ''}`;
  state.toastTimer = setTimeout(() => { el.className = ''; }, 2800);
}

export function getMid() {
  if (!state.insertionSession) return -1;
  return Math.floor((state.insertionSession.lo + state.insertionSession.hi) / 2);
}

export function isRankedVariant(level) {
  if (typeof level?.duplicateOf !== 'string' || level.duplicateOf.length === 0) {
    return false;
  }

  return state.rawLevels.some(candidate =>
    candidate !== level &&
    candidate.name === level.duplicateOf &&
    candidate.pending !== true &&
    !(typeof candidate.duplicateOf === 'string' && candidate.duplicateOf.length > 0)
  );
}

export function getOrdinaryRankedEntries() {
  return state.rankedList.map((level, index) => ({ level, index }));
}

export function getMidLevel() {
  const mid = getMid();
  return getOrdinaryRankedEntries()[mid]?.level ?? null;
}

function getInsertionArrayIndex(ordinaryIndex) {
  return Math.max(0, Math.min(ordinaryIndex, state.rankedList.length));
}

function recordComparison(harderId, easierId, confidence) {
  const key = compKey(harderId, easierId);
  state.comparisonGraph.set(key, { harderId, easierId, confidence, key });
}

function clearComparisonsFor(levelId) {
  for (const [key, comp] of state.comparisonGraph) {
    if (comp.harderId === levelId || comp.easierId === levelId) {
      state.comparisonGraph.delete(key);
    }
  }
}

export function checkContradictions() {
  const indexMap = new Map(getOrdinaryRankedEntries().map(({ level }, i) => [level._id, i]));
  const contradictions = [];

  for (const [, comp] of state.comparisonGraph) {
    if (
      comp.confidence === CONFIDENCE_LEVELS.EQUAL ||
      comp.confidence === CONFIDENCE_LEVELS.UNSURE
    ) continue;

    const harderIdx = indexMap.get(comp.harderId);
    const easierIdx = indexMap.get(comp.easierId);
    if (harderIdx === undefined || easierIdx === undefined) continue;

    if (harderIdx > easierIdx) {
      contradictions.push({
        harder: state.levelMap.get(comp.harderId),
        easier: state.levelMap.get(comp.easierId),
        confidence: comp.confidence,
        key: comp.key,
      });
    }
  }

  state.contradictions = contradictions;
  return contradictions;
}

export function getContradictions() {
  return state.contradictions;
}

export function resolveContradiction(levelId) {
  clearComparisonsFor(levelId);
  const idx = state.rankedList.findIndex(l => l._id === levelId);
  if (idx === -1) return;
  const level = state.rankedList[idx];
  state.rankedList.splice(idx, 1);
  level.pending = true;
  level.lowConfidence = false;
  state.pendingLevels.unshift(level);
  state.placementHistory = state.placementHistory.filter(p => p.level._id !== levelId);
  if (state.insertionSession?.level._id === levelId) state.insertionSession = null;
  checkContradictions();
  saveSession();
  triggerRender();
  showToast(`"${level.name}" moved to pending for re-ranking`, 'gold');
}

export function startInsertion(level) {
  if (isRankedVariant(level)) {
    level.pending = false;
    state.pendingLevels = state.pendingLevels.filter(item => item._id !== level._id);
    saveSession();
    triggerRender();
    return;
  }

  const ordinaryEntries = getOrdinaryRankedEntries();
  if (ordinaryEntries.length === 0) {
    level.pending = false;
    level.confidence = CONFIDENCE_LEVELS.CERTAIN;
    level.lowConfidence = false;
    level.lastEdited = new Date().toISOString();
    state.rankedList.push(level);
    state.pendingLevels = state.pendingLevels.filter(l => l._id !== level._id);
    state.placementHistory.push({ level, insertedAt: state.rankedList.length - 1, compsDone: 0 });
    saveSession();
    triggerRender();
    showToast(`"${level.name}" placed at #1 (first item)`);
    return;
  }
  state.insertionSession = {
    level,
    lo: 0,
    hi: ordinaryEntries.length,
    stepHistory: [],
    minConfidence: CONFIDENCE_LEVELS.CERTAIN,
  };
  triggerRender();
}

export function vote(winner, confidence = CONFIDENCE_LEVELS.CERTAIN) {
  if (!state.insertionSession) return;

  if (confidence === CONFIDENCE_LEVELS.EQUAL || confidence === CONFIDENCE_LEVELS.UNSURE) {
    finalizeAtMid(confidence);
    return;
  }

  const { lo, hi } = state.insertionSession;
  const mid = Math.floor((lo + hi) / 2);

  state.insertionSession.stepHistory.push({ lo, hi });
  state.compCount++;

  if (confidence === CONFIDENCE_LEVELS.LEANING) {
    state.insertionSession.minConfidence = CONFIDENCE_LEVELS.LEANING;
  }

  const midLevel = getOrdinaryRankedEntries()[mid]?.level;
  const newLevel = state.insertionSession.level;

  if (midLevel) {
    if (winner._id === newLevel._id) {
      recordComparison(newLevel._id, midLevel._id, confidence);
      state.insertionSession.hi = mid;
    } else {
      recordComparison(midLevel._id, newLevel._id, confidence);
      state.insertionSession.lo = mid + 1;
    }
  } else {
    if (winner._id === newLevel._id) {
      state.insertionSession.hi = mid;
    } else {
      state.insertionSession.lo = mid + 1;
    }
  }

  if (state.insertionSession.lo >= state.insertionSession.hi) {
    finalizeInsertion();
  } else {
    triggerRender();
  }
}

function finalizeAtMid(confidence) {
  const { level, lo, hi, stepHistory } = state.insertionSession;
  const mid = Math.floor((lo + hi) / 2);
  const midLevel = getOrdinaryRankedEntries()[mid]?.level;

  if (midLevel) {
    recordComparison(level._id, midLevel._id, confidence);
  }

  state.compCount++;
  level.pending = false;
  level.confidence = confidence;
  level.lowConfidence = confidence !== CONFIDENCE_LEVELS.CERTAIN;
  level.lastEdited = new Date().toISOString();
  const insertedAt = getInsertionArrayIndex(mid);
  state.rankedList.splice(insertedAt, 0, level);
  state.pendingLevels = state.pendingLevels.filter(l => l._id !== level._id);
  state.placementHistory.push({ level, insertedAt, compsDone: stepHistory.length + 1 });
  state.insertionSession = null;

  checkContradictions();
  saveSession();
  triggerRender();
  showToast(`"${level.name}" placed at #${mid + 1} (${confidence})`);
}

function finalizeInsertion() {
  const { level, lo, stepHistory, minConfidence } = state.insertionSession;
  level.pending = false;
  level.confidence = minConfidence;
  level.lowConfidence = minConfidence !== CONFIDENCE_LEVELS.CERTAIN;
  level.lastEdited = new Date().toISOString();
  const insertedAt = getInsertionArrayIndex(lo);
  state.rankedList.splice(insertedAt, 0, level);
  state.pendingLevels = state.pendingLevels.filter(l => l._id !== level._id);
  state.placementHistory.push({ level, insertedAt, compsDone: stepHistory.length });
  state.insertionSession = null;

  checkContradictions();
  saveSession();
  triggerRender();
  const confNote = level.lowConfidence ? ' (low confidence)' : '';
  showToast(`"${level.name}" placed at #${lo + 1}${confNote}`);
}

export function undo() {
  if (state.insertionSession && state.insertionSession.stepHistory.length > 0) {
    const prev = state.insertionSession.stepHistory.pop();
    state.insertionSession.lo = prev.lo;
    state.insertionSession.hi = prev.hi;
    state.compCount = Math.max(0, state.compCount - 1);
    triggerRender();
    return;
  }
  if (state.placementHistory.length > 0) {
    const last = state.placementHistory.pop();
    state.rankedList.splice(last.insertedAt, 1);
    last.level.pending = true;
    last.level.lowConfidence = false;
    last.level.confidence = undefined;
    state.pendingLevels.unshift(last.level);
    state.compCount = Math.max(0, state.compCount - last.compsDone);
    state.insertionSession = null;
    clearComparisonsFor(last.level._id);
    checkContradictions();
    saveSession();
    triggerRender();
    showToast(`Undid placement of "${last.level.name}"`, 'gold');
  }
}

export function cancelInsertion() {
  if (!state.insertionSession) return;
  state.insertionSession = null;
  triggerRender();
  showToast('Placement cancelled', 'gold');
}

export function moveLevel(targetIdx, newIdx) {
  if (newIdx < 0 || newIdx >= state.rankedList.length) return;
  const level = state.rankedList[targetIdx];
  state.rankedList.splice(targetIdx, 1);
  state.rankedList.splice(newIdx, 0, level);
  let rank = 0;
  state.rankedList.forEach(item => {
    if (isRankedVariant(item)) return;
    rank++;
    if (Object.prototype.hasOwnProperty.call(item, 'rank')) item.rank = rank;
  });
  saveSession();
  triggerRender();
}

export function moveLevelUp(idx) {
  if (idx <= 0) return;
  moveLevel(idx, idx - 1);
}

export function moveLevelDown(idx) {
  if (idx >= state.rankedList.length - 1) return;
  moveLevel(idx, idx + 1);
}

export function moveToPosition(fromIdx, toIdx) {
  moveLevel(fromIdx, toIdx);
}

export function deleteLevel(levelId) {
  const pendingIdx = state.pendingLevels.findIndex(l => l._id === levelId);
  if (pendingIdx !== -1) {
    const level = state.pendingLevels[pendingIdx];
    state.pendingLevels.splice(pendingIdx, 1);
    const rawIdx = state.rawLevels.findIndex(l => l._id === levelId);
    if (rawIdx !== -1) state.rawLevels.splice(rawIdx, 1);
    state.levelMap.delete(levelId);
    clearComparisonsFor(levelId);
    saveSession();
    triggerRender();
    showToast(`"${level.name}" deleted`);
    return;
  }

  const rankedIdx = state.rankedList.findIndex(l => l._id === levelId);
  if (rankedIdx !== -1) {
    const level = state.rankedList[rankedIdx];
    state.rankedList.splice(rankedIdx, 1);
    const rawIdx = state.rawLevels.findIndex(l => l._id === levelId);
    if (rawIdx !== -1) state.rawLevels.splice(rawIdx, 1);
    state.levelMap.delete(levelId);
    clearComparisonsFor(levelId);
    state.placementHistory = state.placementHistory.filter(p => p.level._id !== levelId);
    checkContradictions();
    saveSession();
    triggerRender();
    showToast(`"${level.name}" deleted`);
    return;
  }

  const variant = state.levelMap.get(levelId);
  if (variant && !variant.pending && isRankedVariant(variant)) {
    const rawIdx = state.rawLevels.findIndex(level => level._id === levelId);
    if (rawIdx !== -1) state.rawLevels.splice(rawIdx, 1);
    state.levelMap.delete(levelId);
    clearComparisonsFor(levelId);
    saveSession();
    triggerRender();
    showToast(`"${variant.name}" deleted`);
  }
}

export function reevaluateRanked(levelId) {
  const idx = state.rankedList.findIndex(l => l._id === levelId);
  if (idx === -1) return;
  const level = state.rankedList[idx];
  state.rankedList.splice(idx, 1);
  level.pending = true;
  level.confidence = undefined;
  level.lowConfidence = false;
  state.pendingLevels.unshift(level);
  clearComparisonsFor(levelId);
  checkContradictions();
  saveSession();
  triggerRender();
  showToast(`"${level.name}" moved to pending for re-ranking`);
}

export function reevaluateRange(from, to) {
  const start = Math.max(1, from) - 1;
  const end = Math.min(to, state.rankedList.length);
  const toMove = state.rankedList.splice(start, end - start);
  toMove.forEach(level => {
    level.pending = true;
    level.confidence = undefined;
    level.lowConfidence = false;
    clearComparisonsFor(level._id);
  });
  state.pendingLevels.unshift(...toMove);
  checkContradictions();
  saveSession();
  triggerRender();
  showToast(`${toMove.length} level(s) moved to pending for re-ranking`);
}

export function saveSession() {
  try {
    const sessionData = {
      rawLevels: state.rawLevels,
      rankedListIds: state.rankedList.map(l => l._id),
      pendingLevelIds: state.pendingLevels.map(l => l._id),
      placementHistory: state.placementHistory.map(p => ({
        levelId: p.level._id,
        insertedAt: p.insertedAt,
        compsDone: p.compsDone,
      })),
      comparisonGraph: Array.from(state.comparisonGraph.entries()),
      customValues: state.customValues,
      detectedColumns: state.detectedColumns,
      detectedColumnsOrder: state.detectedColumnsOrder,
      hiddenColumns: state.hiddenColumns,
      compCount: state.compCount,
      insertionSession: state.insertionSession ? {
        levelId: state.insertionSession.level._id,
        lo: state.insertionSession.lo,
        hi: state.insertionSession.hi,
        stepHistory: state.insertionSession.stepHistory,
        minConfidence: state.insertionSession.minConfidence,
      } : null,
      presetSourceUrl: state.presetSourceUrl,
      presetDataHash: state.presetDataHash,
      lastUpdateCheck: state.lastUpdateCheck,
      lastImportWasArray: state.lastImportWasArray === true,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
  } catch (_) { }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.rawLevels) || data.rawLevels.length < 1) return false;

    state.rawLevels = data.rawLevels.map(l => ({ ...l }));
    state.rawLevels.forEach(level => {
      if (isRankedVariant(level)) level.pending = false;
    });
    state.levelMap = new Map(state.rawLevels.map(l => [l._id, l]));
    state.compCount = data.compCount ?? 0;
    const savedRankedLevels = (data.rankedListIds ?? [])
      .map(id => state.levelMap.get(id))
      .filter(Boolean);
    state.rankedList = savedRankedLevels.filter(level => !isRankedVariant(level));
    const savedPendingIds = new Set(data.pendingLevelIds ?? []);
    const previouslyHiddenUnassignedVariants = state.rawLevels.filter(level =>
      !level.pending &&
      !savedPendingIds.has(level._id) &&
      !state.rankedList.some(ranked => ranked._id === level._id) &&
      typeof level.duplicateOf === 'string' &&
      level.duplicateOf.trim() &&
      !isRankedVariant(level)
    );
    previouslyHiddenUnassignedVariants.forEach(level => {
      const rawIndex = state.rawLevels.indexOf(level);
      const rankedIndex = Number.isFinite(level.rank)
        ? state.rankedList.findIndex(ranked => Number.isFinite(ranked.rank) && ranked.rank > level.rank)
        : state.rankedList.findIndex(ranked => state.rawLevels.indexOf(ranked) > rawIndex);
      state.rankedList.splice(rankedIndex === -1 ? state.rankedList.length : rankedIndex, 0, level);
    });
    state.pendingLevels = (data.pendingLevelIds ?? [])
      .map(id => state.levelMap.get(id))
      .filter(level => level && !isRankedVariant(level));
    state.customValues = (data.customValues ?? []).map(value => ({
      ...value,
      filterable: value.filterable !== false,
      sortable: value.sortable !== false,
      exportable: value.exportable !== false,
      options: Array.isArray(value.options)
        ? value.options.map(opt => String(opt).trim()).filter(Boolean)
        : value.options ? String(value.options).split(',').map(opt => opt.trim()).filter(Boolean) : [],
    }));
    state.detectedColumns = Array.isArray(data.detectedColumns) ? data.detectedColumns.slice() : [];
    state.detectedColumnsOrder = data.detectedColumnsOrder ?? {};
    state.hiddenColumns = Array.isArray(data.hiddenColumns) ? data.hiddenColumns.slice() : [];
    state.lastImportWasArray = data.lastImportWasArray === true;

    state.placementHistory = (data.placementHistory ?? [])
      .map(p => {
        const level = state.levelMap.get(p.levelId);
        const insertedAt = state.rankedList.findIndex(item => item._id === p.levelId);
        if (!level || insertedAt === -1) return null;
        return { level, insertedAt, compsDone: p.compsDone };
      })
      .filter(Boolean);

    state.comparisonGraph = data.comparisonGraph
      ? new Map(data.comparisonGraph)
      : new Map();

    if (data.insertionSession) {
      const sessionLevel = state.levelMap.get(data.insertionSession.levelId);
      if (sessionLevel && !isRankedVariant(sessionLevel)) {
        const toOrdinaryBoundary = boundary => savedRankedLevels
          .slice(0, boundary)
          .filter(level => !isRankedVariant(level)).length;
        state.insertionSession = {
          level: sessionLevel,
          lo: toOrdinaryBoundary(data.insertionSession.lo),
          hi: toOrdinaryBoundary(data.insertionSession.hi),
          stepHistory: (data.insertionSession.stepHistory ?? []).map(step => ({
            lo: toOrdinaryBoundary(step.lo),
            hi: toOrdinaryBoundary(step.hi),
          })),
          minConfidence: data.insertionSession.minConfidence ?? CONFIDENCE_LEVELS.CERTAIN,
        };
      }
    }

    state.presetSourceUrl = data.presetSourceUrl ?? null;
    state.presetDataHash = data.presetDataHash ?? null;
    state.lastUpdateCheck = data.lastUpdateCheck ?? null;

    checkContradictions();
    detectColumnsFromLevels();
    if (state.presetSourceUrl) {
      startUpdateChecker();
    }
    return true;
  } catch (_) {
    return false;
  }
}

export function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { }
}

export function showImportError(msg, panelId = 'main') {
  const el = document.querySelector(`.import-error[data-type="${panelId}"]`);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

export function hideImportError(panelId = 'main') {
  const el = document.querySelector(`.import-error[data-type="${panelId}"]`);
  if (el) el.style.display = 'none';
}

function sortLevelsForRankings(levels) {
  return levels
    .map((level, index) => ({ level, originalIndex: index }))
    .filter(({ level }) => !level.pending && !isRankedVariant(level))
    .sort((a, b) => {
      const aRank = Number.isFinite(a.level.rank) ? a.level.rank : null;
      const bRank = Number.isFinite(b.level.rank) ? b.level.rank : null;

      if (aRank !== null && bRank !== null) {
        return aRank - bRank;
      }

      if (aRank !== null) {
        return -1;
      }

      if (bRank !== null) {
        return 1;
      }
      return a.originalIndex - b.originalIndex;
    })
    .map(({ level }) => level);
}

export function getCurrentImportPanel() {
  if (!document.getElementById('import-pending-panel')?.classList.contains('hidden') &&
    document.getElementById('import-pending-panel')?.offsetParent !== null) return 'pending';
  if (!document.getElementById('replace-main-panel')?.classList.contains('hidden') &&
    document.getElementById('replace-main-panel')?.offsetParent !== null) return 'replace';
  return 'main';
}

export function processLevels(levelsArray, importTarget = 'main', shouldAppend = false, forceMode = null, presetUrl = null) {
  let valid = levelsArray
    .map(level => normalizeLevelObject(level))
    .filter(l => typeof l?.name === 'string' && l.name.trim());

  if (valid.length < 1) {
    showImportError(`Need at least 1 named level. Found ${valid.length}.`, getCurrentImportPanel());
    return;
  }

  valid = valid.map(level => ({
    ...level,
    pending: importTarget === 'pending' ? true : (importTarget === 'main' ? false : level.pending),
  }));

  const hasExistingLevels = state.rawLevels.length > 0;

  if (hasExistingLevels && !shouldAppend && !forceMode) {
    const behavior = state.settings.existingImportBehavior || 'ask';
    if (behavior === 'append') {
      shouldAppend = true;
    } else if (behavior === 'replace') {
      forceMode = 'replace';
    } else if (state.settings.confirmImportOverwrite) {
      const choice = confirm(
        'You already have levels loaded.\n\nOK = Overwrite session (start fresh)\nCancel = Append to existing session'
      );
      if (choice === null) return;
      forceMode = choice ? 'replace' : 'append';
    } else {
      forceMode = 'replace';
    }
  }

  if (forceMode === 'append') shouldAppend = true;
  else if (forceMode === 'replace') shouldAppend = false;

  const existingLevels = shouldAppend ? state.rawLevels : [];
  const beforeDedupCount = valid.length;
  valid = removeDuplicateLevels(valid, existingLevels);
  if (beforeDedupCount > valid.length) {
    showToast(`Skipped ${beforeDedupCount - valid.length} duplicate level(s) during import.`, 'gold');
  }

  if (valid.length === 0) {
    showImportError('No new levels were imported because all levels were duplicates.', getCurrentImportPanel());
    return;
  }

  let newRawLevels;
  if (shouldAppend && hasExistingLevels) {
    newRawLevels = [
      ...state.rawLevels,
      ...valid.map((l, i) => ({ ...l, _id: makeLevelId(l, state.rawLevels.length + i) })),
    ];
  } else {
    newRawLevels = valid.map((l, i) => ({ ...l, _id: makeLevelId(l, i) }));
  }

  state.rawLevels = newRawLevels;
  state.rawLevels.forEach(level => {
    if (isRankedVariant(level)) level.pending = false;
  });
  state.levelMap = new Map(state.rawLevels.map(l => [l._id, l]));

  detectColumnsFromLevels();

  if (!shouldAppend) {
    state.compCount = 0;
    state.placementHistory = [];
    state.insertionSession = null;
    state.comparisonGraph = new Map();
    state.contradictions = [];
  } else {
    state.insertionSession = null;
  }

  state.rankedList = sortLevelsForRankings(state.rawLevels);
  state.selectedLevels = new Set();

  state.pendingLevels = state.rawLevels.filter(l => l.pending && !isRankedVariant(l));

  if (!shouldAppend) {
    clearSession();
  } else {
    saveSession();
  }

  hideImportError(getCurrentImportPanel());

  const sessionPanel = document.getElementById('session-panel');
  if (sessionPanel) sessionPanel.classList.remove('hidden');

  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) resetBtn.classList.remove('hidden');

  switchToTab('comparison');
  triggerRender();
  const rankedCount = state.rankedList.length;

  if (shouldAppend) {
    showToast(
      `Appended ${valid.length} level(s) — Total: ${state.rawLevels.length} (${rankedCount} ranked, ${state.pendingLevels.length} pending)`
    );
  } else {
    showToast(
      `Loaded ${state.rawLevels.length} levels (${rankedCount} ranked, ${state.pendingLevels.length} pending)`
    );
  }

  if (presetUrl && !shouldAppend) {
    recordPresetSource(presetUrl);
    startUpdateChecker();
  }
}

export function loadJSON(data, forceMode = null, presetUrl = null) {
  const panelId = getCurrentImportPanel();
  const importTarget = panelId === 'pending' ? 'pending' : 'main';

  if (typeof data === 'string' && looksLikePlainText(data)) {
    if (looksLikeCSV(data)) {
      processLevels(parseCSV(data), importTarget, false, forceMode, presetUrl);
    } else {
      processLevels(parsePlainText(data), importTarget, false, forceMode, presetUrl);
    }
    return;
  }

  let parsed;
  try {
    parsed = typeof data === 'string' ? JSON.parse(data) : data;
  } catch (error) {
    showImportError(`Invalid JSON — could not parse the file. Error: ${error.message}`, panelId);
    return;
  }

  let levelsArray;
  if (parsed && parsed.levels && Array.isArray(parsed.levels)) {

    state.lastImportWasArray = false;
    levelsArray = parsed.levels.map(level => {
      const normalized = normalizeLevelObject(level);
      if (!normalized.showcaseVideo && Array.isArray(level.ids) && level.ids[0]?.id) {
        normalized.showcaseVideo = `https://youtu.be/${level.ids[0].id}`;
      }
      return normalized;
    });
  } else if (Array.isArray(parsed)) {

    state.lastImportWasArray = true;
    levelsArray = parsed.map(level =>
      typeof level === 'object' && level !== null
        ? normalizeLevelObject(level)
        : { name: String(level), pending: true, customValues: {} }
    );
  } else if (parsed && typeof parsed === 'object') {
    state.lastImportWasArray = false;
    levelsArray = [normalizeLevelObject(parsed)];
  } else {
    showImportError(
      'Invalid format — expected an array, an object with a "levels" array, or plain text/CSV.',
      panelId
    );
    return;
  }

  processLevels(levelsArray, importTarget, false, forceMode, presetUrl);
}

export function reset() {
  if (state.settings.confirmReset &&
    !confirm('Reset the entire session? All rankings and pending levels will be lost.')) return;

  state.rawLevels = [];
  state.levelMap = new Map();
  state.rankedList = [];
  state.pendingLevels = [];
  state.insertionSession = null;
  state.compCount = 0;
  state.placementHistory = [];
  state.rankingFilter = '';
  state.comparisonGraph = new Map();
  state.contradictions = [];
  state.selectedConfidence = CONFIDENCE_LEVELS.CERTAIN;
  state.selectedLevels = new Set();
  state.detectedColumns = [];
  state.detectedColumnsOrder = {};
  state.lastImportWasArray = false;
  clearSession();

  const filterInput = document.getElementById('filter-input');
  if (filterInput) filterInput.value = '';

  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) resetBtn.classList.add('hidden');

  const sessionPanel = document.getElementById('session-panel');
  if (sessionPanel) sessionPanel.classList.add('hidden');

  document.querySelectorAll('.file-input').forEach(input => {
    if (input instanceof HTMLInputElement) input.value = '';
  });

  document.querySelectorAll('.import-error').forEach(el => {
    el.style.display = 'none';
    el.textContent = '';
  });

  triggerRender();
}

function normalizeEmptyExportValue(value) {
  if (value === '') return null;
  if (Array.isArray(value)) return value.map(normalizeEmptyExportValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, childValue]) => [
      key,
      normalizeEmptyExportValue(childValue),
    ]));
  }
  return value;
}

export function getRankingsExport() {
  const internalFields = new Set(['_id', 'pending', 'lowConfidence', 'confidence', 'lastEdited', 'customValues']);
  const variants = state.rawLevels.filter(level => !level.pending && isRankedVariant(level));
  const variantsByTarget = new Map();
  variants.forEach(level => {
    const target = level.duplicateOf;
    if (!variantsByTarget.has(target)) variantsByTarget.set(target, []);
    variantsByTarget.get(target).push(level);
  });
  variantsByTarget.forEach(group => group.sort((a, b) => {
    const aRank = Number.isFinite(a.rank) ? a.rank : Number.POSITIVE_INFINITY;
    const bRank = Number.isFinite(b.rank) ? b.rank : Number.POSITIVE_INFINITY;
    return aRank - bRank || state.rawLevels.indexOf(a) - state.rawLevels.indexOf(b);
  }));
  const levels = state.rankedList.flatMap(level => {
    const name = level.name;
    return [level, ...(variantsByTarget.get(name) ?? [])];
  });
  const exportedIds = new Set(levels.map(level => level._id));
  levels.push(...variants.filter(level => !exportedIds.has(level._id)));
  const exportedLevels = state.settings.includePendingInExport
    ? [...levels, ...state.pendingLevels]
    : levels;
  return exportedLevels.map((level, idx) => {
    const isPending = level.pending === true;
    const exportObj = state.lastImportWasArray || isPending ? {} : { rank: idx + 1 };
    Object.keys(level).forEach(key => {
      if (internalFields.has(key)) return;
      Object.defineProperty(exportObj, key, {
        value: normalizeEmptyExportValue(level[key]),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    });
    state.customValues.forEach(value => {
      if (!value.exportable) return;
      const customVal = level.customValues?.[value.id];
      if (customVal !== undefined) {
        Object.defineProperty(exportObj, value.name, {
          value: normalizeEmptyExportValue(customVal),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    });
    return exportObj;
  });
}

export function recordPresetSource(url) {
  state.presetSourceUrl = url;
  state.presetDataHash = computeDataHash(state.rawLevels);
  state.lastUpdateCheck = Date.now();
}

export async function checkForPresetUpdates() {
  if (!state.presetSourceUrl || state.rawLevels.length === 0) {
    return null;
  }

  const newLevels = await fetchPresetData(state.presetSourceUrl);
  if (!newLevels) {
    return null;
  }

  const newHash = computeDataHash(newLevels);
  if (newHash === state.presetDataHash) {
    return null;
  }

  const diff = generateUpdateDiff(newLevels, state.rawLevels);
  if (diff.added.length === 0 && diff.updated.length === 0 && diff.removed.length === 0) {
    return null;
  }

  state.pendingUpdate = {
    diff,
    newHash,
    newLevels,
    timestamp: Date.now(),
  };

  return state.pendingUpdate;
}

export function showUpdatePrompt(update) {
  const modal = document.getElementById('update-preview-modal');
  if (!modal) return;

  const { diff } = update;
  const title = modal.querySelector('[data-update-title]');
  const content = modal.querySelector('[data-update-content]');

  if (title) {
    title.textContent = `Preset Updates Available (${diff.added.length + diff.updated.length + diff.removed.length} changes)`;
  }

  if (content) {
    const html = `
      ${diff.added.length > 0 ? `
        <div style="margin-bottom: 1em;">
          <strong style="color: #4caf50;">✓ Added (${diff.added.length})</strong>
          <ul style="margin: 0.5em 0; padding-left: 1.5em;">
            ${diff.added.slice(0, 5).map(l => `<li>${escapeHtml(l.name)}</li>`).join('')}
            ${diff.added.length > 5 ? `<li>... and ${diff.added.length - 5} more</li>` : ''}
          </ul>
        </div>
      ` : ''}
      ${diff.updated.length > 0 ? `
        <div style="margin-bottom: 1em;">
          <strong style="color: #2196f3;">⟳ Updated (${diff.updated.length})</strong>
          <ul style="margin: 0.5em 0; padding-left: 1.5em;">
            ${diff.updated.slice(0, 5).map(({ newLevel: l }) => `<li>${escapeHtml(l.name)}</li>`).join('')}
            ${diff.updated.length > 5 ? `<li>... and ${diff.updated.length - 5} more</li>` : ''}
          </ul>
        </div>
      ` : ''}
      ${diff.removed.length > 0 ? `
        <div style="margin-bottom: 1em;">
          <strong style="color: #f44336;">✗ Removed (${diff.removed.length})</strong>
          <ul style="margin: 0.5em 0; padding-left: 1.5em;">
            ${diff.removed.slice(0, 5).map(l => `<li>${escapeHtml(l.name)}</li>`).join('')}
            ${diff.removed.length > 5 ? `<li>... and ${diff.removed.length - 5} more</li>` : ''}
          </ul>
        </div>
      ` : ''}
    `;
    content.innerHTML = html;
  }

  modal.classList.remove('hidden');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function mergeUpdates() {
  if (!state.pendingUpdate) return false;

  const merged = mergePresetUpdates(state.pendingUpdate.diff);
  state.presetDataHash = state.pendingUpdate.newHash;
  state.lastUpdateCheck = Date.now();
  state.pendingUpdate = null;

  saveSession();
  detectColumnsFromLevels();
  triggerRender();

  showToast(`Merged preset updates: ${merged} changes`, 'gold');
  return true;
}

export function dismissUpdate() {
  state.pendingUpdate = null;
  const modal = document.getElementById('update-preview-modal');
  if (modal) modal.classList.add('hidden');
}

export function startUpdateChecker() {
  const checkUpdates = async () => {
    const update = await checkForPresetUpdates();
    if (update) {
      showUpdatePrompt(update);
    }
  };

  if (!state.updateCheckTimer) {
    checkUpdates();
    state.updateCheckTimer = setInterval(checkUpdates, 5 * 60 * 1000);
  }
}

export function mergePresetUpdates(diff) {
  let mergedCount = 0;

  for (const removed of diff.removed) {
    const idx = state.rawLevels.findIndex(l => l._id === removed._id);
    if (idx !== -1) {
      state.rawLevels.splice(idx, 1);
      state.rankedList = state.rankedList.filter(l => l._id !== removed._id);
      state.pendingLevels = state.pendingLevels.filter(l => l._id !== removed._id);
      state.levelMap.delete(removed._id);
    }
  }

  for (const { old, newLevel } of diff.updated) {
    old.creators = newLevel.creators;
    old.tags = newLevel.tags;
    old.gdId = newLevel.gdId;
    mergedCount++;
  }

  for (const newLevel of diff.added) {
    const newId = makeLevelId(newLevel, state.rawLevels.length);
    const levelWithId = { ...newLevel, _id: newId };
    if (isRankedVariant(levelWithId)) levelWithId.pending = false;
    state.rawLevels.push(levelWithId);
    state.levelMap.set(newId, levelWithId);
    if (!isRankedVariant(levelWithId) && !newLevel.pending && !newLevel.rank) {
      state.pendingLevels.push(levelWithId);
    }
    mergedCount++;
  }

  state.rankedList = sortLevelsForRankings(state.rawLevels);
  state.pendingLevels = state.rawLevels.filter(l => l.pending && !isRankedVariant(l));

  return mergedCount;
}