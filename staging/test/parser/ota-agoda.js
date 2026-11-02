// ==========================================================================
// parser/ota-agoda.js - Agoda YCS & Email Regex Engine
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
// 1. AGODA DETECTOR & PARSER ENGINE
// --------------------------------------------------------------------------

// --- Detect if Raw Text Originates from Agoda ---
export const isAgodaText = text => {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return lower.includes('agoda') || lower.includes('prudential tower') || lower.includes('ycs');
};

// --- Extract Structured Booking Data from Agoda Text ---
export const parseAgoda = text => {
    if (!text) return null;
    const l = text.split(/[\n\r]+/).map(x => x.trim()).filter(Boolean);
    const ex = reg => { const m = text.match(reg); return m ? m[1].trim() : ''; };

    const bId = ex(/(?:booking id|reference number|agoda booking id)[:\s#]*(\d{8,12})/i) || ex(/\b(\d{9,10})\b/);
    const nameMatch = text.match(/(?:guest name|primary guest|lead guest)[:\s]+([^\n\r,]+)/i);
    let gN = nameMatch ? nameMatch[1].trim() : '';

    const cI = fD(ex(/(?:check-in|check in|arrival)[:\s]+([^\n\r,]+)/i));
    const cO = fD(ex(/(?:check-out|check out|departure)[:\s]+([^\n\r,]+)/i));
    const bD = fD(ex(/(?:booked on|booking date)[:\s]+([^\n\r,]+)/i));

    const paxMatch = text.match(/(?:number of guests|guests|adults|pax)[:\s]+(\d+)/i);
    const pax = paxMatch ? parseInt(paxMatch[1], 10) : 1;

    const tot = cM(ex(/(?:total price|total amount|total|rate)[:\s]+(?:thb|฿|\$)?\s*([0-9,]+(?:\.[0-9]{2})?)/i));
    const comm = cM(ex(/(?:commission|charges)[:\s]+(?:thb|฿|\$)?\s*([0-9,]+(?:\.[0-9]{2})?)/i));

    let roomMatch = text.match(/(?:room type|room category|room)[:\s]+([^\n\r]+)/i);
    let bT = roomMatch ? roomMatch[1].trim() : '';

    const em = ex(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
    const ph = ex(/(\+[\d\s\-()]{7,20})/);

    let lN = gN, fN = '';
    const parts = gN.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
        fN = parts[0];
        lN = parts.slice(1).join(' ');
    }

    const payments = [];
    if (comm > 0) {
        payments.push({ date: cI || new Date().toISOString().split('T')[0], amt: comm, method: 'agoda-kp' });
    }
    if ((tot - comm) > 0) {
        payments.push({ date: cI || new Date().toISOString().split('T')[0], amt: Number((tot - comm).toFixed(2)), method: 'agoda-pay' });
    }

    return {
        source: 'agoda',
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
        email: em,
        phone: ph,
        country: '',
        refundability: text.toLowerCase().includes('non-refundable') ? 'non-ref' : 'ref',
        status: 'future',
        payments,
        notes: `[AGODA IMPORT: ฿${tot} from ${cI} to ${cO}]`
    };
};
