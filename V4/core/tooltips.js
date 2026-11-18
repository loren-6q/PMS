// ==========================================================================
// core/tooltips.js - Central Tooltip & Feature Documentation Registry
// Wild & Wandering Property Management System
// ==========================================================================

export const TOOLTIPS = Object.freeze({
    // --- Channel Manager Toolbar ---
    "cm.eventsToggle": "Master Event Pricing Switch (ON/OFF).\n• ON: Enables Event (FMP) rate rows, Event Curve Tuner, and pushes Event pricing to mapped Event rate plans.\n• OFF: Treats all dates as standard non-event days.",
    "cm.editMode": "Ripple vs Override Mode:\n• RIPPLE MODE: Editing an Anchor room automatically recalculates all linked rooms.\n• OVERRIDE MODE: Pins only the edited cell without rippling to linked rooms.",
    "cm.saveSync": "Saves changes to Firestore and pushes only modified dates/rooms to Channex (incremental delta sync).",
    "cm.fullSync": "Saves changes to Firestore and pushes a full 500-day availability, rate, and restriction refresh to Channex.",
    "cm.roomsFilter": "Filter which room categories are visible on the grid:\n• Anchors: Master driver rooms only\n• All / Dorms / Privates: Filter by room class",
    "cm.ratesFilter": "Toggle which rate rows are displayed:\n• DEF: Master Default Non-Ref & Refundable\n• Direct: Direct Website (WEB) rates\n• Event: Event / FMP package rows\n• LOS: Weekly / Monthly length-of-stay plans\n• OTA: Channel-specific plans (BDC, HWL, AGO, etc.)\n• Other: Custom user-defined plans",
    "cm.viewFilter": "Customize cell density by toggling individual data layers:\n• Availability (AVL)\n• Price\n• Min / Max Stay\n• Restrictions (CTA / CTD / STOP)",
    "cm.channelPreview": "Filter OTA rate rows to preview a single channel's calculated rates and restrictions.",
    "cm.gaps": "Highlights cells with missing prices or incomplete setup so you never leave unpriced dates open.",
    "cm.curve": "Open the Event Curve & Restriction Pyramid Tuner (±6 days around peak event dates).",
    "cm.bulk": "Open Range Bulk Update to apply rates, Min/Max stays, or Open/CTA/CTD/STOP across a date range.",

    // --- Bulk Drawer & Event Curve ---
    "cm.bulkScope": "Bulk Update Scope:\n• Anchors: Edits anchor rooms and ripples prices/restrictions to linked rooms.\n• All Rooms: Edits ONLY the specific room row(s) you enter, without rippling.",
    "cm.bulkRates": "Choose which rate layers receive the bulk Min/Max and Restriction changes. Select 'All Rates' to apply cleanly across the room without creating per-plan overrides.",
    "cm.minStay": "Minimum Stay:\n• Plain number (e.g. 3) = Min Stay Through (every night of stay must satisfy).\n• With arrow (3▸) = Min Stay on Arrival (checked on check-in date only).\n• Double-click cell to toggle between Through and Arrival.",
    "cm.restrictionPill": "Click to cycle restriction status:\n• Open: Bookable\n• CTA: Closed to Arrival\n• CTD: Closed to Departure\n• CTB: Closed to Both Arrival & Departure\n• STOP: Stop Sell (completely closed)",

    // --- Setup Step 3 & Ghost Rooms ---
    "setup.ghostRoom": "Ghost Room (Mirror Room Type in Channex):\nCreates a mirror FMP room type in Channex linked to your existing PMS room category—without adding a duplicate room to your PMS grid.\n• Shares exact physical availability with the real room.\n• Receives Event (FMP) prices & pyramid restrictions.\n• Map ONLY to Hostelworld's duplicate FMP listing (since Hostelworld does not support custom Event rate plans).",
    "setup.derivedLos": "Derived Weekly / Monthly Rate Plan:\nInherits Price (-15% / -25%), Stop Sell, CTA, CTD, and Max Stay from the parent plan in Channex, while enforcing a fixed 7-night or 28-night Min Stay."
});

export function getTip(key) {
    return TOOLTIPS[key] || key || '';
}

function initGlobalTooltips() {
    if (typeof document === 'undefined' || window._wwTooltipsBound) return;
    window._wwTooltipsBound = true;

    const getTooltipEl = () => {
        let el = document.getElementById('cm-tooltip');
        if (!el) {
            el = document.createElement('div');
            el.id = 'cm-tooltip';
            el.className = 'fixed hidden z-[10000] bg-slate-900/95 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold shadow-2xl border border-slate-700 max-w-xs leading-snug pointer-events-none whitespace-pre-line';
            document.body.appendChild(el);
        }
        return el;
    };

    document.addEventListener('mouseover', (e) => {
        const host = e.target?.closest?.('[data-tip]');
        if (!host) return;
        const text = getTip(host.getAttribute('data-tip'));
        if (!text) return;

        const tt = getTooltipEl();
        tt.innerText = text;
        tt.classList.remove('hidden');

        const rect = host.getBoundingClientRect();
        const left = Math.min(window.innerWidth - 330, Math.max(10, rect.left));
        const top = (rect.bottom + 8 + 90 > window.innerHeight)
            ? Math.max(10, rect.top - 75)
            : rect.bottom + 6;

        tt.style.left = `${left}px`;
        tt.style.top = `${top}px`;
    });

    document.addEventListener('mouseout', (e) => {
        const host = e.target?.closest?.('[data-tip]');
        if (!host) return;
        if (e.relatedTarget && host.contains(e.relatedTarget)) return;
        const tt = document.getElementById('cm-tooltip');
        if (tt) tt.classList.add('hidden');
    });
}

if (typeof window !== 'undefined') {
    window.TOOLTIPS = TOOLTIPS;
    window.getTip = getTip;
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGlobalTooltips);
    } else {
        initGlobalTooltips();
    }
}
