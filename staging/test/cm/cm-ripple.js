// ==========================================================================
// cm/cm-ripple.js - Bidirectional Relational Pricing Propagation Engine
// Wild & Wandering Channel Manager
// ==========================================================================

import { parseYMD, getLocalYMD } from '../core/dates.js';
import { roundCurrency } from '../core/money.js';
import { resolveChannelCode } from '../core/channels.js';

export function applyMath(baseVal, type, modifier, isReverse = false) {
    if (baseVal === "" || baseVal == null || isNaN(parseFloat(baseVal))) return "";
    let val = parseFloat(baseVal);
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

export function getNearestEvent(unixMs) {
    const events = window.eventDates || [];
    if (!events.length) return 999;
    let minDiff = Infinity;
    events.forEach(evt => {
        const evtUnix = parseYMD(evt);
        const diff = Math.round((unixMs - evtUnix) / 86400000);
        if (Math.abs(diff) < Math.abs(minDiff)) minDiff = diff;
    });
    return minDiff;
}

export function computeDynamicPlanRate(dateStr, room, ratePlan) {
    if (!ratePlan) return null;
    const dayObj = (window.masterPricing && window.masterPricing.timeline) ? (window.masterPricing.timeline[dateStr] || {}) : {};
    const roomObj = dayObj[room] || {};
    const isEvents = typeof window.isEventPricingEnabled === 'function' ? window.isEventPricingEnabled() : false;

    const isEvtProduct = (ratePlan.product === 'evt') || (ratePlan.rateSource === 'evt') || /evt|fmp|event|pkg/i.test(ratePlan.ratePlanTitle || '');
    const isRefPolicy = (ratePlan.policy === 'ref') || (/ref|refundable/i.test(ratePlan.ratePlanTitle || '') && !/non-?ref/i.test(ratePlan.ratePlanTitle || ''));

    // 1. Base Rate
    let basePrice = (isEvtProduct && isEvents && roomObj.fmp !== undefined && roomObj.fmp !== "")
        ? roomObj.fmp
        : roomObj.std;

    if (basePrice === undefined || basePrice === "" || isNaN(parseFloat(basePrice))) return null;
    let computed = parseFloat(basePrice);

    // 2. Canonical Channel Multiplier / Adjustment
    const rawChan = ratePlan.channel || 'DEF';
    const chanCode = resolveChannelCode(rawChan);
    const masterDriver = resolveChannelCode(window.pricingRules?.masterDriver || 'WEB');
    const isMaster = (chanCode === masterDriver);

    if (!isMaster) {
        const rulesList = window.pricingRules?.channelRules || [];
        const rule = rulesList.find(r => r.code === chanCode) 
                  || window.pricingRules?.channels?.[rawChan] 
                  || { op: 'sync', val: 0 };

        const op = rule.op || rule.type || 'sync';
        const val = rule.val ?? (rule.markupPct || 0);
        computed = applyMath(computed, op, val);
    }

    // 3. Refundable Policy Markup
    if (isRefPolicy) {
        const rType = (isEvtProduct && isEvents)
            ? (window.pricingRules?.evtRefType || '+%')
            : (window.pricingRules?.stdRefType || '+%');
        const rVal = (isEvtProduct && isEvents) 
            ? (window.pricingRules?.evtRefVal ?? window.pricingRules?.evtRefundableMarkup ?? 25) 
            : (window.pricingRules?.stdRefVal ?? window.pricingRules?.stdRefundableMarkup ?? 25);
        computed = applyMath(computed, rType, rVal);
    }

    // 4. OTA Promo Margin Preserver (Bookable Window + Lead Time + Exclusions + Two-Bucket Stacking)
    const { multiplier } = evaluatePromoStack(dateStr, chanCode, room);
    computed *= multiplier;

    return roundCurrency(computed);
}

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

export function rippleDay(dateStr, startRoom, forceRipple = false) {
    window.masterPricing = window.masterPricing || { timeline: {}, relationships: [] };
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const dMs = parseYMD(dateStr);
    const minDiff = getNearestEvent(dMs);
    const isPeak = (minDiff === 0);

    const adj = {};
    (window.roomTypes || []).forEach(r => { adj[r] = []; });
    (window.masterPricing.relationships || []).forEach(rel => {
        if (!rel.anchor || rel.anchor === 'unlinked' || !rel.target) return;
        if (!adj[rel.anchor]) adj[rel.anchor] = [];
        if (!adj[rel.target]) adj[rel.target] = [];
        adj[rel.anchor].push({ to: rel.target, type: rel.type, val: rel.val, typeFmp: rel.typeFmp, valFmp: rel.valFmp, isReverse: false });
        adj[rel.target].push({ to: rel.anchor, type: rel.type, val: rel.val, typeFmp: rel.typeFmp, valFmp: rel.valFmp, isReverse: true });
    });

    const queue = [startRoom];
    const visited = new Set([startRoom]);

    while (queue.length > 0) {
        const cur = queue.shift();
        const curVals = window.masterPricing.timeline[dateStr][cur] || {};

        (adj[cur] || []).forEach(edge => {
            if (!(window.roomTypes || []).includes(edge.to) || visited.has(edge.to)) return;

            visited.add(edge.to);
            window.masterPricing.timeline[dateStr][edge.to] = window.masterPricing.timeline[dateStr][edge.to] || { isOverride: {} };
            const nextVals = window.masterPricing.timeline[dateStr][edge.to];

            if (!forceRipple && nextVals.isOverride?.std) return;

            if (isPeak) {
                const rType = edge.typeFmp || edge.type;
                const rVal = edge.valFmp !== undefined ? edge.valFmp : edge.val;
                const basePrice = curVals.std !== "" ? curVals.std : curVals.fmp;
                const target = applyMath(basePrice, rType, rVal, edge.isReverse);
                nextVals.std = target;
                nextVals.fmp = target;
            } else {
                if (curVals.std !== undefined && curVals.std !== "") {
                    nextVals.std = applyMath(curVals.std, edge.type, edge.val, edge.isReverse);
                }
                if (curVals.fmp !== undefined && curVals.fmp !== "") {
                    const rType = edge.typeFmp || edge.type;
                    const rVal = edge.valFmp !== undefined ? edge.valFmp : edge.val;
                    nextVals.fmp = applyMath(curVals.fmp, rType, rVal, edge.isReverse);
                }
            }

            queue.push(edge.to);
            window.dirtyDates = window.dirtyDates || new Set();
            window.dirtyDates.add(dateStr);
        });
    }
}

if (typeof window !== 'undefined') {
    window.applyMath = applyMath;
    window.getNearestEvent = getNearestEvent;
    window.computeDynamicPlanRate = computeDynamicPlanRate;
    window.evaluatePromoStack = evaluatePromoStack;
    window.rippleDay = rippleDay;
}
