export const parseYMD = str => { 
    if (!str || typeof str !== 'string') return 0; 
    const p = str.split('-'); 
    return p.length !== 3 ? 0 : Date.UTC(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])); 
};

export const getLocalYMD = d => {
    if (!d) d = new Date();
    if (typeof d === 'string') {
        const trimmed = d.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const parsed = new Date(trimmed.includes('T') ? trimmed : trimmed + 'T12:00:00Z');
        d = isNaN(parsed.getTime()) ? new Date() : parsed;
    } else if (typeof d === 'number') d = new Date(d);
    
    if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();
    try {
        const o = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
        return isNaN(o.getTime()) ? new Date().toISOString().split('T')[0] : o.toISOString().split('T')[0];
    } catch (e) {
        return new Date().toISOString().split('T')[0];
    }
};

// Essential utility added for date math compatibility (since monolith did inline math)
export function diffDays(startStr, endStr) {
    const s = parseYMD(startStr);
    const e = parseYMD(endStr);
    if (isNaN(s) || isNaN(e)) return 0;
    return Math.round((e - s) / 86400000);
}
