// ==========================================================================
// cm/cm-ripple.js - Bidirectional Relational Pricing Propagation Engine
// Wild & Wandering Channel Manager
// ==========================================================================

import { parseYMD } from '../core/dates.js';
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

    // 4. OTA Promo Margin Preserver
    (window.promoRules || []).filter(pr => pr.active).forEach(pr => {
        const isChanMatch = pr.channel === 'ALL' || resolveChannelCode(pr.channel) === chanCode;
        const isScopeMatch = pr.scope === 'ALL' || pr.scope === room;
        const isDateMatch = pr.isAlways || (pr.startDate && pr.endDate && dateStr >= pr.startDate && dateStr <= pr.endDate);

        if (isChanMatch && isScopeMatch && isDateMatch) {
            const disc = pr.discountPct / 100;
            if (disc > 0 && disc < 1) computed *= (1 / (1 - disc));
        }
    });

    return roundCurrency(computed);
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
    window.rippleDay = rippleDay;
}
