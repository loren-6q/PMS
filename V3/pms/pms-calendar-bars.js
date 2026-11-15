// ==========================================================================
// pms/pms-calendar-bars.js - Reservation Bar Renderer & Stable Tooltip
// Wild & Wandering Property Management System
// ==========================================================================

import { diffDays } from '../core/dates.js';
import { getDue } from '../core/money.js';
import { applyStatusStyle } from '../core/occupancy.js';

const CHANNEL_BADGES = {
    'booking.com': { bg: '#003580', txt: '#fff', char: 'B' },
    'hostelworld': { bg: '#F15A24', txt: '#fff', char: 'H' },
    'agoda':       { bg: '#87B2D6', txt: '#fff', char: 'A' },
    'airbnb':      { bg: '#FF5A5F', txt: '#fff', char: 'A' },
    'expedia':     { bg: '#facc15', txt: '#003580', char: 'E' },
    'ctrip':       { bg: '#3b82f6', txt: '#fff', char: 'T' },
    'direct':      { bg: '#10b981', txt: '#fff', char: 'D' },
    'walk-in':     { bg: '#475569', txt: '#fff', char: 'W' }
};

export function renderReservationBar(booking, daysToShow, getDayIndexFn, todayStr, yesterdayStr, onOpenModalFn, searchTerm = '') {
    const sIdx = getDayIndexFn(booking.checkIn);
    const eIdx = getDayIndexFn(booking.checkOut);

    if (eIdx <= 0 || sIdx >= daysToShow) return null;

    const visibleStart = Math.max(0, sIdx);
    const visibleEnd = Math.min(daysToShow, eIdx);
    const span = Math.max(1, visibleEnd - visibleStart);

    const bar = document.createElement('div');
    bar.className = 'staff-bar cursor-pointer select-none';
    bar.dataset.bookingId = booking.id;
    bar.style.gridColumn = `${visibleStart + 2} / span ${span}`;

    const status = (booking.status || 'future').toLowerCase().trim();
    bar.classList.add(`status-${status.replace(/\s+/g, '-')}`);

    // Authoritative status color & styling from core/occupancy.js
    applyStatusStyle(bar, status, false);

    // Alerts: Bad CC & Balance Due (No-shows WHO OWE MONEY GET RED BORDER)
    const dueAmount = getDue(booking);
    if (booking.badCC) {
        bar.classList.add('border-bad-cc');
    } else if (dueAmount > 0.05 && status !== 'cancelled') {
        bar.classList.add('border-owes-money');
    }

    if (booking.checkIn === todayStr && status === 'future') {
        bar.classList.add('alert-checkin-today');
    } else if (booking.checkIn <= yesterdayStr && status === 'future') {
        bar.classList.add('alert-late-checkin');
    } else if (booking.checkOut === todayStr && status === 'here') {
        bar.classList.add('alert-checkout-today');
    } else if (booking.checkOut <= yesterdayStr && status === 'here') {
        bar.classList.add('alert-overdue-departure');
    }

    if (searchTerm && searchTerm.length > 0) {
        const cleanTerm = searchTerm.trim().toUpperCase();
        const fullName = `${booking.firstName || ''} ${booking.lastName || ''}`.toUpperCase();
        const bookId = String(booking.bookId || '').toUpperCase();
        if (fullName.includes(cleanTerm) || bookId.includes(cleanTerm)) {
            bar.classList.add('search-match-highlight');
        } else {
            bar.classList.add('search-dimmed');
        }
    }

    const srcKey = (booking.source || 'direct').toLowerCase();
    const ch = CHANNEL_BADGES[srcKey] || { bg: '#64748b', txt: '#fff', char: '?' };
    const badgeHtml = `<span class="ota-icon shrink-0" style="background:${ch.bg}; color:${ch.txt};" title="${srcKey.toUpperCase()}">${ch.char}</span>`;

    const isRefundable = booking.refundability === 'ref';
    const guestDisplayName = `${booking.lastName || 'GUEST'}, ${booking.firstName ? booking.firstName[0] : ''}`.trim();
    bar.innerHTML = `
        <div class="flex items-center gap-1 overflow-hidden w-full h-full px-1 pointer-events-none">
            ${badgeHtml}
            <span class="truncate font-black text-[11px] leading-tight ${isRefundable ? 'italic' : ''}">${guestDisplayName}</span>
        </div>
    `;

    bar.addEventListener('mouseenter', (e) => showBarTooltip(e, booking));
    bar.addEventListener('mousemove', (e) => positionBarTooltip(e));
    bar.addEventListener('mouseleave', () => hideBarTooltip());

    bar.addEventListener('click', (e) => {
        e.stopPropagation();
        hideBarTooltip();
        if (typeof onOpenModalFn === 'function') {
            onOpenModalFn(booking);
        }
    });

    return bar;
}

// Stable Tooltip DOM Container
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
    const roomText = Array.isArray(b.rooms) ? b.rooms.filter(Boolean).join(', ') : (b.room || 'Unassigned');

    el.innerHTML = `
        <div class="font-black text-xs text-white uppercase border-b border-slate-700 pb-1 mb-1 flex justify-between items-center pointer-events-none">
            <span>${b.firstName || ''} ${b.lastName || 'Guest'}</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded uppercase font-bold bg-slate-800 text-slate-300">${b.source || 'Direct'}</span>
        </div>
        <div class="space-y-0.5 text-[10px] text-slate-300 font-medium pointer-events-none">
            <div>Dates: <b>${b.checkIn} &rarr; ${b.checkOut}</b> (${nights} nt)</div>
            <div>Room: <b>${roomText || 'Unassigned'}</b></div>
            <div>Balance Due: <b class="${due > 0 ? 'text-rose-400' : 'text-emerald-400'} font-bold">฿${Number(due || 0).toFixed(2)}</b></div>
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
