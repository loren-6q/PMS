// ==========================================================================
// parser/ota-expedia.js - Expedia Partner Central Extraction Adapter
// Wild & Wandering Property Management System
// ==========================================================================

export function parseExpedia(lines, normalizedText, parseOtaDate, safeLocalYmd) {
    const s = { source: 'expedia', pax: 1, payments: [], units: 1, rooms: [] };
    const flatRaw = normalizedText.replace(/\s+/g, ' ');

    const idMatch = normalizedText.match(/Reservation\s*ID\s*:?\s*(\d{8,14})/i) || flatRaw.match(/Reservation\s*ID\s*:?\s*(\d{8,14})/i);
    if (idMatch) s.bookId = idMatch[1];

    const guestMatch = normalizedText.match(/Guest\s*:\s*([A-Za-z\u00C0-\u024F\s\-'\.]+?)(?:Booked\s*on|Guest\s*Email|Room\s*Type|\n|$)/i);
    if (guestMatch) {
        const rawName = guestMatch[1].replace(/^(?:mr\.|mrs\.|ms\.|miss|dr\.)\s+/i, '').trim();
        const parts = rawName.split(/\s+/).filter(Boolean);
        if (parts.length > 1) {
            s.firstName = parts.slice(0, -1).join(' ').toUpperCase();
            s.lastName = parts[parts.length - 1].toUpperCase();
        } else if (parts.length === 1) {
            s.lastName = parts[0].toUpperCase();
        }
    }

    const emailMatch = normalizedText.match(/Guest\s*Email\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch) s.email = emailMatch[1].trim();

    const bdMatch = normalizedText.match(/Booked\s*on\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
    if (bdMatch) s.bookDate = parseOtaDate(bdMatch[1]);
    if (!s.bookDate) s.bookDate = safeLocalYmd();

    const rtMatch = normalizedText.match(/Room\s*Type\s*Name\s*:?\s*([\s\S]+?)(?:Pricing\s*Model|Payment\s*Instructions|Check-In|Rate\s*Code|Daily\s*Base\s*Rate|\n|$)/i);
    if (rtMatch) s.bookedType = rtMatch[1].replace(/\r?\n/g, ' ').trim();

    const expRooms = normalizedText.match(/(?:Number\s*of\s*Rooms|Rooms?)\s*:?\s*(\d+)/i);
    if (expRooms) s.units = parseInt(expRooms[1], 10) || 1;

    const mPattern = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
    const dateSectionRegex = new RegExp(`Check-In[\\s\\S]{0,120}?Check-Out[\\s\\S]{0,120}?(${mPattern}\\s+\\d{1,2},?\\s+\\d{4})\\s*(${mPattern}\\s+\\d{1,2},?\\s+\\d{4})(\\d{1,3})?`, 'i');
    
    const datesSection = normalizedText.match(dateSectionRegex);
    if (datesSection) {
        s.checkIn = parseOtaDate(datesSection[1]);
        s.checkOut = parseOtaDate(datesSection[2]);
        if (datesSection[3]) {
            const paxDigit = datesSection[3].charAt(0);
            const pVal = parseInt(paxDigit);
            if (!isNaN(pVal) && pVal > 0) s.pax = pVal;
        }
    }

    const paxMatch = normalizedText.match(/Adults\s*:?\s*(\d+)/i) || flatRaw.match(/(\d+)\s*Adult/i);
    if (paxMatch && (!s.pax || s.pax === 1)) s.pax = Math.max(1, parseInt(paxMatch[1]) || 1);

    const totalMatch = normalizedText.match(/Total\s*Booking\s*Amount\s*:?\s*([\d,]+(?:\.\d+)?)/i) || flatRaw.match(/Total\s*(?:Booking\s*Amount|Amount)?[^\d]*([\d,]+(?:\.\d+)?)\s*(?:THB|USD|EUR|GBP|฿|\$)/i);
    const netMatch = normalizedText.match(/Amount\s*to\s*Charge\s*Expedia\s*Group\s*:?\s*([\d,]+(?:\.\d+)?)/i) || flatRaw.match(/Charge\s*Expedia\s*Group[^\d]*([\d,]+(?:\.\d+)?)/i);

    const totalAmt = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0;
    const netAmt = netMatch ? parseFloat(netMatch[1].replace(/,/g, '')) : 0;

    if (totalAmt > 0) {
        s.totalPrice = totalAmt;
        s.netPrice = netAmt > 0 ? netAmt : Number((totalAmt * 0.82).toFixed(2));
    } else if (netAmt > 0) {
        s.netPrice = netAmt;
        s.totalPrice = Number((netAmt / 0.82).toFixed(2));
    }

    const isExpediaCollect = normalizedText.toLowerCase().includes('expedia collects payment') || normalizedText.toLowerCase().includes('guest has pre-paid');
    if (isExpediaCollect && s.totalPrice > 0) {
        const payDate = s.checkIn || s.bookDate || safeLocalYmd();
        const commission = Number((s.totalPrice - (s.netPrice || s.totalPrice)).toFixed(2));
        if (commission > 0) s.payments.push({ date: payDate, amt: commission, method: 'expedia-kp' });
        if (s.netPrice > 0) s.payments.push({ date: payDate, amt: Number(s.netPrice.toFixed(2)), method: 'expedia-pay' });
    }

    return s;
}
