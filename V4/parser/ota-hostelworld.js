// ==========================================================================
// parser/ota-hostelworld.js - Hostelworld Extranet & Email Normalizer
// Wild & Wandering Property Management System
// ==========================================================================

import { parseFlexibleDate } from './parser-engine.js';

const HW_MONTHS = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12'
};

function parseHwDate(raw) {
    if (!raw) return '';
    const clean = String(raw).trim();
    // Matches "17th Nov ´26", "17th Nov '26", "17 Nov 2026"
    const m = clean.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s*[´'’`′]?\s*(\d{2,4})$/i);
    if (m) {
        const day = m[1].padStart(2, '0');
        const mon = HW_MONTHS[m[2].toLowerCase()];
        if (mon) {
            const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
            return `${yr}-${mon}-${day}`;
        }
    }
    return parseFlexibleDate(clean);
}

function addDaysYMD(ymd, days) {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
    return dt.toISOString().split('T')[0];
}

function parseMoneyAfterLabel(lines, labelRegex, lookahead = 3) {
    const idx = lines.findIndex(l => labelRegex.test(l));
    if (idx === -1) return 0;
    for (let i = idx + 1; i <= Math.min(lines.length - 1, idx + lookahead); i++) {
        const m = lines[i].match(/^(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{1,2})?)$/i);
        if (m) return parseFloat(m[1].replace(/,/g, '')) || 0;
    }
    return 0;
}

export function parseHostelworld(rawText) {
    if (!rawText) return null;
    const text = rawText.replace(/\r/g, '');

    // Signature Check
    const isHw = /hostelworld/i.test(text) || /hw\s*booking\s*ref/i.test(text) || /reference\s*number/i.test(text);
    if (!isHw) return null;

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // 1. Booking Reference Number (e.g. 339615-581112077)
    let bookId = '';
    let refLineIdx = -1;
    const refLabelIdx = lines.findIndex(l => /^reference(?:\s*(?:number|id|code))?$/i.test(l));
    if (refLabelIdx !== -1 && lines[refLabelIdx + 1] && /^[0-9]{5,8}-[0-9]{6,12}$/.test(lines[refLabelIdx + 1])) {
        refLineIdx = refLabelIdx + 1;
        bookId = lines[refLineIdx];
    } else {
        const inlineRef = text.match(/(?:reference\s*(?:number|id|code)|hw\s*ref|booking\s*ref)[\s:#]*([0-9]{5,8}-[0-9]{6,12})/i) ||
                          text.match(/\b([0-9]{5,8}-[0-9]{6,12})\b/);
        if (inlineRef) {
            bookId = inlineRef[1].trim();
            refLineIdx = lines.findIndex(l => l.includes(bookId));
        }
    }

    // 2. Guest Name & 3. Country (Extranet lines right below Reference ID, with email label fallback)
    let firstName = '';
    let lastName = 'GUEST';
    let country = '';

    if (refLineIdx !== -1 && lines[refLineIdx + 1] && !lines[refLineIdx + 1].includes('@')) {
        const fullName = lines[refLineIdx + 1].replace(/\s+/g, ' ').trim();
        const parts = fullName.split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || 'GUEST';

        const nextLine = lines[refLineIdx + 2] || '';
        if (nextLine && !nextLine.includes('@') && !/^\+?\d+$/.test(nextLine) && !/^(booked|arriving)$/i.test(nextLine)) {
            country = nextLine.trim();
        }
    } else {
        const nameMatch = text.match(/(?:lead\s*guest|guest\s*name|name)[\s:#]*([A-Za-z\s\.\-\'\`]+)(?:\n|$)/i) ||
                          text.match(/booked\s*by[\s:#]*([A-Za-z\s\.\-\'\`]+)(?:\n|$)/i);
        if (nameMatch) {
            const parts = nameMatch[1].trim().replace(/\s+/g, ' ').split(' ');
            firstName = parts[0] || '';
            lastName = parts.slice(1).join(' ') || 'GUEST';
        }
        const countryMatch = text.match(/(?:nationality|country|residence)[\s:#]*([A-Za-z\s\-]+)(?:\n|$)/i);
        if (countryMatch) country = countryMatch[1].trim();
    }

    // 4. Email & Phone
    let email = '';
    let phone = '';
    const emailLineIdx = lines.findIndex(l => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(l));
    if (emailLineIdx !== -1) {
        email = lines[emailLineIdx];
        const phoneCandidate = lines[emailLineIdx + 1] || '';
        if (/^\+?\d[\d\s\-()]{6,20}$/.test(phoneCandidate) && !/night/i.test(phoneCandidate)) {
            phone = phoneCandidate.trim();
        }
    } else {
        const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) email = emailMatch[1].trim();
        const phoneMatch = text.match(/(\+\d[\d\s\-\(\)]{7,20})/);
        if (phoneMatch) phone = phoneMatch[1].trim();
    }

    // 5. Nights & Pax
    let nights = 1;
    let pax = 1;
    const nightLineIdx = lines.findIndex(l => /^(\d+)\s*nights?$/i.test(l));
    if (nightLineIdx !== -1) {
        nights = parseInt(lines[nightLineIdx].match(/^(\d+)/)[1], 10) || 1;
        const prevLine = lines[nightLineIdx - 1] || '';
        if (/^\d+$/.test(prevLine)) {
            pax = parseInt(prevLine, 10) || 1;
        }
    } else {
        const paxMatch = text.match(/(?:number\s*of\s*guests|guests|pax|persons?)[\s:#]*(\d+)/i) ||
                         text.match(/(\d+)\s*guests?\b/i);
        if (paxMatch) pax = parseInt(paxMatch[1], 10) || 1;
    }

    // 6. Booked Date, Check-In & Check-Out
    let bookDate = '';
    const bookedIdx = lines.findIndex(l => /^booked(?:\s*on|\s*date)?$/i.test(l));
    if (bookedIdx !== -1 && lines[bookedIdx + 1]) {
        bookDate = parseHwDate(lines[bookedIdx + 1]);
    } else {
        const bMatch = text.match(/(?:booked\s*on|booking\s*date|received)[\s:#]*([^\n\r]+)/i);
        if (bMatch) bookDate = parseHwDate(bMatch[1]);
    }

    let checkIn = '';
    const arrIdx = lines.findIndex(l => /^(?:arriving|arrival|check-in)$/i.test(l));
    if (arrIdx !== -1 && lines[arrIdx + 1]) {
        checkIn = parseHwDate(lines[arrIdx + 1]);
    } else {
        const inMatch = text.match(/(?:check-in|arrival|arriving)[\s:#]*([^\n\r]+)/i);
        if (inMatch) checkIn = parseHwDate(inMatch[1]);
    }

    let checkOut = '';
    const depIdx = lines.findIndex(l => /^(?:departing|departure|check-out)$/i.test(l));
    if (depIdx !== -1 && lines[depIdx + 1]) {
        checkOut = parseHwDate(lines[depIdx + 1]);
    } else {
        const outMatch = text.match(/(?:check-out|departure|departing)[\s:#]*([^\n\r]+)/i);
        if (outMatch) checkOut = parseHwDate(outMatch[1]);
    }
    if (!checkOut && checkIn) {
        checkOut = addDaysYMD(checkIn, nights);
    }
    if (checkIn && checkOut) {
        const ms = new Date(checkOut) - new Date(checkIn);
        nights = Math.max(1, Math.round(ms / 86400000)) || nights;
    }

    // 7. Room Category, Unit Count & Refundability (from Room Details table)
    let bookedType = '';
    let refundability = 'unknown';
    let unitCount = 1;

    const roomDetailsIdx = lines.findIndex(l => /^room\s*details$/i.test(l));
    const bookingPriceIdx = lines.findIndex(l => /^booking\s*price$/i.test(l));
    if (roomDetailsIdx !== -1) {
        const endIdx = bookingPriceIdx > roomDetailsIdx ? bookingPriceIdx : lines.length;
        const roomRows = [];
        for (let i = roomDetailsIdx + 1; i < endIdx; i++) {
            const cells = lines[i].split('\t').map(c => c.trim()).filter(Boolean);
            const rowDate = parseHwDate(cells[0]);
            if (!rowDate) continue;

            if (cells.length >= 2 && !/^(date|room\s*type|persons|breakfast|price)$/i.test(cells[1])) {
                roomRows.push({
                    date: rowDate,
                    rawTitle: cells[1],
                    persons: /^\d+$/.test(cells[2] || '') ? parseInt(cells[2], 10) : 0
                });
            } else if (lines[i + 1] && !/^(date|room\s*type|persons|breakfast|price)$/i.test(lines[i + 1])) {
                roomRows.push({
                    date: rowDate,
                    rawTitle: lines[i + 1].split('\t')[0].trim(),
                    persons: /^\d+$/.test(lines[i + 2] || '') ? parseInt(lines[i + 2], 10) : 0
                });
            }
        }

        if (roomRows.length > 0) {
            const firstTitle = roomRows[0].rawTitle;
            if (/non-?refundable/i.test(firstTitle)) refundability = 'non-ref';
            else if (/\b(refundable|standard\s*rate|flexible|free\s*cancellation)\b/i.test(firstTitle)) refundability = 'ref';

            bookedType = firstTitle
                .replace(/\s*[-–—]?\s*\b(?:non-?refundable|refundable|free\s*cancellation|flexible(?:\s*rate)?|standard\s*rate)\b\s*$/i, '')
                .trim();

            const firstDateRows = roomRows.filter(r => r.date === roomRows[0].date);
            const rowPersons = firstDateRows.reduce((sum, r) => sum + (r.persons || 0), 0);
            unitCount = Math.max(1, firstDateRows.length, rowPersons || pax);
        }
    }

    if (!bookedType) {
        const roomMatch = text.match(/(?:room\s*type|accommodation)[\s:#]+([^\n\r]+)/i);
        if (roomMatch && !/^persons$/i.test(roomMatch[1].trim())) {
            bookedType = roomMatch[1]
                .replace(/\s*[-–—]?\s*\b(?:non-?refundable|refundable|free\s*cancellation|flexible(?:\s*rate)?|standard\s*rate)\b\s*$/i, '')
                .trim();
        }
        unitCount = Math.max(1, pax);
    }
    if (refundability === 'unknown') {
        if (/non-?refundable/i.test(text)) refundability = 'non-ref';
        else if (/\bfree\s*cancellation|flexible\b/i.test(text)) refundability = 'ref';
    }

    // 8. Pricing & Deposit Reconciliation
    let totalPrice = parseMoneyAfterLabel(lines, /^subtotal$/i, 2) ||
                     parseMoneyAfterLabel(lines, /^booking\s*price$/i, 3);
    if (!totalPrice) {
        const totalMatch = text.match(/(?:total\s*price|total\s*amount|booking\s*value)[\s:#]*(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
        if (totalMatch) totalPrice = parseFloat(totalMatch[1].replace(/,/g, '')) || 0;
    }

    let depositPaid = parseMoneyAfterLabel(lines, /^hostelworld\s*deposit$/i, 2) ||
                      parseMoneyAfterLabel(lines, /^paid\s*online$/i, 3);
    if (!depositPaid) {
        const depositMatch = text.match(/(?:deposit\s*paid|deposit\s*amount)[\s:#]*(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
        if (depositMatch) depositPaid = parseFloat(depositMatch[1].replace(/,/g, '')) || 0;
    }

    let balanceDue = parseMoneyAfterLabel(lines, /^to\s*be\s*paid\s*now$/i, 3) ||
                     parseMoneyAfterLabel(lines, /^can\s*be\s*charged\s*now$/i, 2);
    if (!balanceDue) {
        const dueMatch = text.match(/(?:amount\s*due\s*on\s*arrival|balance\s*due|due\s*on\s*arrival)[\s:#]*(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
        if (dueMatch) balanceDue = parseFloat(dueMatch[1].replace(/,/g, '')) || 0;
    }

    if (totalPrice === 0 && (depositPaid > 0 || balanceDue > 0)) {
        totalPrice = Number((depositPaid + balanceDue).toFixed(2));
    }
    if (depositPaid === 0 && totalPrice > 0 && balanceDue > 0) {
        depositPaid = Number((totalPrice - balanceDue).toFixed(2));
    }

    const explicitNet = balanceDue > 0 ? balanceDue : Number((totalPrice - depositPaid).toFixed(2));

    // 9. Payments: Hostelworld Deposit (hw-kp)
    const payments = [];
    if (depositPaid > 0 && checkIn) {
        payments.push({
            date: checkIn,
            amt: depositPaid,
            method: 'hw-kp'
        });
    }

    // 10. Special Requests
    let specialRequests = '';
    const reqMatch = text.match(/(?:special\s*requests?|notes?|remarks?)[\s:#]*\n?([^\n\r]+)/i);
    if (reqMatch && !/^(none|standard|it\s*is\s*the\s*property)/i.test(reqMatch[1].trim())) {
        specialRequests = reqMatch[1].trim();
    }

    const avgNightly = totalPrice > 0 ? (totalPrice / nights).toFixed(2) : '0.00';

    // Standardized Note Block
    const noteLines = [
        `--- ORIGINAL OTA BOOKING ---`,
        `Source: HOSTELWORLD`,
        `Book ID: ${bookId}`,
        `Dates: ${checkIn || '--'} to ${checkOut || '--'} (${nights} Night${nights > 1 ? 's' : ''})`,
        `Booked: ${bookedType || '--'}`,
        `Units (Rooms/Beds): ${unitCount}`,
        `Pax: ${pax}`,
        `Total: ฿${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `Avg Nightly: ฿${parseFloat(avgNightly).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `----------------------------`,
        `• Policy: ${refundability.toUpperCase()}`
    ];
    if (country) noteLines.push(`• Nationality: ${country}`);
    if (depositPaid > 0) noteLines.push(`• Deposit Paid (HW-KP): ฿${depositPaid.toFixed(2)}`);
    if (balanceDue > 0) noteLines.push(`• Arrival Due: ฿${balanceDue.toFixed(2)}`);
    if (specialRequests) noteLines.push(`• Special Request: ${specialRequests}`);

    return {
        source: 'hostelworld',
        bookId,
        firstName: firstName.toUpperCase(),
        lastName: lastName.toUpperCase(),
        country,
        pax,
        unitCount,
        checkIn,
        checkOut,
        bookDate,
        totalPrice,
        netPrice: explicitNet,
        netVerified: true,
        nightlyRates: [],
        isAverageRate: true,
        bookedType,
        phone,
        email,
        isProxyEmail: false,
        refundability,
        payments,
        status: 'future',
        notes: noteLines.join('\n')
    };
}
