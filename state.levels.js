export function makeLevelId(nameOrLevel, index = 0) {
  if (nameOrLevel && typeof nameOrLevel === 'object') {
    const actualId = nameOrLevel._id ?? nameOrLevel.id ?? nameOrLevel.levelId ?? nameOrLevel.levelID ?? nameOrLevel.gdId ?? null;
    if (actualId != null && String(actualId).trim()) {
      const normalized = String(actualId).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      return `level_${normalized}`;
    }
    return makeLevelId(nameOrLevel.name ?? '', index);
  }

  const slug = String(nameOrLevel).toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
  return `${slug}_${index}_${Date.now()}`;
}

export function normalizeLevelObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return { name: String(obj || '').trim(), pending: true };
  }

  const rawName = [obj.name, obj.level, obj.title].find(value => value != null && String(value).trim() !== '');
  const name = rawName ? String(rawName).trim() : '';
  const rawId = obj.id ?? obj.levelID ?? null;
  const rawRank = obj.rank ?? null;
  const parsedRank = rawRank != null
    ? (Number.isFinite(Number(rawRank)) ? Number(rawRank) : parseInt(String(rawRank).replace(/[^0-9]/g, ''), 10) || null)
    : null;
  const rawGdId = obj.gdId ?? obj.levelId ?? obj.levelID ?? null;
  const parsedGdId = rawGdId != null
    ? (Number.isFinite(Number(rawGdId)) ? Number(rawGdId) : parseInt(String(rawGdId).replace(/[^0-9]/g, ''), 10) || null)
    : null;

  const result = { name };

  if (rawId != null && String(rawId).trim()) {
    result.id = rawId;
  }

  if (parsedRank !== null) {
    result.rank = parsedRank;
  }

  if (Array.isArray(obj.tags) ? obj.tags.length > 0 : obj.tags != null && String(obj.tags).trim()) {
    result.tags = obj.tags;
  }

  result.pending = obj.pending ?? (rawId == null && parsedRank == null);

  if (obj.confidence != null && obj.confidence !== '') {
    result.confidence = obj.confidence;
  }

  if (obj.customValues && typeof obj.customValues === 'object' && Object.keys(obj.customValues).length > 0) {
    result.customValues = { ...obj.customValues };
  }

  if (obj._id != null && String(obj._id).trim()) {
    result._id = obj._id;
  }

  return result;
}

export function normalizeLevelName(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getLevelUniqueIds(level) {
  if (!level || typeof level !== 'object') return [];
  return [level.id, level.levelId, level.levelID, level.gdId]
    .filter(id => id != null && String(id).trim() !== '')
    .map(id => String(id).trim());
}

export function isDuplicateLevel(level, other) {
  if (!level || !other) return false;
  const normalizedName = normalizeLevelName(level.name);
  const otherName = normalizeLevelName(other.name);
  return normalizedName && otherName && normalizedName === otherName;
}

export function findDuplicateLevel(level, levels) {
  if (!Array.isArray(levels)) return undefined;
  return levels.find(other => other._id !== level._id && isDuplicateLevel(level, other));
}

export function removeDuplicateLevels(levels, existingLevels = []) {
  const uniqueLevels = [];
  for (const level of levels) {
    const duplicateInExisting = existingLevels.some(existing => isDuplicateLevel(level, existing));
    const duplicateInUnique = uniqueLevels.some(existing => isDuplicateLevel(level, existing));
    if (!duplicateInExisting && !duplicateInUnique) {
      uniqueLevels.push(level);
    }
  }
  return uniqueLevels;
}

export function computeDataHash(levels) {
  const normalized = JSON.stringify(
    levels.map(l => ({
      name: l.name,
      id: l.id,
      creators: l.creators,
      tags: l.tags,
      gdId: l.gdId,
      rank: l.rank,
    })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  );
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return String(hash);
}

export async function fetchPresetData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    let levelsArray;
    if (data && data.levels && Array.isArray(data.levels)) {
      levelsArray = data.levels;
    } else if (Array.isArray(data)) {
      levelsArray = data;
    } else if (data && typeof data === 'object') {
      levelsArray = [data];
    } else {
      throw new Error('Invalid format');
    }

    return levelsArray.map(l => normalizeLevelObject(l));
  } catch (error) {
    console.error('Failed to fetch preset:', error);
    return null;
  }
}

export function generateUpdateDiff(newLevels, currentLevels) {
  const added = [];
  const updated = [];
  const removed = [];

  const currentMap = new Map(currentLevels.map(l => [normalizeLevelName(l.name), l]));

  for (const newLevel of newLevels) {
    const normalized = normalizeLevelName(newLevel.name);
    const existing = currentMap.get(normalized);

    if (!existing) {
      added.push(newLevel);
    } else {
      const hasChanges =
        newLevel.creators !== existing.creators ||
        JSON.stringify(newLevel.tags) !== JSON.stringify(existing.tags) ||
        newLevel.gdId !== existing.gdId;

      if (hasChanges) {
        updated.push({ old: existing, newLevel: newLevel });
      }
    }
  }

  const newNames = new Set(newLevels.map(l => normalizeLevelName(l.name)));
  for (const current of currentLevels) {
    if (!newNames.has(normalizeLevelName(current.name))) {
      removed.push(current);
    }
  }

  return { added, updated, removed };
}
