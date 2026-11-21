// ==========================================================================
// core/tooltips.js - Central Tooltip & Feature Documentation Registry
// Wild & Wandering Property Management System
// ==========================================================================

export const TOOLTIPS = Object.freeze({
    // --- Universal Top Navigation ---
    "nav.switchProp": "Switch active property or view all properties in the catalog.",
    "nav.pms": "Open Front Desk PMS (Calendar Tape, Dashboard & Guest Database).",
    "nav.scan": "Open Mobile Passport Scanner for rapid guest check-in OCR.",
    "nav.tm30": "Open Thai Immigration Section 38 (TM30) batch reporting & CSV export.",
    "nav.admin": "Admin Workspace: Unlock Channel Manager, Accounting, Setup Wizard, and Split Screen.",

    // --- Channel Manager Toolbar & Grid ---
    "cm.eventsToggle": "Master Event Pricing Switch (ON/OFF).\n• ON: Enables Event package rows, Event Curve Tuner, and pushes Event pricing to mapped Event rate plans.\n• OFF: Treats all dates as standard non-event days.",
    "cm.editMode": "Ripple vs Override Mode:\n• RIPPLE MODE: Editing an Anchor room automatically recalculates all linked rooms.\n• OVERRIDE MODE: Pins only the edited cell without rippling to linked rooms.",
    "cm.saveSync": "Saves changes to Firestore and pushes only modified dates/rooms to Channex (incremental delta sync).",
    "cm.fullSync": "Saves changes to Firestore and pushes a full 500-day availability, rate, and restriction refresh to Channex.",
    "cm.roomsFilter": "Filter which room categories are visible on the grid:\n• Anchors: Master driver rooms only\n• All / Dorms / Privates: Filter by room class",
    "cm.ratesFilter": "Toggle which rate rows are displayed:\n• DEF: Master Default Non-Ref & Refundable\n• Direct: Direct Website (WEB) rates\n• Event: Event / package rows\n• LOS: Weekly / Monthly length-of-stay plans\n• OTA: Channel-specific plans (BDC, HWL, AGO, etc.)\n• Other: Custom user-defined plans",
    "cm.viewFilter": "Customize cell density by toggling individual data layers:\n• Availability (AVL)\n• Price\n• Min / Max Stay\n• Restrictions (CTA / CTD / STOP)",
    "cm.channelPreview": "Filter OTA rate rows to preview a single channel's calculated rates and restrictions.",
    "cm.gaps": "Highlights cells with missing prices or incomplete setup so you never leave unpriced dates open.",
    "cm.curve": "Open the Event Curve & Restriction Pyramid Tuner (±6 days around peak event dates).",
    "cm.bulk": "Open Range Bulk Update to apply rates, Min/Max stays, or Open/CTA/CTD/STOP across a date range.",
    "cm.bulkScope": "Bulk Update Scope:\n• Anchors: Edits anchor rooms and ripples prices/restrictions to linked rooms.\n• All Rooms: Edits ONLY the specific room row(s) you enter, without rippling.",
    "cm.bulkRates": "Choose which rate layers receive the bulk Min/Max and Restriction changes. Select 'All Rates' to apply cleanly across the room without creating per-plan overrides.",
    "cm.fillBlanks": "Fill empty room prices from linked Anchors without touching existing prices.",
    "cm.reRippleAll": "Recalculate all linked room prices from Anchors across this date range.",
    "cm.saveDefaultCurve": "Save this curve & restriction pyramid as your default baseline template.",
    "cm.minStay": "Minimum Stay:\n• Plain number (e.g. 3) = Min Stay Through (every night of stay must satisfy).\n• With arrow (3▸) = Min Stay on Arrival (checked on check-in date only).\n• Double-click cell to toggle between Through and Arrival.",
    "cm.restrictionPill": "Click to cycle restriction status:\n• Open: Bookable\n• CTA: Closed to Arrival\n• CTD: Closed to Departure\n• CTB: Closed to Both Arrival & Departure\n• STOP: Stop Sell (completely closed)",
    "cm.pinnedOverride": "Pinned override breaks Anchor ripple (double-click cell to re-link).",

    // --- Setup Wizard ---
    "setup.reorderCats": "Reorder Room Categories to set the exact display order used across the PMS Tape Chart, Channel Manager Matrix, and Dashboard.",
    "setup.moveRoomUp": "Move room up within this category.",
    "setup.moveRoomDown": "Move room down within this category.",
    "setup.deleteRoom": "Delete room (or archive if historical bookings exist).",
    "setup.ghostRoom": "Ghost Room (Mirror Room Type in Channex):\nCreates a secondary mirror room type in Channex linked to an existing PMS room category—without adding extra rows to your PMS calendar.\n• Shares live physical availability with the primary room category.\n• Lets you map separate OTA listings that require isolated pricing or stay restrictions.",
    "setup.derivedLos": "Derived Length-of-Stay Rate Plan:\nInherits Price (with a % discount), Stop Sell, CTA, CTD, and Max Stay from a parent plan in Channex, while enforcing its own fixed Min Stay (e.g. 7 or 28 nights).",

    // --- PMS Front Desk & Guest Folio ---
    "pms.tabDash": "Today's Snapshot: Arrivals, Departures, Stay-Overs, Live Rates & Action Items.",
    "pms.tabCal": "Master Calendar Tape Chart.",
    "pms.tabDb": "Tabular Guest Database Ledger with multi-column sort & filters.",
    "pms.search": "Search guests by name, room/bed ID, booking ID, or link code. Press the orange match badge to jump directly to the reservation bar.",
    "pms.extract": "Paste raw reservation confirmation text from any OTA to auto-parse guest details, dates, pricing, and room assignment.",
    "pms.nudgeInEarlier": "Earlier arrival (-1 day).",
    "pms.nudgeInLater": "Later arrival (+1 day).",
    "pms.nudgeOutEarlier": "Earlier departure (-1 day).",
    "pms.nudgeOutLater": "Later departure (+1 day).",
    "pms.nightsDisplay": "Total stay duration in nights.",
    "pms.earlyOut": "Process an early departure with automatic stayed/unstayed rate calculation.",
    "pms.tm30Sync": "Sync or scan guest passports for Thai Immigration TM30 reporting.",
    "pms.pax": "Total guest count (PAX) for this reservation.",
    "pms.linkCode": "Reservations sharing the same Link Code are visually linked on the tape chart and show a quick-jump itinerary bar inside the folio modal.",
    "pms.toolDelete": "Permanently delete this reservation.",
    "pms.toolSplit": "Split this reservation into two stay segments (e.g. room change mid-stay).",
    "pms.toolMerge": "Merge an adjacent or linked reservation into this booking.",
    "pms.toolDuplicate": "Clone this reservation as a new booking.",
    "pms.toolHistory": "View full audit trail of edits made to this reservation.",
    "pms.toolInvoice": "Generate and print an itemized guest folio invoice.",
    "dash.newBookings": "Incoming bookings with status NEW (including far-future arrivals).\nOpen each booking to verify room assignment, notes, and payments, then set status to FUTURE to acknowledge.",
    "dash.dismissAlert": "Dismiss this alert from Today's Action Items.",
    "dash.liveChecker": "Live Channel Manager rate and stay-restriction quote for the selected dates and PAX.",

    // --- PMS Calendar Legend ---
    "legend.owes": "Owes Balance (solid red border).",
    "legend.badCc": "Bad Credit Card (dashed red border).",
    "legend.arriveToday": "Check-in scheduled for today.",
    "legend.lateIn": "Guest has not checked in yet past arrival date.",
    "legend.departToday": "Check-out scheduled for today.",
    "legend.lateOut": "Overdue Departure (guest still marked 'here' past checkout date).",
    "legend.refundable": "Italics = Refundable ; Upright = Non-Refundable.",
    "legend.extended": "Stay has been extended.",
    "legend.linked": "Linked booking — multiple rooms, beds, or room change.",
    "legend.upFree": "Free room/bed upgrade.",
    "legend.upPaid": "Paid room/bed upgrade.",
    "legend.fbGood": "Positive guest feedback recorded.",
    "legend.fbBad": "Warning / negative guest feedback recorded.",
    "legend.mailConf": "Booking confirmation email sent.",
    "legend.mailNotFmp": "Standard (Non-Event) confirmation email sent.",
    "legend.mailPre": "Pre/Post event date check email sent.",
    "legend.mailPreConf": "Guest confirmed non-event attendance or updated dates.",
    "legend.mailSpec": "Special arrival instructions email sent."
});

export function isTrainingTipsEnabled() {
    try {
        return localStorage.getItem('ww_training_tips') !== 'false';
    } catch (e) {
        return true;
    }
}

export function setTrainingTipsEnabled(enabled) {
    try {
        localStorage.setItem('ww_training_tips', enabled ? 'true' : 'false');
    } catch (e) {}
    if (!enabled) {
        const tt = document.getElementById('cm-tooltip');
        if (tt) tt.classList.add('hidden');
    }
}

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
        const host = e.target?.closest?.('[data-tip], [title]');
        if (!host) return;
        if (host.hasAttribute('title')) {
            const nativeTitle = host.getAttribute('title');
            if (nativeTitle && !host.getAttribute('data-tip')) {
                host.setAttribute('data-tip', nativeTitle);
            }
            host.removeAttribute('title');
        }
        // Training tips (buttons/controls) respect the toggle; data tips (data-tip-type="data") are always active
        const tipType = host.getAttribute('data-tip-type') || 'training';
        if (tipType === 'training' && !isTrainingTipsEnabled()) return;

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
    window.isTrainingTipsEnabled = isTrainingTipsEnabled;
    window.setTrainingTipsEnabled = setTrainingTipsEnabled;
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGlobalTooltips);
    } else {
        initGlobalTooltips();
    }
}
