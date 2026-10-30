// ==========================================================================
// pms/pms-calendar-bars.js - Reservation Bar Placement, Tooltips & Badges
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD } from '../core/dates.js';
import { getDue } from '../core/money.js';

export const SVGS = {
    upFree: `<svg viewBox="0 0 24 24" class="w-full h-full"><path d="M12 2L4 12h5v10h6V12h5z" fill="#facc15" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
    upPaid: `<svg viewBox="0 0 24 24" class="w-full h-full"><path d="M12 2L4 12h5v10h6V12h5z" fill="#4ade80" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
    ext: `<svg viewBox="0 0 24 24" class="w-full h-full"><path d="M4 12h12v-5l8 8-8 8v-5H4z" fill="#3b82f6" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
    link: `<svg viewBox="0 0 24 24" class="w-full h-full"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="#64748b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    mailConf: `<svg viewBox="0 0 24 24" class="w-full h-full"><rect x="1" y="4" width="22" height="16" rx="2" fill="#fff" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
    mailNotFmp: `<svg viewBox="0 0 24 24" class="w-full h-full"><rect x="1" y="4" width="22" height="16" rx="2" fill="#94a3b8" stroke="#334155" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#334155" stroke-width="2"/></svg>`,
    mailPre: `<svg viewBox="0 0 24 24" class="w-full h-full"><rect x="1" y="4" width="22" height="16" rx="2" fill="#f87171" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
    mailPreConf: `<svg viewBox="0 0 24 24" class="w-full h-full"><rect x="1" y="4" width="22" height="16" rx="2" fill="#4ade80" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
    mailSpec: `<svg viewBox="0 0 24 24" class="w-full h-full"><rect x="1" y="4" width="22" height="16" rx="2" fill="#facc15" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
    fbGood: `<svg viewBox="0 0 24 24" class="w-full h-full"><path d="M3 12l5 5L21 4" fill="none" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    fbBad: `<svg viewBox="0 0 24 24" class="w-full h-full"><path d="M4 4l16 16M4 20L20 4" fill="none" stroke="#ef4444" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

const CHANNEL_BADGES = {
    'booking.com': { bg: 'bg-[#003580]', text: 'B' },
    'agoda': { bg: 'bg-[#87B2D6]', text: 'A' },
    'hostelworld': { bg: 'bg-[#F15A24]', text: 'H' },
    'airbnb': { bg: 'bg-[#FF5A5F]', text: 'A' },
    'direct': { bg: 'bg-emerald-500', text: 'D' },
    'expedia': { bg: 'bg-[#facc15]', text: '<span class="text-[#003580]">E</span>' },
    'ctrip': { bg: 'bg-[#3b82f6]', text: 'T' },
    'walk-in': { bg: 'bg-slate-600', text: 'W' },
    'walkin': { bg: 'bg-slate-600', text: 'W' }
};

export function renderReservationBar(booking, daysToShow, getDayIndexFn, todayStr, yesterdayStr, onEditCallback) {
    const eS = getDayIndexFn(booking.checkIn) + 0.3;
    const eE = getDayIndexFn(booking.checkOut) + 0.25;
    if (eS >= daysToShow || eE <= 0) return null;

    const due = getDue(booking);
    const owes = due > 0;
    let borderStyle = 'border border-black/10';

    if (booking.status === 'future' || booking.status === 'new') {
        if (booking.checkIn === todayStr) borderStyle += ' checkin-today';
        else if (booking.checkIn <= yesterdayStr) borderStyle += ' late-checkin';
    } else if (booking.status === 'here') {
        if (booking.checkOut === todayStr) borderStyle += ' overdue-checkout-today';
        else if (booking.checkOut <= yesterdayStr) borderStyle += ' overdue-checkout-past';
    }

    if (booking.status === 'new') borderStyle += ' status-new-pulse';
    else if (booking.badCC) borderStyle = '!border-red-500 !border-dashed !border-[3px]';
    else if (owes) borderStyle = '!border-red-500 !border-[3px]';

    const chBadge = CHANNEL_BADGES[booking.source?.toLowerCase()] || { bg: 'bg-slate-700', text: '?' };

    const bar = document.createElement('div');
    bar.className = `unselectable staff-bar status-${booking.status} ${borderStyle} ${booking.linkedId ? 'linked-' + booking.linkedId : ''}`;
    bar.style.left = `calc(var(--sidebar-w) + (100% - var(--sidebar-w)) * ${Math.max(0, eS) / daysToShow})`;
    bar.style.width = `calc((100% - var(--sidebar-w)) * ${(Math.min(daysToShow, eE) - Math.max(0, eS)) / daysToShow})`;

    let html = `<div class="bar-sticky-content gap-0.5">`;
    if (booking.linkedId) html += `<div class="w-4 h-4 shrink-0 mr-0.5">${SVGS.link}</div>`;
    html += `<span class="${booking.refundability === 'ref' ? 'italic font-black' : 'font-bold'} truncate text-[11px]">${booking.lastName || 'Guest'}</span>`;
    if (booking.pax > 1) html += `<span class="text-[8px] opacity-60 leading-none self-start mt-0.5 ml-0.5">x${booking.pax}</span>`;

    if (booking.upgrade === 'free') html += `<div class="w-3.5 h-4 shrink-0 ml-0.5">${SVGS.upFree}</div>`;
    else if (booking.upgrade === 'paid') html += `<div class="w-3.5 h-4 shrink-0 ml-0.5">${SVGS.upPaid}</div>`;

    if (booking.extended) html += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${SVGS.ext}</div>`;
    if (booking.rating === 'good') html += `<div class="w-4 h-4 shrink-0 ml-0.5">${SVGS.fbGood}</div>`;
    else if (booking.rating === 'bad') html += `<div class="w-4 h-4 shrink-0 ml-0.5">${SVGS.fbBad}</div>`;

    if (booking.emailSpecial) html += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${SVGS.mailSpec}</div>`;
    else if (booking.emailPrePost === 'confirmed') html += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${SVGS.mailPreConf}</div>`;
    else if (booking.emailPrePost) html += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${SVGS.mailPre}</div>`;
    else if (booking.emailConfirm) html += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${SVGS.mailConf}</div>`;

    html += `
        <div class="ml-1 ${chBadge.bg} text-white w-[15px] h-[15px] text-[12px] font-black flex items-center justify-center shrink-0 rounded-xs leading-none">
            ${chBadge.text}
        </div>
        <div class="w-2 shrink-0"></div>
    </div>`;

    bar.innerHTML = html;

    // Hover Tooltip
    const tooltip = document.getElementById('custom-tooltip');
    let tags = [];
    if (booking.refundability === 'ref') tags.push('Refundable');
    if (booking.upgrade === 'free') tags.push('Free Upgrade');
    if (booking.upgrade === 'paid') tags.push('Paid Upgrade');
    if (booking.extended) tags.push('Extended');
    if (booking.emailConfirm) tags.push('Conf Sent');
    if (booking.linkedId) tags.push(`Linked: ${booking.linkedId}`);

    const ttHtml = `
        <div class="font-black text-[15px] text-blue-300 leading-tight mb-1">${booking.firstName || ''} ${booking.lastName || 'Guest'}</div>
        <div>Total: ฿${Number(booking.totalPrice || 0).toFixed(2)} | <span class="${due > 0 ? 'text-red-400 font-black' : 'text-green-400'}">Due: ฿${due.toFixed(2)} ${booking.badCC ? '(*BAD CC*)' : ''}</span></div>
        <div class="text-slate-300 mt-1">${booking.checkIn?.substr(5) || ''} &rarr; ${booking.checkOut?.substr(5) || ''} (${booking.pax || 1} PAX)</div>
        <div class="text-slate-300 mt-0.5">Room: ${(booking.rooms || [booking.room]).filter(Boolean).join(', ') || 'Unassigned'}</div>
        <div class="text-slate-300 mt-0.5">Source: ${(booking.source || 'other').toUpperCase()}</div>
        ${tags.length ? `<div class="mt-1 pt-1 border-t border-slate-600 text-yellow-200 text-[10px] uppercase font-bold">${tags.join(' • ')}</div>` : ''}
    `;

    bar.onmouseenter = () => {
        if (booking.linkedId) {
            document.querySelectorAll('.linked-' + booking.linkedId).forEach(el => el.classList.add('link-glow'));
        }
        if (tooltip) {
            tooltip.innerHTML = ttHtml;
            tooltip.style.display = 'block';
        }
    };

    bar.onmousemove = (e) => {
        if (!tooltip) return;
        tooltip.style.left = (e.clientX + 220 > window.innerWidth ? e.clientX - 230 : e.clientX + 15) + 'px';
        tooltip.style.top = (e.clientY + 150 > window.innerHeight ? e.clientY - 160 : e.clientY + 15) + 'px';
    };

    bar.onmouseleave = () => {
        if (booking.linkedId) {
            document.querySelectorAll('.linked-' + booking.linkedId).forEach(el => el.classList.remove('link-glow'));
        }
        if (tooltip) tooltip.style.display = 'none';
    };

    bar.onclick = (e) => {
        e.stopPropagation();
        if (tooltip) tooltip.style.display = 'none';
        if (typeof onEditCallback === 'function') onEditCallback(booking.id);
    };

    return bar;
}

if (typeof window !== 'undefined') {
    window.SVGS = SVGS;
}
