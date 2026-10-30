// ==========================================================================
// parser/parser-engine.js - Master Clipboard Parser & Router
// Wild & Wandering Property Management System
// ==========================================================================

import { parseHostelworld } from './ota-hostelworld.js';
import { parseBookingCom } from './ota-booking.js';
import { parseAgoda } from './ota-agoda.js';
import { parseExpedia } from './ota-expedia.js';
import { parseAirbnb } from './ota-airbnb.js';

const MONTH_MAP = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

function parseOtaDateToYMD(input, defaultYear) {
    if (!input) return "";
    const str = String(input).trim();
    if (!str) return "";

    const curYear = defaultYear || (new Date()).getFullYear();

    const isoMatch = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;

    const dmyMatch = str.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;

    const dmyWordMatch = str.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s,]+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:[\s,]+(\d{4}))?\b/i);
    if (dmyWordMatch) {
        const mKey = dmyWordMatch[2].toLowerCase().slice(0, 3);
        const mNum = MONTH_MAP[mKey];
        if (mNum) return `${dmyWordMatch[3] || curYear}-${mNum}-${dmyWordMatch[1].padStart(2, '0')}`;
    }

    const mdyMatch = str.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,]+(\d{1,2})(?:st|nd|rd|th)?\b(?:[\s,]+(\d{4}))?/i);
    if (mdyMatch) {
        const mKey = mdyMatch[1].toLowerCase().slice(0, 3);
        const mNum = MONTH_MAP[mKey];
        if (mNum) return `${mdyMatch[3] || curYear}-${mNum}-${mdyMatch[2].padStart(2, '0')}`;
    }

    return "";
}

function safeLocalYmd() {
    const d = new Date();
    const o = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
    return o.toISOString().split('T')[0];
}

export function extractBookingData(rawText) {
    const normalized = (rawText || '').replace(/\u00A0/g, ' ');
    const rawLines = normalized.split(/\r?\n/).map(l => l.trim());
    const lines = rawLines.filter(Boolean); 
    const rawLower = normalized.toLowerCase();

    const isAgodaPartner = /prudential\s*tower|19\s*cecil|049712/i.test(rawLower);

    let s = {};
    if (rawLower.includes('hostelworld')) {
        s = parseHostelworld(lines, normalized, parseOtaDateToYMD, safeLocalYmd);
    } else if (rawLower.includes('booking.com')) {
        s = parseBookingCom(lines, normalized, parseOtaDateToYMD, safeLocalYmd);
        if (isAgodaPartner) s.source = 'agoda';
    } else if (rawLower.includes('expedia') || rawLower.includes('expediapartnercentral')) {
        s = parseExpedia(lines, normalized, parseOtaDateToYMD, safeLocalYmd);
    } else if (rawLower.includes('agoda') || isAgodaPartner) {
        s = parseAgoda(lines, normalized, parseOtaDateToYMD, safeLocalYmd);
    } else if (rawLower.includes('airbnb')) {
        s = parseAirbnb(lines, normalized, parseOtaDateToYMD, safeLocalYmd);
    } else {
        s = { source: 'other', pax: 1, payments: [], units: 1, rooms: [] };
    }

    // Universal Fallbacks
    if (!s.checkIn) {
        const arrMatch = normalized.match(/Arrival\s*Date\s*:?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i);
        if (arrMatch) s.checkIn = parseOtaDateToYMD(arrMatch[1]);
    }
    if (!s.checkOut) {
        const depMatch = normalized.match(/Departure\s*Date\s*:?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i);
        if (depMatch) s.checkOut = parseOtaDateToYMD(depMatch[1]);
    }

    // Dorm Auto-Correction
    const isDorm = /dorm|bed|bunk/i.test(s.bookedType || '');
    if (isDorm && (s.pax > 1) && (!s.units || s.units <= 1)) s.units = s.pax;
    if (isDorm && (s.units > (s.pax || 1))) s.pax = s.units;

    if (s.bookedType) {
        const cleanType = s.bookedType.replace(/^\d+\s*(?:x|\*|\s)\s*/i, '').trim().toUpperCase();
        if (s.units > 1 && !s.bookedType.includes(' + ')) {
            s.bookedType = Array(s.units).fill(cleanType).join(' + ');
        } else if (!s.bookedType.includes(' + ')) {
            s.bookedType = cleanType;
        }
    }

    // Refundability Guard
    const isNonRef = rawLower.includes('non-refundable') || rawLower.includes('charged the total price');
    if (isNonRef) s.refundability = 'non-ref';
    else if (!s.refundability) s.refundability = 'ref';
    
    if (s.checkIn) {
        const p = s.checkIn.split('-');
        if (p.length === 3) {
            const ciDate = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
            const today = new Date(); today.setHours(0, 0, 0, 0); 
            if ((ciDate.getTime() - today.getTime()) / 86400000 <= 7) s.refundability = 'non-ref';
        }
    }

    // Generate Human-Readable Summary
    let nights = 1, avgNightly = 0;
    if (s.checkIn && s.checkOut) {
        const ms = new Date(s.checkOut).getTime() - new Date(s.checkIn).getTime();
        nights = Math.max(1, Math.round(ms / 86400000));
    }
    if (s.totalPrice) avgNightly = (s.totalPrice / nights).toFixed(2);

    let summary = `--- ORIGINAL OTA BOOKING ---\nSource: ${s.source.toUpperCase()}\nBook ID: ${s.bookId || 'N/A'}\nDates: ${s.checkIn || '??'} to ${s.checkOut || '??'} (${nights} Nts)\nBooked: ${s.bookedType || 'Unknown'}\nUnits: ${s.units || 1}\nPax: ${s.pax || 1}\nTotal: ฿${Number(s.totalPrice||0).toFixed(2)}\nAvg Nightly: ฿${avgNightly}\n----------------------------\n`;

    return { s, summary };
}

/**
 * UI Bridge: Reads clipboard textarea, routes to parser, populates PMS folio form.
 */
export async function processAndImportClipboard(rawTextOverride = null) {
    let text = rawTextOverride;
    if (!text) {
        const ta = document.getElementById('extract-paste') || document.getElementById('email-paste') || document.getElementById('email-textarea');
        text = ta ? ta.value.trim() : '';
    }

    if (!text) {
        if (typeof window.customAlert !== 'undefined') window.customAlert("Notification", "Please paste booking text first.");
        else alert("Please paste text first.");
        return;
    }

    const { s, summary } = extractBookingData(text);

    if (typeof window.closeExtractModal === 'function') window.closeExtractModal();
    if (typeof window.closeModal === 'function') window.closeModal('email-modal');

    if (typeof window.getStaffList === 'function' || window.staff) {
        const staffList = typeof window.getStaffList === 'function' ? window.getStaffList() : window.staff;
        const cleanId = String(s.bookId || '').trim();
        const existing = staffList.find(b => {
            if (b.status === 'cancelled') return false;
            if (b.bookId && String(b.bookId).trim() === cleanId) return true;
            if (b.notes && (b.notes.includes(cleanId) || b.notes.includes(`MERGED FROM ID: ${cleanId}`))) return true;
            return false;
        });

        if (existing) {
            if (typeof window.customAlert !== 'undefined') window.customAlert("Duplicate Blocked", `Booking ID ${s.bookId} is already in the system.\n\nOpening existing record now.`);
            if (typeof window.openGuestModal === 'function') window.openGuestModal(existing);
            else if (typeof window.editStaff === 'function') window.editStaff(existing.id);
            return;
        }
    }

    s.notes = (summary + (s.notes || '')).trim();

    if (typeof window.populateFolioForm === 'function') window.populateFolioForm(s);
    else if (typeof window.populateStaffForm === 'function') window.populateStaffForm(s);

    if (typeof window.autoSuggestRoom === 'function') window.autoSuggestRoom(s.bookedType);
}

if (typeof window !== 'undefined') {
    window.processAndImportClipboard = processAndImportClipboard;
}
