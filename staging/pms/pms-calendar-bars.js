// ==========================================================================
// pms/pms-calendar-bars.js - Reservation Bar Renderer & Tooltip Engine
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD, getLocalYMD, diffDays } from '../core/dates.js';
import { getDue } from '../core/money.js';

// OTA Channel Styling Badges
const CHANNEL_BADGES = {
    'booking.com': { bg: '#003580', txt: '#fff', char: 'B' },
    'hostelworld': { bg: '#F15A24', txt: '#fff', char: 'H' },
    'agoda': { bg: '#87B2D6', txt: '#fff', char: 'A' },
    'airbnb': { bg: '#FF5A5F', txt: '#fff', char: 'A' },
    'expedia': { bg: '#facc15', txt: '#003580', char: 'E' },
    'ctrip': { bg: '#3b82f6', txt: '#fff', char: 'T' },
    'direct': { bg: '#10b981', txt: '#fff', char: 'D' },
    'walk-in': { bg: '#475569', txt: '#fff', char: 'W' }
};

export function renderReservationBar(booking, daysToShow, getDayIndexFn, todayStr, yesterdayStr, onOpenModalFn, searchTerm = '') {
    const sIdx = getDayIndexFn(booking.checkIn);
    const eIdx = getDayIndexFn(booking.checkOut);

    // If reservation is completely outside visible viewport
    if (eIdx <= 0 || sIdx >= daysToShow) return null;

    const visibleStart = Math.max(0, sIdx);
    const visibleEnd = Math.min(daysToShow, eIdx);
    const span = Math.max(1, visibleEnd - visibleStart);

    const bar = document.createElement('div');
    bar.className = 'staff-bar cursor-pointer select-none';
    bar.dataset.bookingId = booking.id;

    // Grid positioning across the CSS timeline columns
    // Column 1 is sidebar; calendar day columns start at 2
    bar.style.gridColumn = `${visibleStart + 2} / span ${span}`;

    // Apply Status Background Color
    const status = (booking.status || 'future').toLowerCase();
    bar.classList.add(`status-${status}`);

    // Alert Border Styling: Bad CC vs Owes Balance
    const dueAmount = getDue(booking);
    if (booking.isBadCC) {
        bar.classList.add('border-bad-cc');
    } else if (dueAmount > 0.05 && !['cancelled', 'noshow', 'charged'].includes(status)) {
        bar.classList.add('border-owes-money');
    }

    // Departure & Arrival Alert Badges
    if (booking.checkIn === todayStr && status === 'future') {
        bar.classList.add('alert-checkin-today');
    } else if (booking.checkIn <= yesterdayStr && status === 'future') {
        bar.classList.add('alert-late-checkin');
    } else if (booking.checkOut === todayStr && status === 'here') {
        bar.classList.add('alert-checkout-today');
    } else if (booking.checkOut <= yesterdayStr && status === 'here') {
        bar.classList.add('alert-overdue-departure');
    }

    // Search Matching Highlight & Dimming
    if (searchTerm && searchTerm.length > 0) {
        const fullName = `${booking.firstName || ''} ${booking.lastName || ''}`.toUpperCase();
        const bookId = (booking.bookId || '').toUpperCase();
        if (fullName.includes(searchTerm) || bookId.includes(searchTerm)) {
            bar.classList.add('search-match-highlight');
        } else {
            bar.classList.add('search-dimmed');
        }
    }

    // OTA Channel Badge
    const srcKey = (booking.source || 'direct').toLowerCase();
    const ch = CHANNEL_BADGES[srcKey] || { bg: '#64748b', txt: '#fff', char: '?' };
    const badgeHtml = `<span class="ota-icon shrink-0" style="background:${ch.bg}; color:${ch.txt};" title="${srcKey.toUpperCase()}">${ch.char}</span>`;

    const guestDisplayName = `${booking.lastName || 'GUEST'}, ${booking.firstName ? booking.firstName[0] : ''}`.trim();
    bar.innerHTML = `
        <div class="flex items-center gap-1 overflow-hidden w-full h-full px-1">
            ${badgeHtml}
            <span class="truncate font-black text-[11px] leading-tight ${booking.isRefundable ? 'italic' : ''}">${guestDisplayName}</span>
        </div>
    `;

    // Tooltip Events (Decoupled with Fixed Viewport Anchoring)
    bar.onmouseenter = (e) => showBarTooltip(e, booking);
    bar.onmousemove = (e) => positionBarTooltip(e);
    bar.onmouseleave = () => hideBarTooltip();

    // Click: Open Folio Modal
    bar.onclick = (e) => {
        e.stopPropagation();
        hideBarTooltip();
        if (typeof onOpenModalFn === 'function') {
            onOpenModalFn(booking);
        }
    };

    return bar;
}

// --- Tooltip Controller (Fixes Screen Freakout / Flicker Loop) ---
let tooltipEl = null;

function getTooltipElement() {
    if (!tooltipEl) {
        tooltipEl = document.getElementById('custom-tooltip');
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'custom-tooltip';
            document.body.appendChild(tooltipEl);
        }
        tooltipEl.style.cssText = `
            position: fixed !important;
            pointer-events: none !important;
            z-index: 999999 !important;
            display: none;
            background: #0f172a;
            color: #ffffff;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 11px;
            line-height: 1.4;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
            border: 1px solid #334155;
            max-width: 280px;
        `;
    }
    return tooltipEl;
}

export function showBarTooltip(e, b) {
    const el = getTooltipElement();
    const nights = diffDays(b.checkIn, b.checkOut);
    const due = getDue(b);

    el.innerHTML = `
        <div class="font-black text-xs text-white uppercase border-b border-slate-700 pb-1 mb-1 flex justify-between items-center">
            <span>${b.firstName || ''} ${b.lastName || 'Guest'}</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded uppercase font-bold bg-slate-800 text-slate-300">${b.source || 'Direct'}</span>
        </div>
        <div class="space-y-0.5 text-[10px] text-slate-300 font-medium">
            <div>Dates: <b>${b.checkIn} &rarr; ${b.checkOut}</b> (${nights} nt)</div>
            <div>Room: <b>${Array.isArray(b.rooms) ? b.rooms.join(', ') : (b.room || 'Unassigned')}</b></div>
            <div>Balance Due: <b class="${due > 0 ? 'text-rose-400' : 'text-emerald-400'} font-bold">฿${due.toFixed(2)}</b></div>
            ${b.bookId ? `<div class="text-[9px] text-slate-400 font-mono">ID: ${b.bookId}</div>` : ''}
        </div>
    `;

    el.style.display = 'block';
    positionBarTooltip(e);
}

export function positionBarTooltip(e) {
    if (!tooltipEl || tooltipEl.style.display === 'none') return;
    const offset = 14;
    let x = e.clientX + offset;
    let y = e.clientY + offset;

    // Prevent viewport overflow
    const rect = tooltipEl.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 10) {
        x = e.clientX - rect.width - offset;
    }
    if (y + rect.height > window.innerHeight - 10) {
        y = e.clientY - rect.height - offset;
    }

    tooltipEl.style.left = `${Math.max(10, x)}px`;
    tooltipEl.style.top = `${Math.max(10, y)}px`;
}

export function hideBarTooltip() {
    if (tooltipEl) {
        tooltipEl.style.display = 'none';
    }
}
