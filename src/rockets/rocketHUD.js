/**
 * Rocket HUD - Individual fuel gauges for each rocket
 * Shows Delta, Gamma, Vega, Theta, IV when rocket is clicked
 */

export class RocketHUD {
    constructor() {
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.width = 250;
        this.height = 300;
        this.visible = false;
        this.currentRocket = null;

        this.init();
    }

    init() {
        // Create container
        this.container = document.createElement('div');
        this.container.id = 'rocket-hud';
        this.container.style.cssText = `
            position: fixed;
            top: 70px;
            right: 10px;
            z-index: 1001;
            background: rgba(0, 0, 0, 0.9);
            padding: 16px;
            border-radius: 8px;
            border: 2px solid rgba(74, 144, 226, 0.8);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.7);
            display: none;
            max-width: 280px;
        `;

        // Title
        const title = document.createElement('div');
        title.id = 'rocket-hud-title';
        title.textContent = 'ROCKET METRICS';
        title.style.cssText = `
            font-family: 'Courier New', monospace;
            color: #4a90e2;
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 12px;
            text-align: center;
            letter-spacing: 2px;
        `;
        this.container.appendChild(title);

        // Canvas for gauges
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.style.display = 'block';
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            width: 24px;
            height: 24px;
            background: rgba(255, 0, 0, 0.3);
            color: #ff4444;
            border: 1px solid #ff4444;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            line-height: 1;
        `;
        closeBtn.onclick = () => this.hide();
        this.container.appendChild(closeBtn);

        // Add to document
        document.body.appendChild(this.container);
    }

    /**
     * Show HUD for a specific rocket
     * @param {THREE.Group} rocket - The rocket group
     * @param {Object} greeks - Greek values
     * @param {Object} params - Rocket parameters (strike, type, etc.)
     */
    show(rocket, greeks, params) {
        this.currentRocket = rocket;
        this.visible = true;
        this.container.style.display = 'block';

        // Update title with rocket info
        const title = document.getElementById('rocket-hud-title');
        if (title && params) {
            const type = params.type ? params.type.toUpperCase() : 'CALL';
            const strike = params.strike || 'N/A';
            title.textContent = `${type} $${strike}`;
        }

        // Store data for rendering
        this.greeks = greeks || {};
        this.params = params || {};
        this.fuel = rocket.userData?.fuel || 1.0;
        this.iv = params.iv || 0.16;

        this.render();
    }

    /**
     * Hide HUD
     */
    hide() {
        this.visible = false;
        this.container.style.display = 'none';
        this.currentRocket = null;
    }

    /**
     * Update HUD with current values
     */
    update() {
        if (!this.visible || !this.currentRocket) return;

        // Get fresh data from rocket
        const rocketData = this.currentRocket.userData;
        this.fuel = rocketData.fuel || 1.0;

        // Recalculate Greeks if needed
        if (this.params && this.params.spot && this.params.strike) {
            // Greeks should be updated externally, but we can refresh display
        }

        this.render();
    }

    /**
     * Render all gauges
     */
    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        let y = 10;
        const spacing = 55;

        // Delta gauge (thrust)
        this.drawBarGauge(ctx, 10, y, 'DELTA', this.greeks.delta || 0, 1, '#4a90e2');
        y += spacing;

        // Gamma gauge (curvature)
        this.drawBarGauge(ctx, 10, y, 'GAMMA', (this.greeks.gamma || 0) * 100, 10, '#ff9500');
        y += spacing;

        // Vega gauge (turbulence)
        this.drawBarGauge(ctx, 10, y, 'VEGA', Math.abs(this.greeks.vega || 0) / 10, 1, '#9b59b6');
        y += spacing;

        // Theta gauge (fuel tank)
        this.drawFuelTank(ctx, 10, y, this.fuel, Math.abs(this.greeks.theta || 0));
        y += spacing;

        // IV gauge (implied volatility)
        this.drawBarGauge(ctx, 10, y, 'IV', (this.iv || 0) * 100, 20, '#e74c3c');
    }

    /**
     * Draw a horizontal bar gauge
     */
    drawBarGauge(ctx, x, y, label, value, max, color, scale = 1.0) {
        const barWidth = 180 * scale;
        const barHeight = 18;
        const fillWidth = Math.min(Math.abs(value) / max, 1) * barWidth;

        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Courier New';
        ctx.fillText(label, x, y + 12);

        // Value text
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '10px Courier New';
        ctx.fillText(value.toFixed(3), x + barWidth + 10, y + 12);

        // Bar background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(x, y + 16, barWidth, barHeight);

        // Bar fill
        const gradient = ctx.createLinearGradient(x, 0, x + fillWidth, 0);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, this.lightenColor(color, 40));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y + 16, fillWidth, barHeight);

        // Border
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y + 16, barWidth, barHeight);
    }

    /**
     * Draw fuel tank for Theta
     */
    drawFuelTank(ctx, x, y, fuelLevel, burnRate) {
        const tankWidth = 50;
        const tankHeight = 35;
        const fillHeight = fuelLevel * tankHeight;

        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Courier New';
        ctx.fillText('THETA (FUEL)', x, y + 12);

        // Burn rate
        ctx.fillStyle = '#ff4444';
        ctx.font = '9px Courier New';
        ctx.fillText(`-${burnRate.toFixed(2)}/day`, x + tankWidth + 10, y + 12);

        // Tank outline
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y + 16, tankWidth, tankHeight);

        // Fuel fill
        const fuelColor = fuelLevel > 0.5 ? '#00ff00' : fuelLevel > 0.2 ? '#ffaa00' : '#ff4444';
        ctx.fillStyle = fuelColor;
        ctx.fillRect(x + 2, y + 16 + (tankHeight - fillHeight), tankWidth - 4, fillHeight - 2);

        // Percentage
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Courier New';
        const pct = `${(fuelLevel * 100).toFixed(0)}%`;
        const textWidth = ctx.measureText(pct).width;
        ctx.fillText(pct, x + tankWidth / 2 - textWidth / 2, y + 38);
    }

    /**
     * Lighten a hex color
     */
    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255))
            .toString(16).slice(1);
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

