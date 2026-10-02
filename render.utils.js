import { gdThumbUrl, escHtml } from './state.js';

export const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i;
export const IMAGE_URL_RE = /[/.](?:jpg|jpeg|png|gif|webp|svg|bmp)(?:\?|$)/i;
export const IMAGE_HINT_RE = /(?:thumb|image|img|photo|pic|cdn|gdbrowser|ytimg)/;
export const HTTP_RE = /^https?:\/\//;

export const EMPTY_THUMB = Object.freeze({ primary: null, fallback: null, candidates: [] });

const DATE_FORMATTER = new Intl.DateTimeFormat([], {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function getYouTubeVideoId(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const str = value.trim();
  const patterns = [
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/i,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function collectStringValues(value, entries = [], visited = new Set()) {
  if (typeof value === 'string') {
    entries.push(value);
  } else if (value && typeof value === 'object' && !visited.has(value)) {
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(item => collectStringValues(item, entries, visited));
    } else {
      Object.values(value).forEach(item => collectStringValues(item, entries, visited));
    }
  }
  return entries;
}

function collectNamedImageValues(value, entries = [], visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return entries;
  visited.add(value);
  Object.entries(value).forEach(([key, child]) => {
    if (/(?:image|thumbnail|thumb|img|photo|picture|pic)/i.test(key)) {
      collectStringValues(child, entries);
    } else {
      collectNamedImageValues(child, entries, visited);
    }
  });
  return entries;
}

function collectLevelIds(value, ids = [], visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return ids;
  visited.add(value);
  Object.entries(value).forEach(([key, child]) => {
    const normalizedKey = key.replace(/[_\-\s]/g, '').toLowerCase();
    if (['gdid', 'levelid', 'lvlid', 'id'].includes(normalizedKey)) {
      if (child != null && /^\d+$/.test(String(child).trim())) {
        ids.push({ key: normalizedKey, value: String(child).trim() });
      }
    } else {
      collectLevelIds(child, ids, visited);
    }
  });
  return ids;
}

function getImageCandidate(value, allowAnyHttpUrl = false) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return allowAnyHttpUrl || isImageUrl(trimmed) ? trimmed : null;
}

function computeLevelThumbnailUrls(level) {
  const levelIds = collectLevelIds(level);
  const priority = { gdid: 0, levelid: 1, lvlid: 2, id: 3 };
  const orderedLevelIds = levelIds
    .sort((a, b) => priority[a.key] - priority[b.key])
    .map(({ value }) => value);
  const levelIdCandidates = [...new Set(orderedLevelIds)]
    .map(levelId => `https://levelthumbs.prevter.me/thumbnail/${encodeURIComponent(levelId)}/small`);
  const namedImages = collectNamedImageValues(level)
    .map(value => getImageCandidate(value, true))
    .filter(Boolean);
  const allStrings = collectStringValues(level);
  const otherImages = allStrings
    .map(value => getImageCandidate(value))
    .filter(Boolean);

  const candidates = [...levelIdCandidates, ...namedImages, ...otherImages];
  const seenVideoIds = new Set();
  const videoUrls = allStrings
    .map(value => ({ value, videoId: getYouTubeVideoId(value) }))
    .filter(item => item.videoId && !seenVideoIds.has(item.videoId) && seenVideoIds.add(item.videoId));

  videoUrls.forEach(({ videoId }) => {
    candidates.push(
      `https://raw.githubusercontent.com/AncepsGD/practice-mode-list/main/thumbnails/${videoId}.webp`,
      `https://raw.githubusercontent.com/AncepsGD/practice-mode-list/main/thumbnails/${videoId}.png`,
    );
  });

  levelIds.forEach(({ value }) => candidates.push(gdThumbUrl(value)));
  videoUrls.forEach(({ videoId }) => {
    candidates.push(`https://img.youtube.com/vi/${videoId}/hq1.jpg`);
  });

  const uniqueCandidates = [...new Set(candidates)];
  return uniqueCandidates.length > 0
    ? {
        primary: uniqueCandidates[0],
        fallback: uniqueCandidates[1] || null,
        candidates: uniqueCandidates,
      }
    : EMPTY_THUMB;
}

export function getLevelThumbnailUrls(level) {
  if (!level || (typeof level !== "object" && typeof level !== "function")) {
    return EMPTY_THUMB;
  }

  return computeLevelThumbnailUrls(level);
}

export function handleThumbError() {
  if (this.dataset.thumbnailCandidates !== undefined) {
    try {
      const remaining = JSON.parse(this.dataset.thumbnailCandidates);
      if (Array.isArray(remaining) && remaining.length > 0) {
        this.dataset.thumbnailCandidates = JSON.stringify(remaining.slice(1));
        this.src = remaining[0];
        return;
      }
    } catch (_) {
      this.dataset.thumbnailCandidates = '';
    }
    this.closest(".thumb-wrap")?.classList.remove("has-thumb");
    return;
  }

  const fallback = this.dataset.fallback;

  if (fallback) {
    this.dataset.fallback = "";
    this.src = fallback;
    return;
  }

  this.closest(".thumb-wrap")?.classList.remove("has-thumb");
}

export function handleCellImageError() {
  if (this.dataset.errorHandled) return;
  this.dataset.errorHandled = "1";
  const wrapper = this.closest(".cell-image-wrapper");
  if (!wrapper) return;
  wrapper.classList.add("cell-image-failed");
  wrapper.innerHTML = '<span class="cell-image-failed-text">Failed to load</span>';
}

if (typeof globalThis !== "undefined") {
  if (!globalThis.handleThumbError) globalThis.handleThumbError = handleThumbError;
  if (!globalThis.handleCellImageError) globalThis.handleCellImageError = handleCellImageError;
}

export function setThumbElement(thumbEl, level) {
  const { primary, fallback, candidates } = getLevelThumbnailUrls(level);

  thumbEl.replaceChildren();

  if (!primary) {
    thumbEl.classList.remove("has-thumb");
    return;
  }

  thumbEl.classList.add("has-thumb");

  const img = document.createElement("img");
  img.className = "thumb-img";
  img.alt = level.name ? `Thumbnail for ${level.name}` : "Level thumbnail";
  img.src = primary;
  img.loading = "lazy";
  img.decoding = "async";

  if (fallback) {
    img.dataset.fallback = fallback;
  }
  if (candidates.length > 1) {
    img.dataset.thumbnailCandidates = JSON.stringify(candidates.slice(1));
  }

  img.onerror = handleThumbError;
  thumbEl.appendChild(img);
}

export function thumbInlineHtml(level) {
  const { primary, fallback, candidates } = getLevelThumbnailUrls(level);
  if (!primary) return "";

  const fallbackAttr = fallback ? ` data-fallback="${escHtml(fallback)}"` : "";
  const candidatesAttr = candidates.length > 1
    ? ` data-thumbnail-candidates="${escHtml(JSON.stringify(candidates.slice(1)))}"`
    : "";

  const alt = level.name ? `Thumbnail for ${level.name}` : "Level thumbnail";
  return `<img src="${escHtml(primary)}"${fallbackAttr}${candidatesAttr} class="thumb-img" alt="${escHtml(alt)}" loading="lazy" decoding="async" onerror="handleThumbError.call(this)">`;
}

export function formatTags(tags) {
  if (!tags) return "";

  if (!Array.isArray(tags)) {
    return String(tags).trim();
  }

  let out = "";

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    if (!tag) continue;
    if (out) out += ", ";
    out += tag;
  }

  return out;
}

export function formatVictors(victors) {
  if (!victors) return "";

  if (!Array.isArray(victors)) {
    return String(victors).trim();
  }

  let out = "";

  for (let i = 0; i < victors.length; i++) {
    const name = victors[i]?.name;
    if (!name) continue;
    if (out) out += ", ";
    out += name;
  }

  return out;
}

export function formatTimestamp(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escHtml(String(value));

  return DATE_FORMATTER.format(date);
}

export function isImageUrl(value) {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();

  if (IMAGE_EXT_RE.test(lower)) return true;

  if (HTTP_RE.test(lower)) {
    if (IMAGE_URL_RE.test(lower)) return true;
    if (IMAGE_HINT_RE.test(lower)) return true;
  }

  return false;
}

export function getImageUrlForDisplay(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!isImageUrl(trimmed)) return null;
  return trimmed;
}

export function formatCellValue(value) {
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
