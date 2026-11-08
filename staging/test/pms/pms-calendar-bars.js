// ==========================================================================
// pms/pms-calendar-bars.js - Reservation Bar Renderer, SVGS & Stable Tooltip
// Wild & Wandering Property Management System
// ==========================================================================

import { getDayIndex } from './pms-calendar-tape.js';
import { applyStatusStyle } from '../core/occupancy.js';

// --- Vector Icons for Bars & Legend ---
export const SVGS = {
    link: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline shrink-0"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
    upFree: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="inline shrink-0"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
    upPaid: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="inline shrink-0"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
    ext: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline shrink-0"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>`,
    fbGood: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline shrink-0"><path d="M20 6 9 17l-5-5"></path></svg>`,
    fbBad: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline shrink-0"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    mailConf: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline shrink-0"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>`,
    mailNotFmp: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline shrink-0"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>`,
    mailPre: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline shrink-0"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>`,
    mailPreConf: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline shrink-0"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>`,
    mailSpec: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline shrink-0"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>`
};

const CHANNEL_BADGES = {
    'booking.com': { bg: '#003580', txt: '#fff', char: 'B' },
    'hostelworld': { bg: '#F15A24', txt: '#fff', char: 'H' },
    'agoda':       { bg: '#87B2D6', txt: '#fff', char: 'A' },
    'airbnb':      { bg: '#FF5A5F', txt: '#fff', char: 'A' },
    'expedia':     { bg: '#facc15', txt: '#003580', char: 'E' },
    'ctrip':       { bg: '#3b82f6', txt: '#fff', char: 'T' },
    'trip.com':    { bg: '#3b82f6', txt: '#fff', char: 'T' },
    'direct':      { bg: '#10b981', txt: '#fff', char: 'D' },
    'walk-in':     { bg: '#475569', txt: '#fff', char: 'W' },
    'other':       { bg: '#334155', txt: '#fff', char: '?' }
};

// --- Reservation Bar Renderer ---
export function renderReservationBar(s, dShow, todayStr, yStr, searchTerm, tt) {
    const sIdx = getDayIndex(s.checkIn);
    const eIdx = getDayIndex(s.checkOut);

    if (eIdx <= 0 || sIdx >= dShow) return null;

    const visibleStart = Math.max(0, sIdx);
    const visibleEnd = Math.min(dShow, eIdx);
    const span = Math.max(1, visibleEnd - visibleStart);

    const bar = document.createElement('div');
    bar.className = 'staff-bar cursor-pointer select-none';
    bar.dataset.bookingId = s.id;
    bar.style.gridColumn = `${visibleStart + 2} / span ${span}`;

    const rawStatus = String(s.status || 'future').trim().toLowerCase();
    const status = rawStatus === 'noshow' ? 'no-show' : rawStatus;
    bar.classList.add(`status-${status.replace(/\s+/g, '-')}`);

    // Authoritative status color & styling from core/occupancy.js
    applyStatusStyle(bar, status, false);

    // Alert borders
    const due = window.getDue ? window.getDue(s) : 0;
    if (s.badCC) {
        bar.classList.add('border-bad-cc');
    } else if (due > 0.05 && status !== 'cancelled') {
        bar.classList.add('border-owes-money');
    }

    // Operational date alert badges
    if (s.checkIn === todayStr && status === 'future') {
        bar.classList.add('alert-checkin-today', 'checkin-today');
    } else if (s.checkIn <= yStr && status === 'future') {
        bar.classList.add('alert-late-checkin', 'late-checkin');
    } else if (s.checkOut === todayStr && status === 'here') {
        bar.classList.add('alert-checkout-today', 'overdue-checkout-today');
    } else if (s.checkOut <= yStr && status === 'here') {
        bar.classList.add('alert-overdue-departure', 'overdue-checkout-past');
    }

    // Search dimming & highlighting
    if (searchTerm && searchTerm.length > 0) {
        const clean = searchTerm.toUpperCase();
        const fullName = `${s.firstName || ''} ${s.lastName || ''}`.toUpperCase();
        const bId = String(s.bookId || '').toUpperCase();
        if (fullName.includes(clean) || bId.includes(clean)) {
            bar.classList.add('search-match-highlight');
        } else {
            bar.classList.add('search-dimmed');
        }
    }

    // Channel badge
    const srcKey = String(s.source || 'direct').toLowerCase().trim();
    const ch = CHANNEL_BADGES[srcKey] || CHANNEL_BADGES['other'];
    const badgeHtml = `<span class="ota-icon shrink-0" style="background:${ch.bg}; color:${ch.txt};" title="${srcKey.toUpperCase()}">${ch.char}</span>`;

    // Indicators: Link, Upgrade, Pax, Refundability
    const linkHtml = s.linkedId ? `<span title="Linked Booking (${s.linkedId})">${SVGS.link}</span>` : '';
    const upHtml = s.upgrade === 'paid' ? SVGS.upPaid : (s.upgrade === 'free' ? SVGS.upFree : '');
    const paxHtml = (s.pax && s.pax > 1) ? `<span class="text-[9px] font-bold opacity-80 ml-0.5">X${s.pax}</span>` : '';
    const isRef = s.refundability === 'ref';
    const guestName = (s.lastName || s.firstName || 'GUEST').toUpperCase();

    bar.innerHTML = `
        <div class="flex items-center gap-1 overflow-hidden w-full h-full px-1 pointer-events-none">
            ${linkHtml}
            <span class="truncate font-black text-[11px] leading-tight ${isRef ? 'italic' : ''}">${guestName}</span>
            ${paxHtml}
            ${upHtml}
            ${badgeHtml}
        </div>
    `;

    // Tooltip & Modal click listeners
    bar.addEventListener('mouseenter', e => showBarTooltip(e, s, tt));
    bar.addEventListener('mousemove', e => positionBarTooltip(e, tt));
    bar.addEventListener('mouseleave', () => hideBarTooltip(tt));
    bar.addEventListener('click', e => {
        e.stopPropagation();
        hideBarTooltip(tt);
        if (window.editStaff) window.editStaff(s.id);
    });

    return bar;
}

// --- Stable Tooltip Helpers ---
export function showBarTooltip(e, b, tt) {
    const el = tt || document.getElementById('custom-tooltip');
    if (!el) return;
    const parseFn = window.parseYMD || (str => Date.parse(str));
    const ms = parseFn(b.checkOut) - parseFn(b.checkIn);
    const nights = Math.max(1, Math.round(ms / 86400000));
    const due = window.getDue ? window.getDue(b) : 0;
    const rList = (window.getRooms ? window.getRooms(b) : (b.rooms || [b.room])).filter(Boolean);
    const roomText = rList.join(', ') || 'Unassigned';

    el.innerHTML = `
        <div class="font-black text-xs text-white uppercase border-b border-slate-700 pb-1 mb-1 flex justify-between items-center pointer-events-none">
            <span>${b.firstName || ''} ${b.lastName || 'Guest'}</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded uppercase font-bold bg-slate-800 text-slate-300">${b.source || 'Direct'}</span>
        </div>
        <div class="space-y-0.5 text-[10px] text-slate-300 font-medium pointer-events-none">
            <div>Dates: <b>${b.checkIn} &rarr; ${b.checkOut}</b> (${nights} nt)</div>
            <div>Room: <b>${roomText}</b></div>
            <div>Balance Due: <b class="${due > 0 ? 'text-rose-400' : 'text-emerald-400'} font-bold">฿${Number(due || 0).toFixed(2)}</b></div>
            ${b.bookId ? `<div class="text-[9px] text-slate-400 font-mono">ID: \${b.bookId}</div>` : ''}
        </div>
    `;
    el.style.display = 'block';
    positionBarTooltip(e, el);
}

export function positionBarTooltip(e, tt) {
    const el = tt || document.getElementById('custom-tooltip');
    if (!el || el.style.display === 'none') return;
    const offset = 14;
    let x = e.clientX + offset;
    let y = e.clientY + offset;
    const rect = el.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 10) x = e.clientX - rect.width - offset;
    if (y + rect.height > window.innerHeight - 10) y = e.clientY - rect.height - offset;
    el.style.left = `${Math.max(10, x)}px`;
    el.style.top = `${Math.max(10, y)}px`;
}

export function hideBarTooltip(tt) {
    const el = tt || document.getElementById('custom-tooltip');
    if (el) el.style.display = 'none';
}

if (typeof window !== 'undefined') {
    window.renderReservationBar = renderReservationBar;
    window.SVGS = SVGS;
}
