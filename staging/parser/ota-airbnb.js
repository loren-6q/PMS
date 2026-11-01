// ==========================================================================
// parser/ota-airbnb.js - Airbnb Confirmation Parser
// Wild & Wandering Property Management System
// ==========================================================================

import { parseFlexibleDate } from './parser-engine.js';

export function parseAirbnb(rawText) {
    if (!rawText) return null;
    const text = rawText.replace(/\r/g, '');

    // 1. Signature Check
    const isAirbnb = /airbnb/i.test(text) || /hm[a-z0-9]{8,12}/i.test(text) || /confirmation\s*code[\s:#]*[a-z0-9]{8,12}/i.test(text);
    if (!isAirbnb) return null;

    // 2. Reservation Code
    const codeMatch = text.match(/(?:confirmation\s*code|reservation\s*code)[\s:#]*([A-Z0-9]{8,12})/i) ||
                      text.match(/\b(HM[A-Z0-9]{8,10})\b/);
    const bookId = codeMatch ? codeMatch[1].trim() : '';

    // 3. Guest Name
    let firstName = '';
    let lastName = 'GUEST';
    const nameMatch = text.match(/(?:guest|entire\s*place\s*hosted\s*by|reservation\s*for)[\s:#]*([A-Za-z\s\.\-\'\`]+)(?:\n|$)/i);
    if (nameMatch) {
        const full = nameMatch[1].trim().replace(/\s+/g, ' ');
        const parts = full.split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || 'GUEST';
    }

    // 4. Country / Location
    let country = '';
    const locMatch = text.match(/(?:from|location|lives\s*in)[\s:#]*[A-Za-z\s]+,\s*([A-Za-z\s\-]+)(?:\n|$)/i);
    if (locMatch) {
        country = locMatch[1].trim().toUpperCase();
    }

    // 5. Dates
    let checkIn = '';
    let checkOut = '';

    const rangeMatch = text.match(/([A-Za-z]{3}\s+\d{1,2})\s*[\–\-\—]\s*([A-Za-z]{3}\s+\d{1,2}),?\s*(\d{4})/i);
    if (rangeMatch) {
        const year = rangeMatch[3];
        checkIn = parseFlexibleDate(`${rangeMatch[1]}, ${year}`);
        checkOut = parseFlexibleDate(`${rangeMatch[2]}, ${year}`);
    } else {
        const inMatch = text.match(/(?:check-in|arrival)[\s:#]*([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i);
        const outMatch = text.match(/(?:checkout|check-out|departure)[\s:#]*([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i);
        if (inMatch) checkIn = parseFlexibleDate(inMatch[1]);
        if (outMatch) checkOut = parseFlexibleDate(outMatch[1]);
    }

    // 6. Booking Date
    let bookDate = '';
    const bookDateMatch = text.match(/(?:booked\s*on|reservation\s*date)[\s:#]*([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i);
    if (bookDateMatch) bookDate = parseFlexibleDate(bookDateMatch[1]);

    // 7. Unit Count & Pax
    let pax = 1;
    const paxMatch = text.match(/(\d+)\s*(?:guest|adult)/i);
    if (paxMatch) pax = parseInt(paxMatch[1], 10) || 1;

    // 8. Total Payout (In Airbnb, Payout IS the Net)
    let totalPrice = 0;
    const priceMatch = text.match(/(?:total\s*payout|you\s*earn|host\s*payout|total)[\s:#]*(?:[A-Z]{3}|฿|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
                       text.match(/(?:[A-Z]{3}|฿|\$|€|£)\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (priceMatch) {
        totalPrice = parseFloat(priceMatch[1].replace(/,/g, '')) || 0;
    }

    // 9. Unit / Listing
    let bookedType = '';
    const listingMatch = text.match(/(?:listing|place)[\s:#]*([^\n\r]+)/i);
    if (listingMatch) {
        bookedType = listingMatch[1].trim();
    }

    // 10. Payments (Airbnb is 100% prepaid)
    const payments = [];
    if (totalPrice > 0 && checkIn) {
        payments.push({
            date: checkIn,
            amt: totalPrice,
            method: 'airbnb-pay'
        });
    }

    // 11. Contact Details
    let phone = '';
    const phoneMatch = text.match(/(?:phone|call|tel)[\s:#]*([+\d\s\-\(\)]{8,20})/i);
    if (phoneMatch) phone = phoneMatch[1].trim();

    const noteLines = [
        `[AIRBNB CONFIRMATION]`,
        `• Code: ${bookId}`,
        `• Pax: ${pax}`,
        `• 100% Prepaid via Airbnb Payout`
    ];
    if (!phone) noteLines.push(`• ⚠ Contact Restricted: Message via Airbnb App`);

    return {
        source: 'airbnb',
        bookId,
        firstName: firstName.toUpperCase(),
        lastName: lastName.toUpperCase(),
        country,
        pax,
        unitCount: 1,
        checkIn,
        checkOut,
        bookDate,
        totalPrice,
        netPrice: totalPrice, // Airbnb Total Payout is already net of service fee
        netVerified: true,
        bookedType,
        phone,
        email: '',
        isProxyEmail: false,
        contactRestricted: true,
        refundability: 'non-ref',
        payments,
        status: 'future',
        notes: noteLines.join('\n')
    };
}
