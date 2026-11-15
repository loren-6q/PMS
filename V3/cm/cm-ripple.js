// ==========================================================================
// cm/cm-ripple.js - Bidirectional Relational Pricing Propagation Engine
// Wild & Wandering Channel Manager
// ==========================================================================

import { parseYMD } from '../core/dates.js';

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
    return Math.round(res);
}

export function rippleDay(dateStr, startRoom, forceRipple = false) {
    window.masterPricing = window.masterPricing || { timeline: {}, relationships: [] };
    window.masterPricing.timeline[dateStr] = window.masterPricing.timeline[dateStr] || {};
    const roomTypes = window.roomTypes || [];
    const relationships = window.masterPricing.relationships || [];

    const adj = {};
    roomTypes.forEach(r => { adj[r] = []; });

    relationships.forEach(rel => {
        if (!rel.anchor || rel.anchor === 'unlinked' || !rel.target) return;
        if (!adj[rel.anchor]) adj[rel.anchor] = [];
        if (!adj[rel.target]) adj[rel.target] = [];
        adj[rel.anchor].push({ to: rel.target, type: rel.type, val: rel.val, isReverse: false });
        adj[rel.target].push({ to: rel.anchor, type: rel.type, val: rel.val, isReverse: true });
    });

    const queue = [startRoom];
    const visited = new Set([startRoom]);

    while (queue.length > 0) {
        const cur = queue.shift();
        const curVals = window.masterPricing.timeline[dateStr][cur] || {};

        (adj[cur] || []).forEach(edge => {
            if (!roomTypes.includes(edge.to) || visited.has(edge.to)) return;

            visited.add(edge.to);
            window.masterPricing.timeline[dateStr][edge.to] = window.masterPricing.timeline[dateStr][edge.to] || { isOverride: {} };
            const nextVals = window.masterPricing.timeline[dateStr][edge.to];

            if (!forceRipple && nextVals.isOverride?.std) return;

            if (curVals.std !== undefined && curVals.std !== "") {
                nextVals.std = applyMath(curVals.std, edge.type, edge.val, edge.isReverse);
                queue.push(edge.to);
                window.dirtyDates = window.dirtyDates || new Set();
                window.dirtyDates.add(dateStr);
            }
        });
    }
}

if (typeof window !== 'undefined') {
    window.applyMath = applyMath;
    window.rippleDay = rippleDay;
}
