// ==========================================================================
// parser/ota-hostelworld.js - Hostelworld Clipboard & Email Regex Engine
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
// 1. HOSTELWORLD DETECTOR & PARSER ENGINE
// --------------------------------------------------------------------------

// --- Detect if Raw Text Originates from Hostelworld ---
export const isHostelworldText = text => {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return lower.includes('hostelworld.com') || 
           lower.includes('hostelworld') || 
           lower.includes('hostelbookers') || 
           lower.includes('339615-') || 
           /\b\d{5,8}-\d{6,10}\b/.test(text);
};

// --- Extract Structured Booking Data from Hostelworld Text ---
export const parseHostelworld = text => {
    if (!text) return null;
    const lines = text.split(/[\n\r]+/).map(x => x.trim()).filter(Boolean);
    const tLow = text.toLowerCase();

    let bId = '', gN = '', cCode = '', em = '', ph = '', bD = '', cI = '', cO = '', bT = '';
    let pax = 1, tot = 0, comm = 0, nights = 1;

    let refIdx = lines.findIndex(l => l.includes('339615-') || /\b\d+-\d+\b/.test(l));
    if (refIdx > -1) {
        const m = lines[refIdx].match(/(\d+-\d+)/);
        if (m) bId = m[1];
        gN = lines[refIdx + 1] || '';
        cCode = lines[refIdx + 2] || '';

        for (let i = refIdx + 3; i < refIdx + 8; i++) {
            if (!lines[i] || lines[i] === 'Booked' || lines[i].includes('Night')) break;
            if (lines[i].includes('@') && !em) em = lines[i];
            else if (/^[\d\+\s]+$/.test(lines[i]) && lines[i].length >= 8 && !lines[i].includes('-')) ph = lines[i];
        }
    }

    let nIdx = lines.findIndex(l => l.endsWith('Night') || l.endsWith('Nights'));
    if (nIdx > -1) {
        nights = parseInt(lines[nIdx], 10) || 1;
        let possiblePax = parseInt(lines[nIdx - 1], 10);
        if (!isNaN(possiblePax) && possiblePax > 0 && possiblePax < 50) pax = possiblePax;
    }

    let bIdx = lines.findIndex(l => l === 'Booked');
    if (bIdx > -1) bD = fD(lines[bIdx + 1]);

    let aIdx = lines.findIndex(l => l === 'Arriving');
    if (aIdx > -1) {
        cI = fD(lines[aIdx + 1]);
        if (cI && nights) {
            let d = new Date(cI + "T12:00:00Z");
            d.setUTCDate(d.getUTCDate() + nights);
            cO = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        }
    }

    let subIdx = lines.findIndex(l => l === 'Subtotal');
    if (subIdx > -1) tot = cM(lines[subIdx + 1]);

    let depIdx = lines.findIndex(l => l === 'Hostelworld Deposit');
    if (depIdx > -1) comm = cM(lines[depIdx + 1]);

    let rDetIdx = lines.findIndex(l => l === 'Room Details');
    if (rDetIdx > -1) {
        for (let i = rDetIdx; i < lines.length; i++) {
            if (lines[i].includes('Dorm') || lines[i].includes('Room') || lines[i].includes('Bungalow') || lines[i].includes('Bed')) {
                bT = lines[i].replace(/Non-refundable/i, '').replace(/Promo/i, '').trim();
                break;
            }
        }
    }

    let isNonRef = tLow.includes('non-refundable');
    let daysOut = 999;
    if (cI && bD) daysOut = (parseYMD(cI) - parseYMD(bD)) / 86400000;
    const ref = (isNonRef || daysOut < 7) ? 'non-ref' : 'ref';

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
        payments.push({
            date: cI || new Date().toISOString().split('T')[0],
            amt: comm,
            method: 'hw-kp'
        });
    }

    return {
        source: 'hostelworld',
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
        status: 'future',
        payments,
        notes: `[HOSTELWORLD IMPORT: ฿${tot} from ${cI} to ${cO}]`
    };
};
