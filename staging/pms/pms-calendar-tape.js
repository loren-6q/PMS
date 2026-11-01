// ==========================================================================
// pms/pms-calendar-tape.js - Timeline Date Navigation & Zoom Controller
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD, getLocalYMD, mNames } from '../core/dates.js';

// --- 1. Viewport Timeline State ---
export let viewStart = new Date();
viewStart.setDate(viewStart.getDate() - 3);
viewStart.setHours(12, 0, 0, 0);

export let isZoomWide = false;

// --- 2. Responsive Days Calculation ---
export function getDaysToShow() {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    if (isZoomWide) {
        return w >= 1150 ? 21 : w >= 950 ? 14 : w >= 650 ? 10 : 7;
    }
    return w >= 1150 ? 35 : w >= 950 ? 28 : w >= 650 ? 21 : 14;
}

// --- 3. Timeline Shifting & Month Dropdown Sync ---
export function syncMonthSelectWithView() {
    const selectEl = document.getElementById('jump-month-select');
    if (!selectEl) return;
    const y = viewStart.getFullYear();
    const m = String(viewStart.getMonth() + 1).padStart(2, '0');
    const targetVal = `${y}-${m}`;

    const opt = Array.from(selectEl.options).find(o => o.value === targetVal);
    if (opt) selectEl.value = targetVal;
    else selectEl.value = "";
}

export function shiftTape(days, onUpdateCallback) {
    viewStart.setDate(viewStart.getDate() + days);
    syncMonthSelectWithView();
    if (typeof onUpdateCallback === 'function') onUpdateCallback();
}

export function prevPeriod(onUpdateCallback) {
    shiftTape(-7, onUpdateCallback);
}

export function nextPeriod(onUpdateCallback) {
    shiftTape(7, onUpdateCallback);
}

export function goToday(onUpdateCallback) {
    viewStart = new Date();
    viewStart.setDate(viewStart.getDate() - 3);
    viewStart.setHours(12, 0, 0, 0);
    syncMonthSelectWithView();
    if (typeof onUpdateCallback === 'function') onUpdateCallback();
    scrollToToday();
}

export function jumpToMonth(monthYMD, onUpdateCallback) {
    if (!monthYMD) return;
    const parts = monthYMD.split('-');
    viewStart = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1, 12, 0, 0);
    syncMonthSelectWithView();
    if (typeof onUpdateCallback === 'function') onUpdateCallback();
}

// --- 4. Day-Column Width Zoom Toggle ---
export function toggleZoom(calendarContainerEl, onUpdateCallback) {
    isZoomWide = !isZoomWide;
    const el = calendarContainerEl || document.getElementById('calendar-view') || document.body;
    if (el) {
        el.classList.toggle('zoom-wide-mode', isZoomWide);
    }
    const zoomIcon = document.getElementById('zoom-toggle-icon');
    if (zoomIcon) {
        zoomIcon.setAttribute('data-lucide', isZoomWide ? 'zoom-out' : 'zoom-in');
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }
    if (typeof onUpdateCallback === 'function') onUpdateCallback();
}

// --- 5. Jump-to-Month Dropdown Builder ---
export function populateMonthSelect(selectEl) {
    if (!selectEl || selectEl.options.length >= 2) return;
    let html = '<option value="">ALL DATES</option>';
    const d = new Date(viewStart.getFullYear(), viewStart.getMonth() - 2, 1);
    for (let i = 0; i < 36; i++) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        html += `<option value="${y}-${m}">${mNames[d.getMonth()]} ${y}</option>`;
        d.setMonth(d.getMonth() + 1);
    }
    selectEl.innerHTML = html;
    syncMonthSelectWithView();
}

// --- 6. Centering "Today" on Screen (The Missing Export) ---
export function scrollToToday() {
    setTimeout(() => {
        const todayCell = document.querySelector('.day-column.day-today');
        const scrollContainer = document.getElementById('calendar-scroll-container') || document.getElementById('timeline-body');
        if (todayCell && scrollContainer) {
            const containerWidth = scrollContainer.clientWidth;
            const cellOffset = todayCell.offsetLeft;
            scrollContainer.scrollTo({
                left: Math.max(0, cellOffset - (containerWidth / 2)),
                behavior: 'smooth'
            });
        }
    }, 150);
}

// --- 7. Window Global Bridge ---
if (typeof window !== 'undefined') {
    window.prevPeriod = () => prevPeriod(window.renderCalendar);
    window.nextPeriod = () => nextPeriod(window.renderCalendar);
    window.goToday = () => goToday(window.renderCalendar);
    window.jumpToMonth = (val) => jumpToMonth(val, window.renderCalendar);
    window.toggleZoom = () => toggleZoom(document.getElementById('calendar-view'), window.renderCalendar);
    window.scrollToToday = scrollToToday;
}
