// ==========================================================================
// parser/ota-airbnb.js - Airbnb Confirmation & Reservation List Regex Engine
// Wild & Wandering Property Management System
// ==========================================================================

// --- Helper: Clean Currency String to Float ---
const cM = s => Number(parseFloat((s || '').replace(/[^0-9.-]+/g, "")).toFixed(2)) || 0;

// --- Helper: Flexible Date String to YYYY-MM-DD Normalizer ---
const fD = dS => {
    if (!dS) return '';
    let clean = dS.replace(/´/g, '').replace(/'/g, '').replace(/,/g, '').replace(/(st|nd|rd|th)\b/gi, '').trim();
    const mths = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    let parts = clean.split(/\s+/);
    let d = 1, m = '01', y = new Date().getFullYear();
    parts.forEach(p => {
        let l = p.toLowerCase().substring(0, 3);
        if (mths[l]) m = mths[l];
        else if (/^\d{1,2}$/.test(p)) d = parseInt(p, 10);
        else if (/^\d{2}$/.test(p) && p.length === 2) y = 2000 + parseInt(p, 10);
        else if (/^\d{4}$/.test(p)) y = parseInt(p, 10);
    });
    return `${y}-${m}-${String(d).padStart(2, '0')}`;
};

// --------------------------------------------------------------------------
// 1. AIRBNB DETECTOR & PARSER ENGINE
// --------------------------------------------------------------------------

// --- Detect if Raw Text Originates from Airbnb ---
export const isAirbnbText = text => {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return lower.includes('airbnb') || lower.includes('reservation confirmed');
};

// --- Extract Structured Booking Data from Airbnb Text ---
export const parseAirbnb = text => {
    if (!text) return null;
    const ab = text.split(/[\n\r]+/).map(x => x.trim()).filter(Boolean);
    const ex = reg => { const m = text.match(reg); return m ? m[1].trim() : ''; };

    let gN = '', bT = '', cI = '', cO = '', cCode = '', notes = '';

    let sunsetIdx = ab.findIndex(l => l.toLowerCase().includes('sunset'));
    if (sunsetIdx > 0 && /^([a-zA-Z]{3})\s\d+/.test(ab[sunsetIdx - 2])) {
        gN = ab[sunsetIdx - 1].split(/['’]s group/i)[0].trim();
        bT = ab[sunsetIdx];
        let dateLine = ab[sunsetIdx - 2];
        let dMatch = dateLine.match(/([a-zA-Z]{3}\s\d+)[^\dA-Za-z]+(?:([a-zA-Z]{3})\s)?(\d+)/i);
        if (dMatch) {
            let d1 = dMatch[1];
            let m2 = dMatch[2] || d1.split(' ')[0];
            let d2 = dMatch[3];
            cI = fD(d1);
            cO = fD(`${m2} ${d2}`);
        }
    } else {
        let nIdx = ab.findIndex(x => x.includes('Identity verified') || x.includes('reviews'));
        if (nIdx > 0) {
            gN = ab[nIdx - 1];
            let cLine = ab[nIdx + 1];
            if (cLine && !cLine.includes('Hello') && !cLine.includes('Hi') && !cLine.includes('Automatically')) {
                let parts = cLine.split(',');
                cCode = parts[parts.length - 1].trim();
            }
        } else {
            gN = ex(/Reservation confirmed - (.*?)\s+arrives/i);
        }

        cI = fD(ex(/Check-in[\s\S]*?([A-Za-z]{3},\s*[A-Za-z]{3}\s*\d+(?:,\s*\d{4})?)/i));
        cO = fD(ex(/Checkout[\s\S]*?([A-Za-z]{3},\s*[A-Za-z]{3}\s*\d+(?:,\s*\d{4})?)/i));
        bT = ex(/([^\n]+?)\s*Room\s*Check-in/i);

        let msgIdx = ab.findIndex(x => x.toLowerCase().includes('message from'));
        if (msgIdx > -1) {
            let msg = [];
            for (let i = msgIdx + 1; i < ab.length; i++) {
                if (ab[i].includes('Automatically translated') || ab[i].includes('Hosting requirements') || ab[i].includes('View itinerary')) break;
                if (ab[i].trim()) msg.push(ab[i]);
            }
            if (msg.length > 0) notes = "GUEST MSG:\n" + msg.join("\n");
        }
    }

    const bId = ex(/Confirmation code[\s\S]*?([A-Z0-9]+)/i) || ex(/\b([A-Z0-9]{10})\b/);
    const bD = fD(ex(/Airbnb[\s\S]*?([A-Za-z]{3},\s*[A-Za-z]{3}\s*\d+(?:,\s*\d{4})?)/i));
    const pax = parseInt(ex(/Guests[\s\S]*?(\d+)/i), 10) || 1;
    const tot = cM(ex(/Total\s*(?:\([A-Z]+\))?[\s\S]{0,30}?(?:THB|฿|\$|€|£|[A-Z]{3})\s*([\d,.]+)/i));
    const comm = cM(ex(/Host service fee[\s\S]*?(?:฿|THB)\s*([\d,.]+)/i));

    let lN = gN.trim(), fN = "";
    if (gN.includes(',')) {
        const p = gN.split(',');
        lN = p[0].trim();
        fN = p.slice(1).join(',').trim();
    } else {
        const p = gN.split(/\s+/);
        fN = p[0]?.trim() || '';
        lN = p.length > 1 ? p.slice(1).join(' ').trim() : '';
    }

    const payments = [];
    if (tot > 0) {
        payments.push({
            date: cI || new Date().toISOString().split('T')[0],
            amt: Math.max(0, tot - comm),
            method: 'airbnb-pay'
        });
    }

    return {
        source: 'airbnb',
        bookId: bId,
        firstName: fN.toUpperCase(),
        lastName: lN.toUpperCase(),
        checkIn: cI,
        checkOut: cO,
        bookDate: bD,
        pax,
        bookedType: bT.toUpperCase(),
        totalPrice: tot,
        netPrice: Math.max(0, tot - comm),
        email: '',
        phone: '',
        country: cCode,
        refundability: 'ref',
        status: 'future',
        payments,
        notes: (notes || `[AIRBNB IMPORT: ฿${tot}]`).trim()
    };
};
