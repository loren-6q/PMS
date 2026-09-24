// ---------------------------------------------------------
// PMS - TEXT EXTRACTION PARSERS (Hostelworld, Booking.com, Agoda, Expedia, Airbnb)
// ---------------------------------------------------------

const MONTH_MAP = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

const parseAnyDateToYMD = (input) => {
    if (!input) return "";
    if (input instanceof Date) {
        if (isNaN(input.getTime())) return "";
        try {
            const o = new Date(input.getTime() - (input.getTimezoneOffset() * 60000));
            return isNaN(o.getTime()) ? "" : o.toISOString().split('T')[0];
        } catch (e) {
            return "";
        }
    }

    const str = String(input).trim();
    if (!str) return "";

    // 1. ISO format: YYYY-MM-DD
    const isoMatch = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    }

    // 2. DD/MM/YYYY or DD-MM-YYYY (e.g. 20/09/2026, 28/09/2026)
    const dmyMatch = str.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyMatch) {
        return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }

    // 3. Month Name + Day + Year: "September 18, 2026" or "Sep 26, 2026"
    const mdyMatch = str.match(/(?:^|[^\w])(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,]+(\d{1,2})(?:st|nd|rd|th)?[\s,]+(\d{4})/i);
    if (mdyMatch) {
        const mKey = mdyMatch[1].toLowerCase().slice(0, 3);
        const mNum = MONTH_MAP[mKey];
        if (mNum) {
            return `${mdyMatch[3]}-${mNum}-${mdyMatch[2].padStart(2, '0')}`;
        }
    }

    // 4. Day + Month Name + Year: "18 September 2026" or "26 Sep 2026"
    const dmyWordMatch = str.match(/(\d{1,2})(?:st|nd|rd|th)?[\s,]+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,]+(\d{4})/i);
    if (dmyWordMatch) {
        const mKey = dmyWordMatch[2].toLowerCase().slice(0, 3);
        const mNum = MONTH_MAP[mKey];
        if (mNum) {
            return `${dmyWordMatch[3]}-${mNum}-${dmyWordMatch[1].padStart(2, '0')}`;
        }
    }

    // 5. Fallback constructor with safety check
    try {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
            const o = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
            return isNaN(o.getTime()) ? "" : o.toISOString().split('T')[0];
        }
    } catch (e) {}

    return "";
};

window.extractBookingData = (raw) => {
    const normalized = (raw || '').replace(/\u00A0/g, ' ');
    let rawLines = normalized.split(/\r?\n/).map(l => l.trim());
    let lines = rawLines.filter(Boolean); 
    
    let s = { source: 'other', pax: 1, payments: [], units: 1, rooms: [] };
    let rawLower = normalized.toLowerCase();

    // Identify Source
    if (rawLower.includes('hostelworld')) s.source = 'hostelworld';
    else if (rawLower.includes('booking.com')) s.source = 'booking.com';
    else if (rawLower.includes('expedia') || rawLower.includes('expediapartnercentral')) s.source = 'expedia';
    else if (rawLower.includes('agoda')) s.source = 'agoda';
    else if (rawLower.includes('airbnb')) s.source = 'airbnb';
    else if (rawLower.includes('trip.com') || rawLower.includes('ctrip')) s.source = 'ctrip';

    const getLocalYMD = (d = new Date()) => {
        const parsed = parseAnyDateToYMD(d);
        if (parsed) return parsed;
        const now = new Date();
        const o = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
        return o.toISOString().split('T')[0];
    };

    // ---------------------------------------------------------
    // HOSTELWORLD PARSER
    // ---------------------------------------------------------
    if (s.source === 'hostelworld') {
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
        if (bookedIdx > -1) s.bookDate = parseAnyDateToYMD(lines[bookedIdx + 1]);
        
        let arrIdx = lines.findIndex(l => l === 'Arriving');
        if (arrIdx > -1) s.checkIn = parseAnyDateToYMD(lines[arrIdx + 1]);
        
        let hwDenseRegex = /^(\d{1,2}[a-z]{0,2}\s+[a-zA-Z]{3}\s+[`'´]?\d{2,4})(.*?)(\d{1,2})\s*(THB|USD|EUR|GBP|AUD)\s*([\d,.]+)$/i;
        for (let i = 0; i < lines.length; i++) {
            let m = lines[i].match(hwDenseRegex);
            if (m) {
                if (!s.checkIn) s.checkIn = parseAnyDateToYMD(m[1]);
                let roomStr = m[2].trim();
                
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

        let nightMatch = normalized.match(/(\d+)\s*Nights?/i);
        if (nightMatch && s.checkIn) {
            let nights = parseInt(nightMatch[1]);
            const p = s.checkIn.split('-');
            if (p.length === 3) {
                let d = new Date(Date.UTC(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])));
                d.setUTCDate(d.getUTCDate() + nights);
                s.checkOut = d.toISOString().split('T')[0];
            }
        }
        
        let subIdx = lines.findIndex(l => l.includes('Subtotal') || l === 'Total');
        if (subIdx > -1 && lines.length > subIdx + 1) {
            let amtStr = lines[subIdx + 1] || lines[subIdx];
            s.totalPrice = parseFloat(amtStr.replace(/[^\d.]/g, ''));
        }
        
        let depIdx = lines.findIndex(l => l.includes('Hostelworld Deposit') || l.includes('Deposit'));
        if (depIdx > -1 && lines.length > depIdx + 1) {
            let depositAmt = parseFloat((lines[depIdx + 1] || lines[depIdx]).replace(/[^\d.]/g, ''));
            if (!isNaN(depositAmt)) s.payments.push({ date: s.checkIn || getLocalYMD(), amt: depositAmt, method: 'hw-kp' });
        }

    // ---------------------------------------------------------
    // BOOKING.COM PARSER (EXTRANET OPTIMIZED)
    // ---------------------------------------------------------
    } else if (s.source === 'booking.com') {
        
        let emailIdx = lines.findIndex(l => l.includes('@guest.booking.com'));
        if (emailIdx > -1) {
            s.email = lines[emailIdx];
            if (lines.length > emailIdx + 1) {
                let nextLine = lines[emailIdx + 1].trim();
                if (/\d{5,}/.test(nextLine.replace(/\s+/g, ''))) {
                    s.phone = nextLine;
                }
            }
        }

        let bIdIdx = lines.findIndex(l => l === 'Booking number:');
        if (bIdIdx > -1 && lines.length > bIdIdx + 1) s.bookId = lines[bIdIdx + 1].trim();

        let recIdx = lines.findIndex(l => l === 'Received');
        if (recIdx > -1 && lines.length > recIdx + 1) {
            s.bookDate = parseAnyDateToYMD(lines[recIdx + 1]);
        }

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

        let ciIdx = lines.findIndex(l => l === 'Check-in');
        if (ciIdx > -1 && lines.length > ciIdx + 1) s.checkIn = parseAnyDateToYMD(lines[ciIdx + 1]);
        
        let coIdx = lines.findIndex(l => l === 'Check-out');
        if (coIdx > -1 && lines.length > coIdx + 1) s.checkOut = parseAnyDateToYMD(lines[coIdx + 1]);

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

        let tpIdx = lines.findIndex(l => l === 'Total price');
        if (tpIdx > -1 && lines.length > tpIdx + 1) {
            let priceMatch = lines[tpIdx + 1].match(/(?:THB|USD|EUR|GBP|฿|\$|€|£)\s*([\d,.]+)/i);
            if (priceMatch) s.totalPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
        }

        let commIdx = lines.findIndex(l => l === 'Commission and charges:');
        if (commIdx > -1 && lines.length > commIdx + 1) {
             let cMatch = lines[commIdx + 1].match(/(?:THB|USD|EUR|GBP|฿|\$|€|£)\s*([\d,.]+)/i);
             if (cMatch && s.totalPrice) {
                 let commAmt = parseFloat(cMatch[1].replace(/,/g, ''));
                 s.netPrice = s.totalPrice - commAmt;
             }
        }

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

        if (lines.some(l => l.includes('Payment is facilitated via Payments by Booking.com') || l.includes('Booking.com will collect'))) {
            if (s.netPrice && s.totalPrice) {
                s.payments.push({ date: s.checkIn || getLocalYMD(), amt: s.netPrice, method: 'bdc-pay' });
                s.payments.push({ date: s.checkIn || getLocalYMD(), amt: Number((s.totalPrice - s.netPrice).toFixed(2)), method: 'bdc-kp' });
            } else if (s.totalPrice) {
                 s.payments.push({ date: s.checkIn || getLocalYMD(), amt: s.totalPrice, method: 'bdc-pay' });
            }
        }

    // ---------------------------------------------------------
    // AGODA PARSER (Gmail Copied Tables & YCS Notifications)
    // ---------------------------------------------------------
    } else if (s.source === 'agoda') {
        const flatRaw = normalized.replace(/\s+/g, ' ');

        // 1. Booking ID
        let bIdMatch = normalized.match(/(?:Booking\s*ID|Booking\s*Reference(?:\s*No\.?)?|Reference\s*ID)\s*:?\s*(\d{7,15})/i)
                    || flatRaw.match(/Booking\s*ID\s*(\d{7,15})/i);
        if (bIdMatch) s.bookId = bIdMatch[1];

        // 2. Guest Name
        let nameMatch = normalized.match(/Customer\s*First\s*Name\s*:?\s*([A-Za-z\u00C0-\u024F\s\-'\.]+?)\s*Customer\s*Last\s*Name\s*:?\s*([A-Za-z\u00C0-\u024F\s\-'\.]+?)(?:Country\s*of\s*Residence|Check-in|Other\s*Guests|\n|City|$)/i);
        if (nameMatch) {
            s.firstName = nameMatch[1].trim();
            s.lastName = nameMatch[2].trim();
        } else {
            let altName = normalized.match(/\[RmNo\.1\]\s*([A-Za-z\u00C0-\u024F\s\-'\.]+?)(?:Room\s*Type|\n|\[RmNo|$)/i)
                       || normalized.match(/Guest\s+([A-Za-z\u00C0-\u024F\s\-'\.]+?)\s+is\s+present/i);
            if (altName) {
                let parts = altName[1].trim().split(/\s+/).filter(Boolean);
                if (parts.length > 1) {
                    s.firstName = parts.slice(0, -1).join(' ');
                    s.lastName = parts[parts.length - 1];
                } else {
                    s.lastName = parts[0] || '';
                }
            } else {
                let nameLine = lines.find(l => l.match(/(?:Customer First Name|Guest Name|Guest|Lead Guest)/i));
                if (nameLine) {
                    let parts = nameLine.replace(/(?:Customer First Name|Guest Name|Guest|Lead Guest)\s*:?/i, '').trim().split(/\s+/).filter(Boolean);
                    if (parts.length > 1) {
                        s.firstName = parts.slice(0, -1).join(' ');
                        s.lastName = parts[parts.length - 1];
                    } else if (parts.length === 1) {
                        s.lastName = parts[0];
                    }
                }
            }
        }

        // 3. Country of Residence
        let countryMatch = normalized.match(/Country\s*of\s*Residence\s*:?\s*([A-Za-z\s]+?)(?:Check-in|Check-out|City|Other\s*Guests|Room\s*Type|\n|$)/i);
        if (countryMatch) {
            s.country = countryMatch[1].trim();
        }

        // 4. Check-in & Check-out Dates
        let ciMatch = normalized.match(/Check-in\s*(?:Date)?\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
        if (ciMatch) {
            s.checkIn = parseAnyDateToYMD(ciMatch[1]);
        }

        let coMatch = normalized.match(/Check-out\s*(?:Date)?\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
        if (coMatch) {
            s.checkOut = parseAnyDateToYMD(coMatch[1]);
        }

        // 5. Booking Date
        let bdMatch = normalized.match(/agoda\.com\s*<no-reply@agoda\.com>[\s\S]{0,120}?(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?,?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i)
                   || normalized.match(/Booked\s*on\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
        if (bdMatch) {
            s.bookDate = parseAnyDateToYMD(bdMatch[1]);
        }
        if (!s.bookDate) s.bookDate = getLocalYMD();

        // 6. Occupancy / Pax
        let paxMatch = normalized.match(/(\d+)\s*Adult/i);
        if (paxMatch) {
            let pStr = paxMatch[1];
            s.pax = parseInt(pStr.length > 1 ? pStr.slice(-1) : pStr) || 1;
        }

        // 7. Room Type
        let rtMatch = normalized.match(/No\.\s*of\s*Extra\s*Bed\s*([\s\S]+?)(?:\(null\))?\s*\d*\s*\d+\s*Adult/i)
                   || normalized.match(/Room\s*Type\s*:?\s*([\s\S]+?)(?:\(null\))?\s*(?:No\.\s*of\s*Rooms|Occupancy|\d+\s*Adult)/i);
        if (rtMatch) {
            s.bookedType = rtMatch[1]
                .replace(/\(null\)/gi, '')
                .replace(/No\.\s*of\s*Rooms|Occupancy|No\.\s*of\s*Extra\s*Bed/gi, '')
                .replace(/\r?\n/g, ' ')
                .trim();
        } else {
            let rtLine = lines.findIndex(l => l.match(/(?:Room Type|Room Category|Room|Booked Room)/i));
            if (rtLine > -1 && lines.length > rtLine + 1) {
                s.bookedType = lines[rtLine + 1].replace(/\(null\)/gi, '').trim();
            }
        }

        // 8. Financials: Total Price and Net Payout
        let sellMatch = normalized.match(/Reference\s*sell\s*rate[^\d]*([\d,]+(?:\.\d+)?)/i)
                     || normalized.match(/Total\s*(?:Price|Amount)?[^\d]*([\d,]+(?:\.\d+)?)/i);
        let netMatch = normalized.match(/Net\s*rate[^\d]*([\d,]+(?:\.\d+)?)/i)
                    || normalized.match(/Hotel\s*Payout[^\d]*([\d,]+(?:\.\d+)?)/i);

        let totalAmt = sellMatch ? parseFloat(sellMatch[1].replace(/,/g, '')) : 0;
        let netAmt = netMatch ? parseFloat(netMatch[1].replace(/,/g, '')) : 0;

        if (totalAmt > 0) {
            s.totalPrice = totalAmt;
            s.netPrice = netAmt > 0 ? netAmt : Number((totalAmt * 0.815).toFixed(2));
        } else if (netAmt > 0) {
            s.netPrice = netAmt;
            s.totalPrice = Number((netAmt / 0.815).toFixed(2));
        }

        if (s.totalPrice > 0) {
            const payDate = s.checkIn || s.bookDate || getLocalYMD();
            const commission = Number((s.totalPrice - (s.netPrice || s.totalPrice)).toFixed(2));

            if (commission > 0) {
                s.payments.push({
                    date: payDate,
                    amt: commission,
                    method: 'agoda-kp'
                });
            }
            if (s.netPrice > 0) {
                s.payments.push({
                    date: payDate,
                    amt: Number(s.netPrice.toFixed(2)),
                    method: 'agoda-pay'
                });
            }
        }

    // ---------------------------------------------------------
    // EXPEDIA PARSER (Partner Central Emails & Mashed Tables)
    // ---------------------------------------------------------
    } else if (s.source === 'expedia') {
        const flatRaw = normalized.replace(/\s+/g, ' ');

        // 1. Booking ID (Reservation ID)
        let idMatch = normalized.match(/Reservation\s*ID\s*:?\s*(\d{8,14})/i)
                   || flatRaw.match(/Reservation\s*ID\s*:?\s*(\d{8,14})/i);
        if (idMatch) s.bookId = idMatch[1];

        // 2. Guest Name
        let guestMatch = normalized.match(/Guest\s*:\s*([A-Za-z\u00C0-\u024F\s\-'\.]+?)(?:Booked\s*on|Guest\s*Email|Room\s*Type|\n|$)/i);
        if (guestMatch) {
            let rawName = guestMatch[1].replace(/^(?:mr\.|mrs\.|ms\.|miss|dr\.)\s+/i, '').trim();
            let parts = rawName.split(/\s+/).filter(Boolean);
            if (parts.length > 1) {
                s.firstName = parts.slice(0, -1).join(' ').toUpperCase();
                s.lastName = parts[parts.length - 1].toUpperCase();
            } else if (parts.length === 1) {
                s.lastName = parts[0].toUpperCase();
            }
        }

        // 3. Guest Email & Phone
        let emailMatch = normalized.match(/Guest\s*Email\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        if (emailMatch) s.email = emailMatch[1].trim();

        let phoneMatch = normalized.match(/(?:PST|PDT|AM|PM)\s*(\+?[\d\s()\-]{7,25})\s*Guest\s*Email/i);
        if (phoneMatch) s.phone = phoneMatch[1].trim();

        // 4. Book Date
        let bdMatch = normalized.match(/Booked\s*on\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
        if (bdMatch) {
            s.bookDate = parseAnyDateToYMD(bdMatch[1]);
        }
        if (!s.bookDate) s.bookDate = getLocalYMD();

        // 5. Room Type Name
        let rtMatch = normalized.match(/Room\s*Type\s*Name\s*:?\s*([\s\S]+?)(?:Pricing\s*Model|Payment\s*Instructions|Check-In|Rate\s*Code|Daily\s*Base\s*Rate|\n|$)/i);
        if (rtMatch) {
            s.bookedType = rtMatch[1].replace(/\r?\n/g, ' ').trim();
        }

        // 6. Check-In & Check-Out Dates (Handles mashed: "...Hotel ConfSep 26, 2026Oct 1, 2026105")
        // Uses explicit month names so attached prefix words like "Conf" are not grouped with the month
        const mPattern = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
        const dateSectionRegex = new RegExp(`Check-In[\\s\\S]{0,120}?Check-Out[\\s\\S]{0,120}?(${mPattern}\\s+\\d{1,2},?\\s+\\d{4})\\s*(${mPattern}\\s+\\d{1,2},?\\s+\\d{4})(\\d{1,3})?`, 'i');
        
        let datesSection = normalized.match(dateSectionRegex);
        if (datesSection) {
            s.checkIn = parseAnyDateToYMD(datesSection[1]);
            s.checkOut = parseAnyDateToYMD(datesSection[2]);
            
            // Mashed digits after dates: "105" -> 1 Adult, 0 Kids, 5 Nights
            if (datesSection[3]) {
                let paxDigit = datesSection[3].charAt(0);
                let pVal = parseInt(paxDigit);
                if (!isNaN(pVal) && pVal > 0) s.pax = pVal;
            }
        }

        // Fallback for dates if table was spaced differently
        if (!s.checkIn) {
            let singleIn = normalized.match(new RegExp(`Check-In\\s*(?:Date)?\\s*:?\\s*(${mPattern}\\s+\\d{1,2},?\\s+\\d{4})`, 'i'));
            if (singleIn) s.checkIn = parseAnyDateToYMD(singleIn[1]);
        }
        if (!s.checkOut) {
            let singleOut = normalized.match(new RegExp(`Check-Out\\s*(?:Date)?\\s*:?\\s*(${mPattern}\\s+\\d{1,2},?\\s+\\d{4})`, 'i'));
            if (singleOut) s.checkOut = parseAnyDateToYMD(singleOut[1]);
        }

        // 7. Adults / PAX Fallback
        if (!s.pax || s.pax === 1) {
            let paxMatch = normalized.match(/Adults\s*:?\s*(\d+)/i) || flatRaw.match(/(\d+)\s*Adult/i);
            if (paxMatch) s.pax = Math.max(1, parseInt(paxMatch[1]) || 1);
        }

        // 8. Financials: Total Booking Amount and Amount to Charge Expedia Group (Net)
        let totalMatch = normalized.match(/Total\s*Booking\s*Amount\s*:?\s*([\d,]+(?:\.\d+)?)/i)
                      || flatRaw.match(/Total\s*(?:Booking\s*Amount|Amount)?[^\d]*([\d,]+(?:\.\d+)?)\s*(?:THB|USD|EUR|GBP|฿|\$)/i);
        let netMatch = normalized.match(/Amount\s*to\s*Charge\s*Expedia\s*Group\s*:?\s*([\d,]+(?:\.\d+)?)/i)
                    || flatRaw.match(/Charge\s*Expedia\s*Group[^\d]*([\d,]+(?:\.\d+)?)/i);

        let totalAmt = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0;
        let netAmt = netMatch ? parseFloat(netMatch[1].replace(/,/g, '')) : 0;

        if (totalAmt > 0) {
            s.totalPrice = totalAmt;
            s.netPrice = netAmt > 0 ? netAmt : Number((totalAmt * 0.82).toFixed(2));
        } else if (netAmt > 0) {
            s.netPrice = netAmt;
            s.totalPrice = Number((netAmt / 0.82).toFixed(2));
        }

        // 9. Prepayments & Collection Status
        let isExpediaCollect = rawLower.includes('expedia collects payment') || 
                               rawLower.includes('guest has pre-paid') || 
                               rawLower.includes('hotel invoices expedia');

        if (isExpediaCollect && s.totalPrice > 0) {
            const payDate = s.checkIn || s.bookDate || getLocalYMD();
            const commission = Number((s.totalPrice - (s.netPrice || s.totalPrice)).toFixed(2));

            if (commission > 0) {
                s.payments.push({
                    date: payDate,
                    amt: commission,
                    method: 'expedia-kp'
                });
            }
            if (s.netPrice > 0) {
                s.payments.push({
                    date: payDate,
                    amt: Number(s.netPrice.toFixed(2)),
                    method: 'expedia-pay'
                });
            }
        }

    // ---------------------------------------------------------
    // AIRBNB PARSER
    // ---------------------------------------------------------
    } else if (raw.toLowerCase().includes('airbnb') || s.source === 'airbnb') {
        s.source = 'airbnb';

        // 1. Booking ID
        let idIdx = lines.findIndex(l => l.includes('Confirmation code'));
        if (idIdx > -1 && lines.length > idIdx + 1) {
            s.bookId = lines[idIdx + 1].trim();
        } else {
            let idM = raw.match(/Confirmation code\s*([A-Z0-9]{8,12})/i);
            if (idM) s.bookId = idM[1];
        }

        // 2. Guest Name
        let nameM = raw.match(/Reservation confirmed - (.*?)\s+arrives/i) || raw.match(/New booking confirmed![\s\S]*?\n[\s\S]*?\n(.*?)(?:\n|Identity)/i);
        if (nameM) {
            let parts = nameM[1].trim().split(' ');
            s.firstName = parts[0];
            s.lastName = parts.slice(1).join(' ') || 'GUEST';
        }

        // 3. Country
        let countryMatch = raw.match(/Identity verified.*?\n(.*?)\n/i);
        if (countryMatch) {
            let locationString = countryMatch[1].trim();
            let locParts = locationString.split(',');
            s.country = locParts[locParts.length - 1].trim();
        }

        // 4. Book Date
        let bookDateMatch = raw.match(/Airbnb\s*\n(.*?)\n/i);
        if (bookDateMatch) {
            let timeString = bookDateMatch[1].trim();
            if (timeString.includes(':') || timeString.includes('ago')) {
                s.bookDate = getLocalYMD();
            } else {
                s.bookDate = parseAnyDateToYMD(timeString + " " + new Date().getFullYear()) || getLocalYMD();
            }
        }

        // 5. Check-In & 6. Check-Out
        let ciIdx = lines.findIndex(l => l.includes('Check-in') || l.includes('Check in'));
        if (ciIdx > -1 && lines.length > ciIdx + 1) {
            let dateStr = lines[ciIdx + 1].replace(/^[A-Za-z]{3},\s*/, '');
            s.checkIn = parseAnyDateToYMD(dateStr);
        }

        let coIdx = lines.findIndex(l => l.includes('Checkout') || l.includes('Check out'));
        if (coIdx > -1 && lines.length > coIdx + 1) {
            let dateStr = lines[coIdx + 1].replace(/^[A-Za-z]{3},\s*/, '');
            s.checkOut = parseAnyDateToYMD(dateStr);
        }

        // 7. PAX
        let paxIdx = lines.findIndex(l => l.includes('Guests'));
        if (paxIdx > -1 && lines.length > paxIdx + 1) {
             let paxMatch = lines[paxIdx + 1].match(/(\d+)/);
             if (paxMatch) s.pax = parseInt(paxMatch[1]);
        }

        // 8. Prices (Gross and Net) & Payments
        let totIdx = lines.findIndex(l => l.toLowerCase().includes('total (thb)') || l.toLowerCase() === 'total');
        if (totIdx > -1 && lines.length > totIdx + 1) {
            let totMatch = lines[totIdx + 1].match(/[\d,]+\.\d{2}/);
            if (totMatch) s.totalPrice = parseFloat(totMatch[0].replace(/,/g, ''));
        }

        let netIdx = lines.findIndex(l => l.toLowerCase().includes('you earn'));
        if (netIdx > -1 && lines.length > netIdx + 1) {
            let netMatch = lines[netIdx + 1].match(/[\d,]+\.\d{2}/);
            if (netMatch) {
                s.netPrice = parseFloat(netMatch[0].replace(/,/g, ''));
                s.netOverride = true;
            }
        }

        if (s.totalPrice && s.netPrice) {
            let commAmt = s.totalPrice - s.netPrice;
            let payDate = s.checkIn || getLocalYMD();
            s.payments.push({ date: payDate, amt: Number(s.netPrice.toFixed(2)), method: 'airbnb-pay' });
            s.payments.push({ date: payDate, amt: Number(commAmt.toFixed(2)), method: 'airbnb-kp' });
        }

        // 9. Booked Room Type
        let rtIdx = lines.findIndex(l => l.includes('Add guest details'));
        if (rtIdx > -1 && lines.length > rtIdx + 1) {
            s.bookedType = lines[rtIdx + 1].trim();
        }
    }

    // Universal Fallback for Channel Sheets (Arrival Date / Departure Date formatted text)
    if (!s.checkIn) {
        let arrMatch = normalized.match(/Arrival\s*Date\s*:?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i);
        if (arrMatch) s.checkIn = parseAnyDateToYMD(arrMatch[1]);
    }
    if (!s.checkOut) {
        let depMatch = normalized.match(/Departure\s*Date\s*:?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i);
        if (depMatch) s.checkOut = parseAnyDateToYMD(depMatch[1]);
    }

    // Refundability Check (Applies to all)
    let isNonRef = rawLower.includes('non-refundable') || rawLower.includes('non refundable') || rawLower.includes('charged the total price of the reservation if they cancel at any time');
    if (isNonRef) s.refundability = 'non-ref';
    else if (!s.refundability) s.refundability = 'ref';
    
    if (s.checkIn) {
        const p = s.checkIn.split('-');
        if (p.length === 3) {
            let ciDate = new Date(Date.UTC(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])));
            if (!isNaN(ciDate.getTime())) {
                let today = new Date();
                today.setHours(0, 0, 0, 0); 
                let diffDays = (ciDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
                if (diffDays <= 7) s.refundability = 'non-ref';
            }
        }
    }

    // Build Original Booking Summary
    let nights = 1, avgNightly = 0;
    if (s.checkIn && s.checkOut) {
        const parseYMD = str => { 
            if (!str || typeof str !== 'string') return 0;
            const p = str.split('-'); 
            return p.length !== 3 ? 0 : Date.UTC(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])); 
        };
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
