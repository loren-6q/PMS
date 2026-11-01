// ==========================================================================
// parser/ota-booking.js - Booking.com Extranet & Confirmation Parser
// Wild & Wandering Property Management System
// ==========================================================================

import { parseFlexibleDate } from './parser-engine.js';

export function parseBookingCom(rawText) {
    if (!rawText) return null;
    const text = rawText.replace(/\r/g, '');

    // 1. Signature Check
    const isBdc = /booking\.com/i.test(text) || /booking number/i.test(text);
    if (!isBdc) return null;

    // 2. Booking Reference ID
    const idMatch = text.match(/(?:booking\s*(?:number|id|reference)|confirmation\s*(?:number|code))[\s:#]*([0-9]{8,15})/i) ||
                    text.match(/\b([0-9]{9,10})\b/);
    const bookId = idMatch ? idMatch[1].trim() : '';

    // 3. Guest Name
    let firstName = '';
    let lastName = 'GUEST';
    const nameMatch = text.match(/(?:guest\s*name|booked\s*by|guest)[\s:#]*([A-Za-z\s\.\-\'\`]+)(?:\n|$)/i);
    if (nameMatch) {
        const full = nameMatch[1].trim().replace(/\s+/g, ' ');
        const parts = full.split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || 'GUEST';
    }

    // 4. Country / Nationality (Mandatory for TM30)
    let country = '';
    const countryMatch = text.match(/(?:country|region|nationality|citizen\s*of|citizen|residence)[\s:#]*([A-Za-z\s\-]+)(?:\n|$)/i);
    if (countryMatch) {
        country = countryMatch[1].trim().toUpperCase();
    }

    // 5. Dates
    let checkIn = '';
    let checkOut = '';
    const inMatch = text.match(/(?:check-in|arrival|arriving)[\s:#]*(?:from\s*)?([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i) ||
                    text.match(/check-in[\s:#]*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i);
    const outMatch = text.match(/(?:check-out|departure|departing)[\s:#]*(?:until\s*)?([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i) ||
                     text.match(/check-out[\s:#]*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i);

    if (inMatch) checkIn = parseFlexibleDate(inMatch[1]);
    if (outMatch) checkOut = parseFlexibleDate(outMatch[1]);

    // 6. Booking Date (for dispute & grace period tracking)
    let bookDate = '';
    const bookDateMatch = text.match(/(?:booked\s*on|booking\s*date|received)[\s:#]*([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i);
    if (bookDateMatch) bookDate = parseFlexibleDate(bookDateMatch[1]);

    // 7. Unit Count vs. Headcount (Pax)
    let pax = 1;
    let unitCount = 1;

    const paxMatch = text.match(/(\d+)\s*(?:adult|guest|person|people|pax)/i) ||
                     text.match(/(?:number\s*of\s*guests|guests|adults)[\s:#]*(\d+)/i);
    if (paxMatch) pax = parseInt(paxMatch[1], 10) || 1;

    const unitMatch = text.match(/(\d+)\s*(?:x|bed|beds|room|rooms|unit|units)\b/i) ||
                      text.match(/(?:number\s*of\s*rooms|rooms|units)[\s:#]*(\d+)/i);
    if (unitMatch) {
        unitCount = parseInt(unitMatch[1], 10) || 1;
    } else {
        // Fallback for dorms: if unit count unstated, 1 pax = 1 bed
        unitCount = pax;
    }

    // 8. Total Price & Explicit Channel Payout / Net Extraction
    let totalPrice = 0;
    let explicitNet = null;

    const priceMatch = text.match(/(?:total\s*price|total\s*amount|price|rate)[\s:#]*(?:[A-Z]{3}|฿|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
                       text.match(/(?:[A-Z]{3}|฿|\$|€|£)\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (priceMatch) {
        totalPrice = parseFloat(priceMatch[1].replace(/,/g, '')) || 0;
    }

    const netMatch = text.match(/(?:you\s*receive|payout|net\s*amount|net\s*rate)[\s:#]*(?:[A-Z]{3}|฿|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    const commMatch = text.match(/(?:commission|commission\s*amount)[\s:#]*(?:[A-Z]{3}|฿|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (netMatch) {
        explicitNet = parseFloat(netMatch[1].replace(/,/g, ''));
    } else if (commMatch && totalPrice > 0) {
        const commAmt = parseFloat(commMatch[1].replace(/,/g, '')) || 0;
        explicitNet = Number((totalPrice - commAmt).toFixed(2));
    }

    // 9. Unit / Room Category
    let bookedType = '';
    const roomMatch = text.match(/(?:room\s*type|unit\s*type|accommodation|room)[\s:#]*([^\n\r]+)/i);
    if (roomMatch) {
        bookedType = roomMatch[1].trim();
    }

    // 10. Refundability Policy Extraction
    let refundability = 'unknown';
    if (/non-refundable|non\s*refundable/i.test(text)) {
        refundability = 'non-ref';
    } else if (/free\s*cancellation/i.test(text)) {
        refundability = 'ref';
    }

    // 11. Payments / Prepaid Classification
    const payments = [];
    const isPrepaid = /payments?\s*by\s*booking\.com/i.test(text) || /prepaid\s*by\s*booking/i.test(text);
    if (isPrepaid && totalPrice > 0 && checkIn) {
        payments.push({
            date: checkIn,
            amt: totalPrice,
            method: 'bdc-pay'
        });
    }

    // 12. Contact Details & BDC Proxy Flag
    let phone = '';
    let email = '';
    let isProxyEmail = false;

    const phoneMatch = text.match(/(?:phone|telephone|mobile)[\s:#]*([+\d\s\-\(\)]{8,20})/i);
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@guest\.booking\.com|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (phoneMatch) phone = phoneMatch[1].trim();
    if (emailMatch) {
        email = emailMatch[1].trim();
        if (email.includes('@guest.booking.com')) {
            isProxyEmail = true;
        }
    }

    // 13. Clean Structured Notes (Omits Auto-Responder Template Spam)
    let specialRequests = '';
    const reqMatch = text.match(/(?:special\s*requests?|remarks?)[\s:#]*([^\n\r]+)/i);
    if (reqMatch && !/welcome to|check-in is at|thank you for choosing/i.test(reqMatch[1])) {
        specialRequests = reqMatch[1].trim();
    }

    const noteLines = [
        `[BOOKING.COM CONFIRMATION]`,
        `• Booking ID: ${bookId}`,
        `• Units: ${unitCount} | Pax: ${pax}`,
        `• Policy: ${refundability.toUpperCase()}`
    ];
    if (country) noteLines.push(`• Nationality: ${country}`);
    if (specialRequests) noteLines.push(`• Request: ${specialRequests}`);

    return {
        source: 'booking.com',
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
        isProxyEmail,
        refundability,
        payments,
        status: 'future',
        notes: noteLines.join('\n')
    };
}
