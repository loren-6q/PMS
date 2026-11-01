// ==========================================================================
// parser/ota-agoda.js - Agoda YCS & Confirmation Parser
// Wild & Wandering Property Management System
// ==========================================================================

import { parseFlexibleDate } from './parser-engine.js';

export function parseAgoda(rawText) {
    if (!rawText) return null;
    const text = rawText.replace(/\r/g, '');

    // 1. Signature Check
    const isAgoda = /agoda/i.test(text) || /ycs/i.test(text);
    if (!isAgoda) return null;

    // 2. Booking Reference ID
    const idMatch = text.match(/(?:booking\s*id|reference\s*no|reference)[\s:#]*([0-9]{7,12})/i) ||
                    text.match(/\b([0-9]{8,10})\b/);
    const bookId = idMatch ? idMatch[1].trim() : '';

    // 3. Guest Name
    let firstName = '';
    let lastName = 'GUEST';
    const nameMatch = text.match(/(?:lead\s*guest|guest\s*name|customer\s*name|guest)[\s:#]*([A-Za-z\s\.\-\'\`]+)(?:\n|$)/i);
    if (nameMatch) {
        const full = nameMatch[1].trim().replace(/\s+/g, ' ');
        const parts = full.split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || 'GUEST';
    }

    // 4. Country / Nationality
    let country = '';
    const countryMatch = text.match(/(?:country|nationality|country\/territory\s*of\s*residence|residence)[\s:#]*([A-Za-z\s\-]+)(?:\n|$)/i);
    if (countryMatch) {
        country = countryMatch[1].trim().toUpperCase();
    }

    // 5. Dates
    let checkIn = '';
    let checkOut = '';
    const inMatch = text.match(/(?:check-in|arrival|check\s*in)[\s:#]*([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i) ||
                    text.match(/arrival[\s:#]*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i);
    const outMatch = text.match(/(?:check-out|departure|check\s*out)[\s:#]*([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i) ||
                     text.match(/departure[\s:#]*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i);

    if (inMatch) checkIn = parseFlexibleDate(inMatch[1]);
    if (outMatch) checkOut = parseFlexibleDate(outMatch[1]);

    // 6. Booking Date
    let bookDate = '';
    const bookDateMatch = text.match(/(?:booked\s*on|booking\s*date)[\s:#]*([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i);
    if (bookDateMatch) bookDate = parseFlexibleDate(bookDateMatch[1]);

    // 7. Unit Count & Headcount (Pax)
    let pax = 1;
    let unitCount = 1;

    const paxMatch = text.match(/(\d+)\s*(?:adult|guest|person|pax)/i) ||
                     text.match(/(?:number\s*of\s*guests|no\.\s*of\s*guests|guests|adults)[\s:#]*(\d+)/i);
    if (paxMatch) pax = parseInt(paxMatch[1], 10) || 1;

    const unitMatch = text.match(/(\d+)\s*(?:x|bed|beds|room|rooms|unit|units)\b/i) ||
                      text.match(/(?:no\.\s*of\s*rooms|rooms|units)[\s:#]*(\d+)/i);
    if (unitMatch) {
        unitCount = parseInt(unitMatch[1], 10) || 1;
    } else {
        unitCount = pax;
    }

    // 8. Total Price & Net Rate Payout Extraction
    let totalPrice = 0;
    let explicitNet = null;

    const totalMatch = text.match(/(?:total\s*(?:rate|price|amount)|customer\s*price)[\s:#]*(?:[A-Z]{3}|฿|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
                       text.match(/(?:[A-Z]{3}|฿|\$|€|£)\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (totalMatch) {
        totalPrice = parseFloat(totalMatch[1].replace(/,/g, '')) || 0;
    }

    const netMatch = text.match(/(?:net\s*rate|net\s*amount|property\s*payout|agoda\s*collect)[\s:#]*(?:[A-Z]{3}|฿|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (netMatch) {
        explicitNet = parseFloat(netMatch[1].replace(/,/g, ''));
    }

    // 9. Unit / Room Category
    let bookedType = '';
    const roomMatch = text.match(/(?:room\s*type|room|benefit)[\s:#]*([^\n\r]+)/i);
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

    // 11. Payments (Agoda Collect / UPC)
    const payments = [];
    const isAgodaCollect = /agoda\s*collect/i.test(text) || /electronic\s*card/i.test(text) || /upc/i.test(text);
    if (isAgodaCollect && totalPrice > 0 && checkIn) {
        payments.push({
            date: checkIn,
            amt: explicitNet || totalPrice,
            method: 'agoda-pay'
        });
    }

    // 12. Contact Details
    let phone = '';
    let email = '';
    const phoneMatch = text.match(/(?:phone|tel|mobile)[\s:#]*([+\d\s\-\(\)]{8,20})/i);
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (phoneMatch) phone = phoneMatch[1].trim();
    if (emailMatch) email = emailMatch[1].trim();

    const noteLines = [
        `[AGODA CONFIRMATION]`,
        `• Booking ID: ${bookId}`,
        `• Units: ${unitCount} | Pax: ${pax}`,
        `• Policy: ${refundability.toUpperCase()}`
    ];
    if (country) noteLines.push(`• Nationality: ${country}`);

    return {
        source: 'agoda',
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
