// ==========================================================================
// pms/pms-calendar-tape.js - Timeline Date Navigation, Zoom & Search
// Wild & Wandering Property Management System
// ==========================================================================

// --- DOM Selector Helpers ---
const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);

// --- Calendar Month Constants & Viewport State ---
export const mNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export let viewStart = new Date();
viewStart.setDate(viewStart.getDate() - 3);
viewStart.setHours(12, 0, 0, 0);

export let isZoomWide = false;
export let searchTerm = "";
export let searchMatchIndex = 0;

window.viewStart = viewStart;
window.isZoomWide = isZoomWide;
window.searchTerm = searchTerm;
window.searchMatchIndex = searchMatchIndex;

// --- State & Property Accessors ---
const getStaff = () => window.staff || (window.getStaff ? window.getStaff() : []);
const getPropId = () => {
    const raw = window.getCurrentPropertyId ? window.getCurrentPropertyId() : window.currentPropertyId;
    return window.toCanonicalPropId ? window.toCanonicalPropId(raw) : (raw || 'swims_resort');
};

// --------------------------------------------------------------------------
// 1. TIMELINE COORDINATE & PERIOD NAVIGATION
// --------------------------------------------------------------------------

// --- Date to Grid Column Offset Index Calculator ---
export const getDayIndex = str => {
    const t = window.parseYMD ? window.parseYMD(str) : 0;
    if (!t) return -1;
    const vS = window.viewStart || new Date();
    const vSTime = Date.UTC(vS.getFullYear(), vS.getMonth(), vS.getDate(), 12, 0, 0);
    return Math.round((t - vSTime) / 86400000);
};

// --- Shift Timeline Window Back (-7 Days) ---
export const prevPeriod = () => {
    if (!window.viewStart) window.viewStart = new Date();
    window.viewStart.setDate(window.viewStart.getDate() - 7);
    if (window.render) window.render();
};

// --- Shift Timeline Window Forward (+7 Days) ---
export const nextPeriod = () => {
    if (!window.viewStart) window.viewStart = new Date();
    window.viewStart.setDate(window.viewStart.getDate() + 7);
    if (window.render) window.render();
};

// --- Center Timeline Window on Today (-3 Days Buffer) ---
export const goToday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    d.setHours(12, 0, 0, 0);
    window.viewStart = d;
    if (window.render) window.render();
};

// --- Jump Viewport to Start of Target Month ---
export const jumpToMonth = val => {
    if (val) {
        const [y, m] = val.split('-');
        window.viewStart = new Date(y, m - 1, 1, 12, 0, 0);
        if (window.render) window.render();
    }
};

// --- Toggle Day Column Width Mode (Standard vs Expanded) ---
export const toggleZoom = () => {
    window.isZoomWide = !window.isZoomWide;
    const c = $('calendar-view');
    if (c) {
        if (window.isZoomWide) c.classList.add('zoom-wide-mode');
        else c.classList.remove('zoom-wide-mode');
    }
};

// --------------------------------------------------------------------------
// 2. GUEST SEARCH & TIMELINE MATCH JUMP ENGINE
// --------------------------------------------------------------------------

// --- Realtime Guest Search & Filter Dispatcher ---
export const handleSearch = v => {
    window.searchTerm = v.trim().toUpperCase();
    window.searchMatchIndex = 0;
    const jb = $('search-jump-btn'), mc = $('match-counter');
    const stList = getStaff();
    const term = window.searchTerm;
    const curProp = getPropId();

    const dbNameInput = $('db-filter-name');
    if (dbNameInput && dbNameInput.value !== v) dbNameInput.value = v;

    const m = stList.filter(s => {
        const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
        if (sProp !== curProp) return false;
        return ((s.firstName || '') + ' ' + (s.lastName || '')).toUpperCase().includes(term) || (s.bookId || '').toUpperCase().includes(term);
    });
    if (term && m.length > 0) {
        jb?.classList.replace('hidden', 'flex');
        if (mc) mc.innerText = `Match ${window.searchMatchIndex + 1} of ${m.length}`;
    } else {
        jb?.classList.replace('flex', 'hidden');
    }
    if ($('calendar-view')?.style.display !== 'none' && window.render) window.render();
    if ($('database-view')?.style.display !== 'none' && window.renderDatabase) window.renderDatabase();
};

// --- Clear Active Search Term & Reset Filters ---
export const clearSearch = () => {
    const input = $('guest-search');
    if (input) input.value = "";
    const dbNameInput = $('db-filter-name');
    if (dbNameInput) dbNameInput.value = "";
    window.handleSearch("");
};

// --- Toggle Search Input Drawer Visibility ---
export const toggleSearchMode = () => {
    const c = $('search-container');
    if (!c) return;
    if (c.classList.contains('hidden')) {
        c.classList.replace('hidden', 'flex');
        setTimeout(() => $('guest-search')?.focus(), 50);
    } else {
        c.classList.replace('flex', 'hidden');
    }
};

// --- Clear Search & Dismiss Mobile Search Bar ---
export const clearSearchAndClose = () => {
    window.clearSearch();
    if (window.innerWidth < 640) $('search-container')?.classList.replace('flex', 'hidden');
};

// --- Jump Viewport Directly to Next Search Match ---
export const jumpToSearchMatch = () => {
    const stList = getStaff();
    const term = window.searchTerm;
    const curProp = getPropId();
    const m = stList.filter(s => {
        const sProp = window.toCanonicalPropId ? window.toCanonicalPropId(s.property) : s.property;
        if (sProp !== curProp) return false;
        return ((s.firstName || '') + ' ' + (s.lastName || '')).toUpperCase().includes(term) || (s.bookId || '').toUpperCase().includes(term);
    }).sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''));

    if (m.length > 0) {
        const idx = (window.searchMatchIndex || 0) % m.length;
        const targetBooking = m[idx];
        if (targetBooking.checkIn) {
            const parts = targetBooking.checkIn.split('-');
            const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
            d.setDate(d.getDate() - 3);
            window.viewStart = d;
        }
        window.searchMatchIndex = idx + 1;
        const mc = $('match-counter');
        if (mc) mc.innerText = `Match ${idx + 1} of ${m.length}`;
        if (window.render) window.render();
    }
};

// --------------------------------------------------------------------------
// 3. GLOBAL WINDOW EXPORTS
// --------------------------------------------------------------------------

window.getDayIndex = getDayIndex;
window.prevPeriod = prevPeriod;
window.nextPeriod = nextPeriod;
window.goToday = goToday;
window.jumpToMonth = jumpToMonth;
window.toggleZoom = toggleZoom;
window.handleSearch = handleSearch;
window.clearSearch = clearSearch;
window.toggleSearchMode = toggleSearchMode;
window.clearSearchAndClose = clearSearchAndClose;
window.jumpToSearchMatch = jumpToSearchMatch;
