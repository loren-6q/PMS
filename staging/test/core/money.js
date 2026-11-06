// ==========================================================================
// core/money.js - Multi-Currency Math, Precision & Accounting Ledger
// Wild & Wandering Property Management System
// 100% Variable: Dynamically handles 0-decimal, 2-decimal, and 3-decimal currencies.
// ==========================================================================

// ISO 4217 Currency metadata: 0-decimal currencies
const ZERO_DECIMAL_CURRENCIES = new Set([
    'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 
    'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
]);

// 3-decimal currencies
const THREE_DECIMAL_CURRENCIES = new Set([
    'BHD', 'IQD', 'JOD', 'KWD', 'OMR', 'TND'
]);

/**
 * Determines standard decimal places for a given currency code.
 */
export function getCurrencyDecimals(currencyCode = 'THB') {
    const cur = String(currencyCode).toUpperCase().trim();
    if (ZERO_DECIMAL_CURRENCIES.has(cur)) return 0;
    if (THREE_DECIMAL_CURRENCIES.has(cur)) return 3;
    return 2; // Default for USD, EUR, GBP, THB, AUD, CAD, etc.
}

/**
 * Dynamically resolves the currency symbol for formatting.
 */
export function getCurrencySymbol(currencyCode = 'THB') {
    const cur = String(currencyCode).toUpperCase().trim();
    const symbolMap = {
        'THB': '฿', 'USD': '$', 'EUR': '€', 'GBP': '£', 
        'AUD': 'A$', 'CAD': 'C$', 'SGD': 'S$', 'JPY': '¥', 
        'KRW': '₩', 'VND': '₫', 'NZD': 'NZ$', 'CHF': 'CHF'
    };
    return symbolMap[cur] || cur;
}

/**
 * Rounds a monetary value according to currency decimal rules.
 */
export function roundCurrency(val, currency = 'THB') {
    if (val === "" || val === null || val === undefined || isNaN(val)) return 0;
    const num = Number(val);
    const decimals = getCurrencyDecimals(currency);
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
}

/**
 * Formats a monetary value with proper commas, decimals, and optional currency symbol.
 */
export function formatCurrency(val, currency = 'THB', includeSymbol = false) {
    const num = roundCurrency(val, currency);
    const decimals = getCurrencyDecimals(currency);
    const formattedNum = num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
    return includeSymbol ? `${getCurrencySymbol(currency)}${formattedNum}` : formattedNum;
}

export function getPaid(booking) {
    if (!booking || !Array.isArray(booking.payments)) return 0;
    return booking.payments.reduce((sum, p) => sum + (Number(p.amt) || 0), 0);
}

export function getDue(booking, currency = 'THB') {
    if (!booking) return 0;
    const total = Number(booking.totalPrice) || 0;
    const paid = getPaid(booking);
    return roundCurrency(total - paid, currency);
}

export function getComm(booking) {
    if (!booking || !Array.isArray(booking.payments)) return 0;
    // Commission methods withheld at source across OTAs
    const commMethods = ['hw-kp', 'airbnb-kp', 'bdc-kp', 'agoda-kp', 'expedia-kp', 'trip-kp', 'cc-fee'];
    return booking.payments
        .filter(p => commMethods.includes(p.method))
        .reduce((sum, p) => sum + (Number(p.amt) || 0), 0);
}

if (typeof window !== 'undefined') {
    window.roundCurrency = roundCurrency;
    window.formatCurrency = formatCurrency;
    window.getCurrencySymbol = getCurrencySymbol;
    window.getCurrencyDecimals = getCurrencyDecimals;
    window.getPaid = getPaid;
    window.getDue = getDue;
    window.getComm = getComm;
}
