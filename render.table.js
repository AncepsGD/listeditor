import { state, escHtml, getCustomField, CONFIDENCE_LEVELS, getCustomValue, getOrderedColumns, getFieldDefinition } from './state.js';
import { getMid } from './logic.js';
import { buildRankRow } from './render.rows.js';
import { setupColumnDragHandlers, setupRankingsInteraction, updateBulkToolbar, setupBulkToolbarHandlers, renderRankingsSummary } from './render.interactions.js';
import { formatTags } from './render.utils.js';

const TEXT_COLLATOR = new Intl.Collator([], { numeric: true, sensitivity: 'base' });
const DEFAULT_SORT = Object.freeze({ column: 'rank', direction: 'asc' });
const CONFIDENCE_ORDER = Object.freeze({
    [CONFIDENCE_LEVELS.CERTAIN]: 4,
    [CONFIDENCE_LEVELS.LEANING]: 3,
    [CONFIDENCE_LEVELS.EQUAL]: 2,
    [CONFIDENCE_LEVELS.UNSURE]: 1,
});

if (!('rankingsScrollSetup' in state)) state.rankingsScrollSetup = false;

function isTruthyLike(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function toText(value) {
    if (Array.isArray(value)) return value.join(', ');
    return value ? String(value) : '';
}

function parseDateValue(value) {
    if (!value) return 0;
    const time = Date.parse(String(value));
    return Number.isFinite(time) ? time : 0;
}

function getConfidenceRank(level) {
    const resolved = level?.confidence ?? (level?.lowConfidence ? CONFIDENCE_LEVELS.LEANING : CONFIDENCE_LEVELS.CERTAIN);
    return CONFIDENCE_ORDER[resolved] ?? 0;
}

function buildSortKeyGetter(column) {
    if (column === 'name') {
        return level => level?.name || '';
    }

    if (column === 'creators') {
        return level => level?.creators || '';
    }

    if (column === 'tags') {
        return level => formatTags(level?.tags ?? []);
    }

    if (column === 'confidence') {
        return level => getConfidenceRank(level);
    }

    if (column === 'lastEdited') {
        return level => parseDateValue(level?.lastEdited);
    }

    if (column.startsWith('custom_')) {
        const customValueId = column.slice(7);
        const fieldDef = getCustomField(customValueId);

        if (fieldDef?.type === 'number') {
            return level => toNumber(getCustomValue(level, customValueId));
        }

        if (fieldDef?.type === 'boolean') {
            return level => (isTruthyLike(getCustomValue(level, customValueId)) ? 1 : 0);
        }

        return level => toText(getCustomValue(level, customValueId));
    }

    const fieldDef = getFieldDefinition(column);

    if (fieldDef?.type === 'number') {
        return level => toNumber(level?.[column]);
    }

    if (fieldDef?.type === 'boolean') {
        return level => (isTruthyLike(level?.[column]) ? 1 : 0);
    }

    if (column === 'tags') {
        return level => formatTags(level?.[column] ?? []);
    }

    return level => toText(level?.[column]);
}

function compareRows(a, b, direction) {
    const left = a.sortKey;
    const right = b.sortKey;

    let result = 0;
    if (typeof left === 'number' && typeof right === 'number') {
        result = left - right;
    } else {
        result = TEXT_COLLATOR.compare(String(left), String(right));
    }

    if (result !== 0) {
        return direction === 'desc' ? -result : result;
    }

    return a.idx - b.idx;
}

function getRankingsView() {
    const rankedList = state.rankedList;
    const { column, direction } = state.rankingsSort || DEFAULT_SORT;

    const rows = rankedList.map((level, idx) => ({ level, idx }));

    if (column === 'rank') {
        return direction === 'desc' ? rows.slice().reverse() : rows;
    }

    const getSortKey = buildSortKeyGetter(column);
    const sortableRows = rows.map(row => ({
        ...row,
        sortKey: getSortKey(row.level),
    }));

    sortableRows.sort((a, b) => compareRows(a, b, direction));
    return sortableRows;
}

function captureBaseWidths(scrollState, orderedColumnsLength) {
    const { table, cols } = scrollState;
    if (!table || !cols.length) return;
    const headerCells = Array.from(table.tHead?.rows?.[0]?.cells || []);
    scrollState.headerCells = headerCells;
}

function applyRankingsScrollEffect(scrollState) {

    return;
}

function setupOrRefreshRankingsScrollEffect(table, wrapper, orderedColumns) {
    const scrollState = state.rankingsScrollState ?? (state.rankingsScrollState = {
        table: null,
        wrapper: null,
        cols: [],
        headerCells: [],
        raf: 0,
        refreshRaf: 0,
        initialized: false,
    });

    scrollState.table = table;
    scrollState.wrapper = wrapper;
    scrollState.cols = Array.from(table.querySelectorAll('col'));
    scrollState.headerCells = Array.from(table.tHead?.rows?.[0]?.cells || []);

    const refresh = () => {
        if (scrollState.refreshRaf) return;
        scrollState.refreshRaf = requestAnimationFrame(() => {
            scrollState.refreshRaf = 0;
            captureBaseWidths(scrollState, orderedColumns.length);
            applyRankingsScrollEffect(scrollState);
        });
    };

    if (!scrollState.initialized) {
        scrollState.onScroll = () => {
            if (scrollState.raf) return;
            scrollState.raf = requestAnimationFrame(() => {
                scrollState.raf = 0;
                applyRankingsScrollEffect(scrollState);
            });
        };

        wrapper.addEventListener('scroll', scrollState.onScroll, { passive: true });
        scrollState.initialized = true;
    }

    refresh();
}

export function renderRankings() {
    const table = document.querySelector('.rankings-table');
    const tbody = document.getElementById('rankings-body');
    const thead = document.querySelector('.rankings-table thead tr');

    if (!table || !tbody || !thead) return;

    const orderedColumns = getOrderedColumns();
    const sortState = state.rankingsSort || DEFAULT_SORT;

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

    const colgroupHtml = `<colgroup>${[
            '<col class="col-cb">',
            '<col class="col-rank">',
            ...orderedColumns.map(col => `<col data-column="${col}">`),
            '<col class="col-actions">',
        ].join('')
        }</colgroup>`;

    const existingColgroup = table.querySelector('colgroup');
    if (existingColgroup) {
        existingColgroup.outerHTML = colgroupHtml;
    } else {
        table.insertAdjacentHTML('afterbegin', colgroupHtml);
    }

    const removeColumnSelect = document.getElementById('remove-column-select');
    if (removeColumnSelect) {
        removeColumnSelect.innerHTML = [
            '<option value="">Remove Column...</option>',
            ...orderedColumns.map(col => {
                const fieldDef = getFieldDefinition(col);
                const label = fieldDef?.label || col.charAt(0).toUpperCase() + col.slice(1);
                return `<option value="${escHtml(col)}">${escHtml(label)}</option>`;
            }),
        ].join('');
        removeColumnSelect.value = '';
    }

    const selectAllCb = document.getElementById('select-all-rows');
    if (selectAllCb) {
        selectAllCb.onchange = () => {
            if (selectAllCb.checked) {
                for (const level of state.rankedList) {
                    state.selectedLevels.add(level._id);
                }
            } else {
                state.selectedLevels.clear();
            }

            tbody.querySelectorAll('.row-select').forEach(cb => {
                cb.checked = selectAllCb.checked;
            });

            updateBulkToolbar();
        };
    }

    setupColumnDragHandlers(orderedColumns);

    const mid = state.insertionSession ? getMid() : -1;
    const lo = state.insertionSession?.lo ?? -1;
    const hi = state.insertionSession?.hi ?? -1;
    const filter = state.rankingFilter.toLowerCase();
    const viewRows = getRankingsView();

    tbody.innerHTML = viewRows.map(entry => buildRankRow(entry, mid, lo, hi, filter)).join('');

    thead.querySelectorAll('th[data-sort]').forEach(th => {
        const sorted = th.dataset.sort === sortState.column;
        th.classList.toggle('sorted-asc', sorted && sortState.direction === 'asc');
        th.classList.toggle('sorted-desc', sorted && sortState.direction === 'desc');
    });

    updateBulkToolbar();
    renderRankingsSummary();

    if (!state.rankingsInteractionSetup) {
        setupRankingsInteraction(tbody);
        state.rankingsInteractionSetup = true;
    }

    if (!state.bulkToolbarHandlersSetup) {
        setupBulkToolbarHandlers();
        state.bulkToolbarHandlersSetup = true;
    }

    const wrapper = document.getElementById('rankings-table-wrapper');
    if (wrapper) {
        setupOrRefreshRankingsScrollEffect(table, wrapper, orderedColumns);
        state.rankingsScrollSetup = true;
    }
}