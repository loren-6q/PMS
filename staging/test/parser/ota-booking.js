// ==========================================================================
// parser/ota-booking.js - Booking.com Extranet Line-by-Line State Machine
// Wild & Wandering Property Management System
// ==========================================================================

import { parseFlexibleDate } from './parser-engine.js';

// --- ISO-2 Country Code Dictionary ---
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

// --- Extract PMS Category from Extranet String ---
function cleanCategoryString(raw) {
    if (!raw) return '';
    const str = raw.replace(/^[-•]\s*/, '').trim();

    // Match outer parentheses: "Deluxe Double Room with Side Sea View (Partial Oceanview King Room (A5,7,9,11))"
    // -> "Partial Oceanview King Room (A5,7,9,11)"
    const pMatch = str.match(/\((.+)\)\s*$/);
    if (pMatch && pMatch[1]) {
        // Strip nested assignment tags: "(A5,7,9,11)" -> "Partial Oceanview King Room"
        const stripped = pMatch[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
        return stripped || pMatch[1].trim();
    }
    return str;
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

    // --- LINE-BY-LINE EXACT STATE MACHINE ---
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 1. Check-in Date (Exact label: "Check-in")
        if (/^Check-in$/i.test(line) && i + 1 < lines.length) {
            checkIn = parseFlexibleDate(lines[i + 1]);
        }

        // 2. Check-out Date (Exact label: "Check-out")
        if (/^Check-out$/i.test(line) && i + 1 < lines.length) {
            checkOut = parseFlexibleDate(lines[i + 1]);
        }

        // 3. Headcount (Exact label: "Total guests:")
        if (/^Total\s*guests:?$/i.test(line) && i + 1 < lines.length) {
            const p = parseInt(lines[i + 1], 10);
            if (!isNaN(p) && p > 0) pax = p;
        }

        // 4. Unit Count (Exact label: "Total units")
        if (/^Total\s*units:?$/i.test(line) && i + 1 < lines.length) {
            const u = parseInt(lines[i + 1], 10);
            if (!isNaN(u) && u > 0) unitCount = u;
        }

        // 5. Total Price (Exact label: "Total price")
        if (/^Total\s*price$/i.test(line) && i + 1 < lines.length) {
            const m = lines[i + 1].match(/([0-9,]+(?:\.[0-9]{2})?)/);
            if (m) totalPrice = parseFloat(m[1].replace(/,/g, '')) || 0;
        }

        // 6. Guest Name & Contact Block (Exact label: "Guest name:")
        if (/^Guest\s*name:?$/i.test(line) && i + 1 < lines.length) {
            const nameLine = lines[i + 1];
            const parts = nameLine.split(' ').map(p => p.trim()).filter(Boolean);
            firstName = parts[0] || '';
            lastName = parts.slice(1).join(' ') || 'GUEST';

            // Scan lines below name for ISO country code, email, and phone
            for (let j = i + 2; j < Math.min(i + 6, lines.length); j++) {
                const sub = lines[j];
                // 2-Letter ISO Country Code (e.g. "gb")
                if (!country && /^[a-zA-Z]{2}$/.test(sub)) {
                    const iso = sub.toUpperCase();
                    country = COUNTRY_ISO_MAP[iso] || iso;
                }
                // Email
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

        // 7. Booking Number (Exact label: "Booking number:")
        if (/^Booking\s*number:?$/i.test(line) && i + 1 < lines.length) {
            const m = lines[i + 1].match(/\b([0-9]{8,15})\b/);
            if (m) bookId = m[1];
        }

        // 8. Received Date (Exact label: "Received")
        if (/^Received$/i.test(line) && i + 1 < lines.length) {
            bookDate = parseFlexibleDate(lines[i + 1]);
        }

        // 9. Commission & Charges (Exact label: "Commission and charges:")
        if (/^Commission\s*and\s*charges:?$/i.test(line) && i + 1 < lines.length) {
            const m = lines[i + 1].match(/([0-9,]+(?:\.[0-9]{2})?)/);
            if (m) commissionAmt = parseFloat(m[1].replace(/,/g, '')) || 0;
        }

        // 10. Prepaid Verification
        if (/Payments\s+by\s+Booking\.com/i.test(line) || /Booking\.com\s+will\s+collect/i.test(line)) {
            isPrepaid = true;
        }

        // 11. Room Category (Target 1: Line directly preceding "Cancellation")
        if (i + 1 < lines.length && /^Cancellation$/i.test(lines[i + 1])) {
            bookedType = cleanCategoryString(line);
        }

        // 11b. Room Category Fallback (Target 2: Bullet line under payment details)
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

        // 12. Cancellation Policy (Exact label: "Cancellation")
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

    // Fallback: If unitCount was unstated, default to pax
    if (!unitCount || unitCount < 1) unitCount = pax;

    // Calculate Net Payout & Commission
    if (totalPrice > 0) {
        if (commissionAmt > 0) {
            explicitNet = Number((totalPrice - commissionAmt).toFixed(2));
        } else {
            const defaultRate = parseFloat(window.currentPropertyConfig?.commissions?.['booking.com'] || 18);
            commissionAmt = Number((totalPrice * (defaultRate / 100)).toFixed(2));
            explicitNet = Number((totalPrice - commissionAmt).toFixed(2));
        }
    }

    // Payment Entries: Both BDC-PAY (Payout) and BDC-KP (Commission)
    const payments = [];
    if (isPrepaid && totalPrice > 0 && checkIn) {
        // 1. Net Payout received from Booking.com
        payments.push({
            date: checkIn,
            amt: explicitNet !== null ? explicitNet : totalPrice,
            method: 'bdc-pay'
        });
        // 2. Commission Kept by Booking.com (Settles balance to ฿0.00)
        if (commissionAmt > 0) {
            payments.push({
                date: checkIn,
                amt: commissionAmt,
                method: 'bdc-kp'
            });
        }
    }

    // Duration and average daily rate
    let nights = 1;
    if (checkIn && checkOut) {
        const ms = new Date(checkOut) - new Date(checkIn);
        nights = Math.max(1, Math.round(ms / 86400000)) || 1;
    }
    const avgNightly = totalPrice > 0 ? (totalPrice / nights).toFixed(2) : '0.00';

    // Summary Header Block
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
