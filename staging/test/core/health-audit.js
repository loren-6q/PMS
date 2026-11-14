// ==========================================================================
// core/health-audit.js - Shared Configuration & Pricing Integrity Auditor
// Wild & Wandering Property Management System
// ==========================================================================

import { resolveChannelCode } from './channels.js';

export function runSystemHealthAudit() {
    const issues = [];

    const defs = (window.roomDefinitions || []).filter(r => !r.inactive);
    const activeCats = Array.from(new Set(defs.map(r => (r.category || '').trim()).filter(Boolean)));
    const catSet = new Set(activeCats.map(c => c.toLowerCase()));
    const matchActiveCat = (name) => activeCats.find(c => c.toLowerCase() === String(name || '').trim().toLowerCase()) || null;

    const dormCats = Array.from(new Set(defs.filter(r => r.rule && r.rule !== 'private').map(r => r.category.trim())));
    const privCats = Array.from(new Set(defs.filter(r => r.rule === 'private').map(r => r.category.trim())));

    const rules = window.pricingRules || {};
    const rels = window.masterPricing?.relationships || rules.relationships || [];
    const cMap = window.channexMap || [];
    const rMap = window.channexRateMap || [];
    const promos = window.promoRules || [];

    // 1. Check Anchors
    if (privCats.length > 0) {
        if (!rules.anchorPrivate) {
            issues.push({
                severity: 'warn',
                title: 'Private Master Anchor Not Set',
                detail: 'Select a Private Master Room Anchor in Setup Step 4 so Curves and Bulk updates know which room drives private rates.',
                step: 4
            });
        } else if (!matchActiveCat(rules.anchorPrivate)) {
            issues.push({
                severity: 'error',
                title: `Broken Private Anchor: "${rules.anchorPrivate}"`,
                detail: 'The Private Master Anchor points to a room category that no longer exists.',
                step: 4
            });
        }
    }

    if (dormCats.length > 0) {
        if (!rules.anchorDorm) {
            issues.push({
                severity: 'warn',
                title: 'Dorm Master Anchor Not Set',
                detail: 'Select a Dorm Master Room Anchor in Setup Step 4 so Curves and Bulk updates know which room drives dorm rates.',
                step: 4
            });
        } else if (!matchActiveCat(rules.anchorDorm)) {
            issues.push({
                severity: 'error',
                title: `Broken Dorm Anchor: "${rules.anchorDorm}"`,
                detail: 'The Dorm Master Anchor points to a room category that no longer exists.',
                step: 4
            });
        }
    }

    // 2. Check Bidirectional Pricing Links (Orphaned or Unlinked Categories)
    const linkedCats = new Set();
    rels.forEach((rel, idx) => {
        const aMatch = matchActiveCat(rel.anchor);
        const tMatch = matchActiveCat(rel.target);
        if (rel.anchor && rel.anchor !== 'unlinked' && !aMatch) {
            issues.push({
                severity: 'error',
                title: `Orphaned Ripple Link #${idx + 1}: "${rel.anchor}"`,
                detail: `Anchor category "${rel.anchor}" does not match any active room category.`,
                step: 4
            });
        }
        if (rel.target && !tMatch) {
            issues.push({
                severity: 'error',
                title: `Orphaned Ripple Link #${idx + 1}: "${rel.target}"`,
                detail: `Target category "${rel.target}" does not match any active room category.`,
                step: 4
            });
        }
        if (aMatch) linkedCats.add(aMatch.toLowerCase());
        if (tMatch) linkedCats.add(tMatch.toLowerCase());
    });

    if (activeCats.length > 1) {
        const unlinked = activeCats.filter(c => !linkedCats.has(c.toLowerCase()));
        if (unlinked.length > 0) {
            issues.push({
                severity: 'warn',
                title: `Unlinked Room Categor${unlinked.length > 1 ? 'ies' : 'y'}: ${unlinked.join(', ')}`,
                detail: 'These rooms will not receive Ripple price updates when you edit an Anchor rate.',
                step: 4
            });
        }
    }

    // 3. Check Channex Room & Rate Plan Mappings
    if (window.channexConfig?.propId) {
        const mappedCats = new Set();
        cMap.forEach(m => {
            if (!m.pmsCategory) return;
            const matched = matchActiveCat(m.pmsCategory);
            if (!matched) {
                issues.push({
                    severity: 'error',
                    title: `Broken Channex Room Mapping: "${m.pmsCategory}"`,
                    detail: 'Mapped to a room category name that no longer exists in Step 2.',
                    step: 3
                });
            } else if (m.channexId) {
                mappedCats.add(matched.toLowerCase());
            }
        });

        const unmappedCats = activeCats.filter(c => !mappedCats.has(c.toLowerCase()));
        if (unmappedCats.length > 0) {
            issues.push({
                severity: 'warn',
                title: `Unmapped Channex Room${unmappedCats.length > 1 ? 's' : ''}: ${unmappedCats.join(', ')}`,
                detail: 'Availability and rates for unmapped categories will not sync to Channex.',
                step: 3
            });
        }

        const orphanedPlans = rMap.filter(rp => rp.pmsCategory && !matchActiveCat(rp.pmsCategory));
        if (orphanedPlans.length > 0) {
            issues.push({
                severity: 'error',
                title: `${orphanedPlans.length} Orphaned Channex Rate Plan(s)`,
                detail: `Rate plans are still linked to renamed/deleted categories (${Array.from(new Set(orphanedPlans.map(p => p.pmsCategory))).join(', ')}).`,
                step: 3
            });
        }
    }

    // 4. Check Promo Scopes
    promos.forEach(pr => {
        if (!pr || !pr.active) return;
        const scopes = Array.isArray(pr.scopes) && pr.scopes.length ? pr.scopes : [pr.scope || 'ALL'];
        if (scopes.includes('ALL')) return;
        const badScopes = scopes.filter(sc => !catSet.has(String(sc).trim().toLowerCase()));
        if (badScopes.length > 0) {
            issues.push({
                severity: 'warn',
                title: `Promo "${pr.name}" Targets Missing Room: ${badScopes.join(', ')}`,
                detail: 'Update the room scope on this promotion rule in Deals & Promos.',
                tab: 'promos'
            });
        }
    });

    return issues;
}

export function renderHealthAuditBanner(containerId, context = 'cm') {
    const el = document.getElementById(containerId);
    if (!el) return [];

    const issues = runSystemHealthAudit();
    if (issues.length === 0) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return issues;
    }

    const hasErrors = issues.some(i => i.severity === 'error');
    const propParam = encodeURIComponent(window.currentPropertyId || 'swims_resort');

    const rowsHtml = issues.map(iss => {
        const badgeCls = iss.severity === 'error'
            ? 'bg-rose-600 text-white'
            : 'bg-amber-500 text-slate-950';

        let actionBtn = '';
        if (context === 'setup' && iss.step) {
            actionBtn = `<button type="button" onclick="window.jumpStep(${iss.step})" class="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-[9.5px] font-black uppercase cursor-pointer shrink-0">Go to Step ${iss.step}</button>`;
        } else if (context === 'cm') {
            if (iss.tab === 'promos') {
                actionBtn = `<button type="button" onclick="window.switchTab('promos')" class="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-[9.5px] font-black uppercase cursor-pointer shrink-0">Fix in Promos</button>`;
            } else if (iss.step) {
                actionBtn = `<a href="setup.html?p=${propParam}&step=${iss.step}" class="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-[9.5px] font-black uppercase cursor-pointer shrink-0">Fix in Setup (Step ${iss.step})</a>`;
            }
        }

        return `<div class="flex items-center justify-between gap-2 py-1 border-t border-black/10 first:border-t-0 text-xs">
            <div class="flex items-center gap-1.5 min-w-0">
                <span class="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase shrink-0 ${badgeCls}">${iss.severity === 'error' ? 'ERROR' : 'WARN'}</span>
                <span class="font-black text-slate-900 truncate">${iss.title}:</span>
                <span class="text-slate-700 font-semibold truncate">${iss.detail}</span>
            </div>
            ${actionBtn}
        </div>`;
    }).join('');

    el.className = `${hasErrors ? 'bg-rose-50 border-rose-300' : 'bg-amber-50 border-amber-300'} border-b px-3 py-1.5 shrink-0 z-30`;
    el.innerHTML = `
        <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 text-xs font-black uppercase ${hasErrors ? 'text-rose-900' : 'text-amber-950'}">
                <i data-lucide="shield-alert" size="14" class="${hasErrors ? 'text-rose-600' : 'text-amber-600'}"></i>
                <span>System Health Audit: ${issues.length} Issue${issues.length > 1 ? 's' : ''} Detected</span>
            </div>
            <button type="button" onclick="document.getElementById('${containerId}').classList.add('hidden')" class="text-slate-500 hover:text-slate-900 text-xs font-black uppercase cursor-pointer px-1">Dismiss &times;</button>
        </div>
        <div class="mt-1">${rowsHtml}</div>
    `;

    if (window.lucide) window.lucide.createIcons();
    return issues;
}

if (typeof window !== 'undefined') {
    window.runSystemHealthAudit = runSystemHealthAudit;
    window.renderHealthAuditBanner = renderHealthAuditBanner;
}
