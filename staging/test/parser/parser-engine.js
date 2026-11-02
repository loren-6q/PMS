// ==========================================================================
// parser/parser-engine.js - Master Clipboard & Manual Paste Email Parser
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD, getLocalYMD } from '../pms/pms-init.js';

const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);

export const parseEmail = () => {
    const txt = $('email-textarea')?.value; 
    if (!txt || txt.trim() === '') return; 
    
    let f = $('import-format-select')?.value || 'auto';
    const tLow = txt.toLowerCase();
    if (tLow.includes('339615-') || tLow.includes('hostelworld.com')) f = 'hw-web';
    else if (tLow.includes('airbnb') || tLow.includes('reservation confirmed') || tLow.includes('sunset beach resort')) f = 'airbnb-email';
    else if (tLow.includes('booking.com') || tLow.includes('commission and charges')) f = 'bdc-extranet';

    const ex = (reg, src = txt) => { const m = src.match(reg); return m ? m[1].trim() : ''; };
    const cM = s => Number(parseFloat((s||'').replace(/[^0-9.-]+/g,"")).toFixed(2)) || 0;
    
    const fD = dS => {
        if (!dS) return '';
        let clean = dS.replace(/´/g, '').replace(/'/g, '').replace(/,/g, '').replace(/(st|nd|rd|th)\b/gi, '').trim();
        const mths = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
        let parts = clean.split(/\s+/);
        let d = 1, m = '01', y = new Date().getFullYear();
        parts.forEach(p => {
            let l = p.toLowerCase().substring(0,3);
            if (mths[l]) m = mths[l];
            else if (/^\d{1,2}$/.test(p)) d = parseInt(p, 10);
            else if (/^\d{2}$/.test(p) && p.length === 2) y = 2000 + parseInt(p, 10);
            else if (/^\d{4}$/.test(p)) y = parseInt(p, 10);
        });
        return `${y}-${m}-${String(d).padStart(2,'0')}`;
    };

    let src = '', gN = '', cI = '', cO = '', pax = 1, ph = '', em = '', tot = 0, comm = 0, bId = '', notes = '', bT = '', bD = '', cCode = '', ref = 0, pUp = 0, pSt = 'future', hBdcP = false, un = 1;

    if (f === 'hw-web' || f === 'hw-email') {
        src = 'hostelworld';
        let lines = txt.split(/[\n\r]+/).map(x => x.trim()).filter(Boolean);
        
        let refIdx = lines.findIndex(l => l.includes('339615-'));
        if (refIdx > -1) {
            bId = lines[refIdx].match(/(339615-\d+)/)[1];
            gN = lines[refIdx + 1];
            cCode = lines[refIdx + 2];
            
            for (let i = refIdx + 3; i < refIdx + 8; i++) {
                if (!lines[i] || lines[i] === 'Booked' || lines[i].includes('Night')) break;
                if (lines[i].includes('@') && !em) em = lines[i];
                else if (/^[\d\+\s]+$/.test(lines[i]) && lines[i].length >= 8 && !lines[i].includes('-')) ph = lines[i];
            }
        }
        
        let nIdx = lines.findIndex(l => l.endsWith('Night') || l.endsWith('Nights'));
        let nights = 1;
        if (nIdx > -1) {
            nights = parseInt(lines[nIdx], 10) || 1;
            let possiblePax = parseInt(lines[nIdx - 1], 10);
            if (!isNaN(possiblePax) && possiblePax > 0 && possiblePax < 50) pax = possiblePax;
        }
        
        let bIdx = lines.findIndex(l => l === 'Booked');
        if (bIdx > -1) bD = fD(lines[bIdx + 1]);
        
        let aIdx = lines.findIndex(l => l === 'Arriving');
        if (aIdx > -1) {
            cI = fD(lines[aIdx + 1]);
            if (cI && nights) {
                let d = new Date(cI + "T12:00:00Z");
                d.setUTCDate(d.getUTCDate() + nights);
                cO = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
            }
        }
        
        let subIdx = lines.findIndex(l => l === 'Subtotal');
        if (subIdx > -1) tot = cM(lines[subIdx + 1]);
        
        let depIdx = lines.findIndex(l => l === 'Hostelworld Deposit');
        if (depIdx > -1) comm = cM(lines[depIdx + 1]);
        
        let rDetIdx = lines.findIndex(l => l === 'Room Details');
        if (rDetIdx > -1) {
            for (let i = rDetIdx; i < lines.length; i++) {
                if (lines[i].includes('Dorm') || lines[i].includes('Room') || lines[i].includes('Bungalow') || lines[i].includes('Bed')) {
                    bT = lines[i].replace(/Non-refundable/i, '').replace(/Promo/i, '').trim();
                    break;
                }
            }
        }
        
        let isNonRef = tLow.includes('non-refundable');
        let daysOut = 999;
        if (cI && bD) daysOut = (parseYMD(cI) - parseYMD(bD)) / 86400000;
        if (isNonRef || daysOut < 7) ref = 1; else ref = 2;

    } else if (f === 'bdc-extranet') {
        src = tLow.includes('prudential tower') ? 'agoda' : 'booking.com'; 
        let l = txt.split(/[\n\r]+/).map(x => x.trim().replace(/\xa0/g, ' ')).filter(Boolean);
        let gL = kws => { 
            let i = l.findIndex(x => kws.some(k => x.toLowerCase() === k.toLowerCase() || x.toLowerCase().startsWith(k.toLowerCase()))); 
            if (i > -1) { 
                let m = kws.find(k => l[i].toLowerCase().startsWith(k.toLowerCase())); 
                let rem = l[i].substring(m.length).trim(); 
                return rem ? rem : (i + 1 < l.length ? l[i + 1] : ""); 
            } 
            return ""; 
        };
        
        cI = fD(gL(['Check-in'])); 
        cO = fD(gL(['Check-out'])); 
        bD = fD(gL(['Received', 'Booked on']));
        bId = gL(['Booking number:']); 
        pax = parseInt(gL(['Total guests:']), 10) || 1; 
        tot = cM(gL(['Total price'])); 
        comm = cM(gL(['Commission and charges:']));
        
        let gIdx = l.findIndex(x => x.toLowerCase().startsWith('guest name:'));
        if (gIdx > -1) { 
            let rem = l[gIdx].substring('guest name:'.length).trim(); 
            if (rem) { 
                gN = rem; 
                em = ex(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/, l[gIdx]); 
                ph = ex(/(\+[\d\s]+)/, l[gIdx]); 
                let ccM = l[gIdx].replace(em, '').replace(ph, '').match(/\s+([a-zA-Z]{2})$/); 
                if (ccM) cCode = ccM[1].toUpperCase(); 
                gN = gN.replace(em, '').replace(ph, '').replace(/\s+[a-zA-Z]{2}$/, '').trim(); 
            } else { 
                gN = l[gIdx + 1]; 
                for (let i = gIdx + 2; i < gIdx + 6; i++) { 
                    if (!l[i] || l[i].includes('Preferred language') || l[i].includes('Channel:')) break; 
                    if (l[i].length === 2 && !cCode) cCode = l[i].toUpperCase(); 
                    else if (l[i].includes('@') && !em) em = l[i]; 
                    else if (l[i].includes('+') && !ph) ph = l[i]; 
                } 
            } 
        }
        
        un = parseInt(gL(['Total units', 'Total rooms:']), 10) || 1;
        
        let bTypes = [];
        for (let i = 0; i < l.length; i++) {
            if (/^\s*(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s+(?:[A-Za-z]{3}\s+\d{1,2}|\d{1,2}\s+[A-Za-z]{3})/i.test(l[i])) {
                if (i >= 2 && /(?:THB|฿|\$|€|£|[A-Z]{3})[\s]*[\d,.]+/i.test(l[i-1])) {
                    let rLine = l[i-2].replace(/^\d+\s*(?:x\s*)?/, '').trim();
                    bTypes.push(rLine);
                }
            }
        }
        
        if (bTypes.length === 0) {
            let bTypeIdx = l.findIndex((x, i) => /^\s*(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s+(?:[A-Za-z]{3}\s+\d{1,2}|\d{1,2}\s+[A-Za-z]{3})/i.test(x) && i >= 2 && /(?:THB|฿|\$|€|£|[A-Z]{3})[\s]*[\d,.]+/i.test(l[i-1])); 
            if (bTypeIdx > -1) bTypeIdx -= 2;
            if (bTypeIdx === -1) { 
                let pIdx = l.findIndex(x => x.toLowerCase().endsWith('cancellation policy.') || x.toLowerCase().includes('bank transfer payout')); 
                if (pIdx > -1 && pIdx + 1 < l.length) bTypeIdx = pIdx + 1; 
            } 
            if (bTypeIdx > -1) { bTypes.push(l[bTypeIdx].trim()); }
        }
        
        bT = bTypes.join(' + '); 
        if (bTypes.length > un) un = bTypes.length;

        if (txt.toLowerCase().includes('free upgrade')) pUp = 1; 
        if (/\b(?:status:\s*canceled|status:\s*cancelled|booking canceled|booking cancelled)\b/i.test(txt)) pSt = 'cancelled';
        let lTxt = txt.toLowerCase(); 
        if (lTxt.includes('free of charge until') || lTxt.includes('free cancellation')) { ref = 2; } 
        else if (lTxt.includes('cancel at any time') || lTxt.includes('cancel anytime') || lTxt.includes('non-refundable') || lTxt.includes('non refundable') || lTxt.includes('charged the total price')) { ref = 1; }
        
        let aN = []; 
        l.forEach(x => { 
            if (x.toUpperCase().includes('BED PREFERENCE:') || x.toUpperCase().includes('BED-PREFERENCE REQUEST:')) aN.push(x.replace(/Reply$/i, '').trim()); 
        });
        
        let cIdx = l.findIndex(x => x.toLowerCase() === 'conversation with guest');
        if (cIdx > -1) { 
            let mLines = []; 
            for (let i = cIdx + 1; i < l.length; i++) { 
                let lLow = l[i].toLowerCase(); 
                if (lLow.includes('protect your account security') || lLow === 'images' || lLow === 'templates' || lLow.includes('important information about this guest') || lLow === 'cancellation' || lLow === 'no messages' || lLow.includes('conversations with your guests will appear')) break; 
                if (/^(?:Today|Yesterday|[A-Za-z]+,?\s*\d{1,2}\s*[A-Za-z]*),\s*\d{1,2}:\d{2}/i.test(l[i]) || /^\d{1,2}:\d{2}$/.test(l[i]) || lLow === 'reply') continue; 
                
                if (
                    lLow.includes('having a fantastic experience') ||
                    lLow.includes('hook you up for an extra night') ||
                    lLow.includes('sent automatically based on your messaging preferences') ||
                    lLow.includes('hate finding out weeks later') ||
                    lLow.includes('the swims team') ||
                    lLow.includes('inform us of any special needs') ||
                    lLow.includes('swims! a social beach resort') ||
                    lLow.includes('automatically translated')
                ) {
                    continue;
                }
                
                if (l[i].trim()) mLines.push(l[i].trim()); 
            } 
            if (mLines.length > 0) aN.push("GUEST MSG:\n" + mLines.join("\n")); 
        }
        
        notes = aN.join('\n\n'); 
        if (txt.includes('Payment is facilitated') || txt.includes('Booking.com will collect') || txt.includes('Payment is facilitated through')) hBdcP = true;
    }
    else if (f === 'airbnb-email') {
        src = 'airbnb'; 
        const ab = txt.split(/[\n\r]+/).map(x => x.trim()).filter(Boolean);
        
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
            bId = ex(/Confirmation code[\s\S]*?([A-Z0-9]+)/i); 
            bD = fD(ex(/Airbnb[\s\S]*?([A-Za-z]{3},\s*[A-Za-z]{3}\s*\d+(?:,\s*\d{4})?)/i)); 
            pax = parseInt(ex(/Guests[\s\S]*?(\d+)/i), 10) || 1;
            tot = cM(ex(/Total\s*(?:\([A-Z]+\))?[\s\S]{0,30}?(?:THB|฿|\$|€|£|[A-Z]{3})\s*([\d,.]+)/i));
            comm = cM(ex(/Host service fee[\s\S]*?(?:฿|THB)\s*([\d,.]+)/i));
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
    }

    if ($('email-modal')) $('email-modal').style.display = 'none';

    let lN = gN.trim(), fN = ""; 
    if (gN.includes(',')) { 
        const p = gN.split(','); 
        lN = p[0].trim(); 
        fN = p.slice(1).join(',').trim(); 
    } else { 
        const p = gN.split(' '); 
        fN = p[0].trim(); 
        lN = p.length > 1 ? p.slice(1).join(' ').trim() : ""; 
    }
    
    let pC = cCode || ""; 
    if (cCode.length === 2) { 
        try { 
            pC = new Intl.DisplayNames(['en'], {type: 'region'}).of(cCode.toUpperCase()); 
        } catch(e) { 
            pC = cCode.toUpperCase(); 
        } 
    } else if (cCode.length > 2) { 
        pC = cCode.charAt(0).toUpperCase() + cCode.slice(1).toLowerCase();
    }

    const staff = window.staff || [];
    let existing = null;
    if (bId) {
        existing = staff.find(s => s.bookId === bId);
    } else if (src === 'airbnb') {
        existing = staff.find(s => s.source === 'airbnb' && s.status !== 'cancelled' && s.status !== 'noshow' && ((s.firstName + ' ' + s.lastName).includes(fN) || (s.firstName + ' ' + s.lastName).includes(lN)));
    }

    if (window.populateStaffForm) window.populateStaffForm(existing || {});

    [ 
        ['first-name', fN.toUpperCase()], 
        ['last-name', lN.toUpperCase()], 
        ['check-in', cI], 
        ['check-out', cO], 
        ['pax-count', pax], 
        ['booking-source', src || 'other'], 
        ['booking-date', bD], 
        ['booking-id', bId], 
        ['booked-type', (bT || "").toUpperCase()], 
        ['phone', ph || (existing ? existing.phone : '')], 
        ['email', em || (existing ? existing.email : '')], 
        ['guest-country', pC || (existing ? existing.country : '')], 
        ['total-price', tot > 0 ? tot.toFixed(2) : (existing ? Number(existing.totalPrice).toFixed(2) : 0)], 
        ['net-price', tot > 0 ? Math.max(0, tot - comm).toFixed(2) : (existing ? Number(existing.netPrice).toFixed(2) : 0)]
    ].forEach(([id, val]) => { 
        const el = $(id); 
        if (el && val !== "" && val !== 0) el.value = val; 
    });
    
    if (pSt === 'future' && !existing) pSt = 'new';
    let finalStat = existing ? existing.status : pSt;
    
    let statHdn = $('guest-status-hidden');
    if (statHdn) statHdn.value = finalStat;
    
    let sBtn = $('status-cycle-btn');
    if (sBtn) {
        const STATUS_CYCLE = [
            { val: 'new', bg: '#ec4899', txt: '#fff' },
            { val: 'future', bg: '#7fc6f5', txt: '#1e293b' },
            { val: 'here', bg: '#059669', txt: '#fff' },
            { val: 'left', bg: '#aba39d', txt: '#1e293b' },
            { val: 'unconfirmed', bg: '#8b5cf6', txt: '#fff' },
            { val: 'noshow', bg: '#000', txt: '#fff' },
            { val: 'cancelled', bg: '#94a3b8', txt: '#1e293b' },
            { val: 'charged', bg: '#0f172a', txt: '#fbbf24' },
            { val: 'special', bg: '#fde047', txt: '#1e293b' },
            { val: 'blocked', bg: '#475569', txt: '#fff' },
            { val: 'vol', bg: '#fbcfe8', txt: '#831843' }
        ];
        let sObj = STATUS_CYCLE.find(x => x.val === finalStat) || STATUS_CYCLE[1];
        sBtn.dataset.value = sObj.val;
        sBtn.innerText = sObj.val.toUpperCase();
        sBtn.style.background = sObj.bg;
        sBtn.style.color = sObj.txt;
    }
    
    let autoNotes = `[ORIGINAL OTA IMPORT: ฿${tot} from ${cI} to ${cO}]`;
    let nEl = $('guest-notes'); 
    if (nEl) {
        if (existing && existing.notes && !existing.notes.includes(notes)) {
            nEl.value = existing.notes + "\n\n" + notes; 
        } else {
            nEl.value = (autoNotes + "\n" + notes).trim(); 
        }
    }

    if (window.setMulti) window.setMulti('refund-btn', ref, ['REFUNDABILITY: ?', 'NON-REFUNDABLE', 'REFUNDABLE'], ['text-slate-400', 'bg-red-100 text-red-700 border-red-400', 'bg-green-100 text-green-700 border-green-400']);
    if (pUp > 0 && window.setMulti) window.setMulti('upgrade-btn', pUp, ['NO UPGRADE', 'FREE UPGRADE', 'PAID UPGRADE'], ['text-slate-400', 'bg-blue-100 text-blue-700 border-blue-400', 'bg-orange-100 text-orange-700 border-orange-400']);
    
    if (!existing) {
        if (comm > 0 && window.addPaymentRow) { 
            let kpM = 'other'; 
            if (src === 'booking.com') kpM = 'bdc-kp'; 
            if (src === 'agoda') kpM = 'agoda-kp'; 
            if (src === 'airbnb') kpM = 'airbnb-kp'; 
            if (src === 'hostelworld') kpM = 'hw-kp'; 
            window.addPaymentRow(cI || getLocalYMD(new Date()), comm.toFixed(2), kpM); 
        }
        if ((hBdcP || src === 'airbnb') && (tot - comm) > 0 && window.addPaymentRow) { 
            let payM = src === 'agoda' ? 'agoda-pay' : (src === 'airbnb' ? 'airbnb-pay' : 'bdc-pay'); 
            window.addPaymentRow(cI || getLocalYMD(new Date()), (tot - comm).toFixed(2), payM); 
        }
        if ($('assigned-rooms-container')) $('assigned-rooms-container').innerHTML = ''; 
        for (let k = 0; k < Math.max(1, un); k++) {
            if (window.addRoomSelect) window.addRoomSelect("");
        }
        if (window.autoSuggestRoom) window.autoSuggestRoom((bT || "").toUpperCase(), notes.toUpperCase(), cI, cO);
    }

    if (window.updateHeaderName) window.updateHeaderName(); 
    if (window.calcFinancials) window.calcFinancials(); 
    if (window.updateAvailableRooms) window.updateAvailableRooms(); 
    
    if (cI) { 
        const d = new Date(cI + "T12:00:00"); 
        d.setDate(d.getDate() - 7); 
        window.viewStart = d; 
        if (window.render) window.render(); 
    } 
    if ($('guest-modal')) $('guest-modal').style.display = 'flex';
    if (existing && window.showAlert) setTimeout(() => window.showAlert("Update Detected!\n\nThis booking already exists in the PMS. We have loaded their current data and updated the fields from this email."), 200);
};

window.parseEmail = parseEmail;


// --- Universal OTA Text Extractor Modal & Navbar Bridge ---

export const parseOtaEmailText = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return null;
    const text = rawText.trim();
    const lower = text.toLowerCase();

    let source = 'direct';
    if (lower.includes('booking.com') || lower.includes('guest.booking.com')) source = 'booking.com';
    else if (lower.includes('agoda') || lower.includes('prudential tower')) source = 'agoda';
    else if (lower.includes('hostelworld') || lower.includes('hostelbookers')) source = 'hostelworld';
    else if (lower.includes('airbnb')) source = 'airbnb';
    else if (lower.includes('expedia')) source = 'expedia';

    let bookId = '';
    const bdcMatch = text.match(/(?:booking number|reservation number|book id)[:\s#]*(\d{9,12})/i) || text.match(/\b(\d{10})\b/);
    const agodaMatch = text.match(/(?:booking id|reference number|agoda booking id)[:\s#]*(\d{8,12})/i);
    const hwMatch = text.match(/(?:reference|ref|reference number)[:\s#]*([A-Z0-9\-]{5,15})/i);
    const airbnbMatch = text.match(/(?:confirmation code|reservation code)[:\s#]*([A-Z0-9]{6,12})/i);
    const genericMatch = text.match(/(?:reference|booking id|ref)[:\s#]*([A-Za-z0-9\-_]+)/i);

    if (source === 'booking.com' && bdcMatch) bookId = bdcMatch[1];
    else if (source === 'agoda' && agodaMatch) bookId = agodaMatch[1];
    else if (source === 'hostelworld' && hwMatch) bookId = hwMatch[1];
    else if (source === 'airbnb' && airbnbMatch) bookId = airbnbMatch[1];
    else if (bdcMatch) bookId = bdcMatch[1];
    else if (genericMatch) bookId = genericMatch[1];

    let firstName = '', lastName = '';
    const nameMatch = text.match(/(?:guest name|primary guest|lead guest|booked by|guest)[:\s]+([^\n\r,]+)/i);
    if (nameMatch) {
        const rawName = nameMatch[1].replace(/^(mr\.|mrs\.|ms\.|dr\.)\s+/i, '').trim();
        const parts = rawName.split(/\s+/).filter(Boolean);
        if (parts.length > 1) {
            firstName = parts[0];
            lastName = parts.slice(1).join(' ');
        } else {
            lastName = rawName;
        }
    }

    const parseAnyDateToYMD = (dStr) => {
        if (!dStr) return '';
        const clean = dStr.replace(/^[a-zA-Z]+,?\s*/, '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
        const parsed = Date.parse(clean);
        if (!isNaN(parsed)) {
            return new Date(parsed).toISOString().split('T')[0];
        }
        const dmy = clean.match(/^(\d{1,2})[\/\-\s]+([A-Za-z]+|\d{1,2})[\/\-\s]+(\d{4})/);
        if (dmy) {
            const day = dmy[1].padStart(2, '0');
            let month = dmy[2];
            const year = dmy[3];
            const mIdx = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(month.toLowerCase().slice(0, 3));
            if (mIdx > -1) month = String(mIdx + 1).padStart(2, '0');
            else month = month.padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        return '';
    };

    let checkIn = '', checkOut = '';
    const inMatch = text.match(/(?:check-in|check in|arrival|arriving|from)[:\s]+([^\n\r,]+)/i);
    const outMatch = text.match(/(?:check-out|check out|departure|departing|to)[:\s]+([^\n\r,]+)/i);
    if (inMatch) checkIn = parseAnyDateToYMD(inMatch[1]);
    if (outMatch) checkOut = parseAnyDateToYMD(outMatch[1]);

    if (!checkIn || !checkOut) {
        const allDates = [...text.matchAll(/\b(202\d-\d{2}-\d{2})\b/g)].map(m => m[1]);
        if (allDates.length >= 2) {
            checkIn = allDates[0];
            checkOut = allDates[1];
        }
    }

    let totalPrice = 0;
    let depositPaid = 0;
    const totalMatch = text.match(/(?:total price|total amount|total payable|total cost|total|amount due)[:\s]+(?:thb|฿|\$|eur)?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (totalMatch) totalPrice = parseFloat(totalMatch[1].replace(/,/g, '')) || 0;

    const depositMatch = text.match(/(?:deposit paid|deposit|commission)[:\s]+(?:thb|฿|\$)?\s*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (depositMatch) depositPaid = parseFloat(depositMatch[1].replace(/,/g, '')) || 0;

    let netPrice = totalPrice > 0 ? (depositPaid > 0 ? totalPrice - depositPaid : Number((totalPrice * 0.82).toFixed(2))) : 0;

    let pax = 1;
    const paxMatch = text.match(/(?:number of guests|guests|adults|pax)[:\s]+(\d+)/i);
    if (paxMatch) pax = parseInt(paxMatch[1], 10) || 1;

    let bookedType = '';
    const roomMatch = text.match(/(?:room type|room category|room|accommodates)[:\s]+([^\n\r]+)/i);
    if (roomMatch) bookedType = (window.resolvePmsRoomType ? window.resolvePmsRoomType(roomMatch[1].trim()) : roomMatch[1].trim());

    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const email = emailMatch ? emailMatch[1] : '';

    const phoneMatch = text.match(/(?:phone|telephone|mobile|tel)[:\s]+([+\d\s\-()]{7,22})/i);
    const phone = phoneMatch ? phoneMatch[1].trim() : '';

    const payments = [];
    if (depositPaid > 0) {
        const payKey = source === 'hostelworld' ? 'hw-kp' : (source === 'booking.com' ? 'bdc-kp' : 'agoda-kp');
        payments.push({
            date: window.getLocalYMD ? window.getLocalYMD(new Date()) : new Date().toISOString().split('T')[0],
            amt: depositPaid,
            method: payKey
        });
    }

    return {
        firstName: firstName.toUpperCase(),
        lastName: lastName.toUpperCase(),
        bookId,
        source,
        checkIn: checkIn || (window.getLocalYMD ? window.getLocalYMD(new Date()) : new Date().toISOString().split('T')[0]),
        checkOut: checkOut || (window.getLocalYMD ? window.getLocalYMD(new Date(Date.now() + 86400000)) : new Date(Date.now() + 86400000).toISOString().split('T')[0]),
        totalPrice,
        netPrice,
        pax,
        bookedType,
        email,
        phone,
        status: 'future',
        payments,
        notes: `[IMPORTED VIA EXTRACT - ${source.toUpperCase()}]\n${text.slice(0, 300)}...`
    };
};

export const ensureExtractModalMounted = () => {
    let m = $('extract-modal') || $('email-modal') || $('import-modal');
    if (m) return m;

    m = document.createElement('div');
    m.id = 'extract-modal';
    m.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-3 hidden";
    m.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full border-2 border-slate-800 overflow-hidden flex flex-col">
            <div class="bg-emerald-700 text-white p-3 font-black uppercase text-xs flex items-center justify-between shadow-xs">
                <span class="flex items-center gap-1.5"><i data-lucide="file-input" size="15" class="text-emerald-200"></i> IMPORT OTA RESERVATION</span>
                <button type="button" onclick="window.closeExtractModal()" class="text-emerald-200 hover:text-white cursor-pointer font-bold text-lg leading-none">&times;</button>
            </div>
            <div class="p-3 space-y-2 text-xs">
                <p class="font-bold text-slate-600 text-[11px]">Paste OTA confirmation text (Booking.com, Agoda, Hostelworld, Airbnb) below to instantly import:</p>
                <textarea id="extract-paste" class="w-full h-44 border border-slate-300 rounded p-2 text-xs font-mono bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none" placeholder="Paste booking confirmation email or extranet text here..."></textarea>
                <div class="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Auto-detects BDC • HW • Agoda • Airbnb</span>
                    <div class="flex gap-2">
                        <button type="button" onclick="window.closeExtractModal()" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black rounded uppercase text-xs cursor-pointer">Cancel</button>
                        <button type="button" id="btn-modal-extract" onclick="window.processExtract()" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded uppercase text-xs shadow-md cursor-pointer flex items-center gap-1.5 transition-colors">
                            <i data-lucide="check" size="14"></i> IMPORT BOOKING
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(m);
    if (window.lucide) window.lucide.createIcons();
    return m;
};

export const openExtractModal = () => {
    const m = ensureExtractModalMounted();
    m.classList.remove('hidden');
    m.style.display = 'flex';
    
    const ta = m.querySelector('textarea') || $('extract-paste') || $('email-paste');
    if (ta) {
        ta.value = '';
        setTimeout(() => ta.focus(), 50);
    }

    const submitBtn = m.querySelector('#btn-modal-extract') || m.querySelector('button[onclick*="processExtract"]') || m.querySelector('button[onclick*="parse"]');
    if (submitBtn) {
        submitBtn.innerText = 'IMPORT BOOKING';
        submitBtn.disabled = false;
        submitBtn.removeAttribute('disabled');
        submitBtn.style.pointerEvents = 'auto';
        submitBtn.style.cursor = 'pointer';
        submitBtn.className = "px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded uppercase text-xs shadow-md cursor-pointer flex items-center gap-1.5 transition-colors";
        submitBtn.onclick = (e) => {
            if (e) e.preventDefault();
            window.processExtract();
        };
    }
};

export const closeExtractModal = () => {
    const m = $('extract-modal') || $('email-modal') || $('import-modal');
    if (m) {
        m.classList.add('hidden');
        m.style.display = 'none';
    }
};

export const processExtract = (rawText = null) => {
    let text = rawText;
    if (!text) {
        const m = $('extract-modal') || $('email-modal') || $('import-modal');
        const ta = m ? m.querySelector('textarea') : ($('extract-paste') || $('email-paste'));
        text = ta ? ta.value.trim() : '';
    }

    if (!text) {
        return window.showAlert ? window.showAlert("Please paste booking confirmation text first.") : alert("Please paste text first.");
    }

    const parsed = parseOtaEmailText(text);
    if (!parsed) {
        return window.showAlert ? window.showAlert("Could not extract booking details from the text.") : alert("Could not extract booking details.");
    }

    closeExtractModal();
    if (window.populateStaffForm) window.populateStaffForm(parsed);

    const suggested = window.suggestAvailableRoom ? window.suggestAvailableRoom(parsed.bookedType) : '';
    if (suggested && $('assigned-rooms-container')) {
        $('assigned-rooms-container').innerHTML = '';
        if (window.addRoomSelect) window.addRoomSelect(suggested, false);
    }

    if (window.showAlert) {
        window.showAlert(`Imported: ${parsed.firstName} ${parsed.lastName} (${parsed.bookId || 'New'})\nDates: ${parsed.checkIn} → ${parsed.checkOut}\nAssigned Room: ${suggested || 'Unassigned'}\nClick SAVE to confirm.`);
    }
};

export const bindExtractNavbarBtn = () => {
    const headerButtons = Array.from(document.querySelectorAll('header button, header a, nav button, nav a, #btn-extract, #btn-import'));
    headerButtons.forEach(btn => {
        const txt = (btn.innerText || btn.textContent || '').trim().toUpperCase();
        const id = (btn.id || '').toLowerCase();
        const isMatch = id.includes('extract') || id.includes('import') || txt.includes('EXTRACT') || txt.includes('IMPORT') || txt.includes('PARSE');
        
        if (isMatch) {
            btn.innerText = 'Import';
            btn.disabled = false;
            btn.removeAttribute('disabled');
            btn.style.pointerEvents = 'auto';
            btn.style.cursor = 'pointer';
            btn.style.opacity = '1';
            btn.className = "px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded shadow-xs flex items-center gap-1 transition-colors cursor-pointer";
            btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="inline shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> <span>Import</span>`;
            btn.onclick = (e) => {
                if (e) e.preventDefault();
                openExtractModal();
            };
        }
    });
};

window.parseOtaEmailText = parseOtaEmailText;
window.ensureExtractModalMounted = ensureExtractModalMounted;
window.openExtractModal = openExtractModal;
window.openEmailModal = openExtractModal;
window.openImportModal = openExtractModal;
window.closeExtractModal = closeExtractModal;
window.closeEmailModal = closeExtractModal;
window.closeImportModal = closeExtractModal;
window.processExtract = processExtract;
window.parseAndImport = processExtract;
window.bindExtractNavbarBtn = bindExtractNavbarBtn;

window.addEventListener('keydown', e => {
    if (e.altKey && (e.key === 'e' || e.key === 'E' || e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        openExtractModal();
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindExtractNavbarBtn);
} else {
    bindExtractNavbarBtn();
}




