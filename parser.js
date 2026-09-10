// ---------------------------------------------------------
// SWIMS PMS - TEXT EXTRACTION PARSERS
// ---------------------------------------------------------

window.extractBookingData = (raw) => {
    let rawLines = raw.split('\n').map(l => l.trim());
    let lines = rawLines.filter(Boolean); 
    
    let s = { source: 'other', pax: 1, payments: [], units: 1 };
    let rawLower = raw.toLowerCase();

    // Identify Source
    if (rawLower.includes('hostelworld')) s.source = 'hostelworld';
    else if (rawLower.includes('booking.com')) s.source = 'booking.com';
    else if (rawLower.includes('expedia')) s.source = 'expedia';
    else if (rawLower.includes('agoda')) s.source = 'agoda';
    else if (rawLower.includes('airbnb')) s.source = 'airbnb';
    else if (rawLower.includes('trip.com') || rawLower.includes('ctrip')) s.source = 'ctrip';

    const getLocalYMD = d => { const o = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)); return o.toISOString().split('T')[0]; };

    // ---------------------------------------------------------
    // HOSTELWORLD PARSER
    // ---------------------------------------------------------
    if (s.source === 'hostelworld') {
        const parseHWDate = (str) => {
            if (!str) return "";
            let m = str.match(/(\d+)[a-z]*\s+([a-zA-Z]+)\s+.*?(\d{2,4})/i);
            if (m) {
                let y = m[3].length === 2 ? '20' + m[3] : m[3];
                let mo = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'}[m[2].toLowerCase().substring(0,3)] || '01';
                let d = m[1].padStart(2, '0');
                return `${y}-${mo}-${d}`; 
            }
            return "";
        };

        let refIdx = lines.findIndex(l => l === 'Reference' || l.includes('Reference'));
        if (refIdx > -1) {
            s.bookId = lines[refIdx + 1];
            let nameParts = (lines[refIdx + 2] || '').split(' ');
            s.firstName = nameParts[0] || '';
            s.lastName = nameParts.slice(1).join(' ');
            s.country = lines[refIdx + 3];
            
            let l4 = lines[refIdx + 4] || '';
            let l5 = lines[refIdx + 5] || '';
            if (l4.includes('@')) s.email = l4; else if (l5.includes('@')) s.email = l5;
            
            let p4 = l4.replace(/[\s+]/g, ''); let p5 = l5.replace(/[\s+]/g, '');
            if (p4.length >= 8 && !isNaN(p4)) s.phone = l4; else if (p5.length >= 8 && !isNaN(p5)) s.phone = l5;
        }
        
        let bookedIdx = lines.findIndex(l => l === 'Booked' || l === 'Booking Date');
        if (bookedIdx > -1) s.bookDate = parseHWDate(lines[bookedIdx + 1]);
        
        // Exact Arriving Check-in Logic
        let arrIdx = lines.findIndex(l => l === 'Arriving');
        if (arrIdx > -1) s.checkIn = parseHWDate(lines[arrIdx + 1]);
        
        let hwDenseRegex = /^(\d{1,2}[a-z]{0,2}\s+[a-zA-Z]{3}\s+[`'´]?\d{2,4})(.*?)(\d{1,2})\s*(THB|USD|EUR|GBP|AUD)\s*([\d,.]+)$/i;
        for (let i = 0; i < lines.length; i++) {
            let m = lines[i].match(hwDenseRegex);
            if (m) {
                if (!s.checkIn) s.checkIn = parseHWDate(m[1]); // Fallback if Arriving wasn't found
                let roomStr = m[2].trim();
                
                // Refundability Catch
                if (roomStr.toLowerCase().includes('non-refundable') || roomStr.toLowerCase().includes('non refundable')) {
                    s.refundability = 'non-ref';
                    roomStr = roomStr.replace(/non-?refundable/gi, '').replace(/-\s*$/, '').trim();
                }
                
                s.bookedType = roomStr;
                let paxStr = m[3];
                let paxVal = parseInt(paxStr.length > 1 ? paxStr.charAt(0) : paxStr); 
                if (!isNaN(paxVal) && paxVal > 0) s.pax = paxVal;
                break;
            }
        }

        let nightMatch = raw.match(/(\d+)\s*Nights?/i);
        if (nightMatch && s.checkIn) {
            let nights = parseInt(nightMatch[1]);
            let d = new Date(s.checkIn + "T12:00:00Z");
            d.setUTCDate(d.getUTCDate() + nights);
            s.checkOut = d.toISOString().split('T')[0];
        }
        
        let subIdx = lines.findIndex(l => l.includes('Subtotal') || l === 'Total');
        if (subIdx > -1 && lines.length > subIdx + 1) {
            let amtStr = lines[subIdx + 1] || lines[subIdx];
            s.totalPrice = parseFloat(amtStr.replace(/[^\d.]/g, ''));
        }
        
        let depIdx = lines.findIndex(l => l.includes('Hostelworld Deposit') || l.includes('Deposit'));
        if (depIdx > -1 && lines.length > depIdx + 1) {
            let depositAmt = parseFloat((lines[depIdx + 1] || lines[depIdx]).replace(/[^\d.]/g, ''));
            if (!isNaN(depositAmt)) s.payments.push({ date: s.checkIn || getLocalYMD(new Date()), amt: depositAmt, method: 'hw-kp' });
        }

    // ---------------------------------------------------------
    // BOOKING.COM PARSER (EXTRANET OPTIMIZED)
    // ---------------------------------------------------------
    } else if (s.source === 'booking.com') {
        
        // Email & Phone Number Fix
        let emailIdx = lines.findIndex(l => l.includes('@guest.booking.com'));
        if (emailIdx > -1) {
            s.email = lines[emailIdx];
            if (lines.length > emailIdx + 1) {
                let nextLine = lines[emailIdx + 1].trim();
                // If it contains a string of numbers, assume it's the phone number
                if (/\d{5,}/.test(nextLine.replace(/\s+/g, ''))) {
                    s.phone = nextLine;
                }
            }
        }

        // Booking ID
        let bIdIdx = lines.findIndex(l => l === 'Booking number:');
        if (bIdIdx > -1 && lines.length > bIdIdx + 1) s.bookId = lines[bIdIdx + 1].trim();

        // Book Date
        let recIdx = lines.findIndex(l => l === 'Received');
        if (recIdx > -1 && lines.length > recIdx + 1) {
            let d = new Date(lines[recIdx + 1]);
            if (!isNaN(d)) s.bookDate = getLocalYMD(d);
        }

        // Guest Name & Country
        let gnIdx = lines.findIndex(l => l === 'Guest name:');
        if (gnIdx > -1 && lines.length > gnIdx + 1) {
            let nameLine = lines[gnIdx + 1].trim().replace(/\bGENIUS\b/i, '').trim();
            let nameParts = nameLine.split(/\s+/).filter(Boolean);
            
            s.firstName = nameParts[0] || '';
            s.lastName = nameParts.slice(1).join(' ');

            if (lines.length > gnIdx + 2) {
                let potCountry = lines[gnIdx + 2].trim();
                if (!potCountry.includes('@')) {
                    let match = potCountry.match(/([a-zA-Z]{2})$/);
                    if (match) {
                        let cc = match[1].toUpperCase();
                        const countryMap = { 'IL': 'Israel', 'US': 'United States', 'GB': 'United Kingdom', 'UK': 'United Kingdom', 'FR': 'France', 'DE': 'Germany', 'AU': 'Australia', 'NL': 'Netherlands', 'ES': 'Spain', 'IT': 'Italy', 'CH': 'Switzerland', 'CA': 'Canada', 'SE': 'Sweden', 'DK': 'Denmark', 'RU': 'Russia', 'TH': 'Thailand', 'BE': 'Belgium', 'AT': 'Austria', 'IE': 'Ireland', 'NO': 'Norway', 'FI': 'Finland', 'BR': 'Brazil', 'AR': 'Argentina', 'KR': 'South Korea', 'JP': 'Japan', 'CN': 'China', 'IN': 'India', 'MX': 'Mexico', 'NZ': 'New Zealand', 'ZA': 'South Africa', 'PT': 'Portugal', 'GR': 'Greece' };
                        s.country = countryMap[cc] || cc;
                    }
                }
            }
        }

        // Check-in and Check-out
        let ciIdx = lines.findIndex(l => l === 'Check-in');
        if (ciIdx > -1 && lines.length > ciIdx + 1) s.checkIn = getLocalYMD(new Date(lines[ciIdx + 1]));
        
        let coIdx = lines.findIndex(l => l === 'Check-out');
        if (coIdx > -1 && lines.length > coIdx + 1) s.checkOut = getLocalYMD(new Date(lines[coIdx + 1]));

        // Units and Pax
        let unitsIdx = lines.findIndex(l => l === 'Total units');
        if (unitsIdx > -1 && lines.length > unitsIdx + 1) {
             let uMatch = lines[unitsIdx + 1].match(/(\d+)/);
             if (uMatch) s.units = parseInt(uMatch[1]);
        }

        let paxIdx = lines.findIndex(l => l === 'Total guests:');
        if (paxIdx > -1 && lines.length > paxIdx + 1) {
             let paxMatch = lines[paxIdx + 1].match(/(\d+)/);
             if (paxMatch) s.pax = parseInt(paxMatch[1]);
        }

        // Total Price
        let tpIdx = lines.findIndex(l => l === 'Total price');
        if (tpIdx > -1 && lines.length > tpIdx + 1) {
            let priceMatch = lines[tpIdx + 1].match(/(?:THB|USD|EUR|GBP|฿|\$|€|£)\s*([\d,.]+)/i);
            if (priceMatch) s.totalPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
        }

        // Commission (Net Price)
        let commIdx = lines.findIndex(l => l === 'Commission and charges:');
        if (commIdx > -1 && lines.length > commIdx + 1) {
             let cMatch = lines[commIdx + 1].match(/(?:THB|USD|EUR|GBP|฿|\$|€|£)\s*([\d,.]+)/i);
             if (cMatch && s.totalPrice) {
                 let commAmt = parseFloat(cMatch[1].replace(/,/g, ''));
                 s.netPrice = s.totalPrice - commAmt;
             }
        }

        // Room Type
        let bookDIdx = lines.findIndex(l => l.includes('Booking.com will collect') || l.includes('You will receive a virtual credit card'));
        if (bookDIdx > -1 && lines.length > bookDIdx + 1) {
            s.bookedType = lines[bookDIdx + 1].trim(); 
        } else {
             for (let i = 0; i < lines.length; i++) {
                 let l = lines[i];
                 if ((l.includes('Room') || l.includes('Dorm') || l.includes('Bed') || l.includes('Bungalow')) && !l.includes('When booking') && !l.includes('policies')) {
                     s.bookedType = l;
                     break;
                 }
             }
        }

        // Payment setup
        if (lines.some(l => l.includes('Payment is facilitated via Payments by Booking.com') || l.includes('Booking.com will collect'))) {
            if (s.netPrice && s.totalPrice) {
                s.payments.push({ date: s.checkIn || getLocalYMD(new Date()), amt: s.netPrice, method: 'bdc-pay' });
                s.payments.push({ date: s.checkIn || getLocalYMD(new Date()), amt: Number((s.totalPrice - s.netPrice).toFixed(2)), method: 'bdc-kp' });
            } else if (s.totalPrice) {
                 s.payments.push({ date: s.checkIn || getLocalYMD(new Date()), amt: s.totalPrice, method: 'bdc-pay' });
            }
        }

    // ---------------------------------------------------------
    // AGODA PARSER (Line-by-Line / Fallback Regex)
    // ---------------------------------------------------------
    } else if (s.source === 'agoda') {
        let flatRaw = raw.replace(/\n/g, ' ');

        let bIdLine = lines.find(l => l.match(/(?:Booking ID|Booking Reference|Reference No|Agoda Booking ID)/i));
        if (bIdLine) {
            let m = bIdLine.match(/(?:Booking ID|Booking Reference No\.?|Reference ID|Booking Reference|Agoda Booking ID)\s*:?\s*(\d+)/i);
            if (m) s.bookId = m[1];
            else {
                let idx = lines.indexOf(bIdLine);
                if (idx > -1 && lines.length > idx + 1 && /^\d+$/.test(lines[idx+1].trim())) {
                    s.bookId = lines[idx+1].trim();
                }
            }
        }
        if (!s.bookId) {
            let bIdMatch = flatRaw.match(/(?:Booking ID|Booking Reference)\s*(\d+)/i);
            if (bIdMatch) s.bookId = bIdMatch[1];
        }

        let bDateLine = lines.find(l => l.match(/(?:Booking Date|Booked on|Date of Booking)/i));
        if (bDateLine) {
            let m = bDateLine.match(/(?:Booking Date|Booked on|Date of Booking)\s*:?\s*([A-Za-z]+\s+\d{1,2}(?:,\s+\d{4})?)/i);
            let dateStr = m && m[1] ? m[1].trim() : "";
            if (!dateStr) {
                let idx = lines.indexOf(bDateLine);
                if (idx > -1 && lines.length > idx + 1) {
                    let nextDateMatch = lines[idx+1].match(/([A-Za-z]+\s+\d{1,2}(?:,\s+\d{4})?)/);
                    if (nextDateMatch) dateStr = nextDateMatch[1];
                }
            }
            if (dateStr) {
                let d = new Date(dateStr);
                if (!isNaN(d)) s.bookDate = getLocalYMD(d);
            }
        }
        if (!s.bookDate) {
            let bdMatch = raw.match(/<no-reply@agoda\.com>[\s\S]{1,100}?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s+\d{4})?)/i);
            if (bdMatch) {
                let dStr = bdMatch[1];
                if (!/\d{4}/.test(dStr)) dStr += `, ${new Date().getFullYear()}`;
                let d = new Date(dStr);
                if (!isNaN(d)) s.bookDate = getLocalYMD(d);
            }
        }

        let nameLine = lines.find(l => l.match(/(?:Customer First Name|Guest Name|Guest|Lead Guest)/i));
        if (nameLine) {
            let m = nameLine.match(/(?:Customer First Name|Guest Name|Guest|Lead Guest)\s*:?\s*(.*)/i);
            let nStr = m && m[1].trim() ? m[1].trim() : "";
            if (!nStr || nStr.toLowerCase().includes('last name')) {
                let idx = lines.indexOf(nameLine);
                if (idx > -1 && lines.length > idx + 1) {
                    let nextLine = lines[idx+1].trim();
                    let parts = nextLine.split(/\s\s+/); 
                    if (parts.length >= 2) {
                        s.firstName = parts[0];
                        s.lastName = parts[1];
                    } else {
                        parts = nextLine.split(' ');
                        s.firstName = parts[0];
                        s.lastName = parts.slice(1).join(' ');
                    }
                }
            } else {
                let parts = nStr.split(' ');
                s.firstName = parts[0];
                s.lastName = parts.slice(1).join(' ');
            }
        }
        if (!s.firstName) {
            let fNameMatch = flatRaw.match(/Customer First Name\s*(.*?)\s*Customer Last Name/i);
            if (fNameMatch) s.firstName = fNameMatch[1].trim();
            let lNameMatch = flatRaw.match(/Customer Last Name\s*(.*?)\s*Country/i);
            if (lNameMatch) s.lastName = lNameMatch[1].trim();
        }

        let ciMatch = flatRaw.match(/Check-in\s*(?:Date)?\s*:?\s*([A-Za-z]+\s+\d{1,2}(?:,\s+\d{4})?)/i);
        if (ciMatch) {
            let d = new Date(ciMatch[1]);
            if (!isNaN(d)) s.checkIn = getLocalYMD(d);
        }
        
        let coMatch = flatRaw.match(/Check-out\s*(?:Date)?\s*:?\s*([A-Za-z]+\s+\d{1,2}(?:,\s+\d{4})?)/i);
        if (coMatch) {
            let d = new Date(coMatch[1]);
            if (!isNaN(d)) s.checkOut = getLocalYMD(d);
        }

        let paxMatch = flatRaw.match(/(?:Number of Adults|Adults|Pax)\s*:?\s*(\d+)/i) || flatRaw.match(/(\d+)\s*Adult/i);
        if (paxMatch) s.pax = parseInt(paxMatch[1]);

        let rtLine = lines.findIndex(l => l.match(/(?:Room Type|Room Category|Room|Booked Room)/i));
        if (rtLine > -1) {
            let m = lines[rtLine].match(/(?:Room Type|Room Category|Room|Booked Room)\s*:?\s*(.*)/i);
            let rStr = m && m[1].trim() ? m[1].trim() : "";
            if (!rStr || rStr.toLowerCase() === 'type') {
                if (lines.length > rtLine + 1) {
                    rStr = lines[rtLine + 1].trim();
                }
            }
            if (rStr && !rStr.match(/Check-in|Check-out|Adults|Pax|Total|Price/i)) {
                s.bookedType = rStr.replace(/\(null\)/gi, '').trim();
            }
        }
        if (!s.bookedType) {
            let roomMatch = flatRaw.match(/No\. of Extra Bed\s*(.*?)(?=\d{1,2}\s*(?:Adult|Child|Rate Plan))/i);
            if (roomMatch) s.bookedType = roomMatch[1].replace(/\(null\)/gi, '').trim().replace(/\d$/, '').trim();
        }

        let priceLine = lines.find(l => l.match(/(?:Total Price|Reference sell rate|Grand Total|Total Amount|Price)/i));
        if (priceLine) {
            let m = priceLine.match(/(?:THB|USD|EUR|GBP|฿|\$|€|£)\s*([\d,.]+)/i);
            if (m) {
                s.totalPrice = parseFloat(m[1].replace(/,/g, ''));
            } else {
                let idx = lines.indexOf(priceLine);
                if (idx > -1 && lines.length > idx + 1) {
                    let nextM = lines[idx+1].match(/([\d,.]+)/);
                    if (nextM) s.totalPrice = parseFloat(nextM[1].replace(/,/g, ''));
                }
            }
        }
        
        let netLine = lines.find(l => l.match(/(?:Net rate|Hotel Payout|Agoda Payout|Net Price)/i));
        let netRate = 0;
        if (netLine) {
            let m = netLine.match(/(?:THB|USD|EUR|GBP|฿|\$|€|£)\s*([\d,.]+)/i);
            if (m) netRate = parseFloat(m[1].replace(/,/g, ''));
        }

        if (!s.totalPrice) {
            let sellRateMatch = flatRaw.match(/(?:Reference sell rate|Total Price|Price|Grand Total).*?(?:THB|USD|EUR|GBP|฿|\$|€|£)\s*([\d,.]+)/i);
            if (sellRateMatch) s.totalPrice = parseFloat(sellRateMatch[1].replace(/,/g, ''));
        }
        if (!netRate) {
            let netRateMatch = flatRaw.match(/(?:Net rate|Agoda Payout|Hotel Payout).*?(?:THB|USD|EUR|GBP|฿|\$|€|£)\s*([\d,.]+)/i);
            if (netRateMatch) netRate = parseFloat(netRateMatch[1].replace(/,/g, ''));
        }

        if (s.totalPrice && !netRate) netRate = s.totalPrice * 0.815;
        if (!s.totalPrice && netRate) s.totalPrice = netRate / 0.815;
        if (netRate) s.netPrice = netRate;

        if (s.totalPrice) {
            let commAmt = s.totalPrice - netRate;
            let payDate = s.checkIn || getLocalYMD(new Date());
            
            if (commAmt > 0) s.payments.push({ date: payDate, amt: Number(commAmt.toFixed(2)), method: 'agoda-kp' });
            if (netRate > 0) s.payments.push({ date: payDate, amt: Number(netRate.toFixed(2)), method: 'agoda-pay' });
        }
    } else if (raw.toLowerCase().includes('airbnb')) {
        s.source = 'airbnb';
    }

    // Refundability Check (Applies to all)
    let isNonRef = rawLower.includes('non-refundable') || rawLower.includes('non refundable') || rawLower.includes('charged the total price of the reservation if they cancel at any time');
    if (isNonRef) s.refundability = 'non-ref';
    else if (!s.refundability) s.refundability = 'ref';
    
    if (s.checkIn) {
        let ciDate = new Date(s.checkIn + "T12:00:00Z");
        let today = new Date();
        today.setHours(0, 0, 0, 0); 
        let diffDays = (ciDate - today) / (1000 * 60 * 60 * 24);
        if (diffDays <= 7) s.refundability = 'non-ref';
    }

    // Build Original Booking Summary
    let nights = 1, avgNightly = 0;
    if (s.checkIn && s.checkOut) {
        const parseYMD = str => { const p = str.split('-'); return p.length !== 3 ? 0 : Date.UTC(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])); };
        const ms = parseYMD(s.checkOut) - parseYMD(s.checkIn);
        nights = Math.round(ms / 86400000);
        if (nights < 1) nights = 1;
    }
    if (s.totalPrice) avgNightly = (s.totalPrice / nights).toFixed(2);

    let summary = `--- ORIGINAL OTA BOOKING ---`;
    summary += `\nSource: ${s.source.toUpperCase()}`;
    if (s.bookId) summary += `\nBook ID: ${s.bookId}`;
    summary += `\nDates: ${s.checkIn || '??'} to ${s.checkOut || '??'} (${nights} Night${nights !== 1 ? 's' : ''})`;
    summary += `\nBooked: ${s.bookedType || 'Unknown'}`;
    summary += `\nUnits (Rooms/Beds): ${s.units || 1}`;
    summary += `\nPax: ${s.pax || 1}`;
    summary += `\nTotal: ฿${Number(s.totalPrice||0).toFixed(2)}`;
    if (nights > 0) summary += `\nAvg Nightly: ฿${avgNightly}`;
    summary += `\n----------------------------\n`;

    return { s, summary };
};
