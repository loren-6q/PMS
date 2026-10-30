// ==========================================================================
// parser/ota-agoda.js - Agoda YCS & Partner Central Extraction Adapter
// Wild & Wandering Property Management System
// ==========================================================================

export function parseAgoda(lines, normalizedText, parseOtaDate, safeLocalYmd) {
    const s = { source: 'agoda', pax: 1, payments: [], units: 1, rooms: [] };
    const flatRaw = normalizedText.replace(/\s+/g, ' ');

    const bIdMatch = normalizedText.match(/(?:Booking\s*ID|Booking\s*Reference(?:\s*No\.?)?|Reference\s*ID)\s*:?\s*(\d{7,15})/i) || flatRaw.match(/Booking\s*ID\s*(\d{7,15})/i);
    if (bIdMatch) s.bookId = bIdMatch[1];

    const nameMatch = normalizedText.match(/Customer\s*First\s*Name\s*:?\s*([A-Za-z\u00C0-\u024F\s\-'\.]+?)\s*Customer\s*Last\s*Name\s*:?\s*([A-Za-z\u00C0-\u024F\s\-'\.]+?)(?:Country\s*of\s*Residence|Check-in|Other\s*Guests|\n|City|$)/i);
    if (nameMatch) {
        s.firstName = nameMatch[1].trim();
        s.lastName = nameMatch[2].trim();
    } else {
        const altName = normalizedText.match(/\[RmNo\.1\]\s*([A-Za-z\u00C0-\u024F\s\-'\.]+?)(?:Room\s*Type|\n|\[RmNo|$)/i) || normalizedText.match(/Guest\s+([A-Za-z\u00C0-\u024F\s\-'\.]+?)\s+is\s+present/i);
        if (altName) {
            const parts = altName[1].trim().split(/\s+/).filter(Boolean);
            if (parts.length > 1) {
                s.firstName = parts.slice(0, -1).join(' ');
                s.lastName = parts[parts.length - 1];
            } else {
                s.lastName = parts[0] || '';
            }
        }
    }

    const countryMatch = normalizedText.match(/Country\s*of\s*Residence\s*:?\s*([A-Za-z\s]+?)(?:Check-in|Check-out|City|Other\s*Guests|Room\s*Type|\n|$)/i);
    if (countryMatch) s.country = countryMatch[1].trim();

    const ciMatch = normalizedText.match(/Check-in\s*(?:Date)?\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
    if (ciMatch) s.checkIn = parseOtaDate(ciMatch[1]);

    const coMatch = normalizedText.match(/Check-out\s*(?:Date)?\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
    if (coMatch) s.checkOut = parseOtaDate(coMatch[1]);

    const bdMatch = normalizedText.match(/agoda\.com\s*<no-reply@agoda\.com>[\s\S]{0,120}?(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?,?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i) || normalizedText.match(/Booked\s*on\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
    if (bdMatch) s.bookDate = parseOtaDate(bdMatch[1]);
    if (!s.bookDate) s.bookDate = safeLocalYmd();

    const paxMatch = normalizedText.match(/(\d+)\s*Adult/i);
    if (paxMatch) {
        const pStr = paxMatch[1];
        s.pax = parseInt(pStr.length > 1 ? pStr.slice(-1) : pStr) || 1;
    }

    const agodaRooms = normalizedText.match(/(?:No\.\s*of\s*Rooms|Number\s*of\s*Rooms|Rooms?)\s*:?\s*(\d+)/i);
    if (agodaRooms) s.units = parseInt(agodaRooms[1], 10) || 1;

    const rtMatch = normalizedText.match(/No\.\s*of\s*Extra\s*Bed\s*([\s\S]+?)(?:\(null\))?\s*\d*\s*\d+\s*Adult/i) || normalizedText.match(/Room\s*Type\s*:?\s*([\s\S]+?)(?:\(null\))?\s*(?:No\.\s*of\s*Rooms|Occupancy|\d+\s*Adult)/i);
    if (rtMatch) {
        s.bookedType = rtMatch[1].replace(/\(null\)/gi, '').replace(/No\.\s*of\s*Rooms|Occupancy|No\.\s*of\s*Extra\s*Bed/gi, '').replace(/\r?\n/g, ' ').trim();
    } else {
        const rtLine = lines.findIndex(l => l.match(/(?:Room Type|Room Category|Room|Booked Room)/i));
        if (rtLine > -1 && lines.length > rtLine + 1) s.bookedType = lines[rtLine + 1].replace(/\(null\)/gi, '').trim();
    }

    const sellMatch = normalizedText.match(/Reference\s*sell\s*rate[^\d]*([\d,]+(?:\.\d+)?)/i) || normalizedText.match(/Total\s*(?:Price|Amount)?[^\d]*([\d,]+(?:\.\d+)?)/i);
    const netMatch = normalizedText.match(/Net\s*rate[^\d]*([\d,]+(?:\.\d+)?)/i) || normalizedText.match(/Hotel\s*Payout[^\d]*([\d,]+(?:\.\d+)?)/i);

    const totalAmt = sellMatch ? parseFloat(sellMatch[1].replace(/,/g, '')) : 0;
    const netAmt = netMatch ? parseFloat(netMatch[1].replace(/,/g, '')) : 0;

    if (totalAmt > 0) {
        s.totalPrice = totalAmt;
        s.netPrice = netAmt > 0 ? netAmt : Number((totalAmt * 0.815).toFixed(2));
    } else if (netAmt > 0) {
        s.netPrice = netAmt;
        s.totalPrice = Number((netAmt / 0.815).toFixed(2));
    }

    if (s.totalPrice > 0) {
        const payDate = s.checkIn || s.bookDate || safeLocalYmd();
        const commission = Number((s.totalPrice - (s.netPrice || s.totalPrice)).toFixed(2));

        if (commission > 0) s.payments.push({ date: payDate, amt: commission, method: 'agoda-kp' });
        if (s.netPrice > 0) s.payments.push({ date: payDate, amt: Number(s.netPrice.toFixed(2)), method: 'agoda-pay' });
    }

    return s;
}
