// ==========================================================================
// parser/ota-booking.js - Booking.com Extranet Line-by-Line State Machine
// Wild & Wandering Property Management System
// ==========================================================================

import { parseFlexibleDate } from './parser-engine.js';

// --- Complete ISO-2 Country Code Dictionary ---
const COUNTRY_ISO_MAP = {
    'AF': 'AFGHANISTAN', 'AL': 'ALBANIA', 'DZ': 'ALGERIA', 'AD': 'ANDORRA', 'AO': 'ANGOLA',
    'AR': 'ARGENTINA', 'AM': 'ARMENIA', 'AU': 'AUSTRALIA', 'AT': 'AUSTRIA', 'AZ': 'AZERBAIJAN',
    'BS': 'BAHAMAS', 'BH': 'BAHRAIN', 'BD': 'BANGLADESH', 'BY': 'BELARUS', 'BE': 'BELGIUM',
    'BZ': 'BELIZE', 'BJ': 'BENIN', 'BT': 'BHUTAN', 'BO': 'BOLIVIA', 'BA': 'BOSNIA AND HERZEGOVINA',
    'BW': 'BOTSWANA', 'BR': 'BRAZIL', 'BG': 'BULGARIA', 'KH': 'CAMBODIA', 'CM': 'CAMEROON',
    'CA': 'CANADA', 'CL': 'CHILE', 'CN': 'CHINA', 'CO': 'COLOMBIA', 'CR': 'COSTA RICA',
    'HR': 'CROATIA', 'CU': 'CUBA', 'CY': 'CYPRUS', 'CZ': 'CZECH REPUBLIC', 'DK': 'DENMARK',
    'EC': 'ECUADOR', 'EG': 'EGYPT', 'EE': 'ESTONIA', 'ET': 'ETHIOPIA', 'FI': 'FINLAND',
    'FR': 'FRANCE', 'GE': 'GEORGIA', 'DE': 'GERMANY', 'GH': 'GHANA', 'GR': 'GREECE',
    'GT': 'GUATEMALA', 'HK': 'HONG KONG', 'HU': 'HUNGARY', 'IS': 'ICELAND', 'IN': 'INDIA',
    'ID': 'INDONESIA', 'IR': 'IRAN', 'IE': 'IRELAND', 'IL': 'ISRAEL', 'IT': 'ITALY',
    'JM': 'JAMAICA', 'JP': 'JAPAN', 'JO': 'JORDAN', 'KZ': 'KAZAKHSTAN', 'KE': 'KENYA',
    'KR': 'SOUTH KOREA', 'KW': 'KUWAIT', 'LA': 'LAOS', 'LV': 'LATVIA', 'LB': 'LEBANON',
    'LT': 'LITHUANIA', 'LU': 'LUXEMBOURG', 'MY': 'MALAYSIA', 'MV': 'MALDIVES', 'MT': 'MALTA',
    'MX': 'MEXICO', 'MC': 'MONACO', 'MN': 'MONGOLIA', 'MA': 'MOROCCO', 'MM': 'MYANMAR',
    'NP': 'NEPAL', 'NL': 'NETHERLANDS', 'NZ': 'NEW ZEALAND', 'NG': 'NIGERIA', 'NO': 'NORWAY',
    'OM': 'OMAN', 'PK': 'PAKISTAN', 'PA': 'PANAMA', 'PE': 'PERU', 'PH': 'PHILIPPINES',
    'PL': 'POLAND', 'PT': 'PORTUGAL', 'QA': 'QATAR', 'RO': 'ROMANIA', 'RU': 'RUSSIA',
    'SA': 'SAUDI ARABIA', 'RS': 'SERBIA', 'SG': 'SINGAPORE', 'SK': 'SLOVAKIA', 'SI': 'SLOVENIA',
    'ZA': 'SOUTH AFRICA', 'ES': 'SPAIN', 'LK': 'SRI LANKA', 'SE': 'SWEDEN', 'CH': 'SWITZERLAND',
    'TW': 'TAIWAN', 'TH': 'THAILAND', 'TR': 'TURKEY', 'UA': 'UKRAINE', 'AE': 'UNITED ARAB EMIRATES',
    'GB': 'UNITED KINGDOM', 'UK': 'UNITED KINGDOM', 'US': 'UNITED STATES', 'USA': 'UNITED STATES',
    'UY': 'URUGUAY', 'UZ': 'UZBEKISTAN', 'VN': 'VIETNAM', 'ZW': 'ZIMBABWE'
};

// --- Helper: Extract Exact PMS Room Category ---
function resolveExactRoomCategory(raw) {
    if (!raw) return '';
    
    // 1. Direct match against active property categories in window.hotelRooms
    if (typeof window !== 'undefined' && Array.isArray(window.hotelRooms) && window.hotelRooms.length > 0) {
        const categories = [...new Set(window.hotelRooms.map(r => r.category || r.type).filter(Boolean))];
        // Sort longest-first to prevent partial collisions (e.g. "Partial Oceanview King Room" vs "Oceanview King Room")
        categories.sort((a, b) => b.length - a.length);

        const lowerRaw = raw.toLowerCase();
        const matched = categories.find(cat => lowerRaw.includes(cat.toLowerCase()));
        if (matched) return matched;
    }

    // 2. Extract internal category from outer parentheses
    // e.g. "Deluxe Double Room with Side Sea View (Partial Oceanview King Room (A5,7,9,11))"
    const pMatch = raw.match(/\((.+)\)\s*$/);
    if (pMatch && pMatch[1]) {
        // Strip secondary nested room assignment tag if present: "(A5,7,9,11)"
        const cleaned = pMatch[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
        return cleaned || pMatch[1].trim();
    }

    return raw.trim();
}

export function parseBookingCom(rawText) {
    if (!rawText) return null;

    // Split into trimmed, non-empty lines
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return null;

    // Signature verification
    const isBdc = lines.some(l => /Booking\.com/i.test(l) || /Booking number/i.test(l) || /Reservation details/i.test(l));
    if (!isBdc) return null;

    let checkIn = '';
    let checkOut = '';
    let pax = 1;
    let unitCount = 1;
    let totalPrice = 0;
    let commissionAmt = 0;
    let explicitNet = null;
    let bookId = '';
    let bookDate = '';
    let firstName = '';
    let lastName = 'GUEST';
    let country = '';
    let email = '';
    let phone = '';
    let isProxyEmail = false;
    let bookedType = '';
    let refundability = 'unknown';
    let isPrepaid = false;
    let specialRequests = '';

    // --- LINE-BY-LINE STATE MACHINE ---
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 1. Check-in Date
        if (/^Check-in$/i.test(line) && i + 1 < lines.length) {
            checkIn = parseFlexibleDate(lines[i + 1]);
        }

        // 2. Check-out Date
        if (/^Check-out$/i.test(line) && i + 1 < lines.length) {
            checkOut = parseFlexibleDate(lines[i + 1]);
        }

        // 3. Headcount (Pax)
        if (/^Total\s*guests:?$/i.test(line) && i + 1 < lines.length) {
            const p = parseInt(lines[i + 1], 10);
            if (!isNaN(p) && p > 0) pax = p;
        } else if (/^Total\s*guests:?\s*(\d+)$/i.test(line)) {
            const m = line.match(/^Total\s*guests:?\s*(\d+)$/i);
            if (m) pax = parseInt(m[1], 10) || 1;
        }

        // 4. Unit Count
        if (/^Total\s*units:?$/i.test(line) && i + 1 < lines.length) {
            const u = parseInt(lines[i + 1], 10);
            if (!isNaN(u) && u > 0) unitCount = u;
        } else if (/^Total\s*units:?\s*(\d+)$/i.test(line)) {
            const m = line.match(/^Total\s*units:?\s*(\d+)$/i);
            if (m) unitCount = parseInt(m[1], 10) || 1;
        }

        // 5. Total Price
        if (/^Total\s*price$/i.test(line) && i + 1 < lines.length) {
            const m = lines[i + 1].match(/([0-9,]+(?:\.[0-9]{2})?)/);
            if (m) totalPrice = parseFloat(m[1].replace(/,/g, '')) || 0;
        } else if (/^Total\s*price:?\s*(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{2})?)/i.test(line)) {
            const m = line.match(/([0-9,]+(?:\.[0-9]{2})?)/);
            if (m) totalPrice = parseFloat(m[1].replace(/,/g, '')) || 0;
        }

        // 6. Guest Name & Identity Block
        if (/^Guest\s*name:?$/i.test(line) && i + 1 < lines.length) {
            const nameLine = lines[i + 1];
            const parts = nameLine.split(' ').map(p => p.trim()).filter(Boolean);
            firstName = parts[0] || '';
            lastName = parts.slice(1).join(' ') || 'GUEST';

            // Scan the immediate 4 lines below the name for Country ISO, email, and phone
            for (let j = i + 2; j < Math.min(i + 6, lines.length); j++) {
                const sub = lines[j];
                // 2-Letter ISO Country Code (e.g. "gb", "th", "us")
                if (!country && /^[a-zA-Z]{2}$/.test(sub)) {
                    const iso = sub.toUpperCase();
                    country = COUNTRY_ISO_MAP[iso] || iso;
                }
                // Guest Proxy Email
                if (!email && sub.includes('@')) {
                    email = sub;
                    if (email.includes('@guest.booking.com')) {
                        isProxyEmail = true;
                    }
                }
                // Phone Number
                if (!phone && /^\+\d[\d\s\-\(\)]{6,20}$/.test(sub)) {
                    phone = sub;
                }
            }
        }

        // 7. Booking Number
        if (/^Booking\s*number:?$/i.test(line) && i + 1 < lines.length) {
            const m = lines[i + 1].match(/\b([0-9]{8,15})\b/);
            if (m) bookId = m[1];
        } else if (/^Booking\s*number:?\s*([0-9]{8,15})/i.test(line)) {
            const m = line.match(/^Booking\s*number:?\s*([0-9]{8,15})/i);
            if (m) bookId = m[1];
        }

        // 8. Received Date (Booking Date)
        if (/^Received$/i.test(line) && i + 1 < lines.length) {
            bookDate = parseFlexibleDate(lines[i + 1]);
        } else if (/^Received:?\s*(.+)/i.test(line)) {
            bookDate = parseFlexibleDate(line.replace(/^Received:?\s*/i, ''));
        }

        // 9. Commission and Charges
        if (/^Commission\s*and\s*charges:?$/i.test(line) && i + 1 < lines.length) {
            const m = lines[i + 1].match(/([0-9,]+(?:\.[0-9]{2})?)/);
            if (m) commissionAmt = parseFloat(m[1].replace(/,/g, '')) || 0;
        } else if (/^Commission\s*and\s*charges:?\s*(?:THB|฿|[A-Z]{3})?\s*([0-9,]+(?:\.[0-9]{2})?)/i.test(line)) {
            const m = line.match(/([0-9,]+(?:\.[0-9]{2})?)/);
            if (m) commissionAmt = parseFloat(m[1].replace(/,/g, '')) || 0;
        }

        // 10. Prepaid Check
        if (/Payments\s+by\s+Booking\.com/i.test(line) || /Booking\.com\s+will\s+collect/i.test(line)) {
            isPrepaid = true;
        }

        // 11. Room Category (Lines starting with "- " or Bullet)
        if (!bookedType && /^[-•]\s*(.+)/.test(line)) {
            const rawRoom = line.replace(/^[-•]\s*/, '').trim();
            // Filter out price or date lines that also use bullet prefixes
            if (!/^(?:THB|฿|\$|€|£|[0-9,.]+$)/i.test(rawRoom) &&
                !/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(rawRoom) &&
                !/Conversation with guest/i.test(rawRoom)) {
                bookedType = resolveExactRoomCategory(rawRoom);
            }
        }

        // 12. Cancellation Policy
        if (/^Cancellation$/i.test(line) && i + 1 < lines.length) {
            const policyLine = lines[i + 1];
            if (/charged\s+the\s+total\s+price|non-refundable|cancel\s+at\s+any\s+time/i.test(policyLine)) {
                refundability = 'non-ref';
            } else {
                refundability = 'ref';
            }
        }

        // 13. Special Requests
        if (/^Special\s*requests?:?$/i.test(line) && i + 1 < lines.length) {
            if (!/^None$/i.test(lines[i + 1])) {
                specialRequests = lines[i + 1];
            }
        }
    }

    // Calculate Net Payout
    if (totalPrice > 0) {
        if (commissionAmt > 0) {
            explicitNet = Number((totalPrice - commissionAmt).toFixed(2));
        } else {
            const defaultRate = parseFloat(window.currentPropertyConfig?.commissions?.['booking.com'] || 18);
            commissionAmt = Number((totalPrice * (defaultRate / 100)).toFixed(2));
            explicitNet = Number((totalPrice - commissionAmt).toFixed(2));
        }
    }

    // Payments: Facilitated prepaid cards take the net payout
    const payments = [];
    if (isPrepaid && totalPrice > 0 && checkIn) {
        payments.push({
            date: checkIn,
            amt: explicitNet !== null ? explicitNet : totalPrice,
            method: 'bdc-pay'
        });
    }

    // Calculate duration and average daily rate
    let nights = 1;
    if (checkIn && checkOut) {
        const ms = new Date(checkOut) - new Date(checkIn);
        nights = Math.max(1, Math.round(ms / 86400000)) || 1;
    }
    const avgNightly = totalPrice > 0 ? (totalPrice / nights).toFixed(2) : '0.00';

    // Format the standard summary block
    const noteLines = [
        `--- ORIGINAL OTA BOOKING ---`,
        `Source: BOOKING.COM`,
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
    if (specialRequests) noteLines.push(`• Special Request: ${specialRequests}`);

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
        nightlyRates: [],
        isAverageRate: true,
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
