// ==========================================================================
// parser/ota-airbnb.js - Airbnb Reservation Email & List Extraction Adapter
// Wild & Wandering Property Management System
// ==========================================================================

export function parseAirbnb(lines, normalizedText, parseOtaDate, safeLocalYmd) {
    const s = { source: 'airbnb', pax: 1, payments: [], units: 1, rooms: [] };

    const idIdx = lines.findIndex(l => l.includes('Confirmation code'));
    if (idIdx > -1 && lines.length > idIdx + 1) {
        s.bookId = lines[idIdx + 1].trim();
    } else {
        const idM = normalizedText.match(/Confirmation code\s*([A-Z0-9]{8,12})/i);
        if (idM) s.bookId = idM[1];
    }

    const nameM = normalizedText.match(/Reservation confirmed - (.*?)\s+arrives/i) || normalizedText.match(/New booking confirmed![\s\S]*?\n[\s\S]*?\n(.*?)(?:\n|Identity)/i);
    if (nameM) {
        const parts = nameM[1].trim().split(' ');
        s.firstName = parts[0];
        s.lastName = parts.slice(1).join(' ') || 'GUEST';
    }

    const countryMatch = normalizedText.match(/Identity verified.*?\n(.*?)\n/i);
    if (countryMatch) {
        const locParts = countryMatch[1].trim().split(',');
        s.country = locParts[locParts.length - 1].trim();
    }

    const bookDateMatch = normalizedText.match(/Airbnb\s*\n(.*?)\n/i);
    if (bookDateMatch) {
        const timeString = bookDateMatch[1].trim();
        if (timeString.includes(':') || timeString.includes('ago')) s.bookDate = safeLocalYmd();
        else s.bookDate = parseOtaDate(timeString + " " + new Date().getFullYear()) || safeLocalYmd();
    }
    if (!s.bookDate) s.bookDate = safeLocalYmd();

    const refYear = parseInt((s.bookDate || '').split('-')[0]) || (new Date()).getFullYear();

    const ciIdx = lines.findIndex(l => l.includes('Check-in') || l.includes('Check in'));
    if (ciIdx > -1 && lines.length > ciIdx + 1) {
        s.checkIn = parseOtaDate(lines[ciIdx + 1].replace(/^[A-Za-z]{3},\s*/, '').trim(), refYear);
    }

    const coIdx = lines.findIndex(l => l.includes('Checkout') || l.includes('Check out'));
    if (coIdx > -1 && lines.length > coIdx + 1) {
        s.checkOut = parseOtaDate(lines[coIdx + 1].replace(/^[A-Za-z]{3},\s*/, '').trim(), refYear);
    }

    if (s.checkIn && s.bookDate && s.checkIn < s.bookDate) {
        const p = s.checkIn.split('-');
        s.checkIn = `${parseInt(p[0]) + 1}-${p[1]}-${p[2]}`;
    }
    if (s.checkIn && s.checkOut && s.checkOut < s.checkIn) {
        const p = s.checkOut.split('-');
        s.checkOut = `${parseInt(p[0]) + 1}-${p[1]}-${p[2]}`;
    }

    const paxIdx = lines.findIndex(l => l.includes('Guests'));
    if (paxIdx > -1 && lines.length > paxIdx + 1) {
         const paxMatch = lines[paxIdx + 1].match(/(\d+)/);
         if (paxMatch) s.pax = parseInt(paxMatch[1]);
    }

    const totIdx = lines.findIndex(l => l.toLowerCase().includes('total (thb)') || l.toLowerCase() === 'total');
    if (totIdx > -1 && lines.length > totIdx + 1) {
        const totMatch = lines[totIdx + 1].match(/[\d,]+\.\d{2}/);
        if (totMatch) s.totalPrice = parseFloat(totMatch[0].replace(/,/g, ''));
    }

    const netIdx = lines.findIndex(l => l.toLowerCase().includes('you earn'));
    if (netIdx > -1 && lines.length > netIdx + 1) {
        const netMatch = lines[netIdx + 1].match(/[\d,]+\.\d{2}/);
        if (netMatch) {
            s.netPrice = parseFloat(netMatch[0].replace(/,/g, ''));
            s.netOverride = true;
        }
    }

    if (s.totalPrice && s.netPrice) {
        const commAmt = s.totalPrice - s.netPrice;
        const payDate = s.checkIn || safeLocalYmd();
        s.payments.push({ date: payDate, amt: Number(s.netPrice.toFixed(2)), method: 'airbnb-pay' });
        s.payments.push({ date: payDate, amt: Number(commAmt.toFixed(2)), method: 'airbnb-kp' });
    }

    const rtIdx = lines.findIndex(l => l.includes('Add guest details'));
    if (rtIdx > -1 && lines.length > rtIdx + 1) s.bookedType = lines[rtIdx + 1].trim();

    return s;
}
