// ==========================================================================
// parser/ota-expedia.js - Expedia Partner Central Parser
// Wild & Wandering Property Management System
// ==========================================================================

import { parseFlexibleDate } from './parser-engine.js';

export function parseExpedia(rawText) {
    if (!rawText) return null;
    const text = rawText.replace(/\r/g, '');

    // 1. Signature Check
    const isExpedia = /expedia/i.test(text) || /itinerary\s*#?[\s:#]*[0-9]{10,16}/i.test(text);
    if (!isExpedia) return null;

    // 2. Itinerary ID
    const idMatch = text.match(/(?:itinerary\s*#?|booking\s*id)[\s:#]*([0-9]{10,16})/i);
    const bookId = idMatch ? idMatch[1].trim() : '';

    // 3. Guest Name
    let firstName = '';
    let lastName = 'GUEST';
    const nameMatch = text.match(/(?:primary\s*guest|guest\s*name|guest)[\s:#]*([A-Za-z\s\.\-\'\`]+)(?:\n|$)/i);
    if (nameMatch) {
        const full = nameMatch[1].trim().replace(/\s+/g, ' ');
        const parts = full.split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || 'GUEST';
    }

    // 4. Country / Nationality
    let country = '';
    const countryMatch = text.match(/(?:country|nationality|residence)[\s:#]*([A-Za-z\s\-]+)(?:\n|$)/i);
    if (countryMatch) {
        country = countryMatch[1].trim().toUpperCase();
    }

    // 5. Dates
    let checkIn = '';
    let checkOut = '';
    const inMatch = text.match(/(?:check-in|arrival)[\s:#]*([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i);
    const outMatch = text.match(/(?:check-out|departure)[\s:#]*([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i);
    if (inMatch) checkIn = parseFlexibleDate(inMatch[1]);
    if (outMatch) checkOut = parseFlexibleDate(outMatch[1]);

    // 6. Booking Date
    let bookDate = '';
    const bookDateMatch = text.match(/(?:booked\s*on|booking\s*date)[\s:#]*([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i);
    if (bookDateMatch) bookDate = parseFlexibleDate(bookDateMatch[1]);

    // 7. Unit Count & Pax
    let pax = 1;
    let unitCount = 1;

    const paxMatch = text.match(/(\d+)\s*(?:adult|guest|person)/i) ||
                     text.match(/(?:guests|adults)[\s:#]*(\d+)/i);
    if (paxMatch) pax = parseInt(paxMatch[1], 10) || 1;

    const unitMatch = text.match(/(\d+)\s*(?:room|rooms|unit|units)\b/i);
    if (unitMatch) unitCount = parseInt(unitMatch[1], 10) || 1;

    // 8. Total Price & Net Revenue
    let totalPrice = 0;
    let explicitNet = null;

    const priceMatch = text.match(/(?:total\s*booking\s*amount|total\s*price|total)[\s:#]*(?:[A-Z]{3}|฿|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (priceMatch) {
        totalPrice = parseFloat(priceMatch[1].replace(/,/g, '')) || 0;
    }

    const netMatch = text.match(/(?:net\s*rate|hotel\s*payout|expedia\s*collect)[\s:#]*(?:[A-Z]{3}|฿|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (netMatch) {
        explicitNet = parseFloat(netMatch[1].replace(/,/g, ''));
    }

    // 9. Unit Type
    let bookedType = '';
    const roomMatch = text.match(/(?:room\s*type|room)[\s:#]*([^\n\r]+)/i);
    if (roomMatch) {
        bookedType = roomMatch[1].trim();
    }

    // 10. Refundability Policy
    let refundability = 'unknown';
    if (/non-refundable|non\s*refundable/i.test(text)) {
        refundability = 'non-ref';
    } else if (/free\s*cancellation/i.test(text)) {
        refundability = 'ref';
    }

    // 11. Payments (Expedia Collect vs Hotel Collect)
    const payments = [];
    const isExpediaCollect = /expedia\s*collect/i.test(text);
    if (isExpediaCollect && totalPrice > 0 && checkIn) {
        payments.push({
            date: checkIn,
            amt: explicitNet || totalPrice,
            method: 'expedia-pay'
        });
    }

    // 12. Contact Details
    let phone = '';
    let email = '';
    const phoneMatch = text.match(/(?:phone|tel)[\s:#]*([+\d\s\-\(\)]{8,20})/i);
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (phoneMatch) phone = phoneMatch[1].trim();
    if (emailMatch) email = emailMatch[1].trim();

    const noteLines = [
        `[EXPEDIA CONFIRMATION]`,
        `• Itinerary: ${bookId}`,
        `• Units: ${unitCount} | Pax: ${pax}`,
        `• Policy: ${refundability.toUpperCase()}`
    ];
    if (country) noteLines.push(`• Nationality: ${country}`);

    return {
        source: 'expedia',
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
        netVerified: explicitNet !== null,
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
