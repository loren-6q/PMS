// ==========================================================================
// core/channels.js - Canonical OTA Registry & Channex 3-Letter Adapter Contract
// Wild & Wandering Property Management System
// ==========================================================================

export const CHANNELS = Object.freeze({
    // Internal Base & Direct Operational Channels (Strict 3-Letter)
    DEF: { code: "DEF", name: "DEFAULT", label: "DEFAULT (General OTAs)", sub: "Standard OTA Pipe", isBase: true },
    WEB: { code: "WEB", name: "Direct Website", label: "Website Engine", sub: "Direct Booking Engine", isBase: true },
    WLK: { code: "WLK", name: "Walk-In", label: "Front Desk Walk-In", sub: "On-Site Direct", isBase: true },
    MSG: { code: "MSG", name: "Direct Message", label: "WhatsApp / Direct MSG", sub: "Social / Direct Messaging", isBase: true },
    PHN: { code: "PHN", name: "Phone", label: "Phone Reservation", sub: "Direct Phone Call", isBase: true },

    // Global Major OTAs (Official Channex 3-Letter Shortcodes)
    BDC: { code: "BDC", name: "Booking.com", label: "Booking.com", sub: "BDC Channel", isBase: false },
    HWL: { code: "HWL", name: "Hostelworld", label: "Hostelworld", sub: "HW Channel", isBase: false },
    AGO: { code: "AGO", name: "Agoda", label: "Agoda", sub: "Agoda Channel", isBase: false },
    EXP: { code: "EXP", name: "Expedia", label: "Expedia", sub: "Expedia Channel", isBase: false },
    ABB: { code: "ABB", name: "Airbnb", label: "Airbnb", sub: "Airbnb Channel", isBase: false },
    TRP: { code: "TRP", name: "Trip.com", label: "Trip.com / Ctrip", sub: "Trip.com Channel", isBase: false },
    VRB: { code: "VRB", name: "Vrbo", label: "Vrbo / HomeAway", sub: "Vrbo Channel", isBase: false },
    GGL: { code: "GGL", name: "Google Hotel Ads", label: "Google Hotels", sub: "Google Channel", isBase: false },

    // Asia-Pacific & Regional OTAs
    TKT: { code: "TKT", name: "Tiket.com", label: "Tiket.com", sub: "Tiket Channel", isBase: false },
    TVL: { code: "TVL", name: "Traveloka", label: "Traveloka", sub: "Traveloka Channel", isBase: false },
    RAK: { code: "RAK", name: "Rakuten", label: "Rakuten Travel", sub: "Rakuten Channel", isBase: false },
    FLI: { code: "FLI", name: "Fliggy", label: "Fliggy / Alibaba", sub: "Fliggy Channel", isBase: false },
    MKP: { code: "MKP", name: "MakeMyTrip", label: "MakeMyTrip / Goibibo", sub: "MMT Channel", isBase: false },
    PGI: { code: "PGI", name: "PegiPegi", label: "PegiPegi", sub: "PegiPegi Channel", isBase: false },

    // European, American & Specialty OTAs (Channex Catalog)
    CTZ: { code: "CTZ", name: "CultBooking", label: "CultBooking", sub: "CultBooking Channel", isBase: false },
    DDC: { code: "DDC", name: "Despegar", label: "Despegar / Decolar", sub: "LATAM Channel", isBase: false },
    OVK: { code: "OVK", name: "Ostrovok", label: "Ostrovok / Emerging Travel", sub: "Ostrovok Channel", isBase: false },
    HBD: { code: "HBD", name: "Hotelbeds", label: "Hotelbeds", sub: "Bedbank Channel", isBase: false },
    HRS: { code: "HRS", name: "HRS", label: "HRS Corporate", sub: "HRS Channel", isBase: false },
    HYR: { code: "HYR", name: "HyperGuest", label: "HyperGuest Direct", sub: "B2B Channel", isBase: false },
    FER: { code: "FER", name: "Feratel", label: "Feratel DeskLine", sub: "Alpine Channel", isBase: false },
    ATV: { code: "ATV", name: "Atraveo", label: "Atraveo / e-domizil", sub: "Holiday Home Channel", isBase: false },
    TRA: { code: "TRA", name: "Traum-Ferienwohnungen", label: "Traum", sub: "Vacation Rental Channel", isBase: false },
    SZP: { code: "SZP", name: "Szallas", label: "Szallas.hu", sub: "CEE Channel", isBase: false },
    BKG: { code: "BKG", name: "Bookeasy", label: "Bookeasy", sub: "Visitor Centre Channel", isBase: false },
    RVE: { code: "RVE", name: "Roiback", label: "Roiback Direct", sub: "Direct Booking Engine", isBase: false },
    SBR: { code: "SBR", name: "Sabre", label: "Sabre SynXis", sub: "GDS Channel", isBase: false },
    AMB: { code: "AMB", name: "Amadeus", label: "Amadeus GDS", sub: "GDS Channel", isBase: false },
    TPO: { code: "TPO", name: "Travelport", label: "Travelport / Galileo", sub: "GDS Channel", isBase: false }
});

// Full ordered list of external OTAs (for modals and selectors)
export const CANONICAL_OTA_LIST = Object.freeze(
    Object.values(CHANNELS).filter(ch => !ch.isBase)
);

/**
 * Normalizes any string to its strict uppercase 3-letter Channex code.
 */
export function resolveChannelCode(rawString) {
    if (!rawString) return "DIR";
    const clean = String(rawString).trim().toUpperCase();

    // Direct 3-letter hit
    if (CHANNELS[clean]) return clean;

    // Check dynamic local cache from Channex API
    try {
        const cached = JSON.parse(localStorage.getItem('channex_dynamic_channels') || '{}');
        if (cached[clean]) return clean;
    } catch (e) {}

    // Match by display name
    for (const ch of Object.values(CHANNELS)) {
        if (ch.name.toUpperCase() === clean || ch.label.toUpperCase() === clean) {
            return ch.code;
        }
    }

    return clean.length === 3 ? clean : "DEF";
}

/**
 * Returns the channel metadata object for any 3-letter code.
 */
export function getChannelByCode(code) {
    const canonical = resolveChannelCode(code);
    if (CHANNELS[canonical]) {
        return CHANNELS[canonical];
    }
    return {
        code: canonical,
        name: canonical,
        label: canonical,
        sub: "Custom / Dynamic Channel",
        isBase: false
    };
}

/**
 * Returns official -PAY and -KP accounting ledger pairs.
 */
export function getOtaPaymentPair(channelCode, isActive = true) {
    const channel = getChannelByCode(channelCode);
    const codeLower = channel.code.toLowerCase();
    return [
        {
            key: `${codeLower}-pay`,
            label: `${channel.name} Payout / Collect`,
            type: "revenue",
            channel: channel.code,
            channelName: channel.name,
            active: isActive
        },
        {
            key: `${codeLower}-kp`,
            label: `${channel.name} Commission (Withheld)`,
            type: "commission",
            channel: channel.code,
            channelName: channel.name,
            active: isActive
        }
    ];
}

/**
 * Normalizes pricing channel rules into canonical schema:
 * [{ code: "BDC", name: "Booking.com", sub: "BDC Channel", op: "+%", val: 18, locked: false }]
 */
export function normalizeChannelRules(rawRules = []) {
    const defaultRules = [
        { code: "DEF", name: "DEFAULT", sub: "Standard OTA Pipe", op: "sync", val: 0, locked: true },
        { code: "DIR", name: "DIRECT", sub: "Direct Website Engine", op: "sync", val: 0, locked: true }
    ];

    if (!Array.isArray(rawRules) || rawRules.length === 0) {
        return defaultRules;
    }

    const seen = new Set();
    const result = [];

    const rawDef = rawRules.find(r => resolveChannelCode(r.code || r.name || r.channel) === "DEF");
    const rawDir = rawRules.find(r => resolveChannelCode(r.code || r.name || r.channel) === "DIR" || resolveChannelCode(r.code || r.name || r.channel) === "WEB");

    result.push({
        code: "DEF",
        name: "DEFAULT",
        sub: "Standard OTA Pipe",
        op: rawDef?.op || "sync",
        val: rawDef?.val ?? 0,
        locked: true
    });
    seen.add("DEF");

    result.push({
        code: "DIR",
        name: "DIRECT",
        sub: "Direct Website Engine",
        op: rawDir?.op || "sync",
        val: rawDir?.val ?? 0,
        locked: true
    });
    seen.add("DIR");

    rawRules.forEach(rule => {
        const rawIdentifier = rule.code || rule.name || rule.channel;
        const code = resolveChannelCode(rawIdentifier);
        if (seen.has(code)) return;
        seen.add(code);

        const meta = getChannelByCode(code);
        result.push({
            code: meta.code,
            name: meta.name,
            sub: meta.sub || "Custom Channel",
            op: rule.op || "+%",
            val: rule.val ?? (rule.markupPct || 0),
            locked: false
        });
    });

    return result;
}
