import { gdThumbUrl, escHtml } from './state.js';

export const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i;
export const IMAGE_URL_RE = /[/.](?:jpg|jpeg|png|gif|webp|svg|bmp)(?:\?|$)/i;
export const IMAGE_HINT_RE = /(?:thumb|image|img|photo|pic|cdn|gdbrowser|ytimg)/;
export const HTTP_RE = /^https?:\/\//;

export const EMPTY_THUMB = Object.freeze({ primary: null, fallback: null });

const DATE_FORMATTER = new Intl.DateTimeFormat([], {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const thumbCache = new WeakMap();

function computeLevelThumbnailUrls(level) {
  const custom =
    level.thumbnail ||
    level.image ||
    level.img ||
    level.photo ||
    null;

  const gd = level.gdId != null ? gdThumbUrl(level.gdId) : null;

  if (custom) return { primary: custom, fallback: gd };
  if (gd) return { primary: gd, fallback: null };
  return EMPTY_THUMB;
}

export function getLevelThumbnailUrls(level) {
  if (!level || (typeof level !== "object" && typeof level !== "function")) {
    return EMPTY_THUMB;
  }

  const cached = thumbCache.get(level);
  if (cached) return cached;

  const result = computeLevelThumbnailUrls(level);
  thumbCache.set(level, result);
  return result;
}

export function handleThumbError() {
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
  const { primary, fallback } = getLevelThumbnailUrls(level);

  thumbEl.replaceChildren();

  if (!primary) {
    thumbEl.classList.remove("has-thumb");
    return;
  }

  thumbEl.classList.add("has-thumb");

  const img = document.createElement("img");
  img.className = "thumb-img";
  img.src = primary;
  img.loading = "lazy";
  img.decoding = "async";

  if (fallback) {
    img.dataset.fallback = fallback;
  }

  img.onerror = handleThumbError;
  thumbEl.appendChild(img);
}

export function thumbInlineHtml(level) {
  const { primary, fallback } = getLevelThumbnailUrls(level);
  if (!primary) return "";

  const fallbackAttr = fallback ? ` data-fallback="${escHtml(fallback)}"` : "";

  return `<img src="${escHtml(primary)}"${fallbackAttr} class="thumb-img" loading="lazy" decoding="async" onerror="handleThumbError.call(this)">`;
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
