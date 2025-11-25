/**
 * Contract Parser - Natural Language to Structured Contract Data
 * Uses OpenAI API to parse contract strings like "2 SPY 600C Dec 20 @ 5.20"
 */

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

/**
 * Parse a natural language contract string into structured data
 * @param {string} text - Natural language contract description
 * @returns {Promise<Object>} Parsed contract data
 */
export async function parseContract(text) {
    if (!text || text.trim().length === 0) {
        throw new Error('Contract text cannot be empty');
    }

    // Try regex parser first for common patterns (faster, no API call)
    const regexResult = tryRegexParse(text);
    if (regexResult) {
        console.log('✅ Parsed with regex:', regexResult);
        return regexResult;
    }

    // Fall back to OpenAI for complex inputs
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured. Set VITE_OPENAI_API_KEY in .env file');
    }

    try {
        const result = await parseWithOpenAI(text);
        console.log('✅ Parsed with OpenAI:', result);
        return result;
    } catch (error) {
        console.error('❌ Parse error:', error);
        throw new Error(`Failed to parse contract: ${error.message}`);
    }
}

/**
 * Try to parse using regex patterns for common formats
 * @param {string} text - Contract text
 * @returns {Object|null} Parsed data or null if no match
 */
function tryRegexParse(text) {
    // Pattern: "2 SPY 600C Dec 20 @ 5.20"
    // Pattern: "-1 QQQ 500P 0DTE"
    // Pattern: "SPY 600/610 call spread"

    const normalized = text.trim().toUpperCase();

    // Pattern 1: Standard format with all details
    // Example: "2 SPY 600C DEC 20 @ 5.20" or "-1 QQQ 500P 0DTE @ 2.50"
    const standardPattern = /^([+-]?\d+)\s+([A-Z]+)\s+(\d+(?:\.\d+)?)\s*([CP])\s+(.+?)(?:\s+@\s+(\d+(?:\.\d+)?))?$/i;
    const match = standardPattern.exec(normalized);

    if (match) {
        const [, quantity, ticker, strike, type, expiryStr, premium] = match;

        return {
            quantity: parseInt(quantity),
            ticker: ticker,
            strike: parseFloat(strike),
            type: type === 'C' ? 'call' : 'put',
            expiry: parseExpiry(expiryStr),
            premium: premium ? parseFloat(premium) : null,
            raw: text
        };
    }

    // Pattern 2: Simplified format without premium
    // Example: "SPY 600C"
    const simplePattern = /^([+-]?\d+)?\s*([A-Z]+)\s+(\d+(?:\.\d+)?)\s*([CP])$/i;
    const simpleMatch = simplePattern.exec(normalized);

    if (simpleMatch) {
        const [, quantity, ticker, strike, type] = simpleMatch;

        return {
            quantity: quantity ? parseInt(quantity) : 1,
            ticker: ticker,
            strike: parseFloat(strike),
            type: type === 'C' ? 'call' : 'put',
            expiry: null, // Will use default
            premium: null,
            raw: text
        };
    }

    return null; // No regex match, will try OpenAI
}

/**
 * Parse expiry string to Date object
 * @param {string} expiryStr - Expiry string (e.g., "DEC 20", "0DTE", "12/20/24")
 * @returns {Date|null} Parsed date or null
 */
function parseExpiry(expiryStr) {
    if (!expiryStr) return null;

    const normalized = expiryStr.trim().toUpperCase();

    // Handle 0DTE (same day expiry)
    if (normalized === '0DTE') {
        return new Date(); // Today
    }

    // Handle month abbreviations (DEC 20, JAN 15, etc.)
    const monthPattern = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})$/;
    const monthMatch = monthPattern.exec(normalized);

    if (monthMatch) {
        const [, month, day] = monthMatch;
        const monthMap = {
            JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
            JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
        };

        const currentYear = new Date().getFullYear();
        const date = new Date(currentYear, monthMap[month], parseInt(day));

        // If date is in the past, assume next year
        if (date < new Date()) {
            date.setFullYear(currentYear + 1);
        }

        return date;
    }

    // Try parsing as standard date
    const date = new Date(expiryStr);
    if (!isNaN(date.getTime())) {
        return date;
    }

    return null;
}

/**
 * Parse contract using OpenAI API
 * @param {string} text - Contract text
 * @returns {Promise<Object>} Parsed contract data
 */
async function parseWithOpenAI(text) {
    const prompt = `Parse this options contract description into JSON format. Extract:
- quantity (number, can be negative for short positions)
- ticker (stock symbol)
- strike (strike price as number)
- type ("call" or "put")
- expiry (date string in ISO format, or null if not specified)
- premium (entry price as number, or null if not specified)

Contract: "${text}"

Respond with ONLY valid JSON, no other text.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are a financial options contract parser. Always respond with valid JSON only.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0,
            max_tokens: 200
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    // Parse JSON response
    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch (e) {
        throw new Error(`Invalid JSON response from OpenAI: ${content}`);
    }

    // Validate required fields
    if (!parsed.ticker || !parsed.strike || !parsed.type) {
        throw new Error('Missing required fields in parsed contract');
    }

    // Normalize and validate
    return {
        quantity: parsed.quantity || 1,
        ticker: parsed.ticker.toUpperCase(),
        strike: parseFloat(parsed.strike),
        type: parsed.type.toLowerCase(),
        expiry: parsed.expiry ? new Date(parsed.expiry) : null,
        premium: parsed.premium ? parseFloat(parsed.premium) : null,
        raw: text
    };
}

/**
 * Calculate days to expiry from a date
 * @param {Date|null} expiryDate - Expiration date
 * @returns {number} Days to expiry (0 if null or past)
 */
export function calculateDTE(expiryDate) {
    if (!expiryDate) return 7; // Default 7 days if not specified

    const now = new Date();
    const diffTime = expiryDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
}

/**
 * Validate parsed contract data
 * @param {Object} contract - Parsed contract
 * @returns {boolean} True if valid
 */
export function validateContract(contract) {
    if (!contract) return false;

    const required = ['ticker', 'strike', 'type'];
    for (const field of required) {
        if (!contract[field]) {
            console.error(`Missing required field: ${field}`);
            return false;
        }
    }

    if (contract.type !== 'call' && contract.type !== 'put') {
        console.error(`Invalid type: ${contract.type}`);
        return false;
    }

    if (contract.strike <= 0) {
        console.error(`Invalid strike: ${contract.strike}`);
        return false;
    }

    return true;
}
