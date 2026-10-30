// ==========================================================================
// parser/ota-booking.js - Booking.com Extranet & Email Extraction Adapter
// Wild & Wandering Property Management System
// ==========================================================================

export function parseBookingCom(lines, normalizedText, parseOtaDate, safeLocalYmd) {
    const s = { source: 'booking.com', pax: 1, payments: [], units: 1, rooms: [] };
    const countryMap = { 
        'IL': 'Israel', 'US': 'United States', 'GB': 'United Kingdom', 'UK': 'United Kingdom', 
        'FR': 'France', 'DE': 'Germany', 'AU': 'Australia', 'NL': 'Netherlands', 'ES': 'Spain', 
        'IT': 'Italy', 'CH': 'Switzerland', 'CA': 'Canada', 'SE': 'Sweden', 'DK': 'Denmark', 
        'RU': 'Russia', 'TH': 'Thailand', 'BE': 'Belgium', 'AT': 'Austria', 'IE': 'Ireland', 
        'NO': 'Norway', 'FI': 'Finland', 'BR': 'Brazil', 'AR': 'Argentina', 'KR': 'South Korea', 
        'JP': 'Japan', 'CN': 'China', 'IN': 'India', 'MX': 'Mexico', 'NZ': 'New Zealand', 
        'ZA': 'South Africa', 'PT': 'Portugal', 'GR': 'Greece' 
    };

    const emailIdx = lines.findIndex(l => l.includes('@guest.booking.com'));
    if (emailIdx > -1) {
        s.email = lines[emailIdx];
        if (lines.length > emailIdx + 1) {
            const nextLine = lines[emailIdx + 1].trim();
            if (/\d{5,}/.test(nextLine.replace(/\s+/g, ''))) s.phone = nextLine;
        }
    }

    const bIdIdx = lines.findIndex(l => l === 'Booking number:');
    if (bIdIdx > -1 && lines.length > bIdIdx + 1) s.bookId = lines[bIdIdx + 1].trim();

    const recIdx = lines.findIndex(l => l === 'Received');
    if (recIdx > -1 && lines.length > recIdx + 1) s.bookDate = parseOtaDate(lines[recIdx + 1]);

    const gnIdx = lines.findIndex(l => l === 'Guest name:');
    if (gnIdx > -1 && lines.length > gnIdx + 1) {
        const nameLine = lines[gnIdx + 1].trim().replace(/\bGENIUS\b/i, '').trim();
        const nameParts = nameLine.split(/\s+/).filter(Boolean);
        
        if (nameParts.length > 2 && /^[a-zA-Z]{2}$/.test(nameParts[nameParts.length - 1])) {
            const cc = nameParts.pop().toUpperCase();
            s.country = countryMap[cc] || cc;
        }
        s.firstName = nameParts[0] || '';
        s.lastName = nameParts.slice(1).join(' ');

        if (!s.country && lines.length > gnIdx + 2) {
            const potCountry = lines[gnIdx + 2].trim();
            if (!potCountry.includes('@')) {
                const match = potCountry.match(/([a-zA-Z]{2})$/);
                if (match) {
                    const cc = match[1].toUpperCase();
                    s.country = countryMap[cc] || cc;
                }
            }
        }
    }

    const ciIdx = lines.findIndex(l => l === 'Check-in');
    if (ciIdx > -1 && lines.length > ciIdx + 1) s.checkIn = parseOtaDate(lines[ciIdx + 1]);
    
    const coIdx = lines.findIndex(l => l === 'Check-out');
    if (coIdx > -1 && lines.length > coIdx + 1) s.checkOut = parseOtaDate(lines[coIdx + 1]);

    const unitsIdx = lines.findIndex(l => l === 'Total units');
    if (unitsIdx > -1 && lines.length > unitsIdx + 1) {
         const uMatch = lines[unitsIdx + 1].match(/(\d+)/);
         if (uMatch) s.units = parseInt(uMatch[1], 10);
    }

    const paxIdx = lines.findIndex(l => l === 'Total guests:');
    if (paxIdx > -1 && lines.length > paxIdx + 1) {
         const paxMatch = lines[paxIdx + 1].match(/(\d+)/);
         if (paxMatch) s.pax = parseInt(paxMatch[1], 10);
    }

    const tpIdx = lines.findIndex(l => l === 'Total price');
    if (tpIdx > -1 && lines.length > tpIdx + 1) {
        const priceMatch = lines[tpIdx + 1].match(/(?:THB|USD|EUR|GBP|฿|\$|€|£)\s*([\d,.]+)/i);
        if (priceMatch) s.totalPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
    }

    const commIdx = lines.findIndex(l => l === 'Commission and charges:');
    if (commIdx > -1 && lines.length > commIdx + 1) {
         const cMatch = lines[commIdx + 1].match(/(?:THB|USD|EUR|GBP|฿|\$|€|£)\s*([\d,.]+)/i);
         if (cMatch && s.totalPrice) {
             const commAmt = parseFloat(cMatch[1].replace(/,/g, ''));
             s.netPrice = s.totalPrice - commAmt;
         }
    }

    const bookDIdx = lines.findIndex(l => l.includes('Booking.com will collect') || l.includes('virtual credit card'));
    if (bookDIdx > -1 && lines.length > bookDIdx + 1) {
        s.bookedType = lines[bookDIdx + 1].trim(); 
    } else {
         for (let i = 0; i < lines.length; i++) {
             const l = lines[i];
             if ((l.includes('Room') || l.includes('Dorm') || l.includes('Bed') || l.includes('Bungalow')) && !l.includes('When booking') && !l.includes('policies')) {
                 s.bookedType = l;
                 break;
             }
         }
    }

    if (lines.some(l => l.includes('Payment is facilitated via Payments by Booking.com') || l.includes('Booking.com will collect'))) {
        if (s.netPrice && s.totalPrice) {
            s.payments.push({ date: s.checkIn || safeLocalYmd(), amt: s.netPrice, method: 'bdc-pay' });
            s.payments.push({ date: s.checkIn || safeLocalYmd(), amt: Number((s.totalPrice - s.netPrice).toFixed(2)), method: 'bdc-kp' });
        } else if (s.totalPrice) {
             s.payments.push({ date: s.checkIn || safeLocalYmd(), amt: s.totalPrice, method: 'bdc-pay' });
        }
    }

    return s;
}
