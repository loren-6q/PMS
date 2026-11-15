// ==========================================================================
// pms/pms-calendar-bars.js - Reservation Bar Renderer & Tooltip Engine
// Wild & Wandering Property Management System
// ==========================================================================

import { getDayIndex } from './pms-calendar-tape.js';
import { applyStatusStyle } from '../core/occupancy.js';

// --- DOM Selector Helpers ---
const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);

// --------------------------------------------------------------------------
// 1. RESERVATION BAR SVG ICONS & OCCUPANCY ASSETS
// --------------------------------------------------------------------------

// --- Reservation Bar Vector Icon Suite ---
export const SVGS = {
    upFree: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M12 2L4 12h5v10h6V12h5z" fill="#facc15" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
    upPaid: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M12 2L4 12h5v10h6V12h5z" fill="#4ade80" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
    ext: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M4 12h12v-5l8 8-8 8v-5H4z" fill="#3b82f6" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
    link: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="#64748b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    mailConf: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#fff" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
    mailNotFmp: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#94a3b8" stroke="#334155" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#334155" stroke-width="2"/></svg>`,
    mailPre: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#f87171" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
    mailPreConf: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#4ade80" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
    mailSpec: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><rect x="1" y="4" width="22" height="16" rx="2" fill="#facc15" stroke="#000" stroke-width="2"/><path d="M1 6l11 8 11-8" fill="none" stroke="#000" stroke-width="2"/></svg>`,
    fbGood: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M3 12l5 5L21 4" fill="none" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12l5 5L21 4" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/></svg>`,
    fbBad: `<svg viewBox="0 0 24 24" class="w-full h-full" overflow="visible"><path d="M4 4l16 16M4 20L20 4" fill="none" stroke="#ef4444" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 4l16 16M4 20L20 4" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/></svg>`
};

window.SVGS = SVGS;

// --- Booking Room Accessor Helper ---
const getRooms = s => (s?.rooms?.length ? s.rooms : (s?.room ? [s.room] : []));

// --------------------------------------------------------------------------
// 2. RESERVATION BAR RENDERING & TOOLTIP ENGINE
// --------------------------------------------------------------------------

// --- Reservation Timeline Bar DOM Generator ---
export const renderReservationBar = (s, dShow, todayStr, yStr, searchTerm, tt) => {
    const eS = getDayIndex(s.checkIn) + 0.3;
    const eE = getDayIndex(s.checkOut) + 0.25;
    if (eS >= dShow || eE <= 0) return null;
    const due = window.getDue ? window.getDue(s) : 0;
    const owes = due > 0;
    let bSty = 'border border-black/10';
    let isA = false;

    if (s.status === 'future' || s.status === 'new') {
        if (s.checkIn === todayStr) { bSty += ' checkin-today'; isA = true; }
        else if (s.checkIn <= yStr) { bSty += ' late-checkin'; isA = true; }
    } else if (s.status === 'here') {
        if (s.checkOut === todayStr) { bSty += ' overdue-checkout-today'; isA = true; }
        else if (s.checkOut <= yStr) { bSty += ' overdue-checkout-past'; isA = true; }
    }

    if (s.status === 'new') { bSty += ' status-new-pulse'; isA = true; }
    if (!isA) {
        if (s.badCC) bSty = '!border-red-500 !border-dashed !border-[3px]';
        else if (owes) bSty = '!border-red-500 !border-[3px]';
    }

    const srcC = {
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

    const src = srcC[s.source] || { bg: 'bg-slate-700', text: '?' };
    const bar = document.createElement('div');
    bar.className = `unselectable staff-bar status-${s.status} ${bSty} ${s.linkedId ? 'linked-' + s.linkedId : ''}`;
    bar.style.left = `calc(var(--sidebar-w) + (100% - var(--sidebar-w)) * ${Math.max(0, eS) / dShow})`;
    bar.style.width = `calc((100% - var(--sidebar-w)) * ${(Math.min(dShow, eE) - Math.max(0, eS)) / dShow})`;
    applyStatusStyle(bar, s.status);

    if (searchTerm && !(s.firstName + ' ' + s.lastName).toUpperCase().includes(searchTerm) && !(s.bookId || '').toUpperCase().includes(searchTerm)) {
        bar.style.opacity = "0.15";
    }

    let bHtml = `<div class="bar-sticky-content gap-0.5">`;
    if (s.linkedId) bHtml += `<div class="w-4 h-4 shrink-0 mr-0.5">${SVGS.link}</div>`;
    bHtml += `<span class="${s.refundability === 'ref' && window.parseYMD(s.checkIn) - Date.now() > 7 * 86400000 ? 'italic font-black' : 'font-bold'} truncate text-[11px]" style="letter-spacing:-0.3px;">${s.lastName}</span>`;
    if (s.pax > 1) bHtml += `<span class="text-[8px] opacity-60 leading-none self-start mt-0.5 ml-0.5">x${s.pax}</span>`;
    if (s.upgrade === 'free') bHtml += `<div class="w-3.5 h-4 shrink-0 ml-0.5">${SVGS.upFree}</div>`;
    else if (s.upgrade === 'paid') bHtml += `<div class="w-3.5 h-4 shrink-0 ml-0.5">${SVGS.upPaid}</div>`;
    if (s.extended) bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${SVGS.ext}</div>`;
    if (s.rating === 'good') bHtml += `<div class="w-4 h-4 shrink-0 ml-0.5">${SVGS.fbGood}</div>`;
    else if (s.rating === 'bad') bHtml += `<div class="w-4 h-4 shrink-0 ml-0.5">${SVGS.fbBad}</div>`;
    if (s.emailSpecial) bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${SVGS.mailSpec}</div>`;
    else if (s.emailPrePost === 'confirmed') bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${SVGS.mailPreConf}</div>`;
    else if (s.emailPrePost === 'sent' || s.emailPrePost === true) bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${SVGS.mailPre}</div>`;
    else if (s.emailConfirm === 2 || s.emailConfirm === 'not_fmp') bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${SVGS.mailNotFmp}</div>`;
    else if (s.emailConfirm) bHtml += `<div class="w-4 h-3.5 shrink-0 ml-0.5">${SVGS.mailConf}</div>`;
    bHtml += `<div class="ml-1 ${src.bg} text-white w-[15px] h-[15px] text-[13px] font-black flex items-center justify-center shrink-0 rounded-sm leading-none pb-[1px] pt-[0.5px]">${src.text}</div><div class="w-2 shrink-0"></div></div>`;
    bar.innerHTML = bHtml;

    let tags = [];
    if (s.refundability === 'ref') tags.push('Refundable');
    if (s.upgrade === 'free') tags.push('Free Upgrade');
    if (s.upgrade === 'paid') tags.push('Paid Upgrade');
    if (s.extended) tags.push('Extended');
    if (s.emailConfirm === 2 || s.emailConfirm === 'not_fmp') tags.push('Conf Sent (Not FMP)');
    else if (s.emailConfirm) tags.push('Conf Sent');
    if (s.emailPrePost) tags.push(`Pre/Post ${s.emailPrePost}`);
    if (s.emailSpecial) tags.push('Special Sent');
    if (s.linkedId) tags.push(`Linked: ${s.linkedId}`);

    let ttHtml = `<div class="font-black text-[15px] text-blue-300 leading-tight mb-1">${s.firstName || ''} ${s.lastName || ''}</div><div>Total: ฿${Number(s.totalPrice || 0).toFixed(2)} | <span class="${due > 0 ? 'text-red-400' : 'text-green-400'}">Due: ฿${due.toFixed(2)} ${s.badCC ? '(*BAD CC*)' : ''}</span></div><div class="text-slate-300 mt-1">${s.checkIn ? s.checkIn.substr(5) : ''} → ${s.checkOut ? s.checkOut.substr(5) : ''} (${s.pax} PAX)</div><div class="text-slate-300 mt-0.5">Rooms: ${getRooms(s).filter(Boolean).join(', ') || 'Unassigned'}</div>`;
    if (s.bookedType) ttHtml += `<div class="text-slate-300 mt-0.5">Booked: ${s.bookedType}</div>`;
    ttHtml += `<div class="text-slate-300 mt-0.5">Src: ${(s.source || 'other').toUpperCase()}</div>`;
    if (tags.length > 0) ttHtml += `<div class="mt-1 pt-1 border-t border-slate-600 text-yellow-200 text-[10px] uppercase font-bold max-w-[200px] leading-tight">${tags.join(' • ')}</div>`;
    if (s.phone || s.email) ttHtml += `<div class="mt-1 pt-1 border-t border-slate-600 text-slate-400 text-[10px] leading-tight">${s.phone || ''}<br>${s.email || ''}</div>`;

    bar.onmouseenter = () => {
        if (s.linkedId) $$('.linked-' + s.linkedId).forEach(el => el.classList.add('link-glow'));
        if (tt) { tt.innerHTML = ttHtml; tt.style.display = 'block'; }
    };
    bar.onmousemove = e => {
        if (!tt) return;
        tt.style.left = (e.clientX + 235 > window.innerWidth ? e.clientX - 235 : e.clientX + 15) + 'px';
        tt.style.top = (e.clientY + 165 > window.innerHeight ? e.clientY - 165 : e.clientY + 15) + 'px';
    };
    bar.onmouseleave = () => {
        if (s.linkedId) $$('.linked-' + s.linkedId).forEach(el => el.classList.remove('link-glow'));
        if (tt) tt.style.display = 'none';
    };
    bar.onclick = e => {
        e.stopPropagation();
        if (tt) tt.style.display = 'none';
        if (window.editStaff) window.editStaff(s.id);
    };

    return bar;
};
