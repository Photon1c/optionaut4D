/**
 * Live HUD - Always-visible status overlay
 * Displays: spot price, DTE, total P/L, reset button
 */

export class LiveHUD {
    constructor() {
        this.container = null;
        this.spotPriceEl = null;
        this.dteEl = null;
        this.plEl = null;
        this.resetBtn = null;

        this.currentSpot = 100;
        this.dte = 7;
        this.totalPL = 0;

        this.init();
    }

    init() {
        // Create HUD container
        this.container = document.createElement('div');
        this.container.id = 'live-hud';
        this.container.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            z-index: 1000;
            background: rgba(0, 0, 0, 0.7);
            padding: 12px 16px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            color: #00ff00;
            font-size: 14px;
            line-height: 1.6;
            border: 1px solid rgba(0, 255, 0, 0.3);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            min-width: 180px;
        `;

        // Spot price display
        this.spotPriceEl = document.createElement('div');
        this.spotPriceEl.style.cssText = 'margin-bottom: 6px; font-weight: bold;';
        this.updateSpotPrice(this.currentSpot);
        this.container.appendChild(this.spotPriceEl);

        // DTE display
        this.dteEl = document.createElement('div');
        this.dteEl.style.cssText = 'margin-bottom: 6px;';
        this.updateDTE(this.dte);
        this.container.appendChild(this.dteEl);

        // P/L display
        this.plEl = document.createElement('div');
        this.plEl.style.cssText = 'margin-bottom: 10px; font-weight: bold;';
        this.updatePL(this.totalPL);
        this.container.appendChild(this.plEl);

        // Reset button
        this.resetBtn = document.createElement('button');
        this.resetBtn.textContent = 'Reset Scene';
        this.resetBtn.style.cssText = `
            width: 100%;
            padding: 6px;
            background: rgba(255, 0, 0, 0.2);
            color: #ff4444;
            border: 1px solid #ff4444;
            border-radius: 4px;
            cursor: pointer;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            transition: all 0.2s;
        `;
        this.resetBtn.onmouseover = () => {
            this.resetBtn.style.background = 'rgba(255, 0, 0, 0.4)';
        };
        this.resetBtn.onmouseout = () => {
            this.resetBtn.style.background = 'rgba(255, 0, 0, 0.2)';
        };
        this.container.appendChild(this.resetBtn);

        // Add to document
        document.body.appendChild(this.container);
    }

    /**
     * Update spot price display
     * @param {number} price - Current underlying price
     * @param {string} ticker - Ticker symbol (optional)
     */
    updateSpotPrice(price, ticker = 'SPY') {
        this.currentSpot = price;
        this.spotPriceEl.textContent = `${ticker}: $${price.toFixed(2)}`;
    }

    /**
     * Update days to expiry
     * @param {number} days - Days to expiry
     */
    updateDTE(days) {
        this.dte = days;
        const color = days === 0 ? '#ff4444' : days <= 3 ? '#ffaa00' : '#00ff00';
        this.dteEl.innerHTML = `DTE: <span style="color: ${color}">${days}</span>`;
    }

    /**
     * Update total P/L
     * @param {number} pl - Profit/Loss amount
     */
    updatePL(pl) {
        this.totalPL = pl;
        const color = pl >= 0 ? '#00ff00' : '#ff4444';
        const sign = pl >= 0 ? '+' : '';
        this.plEl.innerHTML = `P/L: <span style="color: ${color}">${sign}$${pl.toFixed(2)}</span>`;
    }

    /**
     * Set reset button click handler
     * @param {Function} callback - Function to call on reset
     */
    onReset(callback) {
        this.resetBtn.addEventListener('click', callback);
    }

    /**
     * Show/hide HUD
     * @param {boolean} visible - Visibility state
     */
    setVisible(visible) {
        this.container.style.display = visible ? 'block' : 'none';
    }

    /**
     * Remove HUD from DOM
     */
    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
