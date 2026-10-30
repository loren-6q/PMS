// ==========================================================================
// parser/ota-hostelworld.js - Hostelworld Extranet & Email Extraction Adapter
// Wild & Wandering Property Management System
// ==========================================================================

export function parseHostelworld(lines, normalizedText, parseOtaDate, safeLocalYmd) {
    const s = { source: 'hostelworld', pax: 1, payments: [], units: 1, rooms: [] };
    
    const refIdx = lines.findIndex(l => l === 'Reference' || l.includes('Reference'));
    if (refIdx > -1) {
        s.bookId = lines[refIdx + 1];
        const nameParts = (lines[refIdx + 2] || '').split(' ');
        s.firstName = nameParts[0] || '';
        s.lastName = nameParts.slice(1).join(' ');
        s.country = lines[refIdx + 3];
        
        const l4 = lines[refIdx + 4] || '', l5 = lines[refIdx + 5] || '';
        if (l4.includes('@')) s.email = l4; else if (l5.includes('@')) s.email = l5;
        
        const p4 = l4.replace(/[\s+]/g, ''), p5 = l5.replace(/[\s+]/g, '');
        if (p4.length >= 8 && !isNaN(p4)) s.phone = l4; else if (p5.length >= 8 && !isNaN(p5)) s.phone = l5;
    }
    
    const bookedIdx = lines.findIndex(l => l === 'Booked' || l === 'Booking Date');
    if (bookedIdx > -1) s.bookDate = parseOtaDate(lines[bookedIdx + 1]);
    
    const arrIdx = lines.findIndex(l => l === 'Arriving');
    if (arrIdx > -1) s.checkIn = parseOtaDate(lines[arrIdx + 1]);
    
    const hwDenseRegex = /^(\d{1,2}[a-z]{0,2}\s+[a-zA-Z]{3}\s+[`'´]?\d{2,4})(.*?)(\d{1,2})\s*(THB|USD|EUR|GBP|AUD)\s*([\d,.]+)$/i;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(hwDenseRegex);
        if (m) {
            if (!s.checkIn) s.checkIn = parseOtaDate(m[1]);
            let roomStr = m[2].trim();
            if (roomStr.toLowerCase().includes('non-refundable') || roomStr.toLowerCase().includes('non refundable')) {
                s.refundability = 'non-ref';
                roomStr = roomStr.replace(/non-?refundable/gi, '').replace(/-\s*$/, '').trim();
            }
            s.bookedType = roomStr;
            const paxStr = m[3];
            const paxVal = parseInt(paxStr.length > 1 ? paxStr.charAt(0) : paxStr); 
            if (!isNaN(paxVal) && paxVal > 0) s.pax = paxVal;
            break;
        }
    }

    const hwBedMatch = normalizedText.match(/(?:No\.?\s*of\s*Beds?|Beds?|Persons?)\s*:?\s*(\d+)/i);
    if (hwBedMatch) {
        const bNum = parseInt(hwBedMatch[1], 10);
        if (bNum > 0) s.units = bNum;
    }

    const nightMatch = normalizedText.match(/(\d+)\s*Nights?/i);
    if (nightMatch && s.checkIn) {
        const nights = parseInt(nightMatch[1]) || 1;
        const p = s.checkIn.split('-');
        if (p.length === 3) {
            const d = new Date(Date.UTC(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])));
            d.setUTCDate(d.getUTCDate() + nights);
            s.checkOut = d.toISOString().split('T')[0];
        }
    }
    
    const subIdx = lines.findIndex(l => l.includes('Subtotal') || l === 'Total');
    if (subIdx > -1 && lines.length > subIdx + 1) {
        const amtStr = lines[subIdx + 1] || lines[subIdx];
        s.totalPrice = parseFloat(amtStr.replace(/[^\d.]/g, ''));
    }
    
    const depIdx = lines.findIndex(l => l.includes('Hostelworld Deposit') || l.includes('Deposit'));
    if (depIdx > -1 && lines.length > depIdx + 1) {
        const depositAmt = parseFloat((lines[depIdx + 1] || lines[depIdx]).replace(/[^\d.]/g, ''));
        if (!isNaN(depositAmt)) s.payments.push({ date: s.checkIn || safeLocalYmd(), amt: depositAmt, method: 'hw-kp' });
    }

    return s;
}
