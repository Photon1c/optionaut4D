/**
 * Rocket Metrics - Calculations for P/L, Greeks, and positioning
 * Matches optionaut-app reference implementation
 */

/**
 * Calculate P/L for an option position
 * P/L = (current option price - premium paid) * 100 (per contract)
 * 
 * @param {number} currentOptionPrice - Current option price from Black-Scholes
 * @param {number} premium - Premium paid when entering position
 * @param {number} contracts - Number of contracts (default 1)
 * @returns {number} Profit/Loss in dollars
 */
export function calculateProfitLoss(currentOptionPrice, premium, contracts = 1) {
    return (currentOptionPrice - premium) * 100 * contracts;
}

/**
 * Calculate intrinsic value
 * @param {number} spot - Current spot price
 * @param {number} strike - Strike price
 * @param {string} type - 'call' or 'put'
 * @returns {number} Intrinsic value
 */
export function calculateIntrinsicValue(spot, strike, type) {
    if (type === 'call') {
        return Math.max(0, spot - strike);
    } else {
        return Math.max(0, strike - spot);
    }
}

/**
 * Check if option is in-the-money
 * @param {number} spot - Current spot price
 * @param {number} strike - Strike price
 * @param {string} type - 'call' or 'put'
 * @returns {boolean} True if ITM
 */
export function isInTheMoney(spot, strike, type) {
    if (type === 'call') {
        return spot > strike;
    } else {
        return spot < strike;
    }
}

/**
 * Calculate breakeven price
 * @param {number} strike - Strike price
 * @param {number} premium - Premium paid
 * @param {string} type - 'call' or 'put'
 * @returns {number} Breakeven price
 */
export function calculateBreakeven(strike, premium, type) {
    if (type === 'call') {
        return strike + premium;
    } else {
        return strike - premium;
    }
}

