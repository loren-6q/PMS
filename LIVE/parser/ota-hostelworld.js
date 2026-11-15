// ==========================================================================
// parser/ota-hostelworld.js - Hostelworld Extranet & Email Normalizer
// Wild & Wandering Property Management System
// ==========================================================================

import { parseFlexibleDate } from './parser-engine.js';

export function parseHostelworld(rawText) {
    if (!rawText) return null;
    const text = rawText.replace(/\r/g, '');

    // Signature Check
    const isHw = /hostelworld/i.test(text) || /hw\s*booking\s*ref/i.test(text) || /reference\s*number/i.test(text);
    if (!isHw) return null;

    // 1. Booking Reference Number (e.g. 339615-579981275)
    const refMatch = text.match(/(?:reference\s*(?:number|id|code)|hw\s*ref|booking\s*ref)[\s:#]*([0-9]{5,8}-[0-9]{6,12})/i) ||
                     text.match(/\b([0-9]{5,8}-[0-9]{6,12})\b/) ||
                     text.match(/(?:booking\s*reference)[\s:#]*([0-9]{8,15})/i);
    const bookId = refMatch ? refMatch[1].trim() : '';

    // 2. Guest Name
    let firstName = '';
    let lastName = 'GUEST';
    const nameMatch = text.match(/(?:lead\s*guest|guest\s*name|name)[\s:#]*([A-Za-z\s\.\-\'\`]+)(?:\n|$)/i) ||
                      text.match(/booked\s*by[\s:#]*([A-Za-z\s\.\-\'\`]+)(?:\n|$)/i);
    if (nameMatch) {
        const parts = nameMatch[1].trim().replace(/\s+/g, ' ').split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || 'GUEST';
    }

    // 3. Country / Nationality
    let country = '';
    const countryMatch = text.match(/(?:nationality|country|residence)[\s:#]*([A-Za-z\s\-]+)(?:\n|$)/i);
    if (countryMatch) {
        country = countryMatch[1].trim().toUpperCase();
    }

    // 4. Dates
    let checkIn = '';
    let checkOut = '';
    const inMatch = text.match(/(?:check-in|arrival|arriving)[\s:#]*([^\n\r]+)/i);
    const outMatch = text.match(/(?:check-out|departure|departing)[\s:#]*([^\n\r]+)/i);
    if (inMatch) checkIn = parseFlexibleDate(inMatch[1]);
    if (outMatch) checkOut = parseFlexibleDate(outMatch[1]);

    // 5. Booking Date
    let bookDate = '';
    const bookDateMatch = text.match(/(?:booked\s*on|booking\s*date|received)[\s:#]*([^\n\r]+)/i);
    if (bookDateMatch) bookDate = parseFlexibleDate(bookDateMatch[1]);

    // 6. Units & Headcount (Pax)
    let pax = 1;
    let unitCount = 1;
    const paxMatch = text.match(/(?:number\s*of\s*guests|guests|pax|persons?)[\s:#]*(\d+)/i) ||
                     text.match(/(\d+)\s*guests?\b/i);
    if (paxMatch) pax = parseInt(paxMatch[1], 10) || 1;

    const unitMatch = text.match(/(?:number\s*of\s*beds|beds?|units?|rooms?)[\s:#]*(\d+)/i) ||
                      text.match(/(\d+)\s*(?:bed|beds|unit|units|room|rooms)\b/i);
    if (unitMatch) {
        unitCount = parseInt(unitMatch[1], 10) || 1;
    } else {
        unitCount = pax;
    }

    // 7. Pricing & Deposit Reconciliation
    let totalPrice = 0;
    let depositPaid = 0; // Deposit retained by Hostelworld (hw-kp)
    let balanceDue = 0;  // Payable by guest upon arrival

    const totalMatch = text.match(/(?:total\s*price|total\s*amount|total|booking\s*value)[\s:#]*(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (totalMatch) totalPrice = parseFloat(totalMatch[1].replace(/,/g, '')) || 0;

    const depositMatch = text.match(/(?:deposit\s*paid|deposit|deposit\s*amount)[\s:#]*(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (depositMatch) depositPaid = parseFloat(depositMatch[1].replace(/,/g, '')) || 0;

    const dueMatch = text.match(/(?:amount\s*due\s*on\s*arrival|balance\s*due|due\s*on\s*arrival|to\s*pay)[\s:#]*(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (dueMatch) balanceDue = parseFloat(dueMatch[1].replace(/,/g, '')) || 0;

    // If total was unstated but parts exist
    if (totalPrice === 0 && (depositPaid > 0 || balanceDue > 0)) {
        totalPrice = Number((depositPaid + balanceDue).toFixed(2));
    }
    // If deposit unstated, default standard HW commission (~15%)
    if (depositPaid === 0 && totalPrice > 0 && balanceDue > 0) {
        depositPaid = Number((totalPrice - balanceDue).toFixed(2));
    }

    const explicitNet = balanceDue > 0 ? balanceDue : Number((totalPrice - depositPaid).toFixed(2));

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
    } else if (/standard|free\s*cancellation|flexible/i.test(text)) {
        refundability = 'ref';
    }

    // 10. Payments: Only the deposit retained by Hostelworld is logged
    const payments = [];
    if (depositPaid > 0 && checkIn) {
        payments.push({
            date: checkIn,
            amt: depositPaid,
            method: 'hw-kp'
        });
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

    // Duration & Average Rate
    let nights = 1;
    if (checkIn && checkOut) {
        const ms = new Date(checkOut) - new Date(checkIn);
        nights = Math.max(1, Math.round(ms / 86400000)) || 1;
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
