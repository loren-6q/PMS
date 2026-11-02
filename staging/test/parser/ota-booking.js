// ==========================================================================
// parser/ota-booking.js - Booking.com Extranet & Email Regex Engine
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD } from '../core/dates.js';

// --- Helper: Clean Currency String to Float ---
const cM = s => Number(parseFloat((s || '').replace(/[^0-9.-]+/g, "")).toFixed(2)) || 0;

// --- Helper: Flexible Date String to YYYY-MM-DD Normalizer ---
const fD = dS => {
    if (!dS) return '';
    let clean = dS.replace(/´/g, '').replace(/'/g, '').replace(/,/g, '').replace(/(st|nd|rd|th)\b/gi, '').trim();
    const mths = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    let parts = clean.split(/\s+/);
    let d = 1, m = '01', y = new Date().getFullYear();
    parts.forEach(p => {
        let l = p.toLowerCase().substring(0, 3);
        if (mths[l]) m = mths[l];
        else if (/^\d{1,2}$/.test(p)) d = parseInt(p, 10);
        else if (/^\d{2}$/.test(p) && p.length === 2) y = 2000 + parseInt(p, 10);
        else if (/^\d{4}$/.test(p)) y = parseInt(p, 10);
    });
    return `${y}-${m}-${String(d).padStart(2, '0')}`;
};

// --------------------------------------------------------------------------
// 1. BOOKING.COM DETECTOR & PARSER ENGINE
// --------------------------------------------------------------------------

// --- Detect if Raw Text Originates from Booking.com ---
export const isBookingComText = text => {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return (lower.includes('booking.com') || lower.includes('commission and charges') || lower.includes('guest.booking.com')) && 
           !lower.includes('prudential tower');
};

// --- Extract Structured Booking Data from Booking.com Text ---
export const parseBookingCom = text => {
    if (!text) return null;
    const l = text.split(/[\n\r]+/).map(x => x.trim().replace(/\xa0/g, ' ')).filter(Boolean);
    const tLow = text.toLowerCase();

    const gL = kws => {
        let i = l.findIndex(x => kws.some(k => x.toLowerCase() === k.toLowerCase() || x.toLowerCase().startsWith(k.toLowerCase())));
        if (i > -1) {
            let m = kws.find(k => l[i].toLowerCase().startsWith(k.toLowerCase()));
            let rem = l[i].substring(m.length).trim();
            return rem ? rem : (i + 1 < l.length ? l[i + 1] : "");
        }
        return "";
    };

    const ex = reg => { const m = text.match(reg); return m ? m[1].trim() : ''; };

    const cI = fD(gL(['Check-in']));
    const cO = fD(gL(['Check-out']));
    const bD = fD(gL(['Received', 'Booked on']));
    const bId = gL(['Booking number:']) || ex(/\b(\d{10})\b/);
    const pax = parseInt(gL(['Total guests:']), 10) || 1;
    const tot = cM(gL(['Total price']));
    const comm = cM(gL(['Commission and charges:']));

    let gN = '', em = '', ph = '', cCode = '';
    let gIdx = l.findIndex(x => x.toLowerCase().startsWith('guest name:'));
    if (gIdx > -1) {
        let rem = l[gIdx].substring('guest name:'.length).trim();
        if (rem) {
            gN = rem;
            em = ex(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
            ph = ex(/(\+[\d\s]+)/);
            let ccM = l[gIdx].replace(em, '').replace(ph, '').match(/\s+([a-zA-Z]{2})$/);
            if (ccM) cCode = ccM[1].toUpperCase();
            gN = gN.replace(em, '').replace(ph, '').replace(/\s+[a-zA-Z]{2}$/, '').trim();
        } else {
            gN = l[gIdx + 1] || '';
            for (let i = gIdx + 2; i < gIdx + 6; i++) {
                if (!l[i] || l[i].includes('Preferred language') || l[i].includes('Channel:')) break;
                if (l[i].length === 2 && !cCode) cCode = l[i].toUpperCase();
                else if (l[i].includes('@') && !em) em = l[i];
                else if (l[i].includes('+') && !ph) ph = l[i];
            }
        }
    }

    let bTypes = [];
    for (let i = 0; i < l.length; i++) {
        if (/^\s*(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s+(?:[A-Za-z]{3}\s+\d{1,2}|\d{1,2}\s+[A-Za-z]{3})/i.test(l[i])) {
            if (i >= 2 && /(?:THB|฿|\$|€|£|[A-Z]{3})[\s]*[\d,.]+/i.test(l[i - 1])) {
                let rLine = l[i - 2].replace(/^\d+\s*(?:x\s*)?/, '').trim();
                bTypes.push(rLine);
            }
        }
    }

    if (bTypes.length === 0) {
        let pIdx = l.findIndex(x => x.toLowerCase().endsWith('cancellation policy.') || x.toLowerCase().includes('bank transfer payout'));
        if (pIdx > -1 && pIdx + 1 < l.length) bTypes.push(l[pIdx + 1].trim());
    }

    const bT = bTypes.join(' + ');

    let ref = 'unknown';
    if (tLow.includes('free of charge until') || tLow.includes('free cancellation')) ref = 'ref';
    else if (tLow.includes('cancel at any time') || tLow.includes('cancel anytime') || tLow.includes('non-refundable') || tLow.includes('charged the total price')) ref = 'non-ref';

    let upgrade = tLow.includes('free upgrade') ? 'free' : 'none';
    let status = /\b(?:status:\s*canceled|status:\s*cancelled|booking canceled|booking cancelled)\b/i.test(text) ? 'cancelled' : 'future';

    let aN = [];
    l.forEach(x => {
        if (x.toUpperCase().includes('BED PREFERENCE:') || x.toUpperCase().includes('BED-PREFERENCE REQUEST:')) aN.push(x.replace(/Reply$/i, '').trim());
    });

    let cIdx = l.findIndex(x => x.toLowerCase() === 'conversation with guest');
    if (cIdx > -1) {
        let mLines = [];
        for (let i = cIdx + 1; i < l.length; i++) {
            let lLow = l[i].toLowerCase();
            if (lLow.includes('protect your account security') || lLow === 'images' || lLow === 'templates' || lLow.includes('important information about this guest') || lLow === 'cancellation' || lLow === 'no messages' || lLow.includes('conversations with your guests will appear')) break;
            if (/^(?:Today|Yesterday|[A-Za-z]+,?\s*\d{1,2}\s*[A-Za-z]*),\s*\d{1,2}:\d{2}/i.test(l[i]) || /^\d{1,2}:\d{2}$/.test(l[i]) || lLow === 'reply') continue;
            if (lLow.includes('having a fantastic experience') || lLow.includes('hook you up for an extra night') || lLow.includes('sent automatically based on your messaging preferences') || lLow.includes('swims team') || lLow.includes('automatically translated')) continue;
            if (l[i].trim()) mLines.push(l[i].trim());
        }
        if (mLines.length > 0) aN.push("GUEST MSG:\n" + mLines.join("\n"));
    }

    let hBdcP = tLow.includes('payment is facilitated') || tLow.includes('booking.com will collect');

    let lN = gN.trim(), fN = "";
    if (gN.includes(',')) {
        const p = gN.split(',');
        lN = p[0].trim();
        fN = p.slice(1).join(',').trim();
    } else {
        const p = gN.split(/\s+/);
        fN = p[0]?.trim() || '';
        lN = p.length > 1 ? p.slice(1).join(' ').trim() : '';
    }

    let country = cCode;
    if (cCode.length === 2) {
        try { country = new Intl.DisplayNames(['en'], { type: 'region' }).of(cCode.toUpperCase()) || cCode; } catch (e) {}
    }

    const payments = [];
    if (comm > 0) {
        payments.push({ date: cI || new Date().toISOString().split('T')[0], amt: comm, method: 'bdc-kp' });
    }
    if (hBdcP && (tot - comm) > 0) {
        payments.push({ date: cI || new Date().toISOString().split('T')[0], amt: Number((tot - comm).toFixed(2)), method: 'bdc-pay' });
    }

    return {
        source: 'booking.com',
        bookId: bId,
        firstName: fN.toUpperCase(),
        lastName: lN.toUpperCase(),
        checkIn: cI,
        checkOut: cO,
        bookDate: bD,
        pax,
        bookedType: bT.toUpperCase(),
        totalPrice: tot,
        netPrice: Math.max(0, tot - comm),
        email: em,
        phone: ph,
        country,
        refundability: ref,
        upgrade,
        status,
        payments,
        notes: aN.join('\n\n')
    };
};
