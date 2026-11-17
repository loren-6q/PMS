// ==========================================================================
// cm/cm-ripple.js - Bidirectional Relational Pricing Propagation Engine
// Wild & Wandering Channel Manager
// ==========================================================================

import { parseYMD, getLocalYMD, getNearestEvent } from '../core/dates.js';
import { roundCurrency } from '../core/money.js';
import { resolveChannelCode } from '../core/channels.js';
import { resolveRoomCategory } from '../core/properties.js';

// --- Apply Arithmetic Operator to Base Rate ---
export function applyMath(baseVal, type, modifier, isReverse = false) {
    if (baseVal === "" || baseVal == null || isNaN(parseFloat(baseVal))) return "";
    const val = parseFloat(baseVal);
    let mod = parseFloat(modifier);
    if (isNaN(mod)) mod = 0;

    let res = val;
    if (type === '=' || type === 'sync') res = val;
    else if (!isReverse) {
        if (type === '+' || type === 'add') res = Math.max(0, val + mod);
        if (type === '-' || type === 'sub') res = Math.max(0, val - mod);
        if (type === '+%' || type === 'add_pct') res = val * (1 + (mod / 100));
        if (type === '-%' || type === 'sub_pct') res = Math.max(0, val * (1 - (mod / 100)));
    } else {
        if (type === '+' || type === 'add') res = Math.max(0, val - mod);
        if (type === '-' || type === 'sub') res = Math.max(0, val + mod);
        if (type === '+%' || type === 'add_pct') res = val / (1 + (mod / 100));
        if (type === '-%' || type === 'sub_pct') res = Math.max(0, val * (1 - (mod / 100)));
    }
    return roundCurrency(res);
}

export { getNearestEvent };

// --- Resolve Single-Night CM Rate ('DEF_NON_REF' | 'DIR_NON_REF' | 'DEF_EVT_NON_REF') ---
export function getCmNightRate(dateStr, roomCategory, planType = 'DEF_NON_REF') {
    const timeline = window.masterPricing?.timeline || {};
    const dayObj = timeline[dateStr] || {};
    const allRooms = window.roomTypes || [];
    const canonicalRoom = resolveRoomCategory(roomCategory, allRooms) || roomCategory;
    const roomObj = dayObj[canonicalRoom] || {};

    if (planType === 'DEF_EVT_NON_REF') {
        if (roomObj.fmp !== undefined && roomObj.fmp !== "" && !isNaN(parseFloat(roomObj.fmp))) {
            return roundCurrency(parseFloat(roomObj.fmp));
        }
        // On peak day, event rate equals peak standard rate if fmp is blank
        const dMs = parseYMD(dateStr);
        if (dMs && getNearestEvent(dMs) === 0 && roomObj.std !== undefined && roomObj.std !== "" && !isNaN(parseFloat(roomObj.std))) {
            return roundCurrency(parseFloat(roomObj.std));
        }
        // Outside event curve dates, fall back to DIR Non-Ref rate
        return getCmNightRate(dateStr, canonicalRoom, 'DIR_NON_REF');
    }

    if (roomObj.std === undefined || roomObj.std === "" || isNaN(parseFloat(roomObj.std))) return null;
    let computed = parseFloat(roomObj.std);

    if (planType === 'DIR_NON_REF') {
        const rulesList = window.pricingRules?.channelRules || [];
        let rule = rulesList.find(r => resolveChannelCode(r.code) === 'WEB')
                || window.pricingRules?.channels?.['WEB']
                || window.pricingRules?.channels?.['DIR']
                || window.pricingRules?.channels?.['DIRECT'];

        if (!rule) {
            const legacyDirPct = parseFloat(window.pricingRules?.directDiscountPct ?? window.pricingRules?.webDiscountPct);
            if (!isNaN(legacyDirPct) && legacyDirPct !== 0) {
                rule = { op: '-%', val: Math.abs(legacyDirPct) };
            }
        }

        if (rule) {
            const op = rule.op || rule.type || 'sync';
            const val = rule.val ?? (rule.markupPct || 0);
            computed = applyMath(computed, op, val);
        }
    }

    return roundCurrency(computed);
}

// --- Compute Multi-Night CM Stay Quote & Restrictions ---
export function getCmStayQuote({ checkIn, nights = 1, roomCategory, planType = 'DEF_NON_REF' } = {}) {
    const startMs = parseYMD(checkIn);
    const numNights = Math.max(1, parseInt(nights, 10) || 1);
    if (!startMs || !roomCategory) {
        return {
            complete: false,
            nights: numNights,
            foundNights: 0,
            total: null,
            avgNightly: null,
            nightly: [],
            restrictions: { stop: false, cta: false, maxMinStay: 0 }
        };
    }

    const timeline = window.masterPricing?.timeline || {};
    const allRooms = window.roomTypes || [];
    const canonicalRoom = resolveRoomCategory(roomCategory, allRooms) || roomCategory;

    let total = 0;
    let foundNights = 0;
    const nightly = [];
    let stop = false;
    let cta = false;
    let maxMinStay = 0;

    for (let i = 0; i < numNights; i++) {
        const dStr = new Date(startMs + (i * 86400000)).toISOString().split('T')[0];
        const rate = getCmNightRate(dStr, canonicalRoom, planType);
        const dayRoom = timeline[dStr]?.[canonicalRoom] || {};
        const globalObj = timeline[dStr]?.GLOBAL || {};

        if (dayRoom.stop || globalObj.stop) stop = true;
        if (i === 0 && (dayRoom.cta || globalObj.cta)) cta = true;
        const mStay = parseInt(dayRoom.min_arr || dayRoom.min || globalObj.min_arr || globalObj.min || 0, 10) || 0;
        if (mStay > maxMinStay) maxMinStay = mStay;

        nightly.push({ date: dStr, rate });
        if (rate !== null && !isNaN(rate)) {
            total += rate;
            foundNights++;
        }
    }

    const complete = foundNights === numNights;
    const roundedTotal = complete ? roundCurrency(total) : null;
    const avgNightly = complete ? roundCurrency(roundedTotal / numNights) : null;

    return {
        complete,
        nights: numNights,
        foundNights,
        total: roundedTotal,
        avgNightly,
        nightly,
        restrictions: { stop, cta, maxMinStay }
    };
}

// --- Compute Derived Rate Plan Price (With Channel, Policy & Promo Rules) ---
export function computeDynamicPlanRate(dateStr, room, ratePlan) {
    if (!ratePlan) return null;
    const dayObj = (window.masterPricing && window.masterPricing.timeline) ? (window.masterPricing.timeline[dateStr] || {}) : {};
    const roomObj = dayObj[room] || {};
    const isEvents = typeof window.isEventPricingEnabled === 'function' ? window.isEventPricingEnabled() : false;

    const isEvtProduct = (ratePlan.product === 'evt') || (ratePlan.rateSource === 'evt') || /evt|fmp|event|pkg/i.test(ratePlan.ratePlanTitle || '');
    const isRefPolicy = (ratePlan.policy === 'ref') || (/ref|refundable/i.test(ratePlan.ratePlanTitle || '') && !/non-?ref/i.test(ratePlan.ratePlanTitle || ''));

    const basePrice = (isEvtProduct && isEvents && roomObj.fmp !== undefined && roomObj.fmp !== "")
        ? roomObj.fmp
        : roomObj.std;

    if (basePrice === undefined || basePrice === "" || isNaN(parseFloat(basePrice))) return null;
    let computed = parseFloat(basePrice);

    const rawChan = ratePlan.channel || 'DEF';
    const chanCode = resolveChannelCode(rawChan);

    if (chanCode !== 'DEF') {
        const rulesList = window.pricingRules?.channelRules || [];
        let rule = rulesList.find(r => resolveChannelCode(r.code) === chanCode)
                || window.pricingRules?.channels?.[chanCode]
                || window.pricingRules?.channels?.[rawChan];

        if (!rule && chanCode === 'WEB') {
            const legacyDirPct = parseFloat(window.pricingRules?.directDiscountPct ?? window.pricingRules?.webDiscountPct);
            if (!isNaN(legacyDirPct) && legacyDirPct !== 0) {
                rule = { op: '-%', val: Math.abs(legacyDirPct) };
            }
        }

        if (rule) {
            const op = rule.op || rule.type || 'sync';
            const val = rule.val ?? (rule.markupPct || 0);
            computed = applyMath(computed, op, val);
        }
    }

    if (isRefPolicy) {
        const rType = (isEvtProduct && isEvents)
            ? (window.pricingRules?.evtRefType || '+%')
            : (window.pricingRules?.stdRefType || '+%');
        const rVal = (isEvtProduct && isEvents)
            ? (window.pricingRules?.evtRefVal ?? window.pricingRules?.evtRefundableMarkup ?? 25)
            : (window.pricingRules?.stdRefVal ?? window.pricingRules?.stdRefundableMarkup ?? 25);
        computed = applyMath(computed, rType, rVal);
    }

    const { multiplier } = evaluatePromoStack(dateStr, chanCode, room);
    computed *= multiplier;

    return roundCurrency(computed);
}

// --- Evaluate Margin-Preserving OTA Promo Stack ---
export function evaluatePromoStack(dateStr, chanCode, room, asOfDateStr = null) {
    const resolvedChan = resolveChannelCode(chanCode);
    if (!resolvedChan || resolvedChan === 'DEF' || resolvedChan === 'WEB') {
        return { applied: [], winner: null, superseded: [], stackable: [], multiplier: 1, effectiveDiscountPct: 0, totalMarkupPct: 0 };
    }

    const asOf = asOfDateStr || getLocalYMD(new Date());
    const eventsSet = new Set(window.eventDates || []);

    const matching = (window.promoRules || []).filter(pr => {
        if (!pr || !pr.active || !pr.channel || pr.channel === 'ALL') return false;
        if (resolveChannelCode(pr.channel) !== resolvedChan) return false;

        const scopes = Array.isArray(pr.scopes) && pr.scopes.length ? pr.scopes : [pr.scope || 'ALL'];
        const isScopeMatch = scopes.includes('ALL') || (room && scopes.includes(room));
        if (!isScopeMatch) return false;

        const hasBookBounds = !!(pr.bookStart || pr.bookEnd);
        const bookAlw = pr.bookAlways !== undefined ? !!pr.bookAlways : !hasBookBounds;
        if (!bookAlw) {
            if (pr.bookStart && asOf < pr.bookStart) return false;
            if (pr.bookEnd && asOf > pr.bookEnd) return false;
        }

        const minAdv = parseInt(pr.minAdvanceDays, 10) || 0;
        if (minAdv > 0) {
            const leadDays = Math.round((parseYMD(dateStr) - parseYMD(asOf)) / 86400000);
            if (leadDays < minAdv) return false;
        }

        const stayAlw = pr.stayAlways !== undefined ? !!pr.stayAlways : !!pr.isAlways;
        const sStart = pr.stayStart || pr.startDate || '';
        const sEnd = pr.stayEnd || pr.endDate || '';
        if (!stayAlw) {
            if (sStart && dateStr < sStart) return false;
            if (sEnd && dateStr > sEnd) return false;
        }

        if (pr.excludeEvents && eventsSet.has(dateStr)) return false;
        if (Array.isArray(pr.excludedDates) && pr.excludedDates.includes(dateStr)) return false;

        return true;
    });

    const nonStacking = matching.filter(pr => !pr.stackable);
    const stackable = matching.filter(pr => !!pr.stackable);

    let winner = null;
    const superseded = [];
    nonStacking.forEach(pr => {
        if (!winner || (parseFloat(pr.discountPct) || 0) > (parseFloat(winner.discountPct) || 0)) {
            if (winner) superseded.push(winner);
            winner = pr;
        } else {
            superseded.push(pr);
        }
    });

    const applied = [
        ...(winner ? [winner] : []),
        ...stackable
    ];

    let multiplier = 1;
    let remainingFactor = 1;
    applied.forEach(pr => {
        const disc = (parseFloat(pr.discountPct) || 0) / 100;
        if (disc > 0 && disc < 1) {
            multiplier *= (1 / (1 - disc));
            remainingFactor *= (1 - disc);
        }
    });

    return {
        applied,
        winner,
        superseded,
        stackable,
        multiplier,
        effectiveDiscountPct: (1 - remainingFactor) * 100,
        totalMarkupPct: (multiplier - 1) * 100
    };
}

// --- Copy Restriction Field During Ripple ---
function copyRestrictionField(src, dst, key, force) {
    if (!force && dst.isOverride?.[key]) return;
    if (src[key] !== undefined && src[key] !== "" && src[key] !== false) {
        dst[key] = src[key];
    } else {
        delete dst[key];
    }
}

// --- Propagate Anchor Rate & Restriction Changes Across Linked Rooms ---
export function rippleDay(dateStr, startRoom, forceRipple = false, scope = 'both') {
    window.masterPricing = window.masterPricing || { timeline: {}, relationships: [] };
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dMs = parseYMD(dateStr);
    const minDiff = getNearestEvent(dMs);
    const isPeak = (minDiff === 0);

    const doRates = scope === 'rates' || scope === 'both';
    const doRestrictions = scope === 'restrictions' || scope === 'both';

    const allRooms = window.roomTypes || [];
    const canonicalStart = resolveRoomCategory(startRoom, allRooms);
    if (!canonicalStart) return;

    const adj = {};
    allRooms.forEach(r => { adj[r] = []; });

    (window.masterPricing.relationships || []).forEach(rel => {
        const rawA = rel.anchor || rel.source || rel.from || rel.roomA;
        const rawB = rel.target || rel.to || rel.roomB;
        if (!rawA || rawA === 'unlinked' || !rawB) return;

        const roomA = resolveRoomCategory(rawA, allRooms);
        const roomB = resolveRoomCategory(rawB, allRooms);
        if (!roomA || !roomB || roomA === roomB) return;

        const op = rel.type || rel.op || '+';
        const val = rel.val ?? rel.modifier ?? 0;
        const opFmp = rel.typeFmp || rel.opFmp || op;
        const valFmp = rel.valFmp ?? rel.modifierFmp ?? val;

        adj[roomA].push({ to: roomB, type: op, val, typeFmp: opFmp, valFmp, isReverse: false });
        adj[roomB].push({ to: roomA, type: op, val, typeFmp: opFmp, valFmp, isReverse: true });
    });

    const queue = [canonicalStart];
    const visited = new Set([canonicalStart]);

    while (queue.length > 0) {
        const cur = queue.shift();
        const curVals = window.masterPricing.timeline[dateStr][cur] || {};

        (adj[cur] || []).forEach(edge => {
            if (visited.has(edge.to)) return;

            visited.add(edge.to);
            window.masterPricing.timeline[dateStr][edge.to] = window.masterPricing.timeline[dateStr][edge.to] || { isOverride: {} };
            const nextVals = window.masterPricing.timeline[dateStr][edge.to];
            nextVals.isOverride = nextVals.isOverride || {};

            if (doRates && (forceRipple || !nextVals.isOverride.std)) {
                if (isPeak) {
                    const basePrice = (curVals.std !== undefined && curVals.std !== "") ? curVals.std : curVals.fmp;
                    if (basePrice !== undefined && basePrice !== "") {
                        const target = applyMath(basePrice, edge.typeFmp, edge.valFmp, edge.isReverse);
                        nextVals.std = target;
                        nextVals.fmp = target;
                    }
                } else {
                    if (curVals.std !== undefined && curVals.std !== "") {
                        nextVals.std = applyMath(curVals.std, edge.type, edge.val, edge.isReverse);
                    }
                    if (curVals.fmp !== undefined && curVals.fmp !== "") {
                        nextVals.fmp = applyMath(curVals.fmp, edge.type, edge.val, edge.isReverse);
                    }
                }
            }

            if (doRestrictions) {
                ['min', 'min_arr', 'max', 'cta', 'ctd', 'stop', 'evt_min', 'evt_min_arr', 'evt_max', 'evt_cta', 'evt_ctd', 'evt_stop']
                    .forEach(k => copyRestrictionField(curVals, nextVals, k, forceRipple));
            }

            queue.push(edge.to);
            window.dirtyDates = window.dirtyDates || new Set();
            window.dirtyDates.add(dateStr);
            window.dirtyCellKeys = window.dirtyCellKeys || new Set();
            window.justSyncedCellKeys = window.justSyncedCellKeys || new Set();
            window.dirtyCellKeys.add(`${dateStr}|${edge.to}`);
            window.justSyncedCellKeys.delete(`${dateStr}|${edge.to}`);
        });
    }
}

if (typeof window !== 'undefined') {
    window.applyMath = applyMath;
    window.getNearestEvent = getNearestEvent;
    window.getCmNightRate = getCmNightRate;
    window.getCmStayQuote = getCmStayQuote;
    window.computeDynamicPlanRate = computeDynamicPlanRate;
    window.evaluatePromoStack = evaluatePromoStack;
    window.rippleDay = rippleDay;
}
