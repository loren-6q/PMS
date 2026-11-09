// ==========================================================================
// core/channels.js - Canonical OTA Registry & Channex Adapter Contract
// Wild & Wandering Property Management System
// ==========================================================================

export const CHANNELS = Object.freeze({
    // Internal Base Channels
    DEF: { code: "DEF", name: "DEFAULT", label: "DEFAULT (General OTAs)", sub: "Standard OTA Pipe", isBase: true },
    DIR: { code: "DIR", name: "DIRECT", label: "Direct Website", sub: "Direct Booking Engine", isBase: true },

    // Global Major OTAs
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
    MKP: { code: "MKP", name: "MakeMyTrip", label: "MakeMyTrip", sub: "MMT Channel", isBase: false },
    PGI: { code: "PGI", name: "PegiPegi", label: "PegiPegi", sub: "PegiPegi Channel", isBase: false },

    // European, American & Specialty OTAs
    HBD: { code: "HBD", name: "Hotelbeds", label: "Hotelbeds", sub: "Bedbank Channel", isBase: false },
    DES: { code: "DES", name: "Despegar", label: "Despegar / Decolar", sub: "LATAM Channel", isBase: false },
    OST: { code: "OST", name: "Ostrovok", label: "Ostrovok / Emerging", sub: "Ostrovok Channel", isBase: false },
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

// Full ordered array of all external OTAs (excluding internal DEF and DIR)
export const CANONICAL_OTA_LIST = Object.freeze(
    Object.values(CHANNELS).filter(ch => !ch.isBase)
);

// Map of all historical & shorthand aliases directly to official 3-letter codes
const LEGACY_ALIAS_MAP = {
    // Booking.com
    "booking": "BDC",
    "booking.com": "BDC",
    "bdc": "BDC",
    "bdc-pay": "BDC",
    "bdc-kp": "BDC",

    // Hostelworld
    "hostelworld": "HWL",
    "hw": "HWL",
    "hwl": "HWL",
    "hw-pay": "HWL",
    "hw-kp": "HWL",
    "hwl-pay": "HWL",
    "hwl-kp": "HWL",

    // Agoda
    "agoda": "AGO",
    "ago": "AGO",
    "ycs": "AGO",
    "agoda-pay": "AGO",
    "agoda-kp": "AGO",

    // Expedia
    "expedia": "EXP",
    "exp": "EXP",
    "epc": "EXP",
    "expedia-pay": "EXP",
    "expedia-kp": "EXP",

    // Airbnb
    "airbnb": "ABB",
    "abb": "ABB",
    "abnb": "ABB",
    "airbnb-pay": "ABB",
    "airbnb-kp": "ABB",

    // Trip.com
    "trip": "TRP",
    "trip.com": "TRP",
    "ctrip": "TRP",
    "trp": "TRP",
    "trip-pay": "TRP",
    "trip-kp": "TRP",

    // Direct / Internal
    "direct": "DIR",
    "dir": "DIR",
    "website": "DIR",
    "web": "DIR",
    "walkin": "DIR",
    "phone": "DIR",
    "default": "DEF",
    "def": "DEF"
};

/**
 * Resolves any raw string (legacy name, short alias, or code) to official 3-letter Channex code.
 */
export function resolveChannelCode(rawString) {
    if (!rawString) return "DIR";
    const clean = String(rawString).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!clean) return "DIR";

    if (LEGACY_ALIAS_MAP[clean]) {
        return LEGACY_ALIAS_MAP[clean];
    }

    const upper = clean.toUpperCase();
    if (CHANNELS[upper]) {
        return upper;
    }

    // Dynamic Channex catalog cache check
    try {
        const cached = JSON.parse(localStorage.getItem('channex_dynamic_channels') || '{}');
        if (cached[upper]) return upper;
    } catch (e) {}

    return clean.length === 3 ? upper : "DEF";
}

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
 * Generates official -PAY and -KP accounting ledger pairs for a channel.
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

    // Ensure DEF and DIR are locked at top
    const rawDef = rawRules.find(r => resolveChannelCode(r.code || r.name || r.channel) === "DEF");
    const rawDir = rawRules.find(r => resolveChannelCode(r.code || r.name || r.channel) === "DIR");

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
