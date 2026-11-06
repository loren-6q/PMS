// ==========================================================================
// parser/ota-booking.js - Booking.com Extranet Line-by-Line State Machine
// Wild & Wandering Property Management System
// ==========================================================================

import { parseFlexibleDate } from './parser-engine.js';

// --- ISO-2 Country Code Dictionary (TM30 Standard) ---
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

// --- Helper: Extract Exact PMS Room Category from Parentheses ---
function cleanCategoryString(raw) {
    if (!raw) return '';
    const str = raw.replace(/^[-•]\s*/, '').trim();

    // Match outer parentheses: "Deluxe Double Room with Side Sea View (Partial Oceanview King Room (A5,7,9,11))"
    // -> captures "Partial Oceanview King Room (A5,7,9,11)"
    const pMatch = str.match(/\((.+)\)\s*$/);
    if (pMatch && pMatch[1]) {
        // Strip trailing room-allocation numbers: "(A5,7,9,11)" -> "Partial Oceanview King Room"
        const stripped = pMatch[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
        return stripped || pMatch[1].trim();
    }
    return str;
}

export function parseBookingCom(rawText) {
    if (!rawText) return null;

    // Split into non-empty, trimmed lines
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return null;

    // Strict Extranet verification
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

    // --- EXACT LINE-BY-LINE STATE MACHINE ---
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

        // 3. Headcount (Total guests: \n 1)
        if (/^Total\s*guests:?$/i.test(line) && i + 1 < lines.length) {
            const p = parseInt(lines[i + 1], 10);
            if (!isNaN(p) && p > 0) pax = p;
        }

        // 4. Unit Count (Total units \n 1)
        if (/^Total\s*units:?$/i.test(line) && i + 1 < lines.length) {
            const u = parseInt(lines[i + 1], 10);
            if (!isNaN(u) && u > 0) unitCount = u;
        }

        // 5. Total Price (Total price \n THB 6,191.28)
        if (/^Total\s*price$/i.test(line) && i + 1 < lines.length) {
            const m = lines[i + 1].match(/([0-9,]+(?:\.[0-9]{2})?)/);
            if (m) totalPrice = parseFloat(m[1].replace(/,/g, '')) || 0;
        }

        // 6. Guest Name & Contact Details (Guest name: \n Ashraf Idrissou \n gb)
        if (/^Guest\s*name:?$/i.test(line) && i + 1 < lines.length) {
            const nameLine = lines[i + 1];
            const parts = nameLine.split(' ').map(p => p.trim()).filter(Boolean);
            firstName = parts[0] || '';
            lastName = parts.slice(1).join(' ') || 'GUEST';

            // Scan following lines for 2-digit ISO country code, proxy email, and phone
            for (let j = i + 2; j < Math.min(i + 6, lines.length); j++) {
                const sub = lines[j];
                if (!country && /^[a-zA-Z]{2}$/.test(sub)) {
                    const iso = sub.toUpperCase();
                    country = COUNTRY_ISO_MAP[iso] || iso;
                }
                if (!email && sub.includes('@')) {
                    email = sub;
                    if (email.includes('@guest.booking.com')) {
                        isProxyEmail = true;
                    }
                }
                if (!phone && /^\+\d[\d\s\-\(\)]{6,20}$/.test(sub)) {
                    phone = sub;
                }
            }
        }

        // 7. Booking Number (Booking number: \n 6504048867)
        if (/^Booking\s*number:?$/i.test(line) && i + 1 < lines.length) {
            const m = lines[i + 1].match(/\b([0-9]{8,15})\b/);
            if (m) bookId = m[1];
        }

        // 8. Received Date (Received \n Sat 19 Sept 2026)
        if (/^Received$/i.test(line) && i + 1 < lines.length) {
            bookDate = parseFlexibleDate(lines[i + 1]);
        }

        // 9. Commission and Charges (Commission and charges: \n THB 1,258.89)
        if (/^Commission\s*and\s*charges:?$/i.test(line) && i + 1 < lines.length) {
            const m = lines[i + 1].match(/([0-9,]+(?:\.[0-9]{2})?)/);
            if (m) commissionAmt = parseFloat(m[1].replace(/,/g, '')) || 0;
        }

        // 10. Prepaid Verification
        if (/Payments\s+by\s+Booking\.com/i.test(line) || /Booking\.com\s+will\s+collect/i.test(line)) {
            isPrepaid = true;
        }

        // 11. Room Category (Target A: Line directly above "Cancellation")
        if (i + 1 < lines.length && /^Cancellation$/i.test(lines[i + 1])) {
            bookedType = cleanCategoryString(line);
        }

        // 11b. Room Category (Target B: Bullet line under payment details)
        if (!bookedType && /^[-•]\s*(.+)/.test(line)) {
            const raw = line.replace(/^[-•]\s*/, '').trim();
            if (raw.length > 5 &&
                !/^(?:THB|฿|\$|€|£|[0-9,.]+$)/i.test(raw) &&
                !/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(raw) &&
                !/Conversation with guest/i.test(raw) &&
                !/^(?:Home|Rates|Promotions|Reservations|Property|Inbox|Finance|Analytics)/i.test(raw)) {
                bookedType = cleanCategoryString(raw);
            }
        }

        // 12. Cancellation Policy (Cancellation \n The guest will be charged the total price...)
        if (/^Cancellation$/i.test(line) && i + 1 < lines.length) {
            const policyText = lines[i + 1];
            if (/charged\s+the\s+total\s+price|cancel\s+at\s+any\s+time|non-refundable/i.test(policyText)) {
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

    if (!unitCount || unitCount < 1) unitCount = pax;

    // Financial Reconciliation
    if (totalPrice > 0) {
        if (commissionAmt > 0) {
            explicitNet = Number((totalPrice - commissionAmt).toFixed(2));
        } else {
            const defaultRate = parseFloat(window.currentPropertyConfig?.commissions?.['booking.com'] || 18);
            commissionAmt = Number((totalPrice * (commRate / 100)).toFixed(2));
            explicitNet = Number((totalPrice - commissionAmt).toFixed(2));
        }
    }

    // Split Payments: bdc-pay (Bank Transfer Payout) + bdc-kp (Commission Kept by BDC)
    const payments = [];
    if (isPrepaid && totalPrice > 0 && checkIn) {
        payments.push({
            date: checkIn,
            amt: explicitNet !== null ? explicitNet : totalPrice,
            method: 'bdc-pay'
        });
        if (commissionAmt > 0) {
            payments.push({
                date: checkIn,
                amt: commissionAmt,
                method: 'bdc-kp'
            });
        }
    }

    let nights = 1;
    if (checkIn && checkOut) {
        const ms = new Date(checkOut) - new Date(checkIn);
        nights = Math.max(1, Math.round(ms / 86400000)) || 1;
    }
    const avgNightly = totalPrice > 0 ? (totalPrice / nights).toFixed(2) : '0.00';

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
