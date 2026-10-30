// ==========================================================================
// pms/pms-calendar-tape.js - Timeline Date Navigation & Zoom Controller
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD, getLocalYMD, mNames } from '../core/dates.js';

export let viewStart = new Date();
viewStart.setDate(viewStart.getDate() - 3);
viewStart.setHours(12, 0, 0, 0);

export let isZoomWide = false;

export function getDaysToShow() {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    return w >= 1150 ? 35 : w >= 950 ? 28 : w >= 650 ? 21 : 14;
}

export function shiftTape(days, onUpdateCallback) {
    viewStart.setDate(viewStart.getDate() + days);
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
    if (typeof onUpdateCallback === 'function') onUpdateCallback();
}

export function jumpToMonth(monthYMD, onUpdateCallback) {
    if (!monthYMD) return;
    const parts = monthYMD.split('-');
    viewStart = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1, 12, 0, 0);
    if (typeof onUpdateCallback === 'function') onUpdateCallback();
}

export function toggleZoom(calendarContainerEl) {
    isZoomWide = !isZoomWide;
    if (calendarContainerEl) {
        calendarContainerEl.classList.toggle('zoom-wide-mode', isZoomWide);
    }
}

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
}

if (typeof window !== 'undefined') {
    window.prevPeriod = () => prevPeriod(window.renderCalendar);
    window.nextPeriod = () => nextPeriod(window.renderCalendar);
    window.goToday = () => goToday(window.renderCalendar);
    window.jumpToMonth = (val) => jumpToMonth(val, window.renderCalendar);
    window.toggleZoom = () => toggleZoom(document.getElementById('calendar-view'));
}
