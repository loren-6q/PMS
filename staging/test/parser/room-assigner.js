// ==========================================================================
// parser/room-assigner.js - Automatic Room Suggestion Engine
// Wild & Wandering Property Management System
// ==========================================================================

import { parseYMD } from '../pms/pms-init.js';

const $$ = s => document.querySelectorAll(s);

export const autoSuggestRoom = (bt, nt, cin, cout) => {
    if (!cin || !cout || !bt) return;
    const staff = window.staff || [];
    const hotelRooms = window.hotelRooms || [];

    const sU = parseYMD(cin), eU = parseYMD(cout), occ = new Set();
    staff.forEach(s => {
        if (['cancelled', 'noshow', 'unconfirmed', 'charged'].includes(s.status)) return;
        if (sU < parseYMD(s.checkOut) && parseYMD(s.checkIn) < eU) {
            (s.rooms?.length ? s.rooms : [s.room]).forEach(r => { if (r) occ.add(r); });
        }
    });

    let av = hotelRooms.filter(r => !occ.has(r.id));
    let aRId = [];

    // NOTE: In Phase 2, this section will pull from window.propertyOtaMap dynamically
    bt.split(' + ').forEach(part => {
        let pT = null;
        if (/DORMITORY|4-BED|DORM/i.test(part)) pT = "Standard Quad Dorm";
        else if (/TRIPLE/i.test(part) && /BUNK/i.test(part)) pT = "Partial Oceanview Triple (Bunk+Twin)";
        else if (/TRIPLE/i.test(part)) pT = "Partial Oceanview Triple (King+Twin)";
        else if (/SIDE SEA VIEW/i.test(part) || (/PARTIAL/i.test(part) && !/TWIN|TRIPLE/i.test(part))) pT = "Partial Oceanview King Room";
        else if (/PARTIAL SEA VIEW/i.test(part) || (/PARTIAL/i.test(part) && /TWIN/i.test(part))) pT = "Partial Oceanview Twin Room";
        else if (/DELUXE TWIN/i.test(part) || (/OCEANVIEW/i.test(part) && /TWIN/i.test(part))) pT = "Oceanview Twin Room";
        else if (/DELUXE DOUBLE/i.test(part) || (/OCEANVIEW/i.test(part) && !/TWIN/i.test(part))) pT = "Oceanview King Room";
        else if (/TWIN ROOM WITH BALCONY/i.test(part) || (/GARDEN/i.test(part) && /TWIN/i.test(part))) pT = "Gardenview Twin Room";
        else if (/KING ROOM WITH BALCONY/i.test(part) || (/GARDEN/i.test(part) && !/TWIN/i.test(part))) pT = "Gardenview King Room";
        else if (/OCEANFRONT/i.test(part)) pT = /TWIN/i.test(part) ? "Oceanfront Twin" : "Oceanfront King";
        else if (/BUNGALOW/i.test(part)) pT = "BUNGALOWS";

        let pB = null;
        if (/1 EXTRA-LARGE DOUBLE BED|1 EXTRA-LARGE|1 DOUBLE|1 KING|LARGE DOUBLE|1 BED|ONE BED/i.test(nt) || /KING|DOUBLE(?!\sTWIN)/i.test(part)) pB = "KING";
        else if (/TWIN|SEPARATE|2 SINGLE|TWO SINGLE|2 BEDS|SINGLES/i.test(nt) || (/TWIN/i.test(part) && !/DOUBLE/i.test(part))) pB = "TWIN";
        else if (/BUNK/i.test(nt)) pB = "BUNK+T";

        let m = (pT && pB) ? av.find(r => r.type === pT && r.bed && r.bed.includes(pB)) : null;
        if (!m && pT) m = av.find(r => r.type === pT);

        if (m) {
            aRId.push(m.id);
            av = av.filter(r => r.id !== m.id);
        }
    });

    if (aRId.length > 0) {
        const s = $$('.assigned-room-select');
        aRId.forEach((id, i) => { if (s[i]) s[i].value = id; });
        if (window.updateAvailableRooms) window.updateAvailableRooms();
    }
};

window.autoSuggestRoom = autoSuggestRoom;
