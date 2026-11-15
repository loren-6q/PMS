// ==========================================================================
// parser/ota-expedia.js - Expedia Partner Central Normalizer
// Wild & Wandering Property Management System
// ==========================================================================

import { parseFlexibleDate } from './parser-engine.js';

export function parseExpedia(rawText) {
    if (!rawText) return null;
    const text = rawText.replace(/\r/g, '');

    const isExpedia = /expedia/i.test(text) || /partner\s*central/i.test(text) || /itinerary\s*number/i.test(text);
    if (!isExpedia) return null;

    // 1. Itinerary Number (Typically 11-13 digits)
    const idMatch = text.match(/(?:itinerary\s*number|itinerary|booking\s*id)[\s:#]*([0-9]{10,15})/i) ||
                    text.match(/\b([0-9]{11,13})\b/);
    const bookId = idMatch ? idMatch[1].trim() : '';

    // 2. Guest Name
    let firstName = '';
    let lastName = 'GUEST';
    const nameMatch = text.match(/(?:primary\s*guest|guest\s*name|traveler)[\s:#]*([A-Za-z\s\.\-\'\`]+)(?:\n|$)/i);
    if (nameMatch) {
        const parts = nameMatch[1].trim().replace(/\s+/g, ' ').split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || 'GUEST';
    }

    // 3. Country / Location
    let country = '';
    const countryMatch = text.match(/(?:country|nationality|region)[\s:#]*([A-Za-z\s\-]+)(?:\n|$)/i);
    if (countryMatch) {
        country = countryMatch[1].trim().toUpperCase();
    }

    // 4. Dates
    let checkIn = '';
    let checkOut = '';
    const inMatch = text.match(/(?:check-in|arrival)[\s:#]*([^\n\r]+)/i);
    const outMatch = text.match(/(?:check-out|departure)[\s:#]*([^\n\r]+)/i);
    if (inMatch) checkIn = parseFlexibleDate(inMatch[1]);
    if (outMatch) checkOut = parseFlexibleDate(outMatch[1]);

    // 5. Booking Date
    let bookDate = '';
    const bookDateMatch = text.match(/(?:booked\s*on|booking\s*date)[\s:#]*([^\n\r]+)/i);
    if (bookDateMatch) bookDate = parseFlexibleDate(bookDateMatch[1]);

    // 6. Units & Headcount (Pax)
    let pax = 1;
    let unitCount = 1;
    const paxMatch = text.match(/(\d+)\s*(?:adults?|travelers?|guests?)\b/i) ||
                     text.match(/(?:number\s*of\s*guests|guests)[\s:#]*(\d+)/i);
    if (paxMatch) pax = parseInt(paxMatch[1], 10) || 1;

    const unitMatch = text.match(/(?:number\s*of\s*rooms|rooms|units)[\s:#]*(\d+)/i) ||
                      text.match(/(\d+)\s*rooms?\b/i);
    if (unitMatch) {
        unitCount = parseInt(unitMatch[1], 10) || 1;
    } else {
        unitCount = pax;
    }

    // 7. Pricing & Payout Rules (Expedia Collect vs Hotel Collect)
    let totalPrice = 0;
    let explicitNet = null;
    let commissionAmt = 0;

    const totalMatch = text.match(/(?:total\s*price|booking\s*total|total\s*charges)[\s:#]*(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (totalMatch) totalPrice = parseFloat(totalMatch[1].replace(/,/g, '')) || 0;

    const netMatch = text.match(/(?:hotel\s*payout|net\s*rate|payable\s*to\s*hotel)[\s:#]*(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (netMatch) explicitNet = parseFloat(netMatch[1].replace(/,/g, ''));

    const commMatch = text.match(/commission[\s:#]*(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (commMatch) commissionAmt = parseFloat(commMatch[1].replace(/,/g, '')) || 0;

    const isExpediaCollect = /expedia\s*collect|virtual\s*card|epc/i.test(text);

    if (explicitNet === null && totalPrice > 0) {
        const commRate = parseFloat(window.currentPropertyConfig?.commissions?.expedia || 18);
        commissionAmt = Number((totalPrice * (commRate / 100)).toFixed(2));
        explicitNet = Number((totalPrice - commissionAmt).toFixed(2));
    }

    // 8. Room Category
    let bookedType = '';
    const roomMatch = text.match(/(?:room\s*type|room|accommodation)[\s:#]*([^\n\r]+)/i);
    if (roomMatch) {
        bookedType = roomMatch[1].replace(/^[-•]\s*/, '').trim();
        const pMatch = bookedType.match(/\((.+)\)\s*$/);
        if (pMatch && pMatch[1]) {
            bookedType = pMatch[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
        }
    }

    // 9. Refundability Policy
    let refundability = 'unknown';
    if (/non-refundable|non\s*refundable/i.test(text)) {
        refundability = 'non-ref';
    } else if (/free\s*cancellation|flexible/i.test(text)) {
        refundability = 'ref';
    }

    // 10. Payments: Expedia Collect = expedia-pay (net) + expedia-kp (commission)
    const payments = [];
    if (isExpediaCollect && totalPrice > 0 && checkIn) {
        payments.push({
            date: checkIn,
            amt: explicitNet !== null ? explicitNet : totalPrice,
            method: 'expedia-pay'
        });
        if (commissionAmt > 0) {
            payments.push({
                date: checkIn,
                amt: commissionAmt,
                method: 'expedia-kp'
            });
        }
    }

    // 11. Contact Details
    let phone = '';
    let email = '';
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const phoneMatch = text.match(/(\+\d[\d\s\-\(\)]{7,20})/);
    if (emailMatch) email = emailMatch[1].trim();
    if (phoneMatch) phone = phoneMatch[1].trim();

    // 12. Special Requests
    let specialRequests = '';
    const reqMatch = text.match(/(?:special\s*requests?|notes?|remarks?)[\s:#]*\n?([^\n\r]+)/i);
    if (reqMatch && !/none|standard/i.test(reqMatch[1])) {
        specialRequests = reqMatch[1].trim();
    }

    // Duration & Average Daily Rate
    let nights = 1;
    if (checkIn && checkOut) {
        const ms = new Date(checkOut) - new Date(checkIn);
        nights = Math.max(1, Math.round(ms / 86400000)) || 1;
    }
    const avgNightly = totalPrice > 0 ? (totalPrice / nights).toFixed(2) : '0.00';

    // Standard Note Block
    const noteLines = [
        `--- ORIGINAL OTA BOOKING ---`,
        `Source: EXPEDIA`,
        `Book ID: ${bookId}`,
        `Dates: ${checkIn || '--'} to ${checkOut || '--'} (${nights} Night${nights > 1 ? 's' : ''})`,
        `Booked: ${bookedType || '--'}`,
        `Units (Rooms/Beds): ${unitCount}`,
        `Pax: ${pax}`,
        `Total: ฿${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `Net Payout: ฿${explicitNet !== null ? explicitNet.toFixed(2) : '--'} (Commission: ฿${commissionAmt.toFixed(2)})`,
        `Avg Nightly: ฿${parseFloat(avgNightly).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `----------------------------`,
        `• Policy: ${refundability.toUpperCase()}`
    ];
    if (country) noteLines.push(`• Nationality: ${country}`);
    if (specialRequests) noteLines.push(`• Special Request: ${specialRequests}`);

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
