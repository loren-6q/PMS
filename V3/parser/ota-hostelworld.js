// ==========================================================================
// parser/ota-hostelworld.js - Hostelworld Extranet & Email Parser
// Wild & Wandering Property Management System
// ==========================================================================

import { parseFlexibleDate } from './parser-engine.js';

export function parseHostelworld(rawText) {
    if (!rawText) return null;
    const text = rawText.replace(/\r/g, '');

    // 1. Signature Check
    const isHw = /hostelworld/i.test(text) || /reference\s*number[\s:#]*[0-9]{4,8}-[0-9]{4,8}/i.test(text);
    if (!isHw) return null;

    // 2. Reference ID
    const idMatch = text.match(/(?:reference\s*number|reference|ref)[\s:#]*([0-9\-]+)/i);
    const bookId = idMatch ? idMatch[1].trim() : '';

    // 3. Guest Name
    let firstName = '';
    let lastName = 'GUEST';
    const nameMatch = text.match(/(?:lead\s*guest|guest\s*name|name)[\s:#]*([A-Za-z\s\.\-\'\`]+)(?:\n|$)/i);
    if (nameMatch) {
        const full = nameMatch[1].trim().replace(/\s+/g, ' ');
        const parts = full.split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || 'GUEST';
    }

    // 4. Country / Nationality (Crucial for TM30)
    let country = '';
    const countryMatch = text.match(/(?:nationality|country|citizen)[\s:#]*([A-Za-z\s\-]+)(?:\n|$)/i);
    if (countryMatch) {
        country = countryMatch[1].trim().toUpperCase();
    }

    // 5. Dates
    let checkIn = '';
    let checkOut = '';
    const inMatch = text.match(/(?:arriving|arrival|check-in)[\s:#]*([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i) ||
                    text.match(/arriving[\s:#]*([0-9]{1,2}\s+[A-Za-z]{3}\s+[0-9]{4})/i);
    const outMatch = text.match(/(?:departing|departure|check-out)[\s:#]*([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i) ||
                     text.match(/departing[\s:#]*([0-9]{1,2}\s+[A-Za-z]{3}\s+[0-9]{4})/i);

    if (inMatch) checkIn = parseFlexibleDate(inMatch[1]);
    if (outMatch) checkOut = parseFlexibleDate(outMatch[1]);

    // 6. Booking Date
    let bookDate = '';
    const bookDateMatch = text.match(/(?:booked\s*on|booking\s*date)[\s:#]*([^\n\r,]+(?:,\s*\d{4}|\s*\d{4}))/i);
    if (bookDateMatch) bookDate = parseFlexibleDate(bookDateMatch[1]);

    // 7. Unit Count & Pax
    let pax = 1;
    let unitCount = 1;

    const paxMatch = text.match(/(\d+)\s*(?:person|people|guest|pax)/i) ||
                     text.match(/(?:persons|number\s*of\s*guests|guests)[\s:#]*(\d+)/i);
    if (paxMatch) pax = parseInt(paxMatch[1], 10) || 1;

    const unitMatch = text.match(/(\d+)\s*(?:bed|beds|dorm\s*bed|room|rooms)\b/i);
    if (unitMatch) {
        unitCount = parseInt(unitMatch[1], 10) || 1;
    } else {
        unitCount = pax;
    }

    // 8. Total Price & Deposit Split
    let totalPrice = 0;
    let depositAmt = 0;

    const totalMatch = text.match(/(?:total\s*price|total\s*cost|total|amount)[\s:#]*(?:[A-Z]{3}|฿|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (totalMatch) {
        totalPrice = parseFloat(totalMatch[1].replace(/,/g, '')) || 0;
    }

    const depositMatch = text.match(/(?:deposit\s*paid|deposit)[\s:#]*(?:[A-Z]{3}|฿|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (depositMatch) {
        depositAmt = parseFloat(depositMatch[1].replace(/,/g, '')) || 0;
    }

    // In Hostelworld, Net Revenue is Total Price minus HW commission deposit
    const explicitNet = totalPrice > 0 ? Number((totalPrice - depositAmt).toFixed(2)) : null;

    // 9. Unit / Room Category
    let bookedType = '';
    const roomMatch = text.match(/(?:room\s*type|dorm\s*bed|bed|room)[\s:#]*([^\n\r]+)/i);
    if (roomMatch) {
        bookedType = roomMatch[1].trim();
    }

    // 10. Payment Entries (Hostelworld logs deposit as hw-kp)
    const payments = [];
    if (depositAmt > 0 && checkIn) {
        payments.push({
            date: checkIn,
            amt: depositAmt,
            method: 'hw-kp'
        });
    }

    // 11. Contact Details
    let phone = '';
    let email = '';
    const phoneMatch = text.match(/(?:phone|tel)[\s:#]*([+\d\s\-\(\)]{8,20})/i);
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (phoneMatch) phone = phoneMatch[1].trim();
    if (emailMatch) email = emailMatch[1].trim();

    const noteLines = [
        `[HOSTELWORLD CONFIRMATION]`,
        `• Ref: ${bookId}`,
        `• Units: ${unitCount} | Pax: ${pax}`,
        `• Deposit: ฿${depositAmt} (HW-KP)`,
        `• Balance Due on Arrival: ฿${Number((totalPrice - depositAmt).toFixed(2))}`
    ];
    if (country) noteLines.push(`• Nationality: ${country}`);

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
        netVerified: explicitNet !== null,
        bookedType,
        phone,
        email,
        isProxyEmail: false,
        refundability: 'non-ref',
        payments,
        status: 'future',
        notes: noteLines.join('\n')
    };
}
