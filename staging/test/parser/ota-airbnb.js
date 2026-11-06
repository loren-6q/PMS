// ==========================================================================
// parser/ota-airbnb.js - Airbnb Confirmation & Extranet Normalizer
// Wild & Wandering Property Management System
// ==========================================================================

import { parseFlexibleDate } from './parser-engine.js';

export function parseAirbnb(rawText) {
    if (!rawText) return null;
    const text = rawText.replace(/\r/g, '');

    const isAirbnb = /airbnb/i.test(text) || /hm[a-z0-9]{8}/i.test(text) || /reservation\s*code/i.test(text);
    if (!isAirbnb) return null;

    // 1. Reservation Code (e.g. HM12345678 or 10-char alphanumeric)
    const codeMatch = text.match(/(?:confirmation\s*code|reservation\s*code)[\s:#]*([A-Z0-9]{8,12})/i) ||
                      text.match(/\b(HM[A-Z0-9]{8,10})\b/i);
    const bookId = codeMatch ? codeMatch[1].trim().toUpperCase() : '';

    // 2. Guest Name
    let firstName = '';
    let lastName = 'GUEST';
    const nameMatch = text.match(/(?:guest|guest\s*name|hosted)[\s:#]*([A-Za-z\s\.\-\'\`]+)(?:\n|$)/i);
    if (nameMatch) {
        const parts = nameMatch[1].trim().replace(/\s+/g, ' ').split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || 'GUEST';
    }

    // 3. Country / Location
    let country = '';
    const locMatch = text.match(/(?:lives\s*in|from|country)[\s:#]*([A-Za-z\s,]+)(?:\n|$)/i);
    if (locMatch) {
        country = locMatch[1].trim().split(',').pop().trim().toUpperCase();
    }

    // 4. Dates
    let checkIn = '';
    let checkOut = '';
    const inMatch = text.match(/(?:check-in|arrive)[\s:#]*([^\n\r]+)/i);
    const outMatch = text.match(/(?:checkout|check-out|depart)[\s:#]*([^\n\r]+)/i);
    if (inMatch) checkIn = parseFlexibleDate(inMatch[1]);
    if (outMatch) checkOut = parseFlexibleDate(outMatch[1]);

    // 5. Booking Date
    let bookDate = '';
    const bookDateMatch = text.match(/(?:booked|booked\s*on)[\s:#]*([^\n\r]+)/i);
    if (bookDateMatch) bookDate = parseFlexibleDate(bookDateMatch[1]);

    // 6. Units & Headcount (Pax)
    let pax = 1;
    let unitCount = 1;
    const paxMatch = text.match(/(\d+)\s*guests?\b/i) ||
                     text.match(/(?:number\s*of\s*guests|guests|adults)[\s:#]*(\d+)/i);
    if (paxMatch) pax = parseInt(paxMatch[1], 10) || 1;

    // 7. Pricing & Payout
    let totalPrice = 0;
    let explicitNet = null;
    let commissionAmt = 0;

    const payoutMatch = text.match(/(?:host\s*payout|payout|you\s*earn|total\s*payout)[\s:#]*(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (payoutMatch) explicitNet = parseFloat(payoutMatch[1].replace(/,/g, ''));

    const totalMatch = text.match(/(?:total\s*price|total|guest\s*paid)[\s:#]*(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (totalMatch) totalPrice = parseFloat(totalMatch[1].replace(/,/g, '')) || 0;

    if (totalPrice === 0 && explicitNet !== null) {
        // Airbnb host-only fee ~3-15%
        totalPrice = explicitNet;
    }
    if (explicitNet === null && totalPrice > 0) {
        commissionAmt = Number((totalPrice * 0.15).toFixed(2));
        explicitNet = Number((totalPrice - commissionAmt).toFixed(2));
    } else if (totalPrice > 0 && explicitNet !== null) {
        commissionAmt = Number((totalPrice - explicitNet).toFixed(2));
    }

    // 8. Room / Listing Name
    let bookedType = '';
    const listMatch = text.match(/(?:entire\s*place|private\s*room|listing|room)[\s:#]*([^\n\r]+)/i);
    if (listMatch) {
        bookedType = listMatch[1].replace(/^[-•]\s*/, '').trim();
    }

    // 9. Refundability Policy
    let refundability = 'ref';
    if (/non-refundable|firm|strict/i.test(text)) {
        refundability = 'non-ref';
    } else if (/flexible|moderate/i.test(text)) {
        refundability = 'ref';
    }

    // 10. Payments: Airbnb is 100% prepaid (airbnb-pay for payout + airbnb-kp for fee)
    const payments = [];
    if (totalPrice > 0 && checkIn) {
        payments.push({
            date: checkIn,
            amt: explicitNet !== null ? explicitNet : totalPrice,
            method: 'airbnb-pay'
        });
        if (commissionAmt > 0) {
            payments.push({
                date: checkIn,
                amt: commissionAmt,
                method: 'airbnb-kp'
            });
        }
    }

    // 11. Contact Details (Airbnb masks direct contact before booking)
    let phone = '';
    const phoneMatch = text.match(/(\+\d[\d\s\-\(\)]{7,20})/);
    if (phoneMatch) phone = phoneMatch[1].trim();

    // 12. Special Requests
    let specialRequests = '';
    const reqMatch = text.match(/(?:message\s*from\s*guest|note)[\s:#]*\n?([^\n\r]+)/i);
    if (reqMatch) specialRequests = reqMatch[1].trim();

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
        `Source: AIRBNB`,
        `Book ID: ${bookId}`,
        `Dates: ${checkIn || '--'} to ${checkOut || '--'} (${nights} Night${nights > 1 ? 's' : ''})`,
        `Booked: ${bookedType || '--'}`,
        `Units (Rooms/Beds): ${unitCount}`,
        `Pax: ${pax}`,
        `Total: ฿${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `Net Payout: ฿${explicitNet !== null ? explicitNet.toFixed(2) : '--'} (Fee: ฿${commissionAmt.toFixed(2)})`,
        `Avg Nightly: ฿${parseFloat(avgNightly).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `----------------------------`,
        `• Policy: ${refundability.toUpperCase()}`
    ];
    if (country) noteLines.push(`• Nationality: ${country}`);
    if (specialRequests) noteLines.push(`• Special Request: ${specialRequests}`);

    return {
        source: 'airbnb',
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
        email: '',
        isProxyEmail: false,
        refundability,
        payments,
        status: 'future',
        notes: noteLines.join('\n')
    };
}
