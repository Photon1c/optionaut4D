/**
 * Greek HUD - Visual gauges for option Greeks
 * Displays Delta, Gamma, Vega, Theta, Rho as interactive gauges
 */

export class GreekHUD {
    constructor() {
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.width = 280;
        this.height = 320;

        this.greeks = {
            delta: 0,
            gamma: 0,
            vega: 0,
            theta: 0,
            rho: 0
        };

        this.fuel = 1.0; // 0-1 for theta visualization

        this.init();
    }

    init() {
        // Create container
        this.container = document.createElement('div');
        this.container.id = 'greek-hud';
        this.container.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            z-index: 1000;
            background: rgba(0, 0, 0, 0.8);
            padding: 16px;
            border-radius: 8px;
            border: 1px solid rgba(100, 200, 255, 0.3);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        `;

        // Title
        const title = document.createElement('div');
        title.textContent = 'GREEKS';
        title.style.cssText = `
            font-family: 'Courier New', monospace;
            color: #64c8ff;
            font-size: 16px;
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

        // Add to document
        document.body.appendChild(this.container);

        // Initial render
        this.render();
    }

    /**
     * Update Greek values
     * @param {Object} greeks - Greek values {delta, gamma, vega, theta, rho}
     * @param {number} fuel - Fuel level 0-1 (for theta visualization)
     */
    update(greeks, fuel = 1.0) {
        this.greeks = { ...greeks };
        this.fuel = fuel;
        this.render();
    }

    /**
     * Render all gauges
     */
    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        let y = 10;
        const spacing = 60;

        // Delta gauge (thrust)
        this.drawBarGauge(ctx, 10, y, 'DELTA', this.greeks.delta, 1, '#4a90e2');
        y += spacing;

        // Gamma gauge (curvature)
        this.drawBarGauge(ctx, 10, y, 'GAMMA', this.greeks.gamma * 100, 10, '#ff9500');
        y += spacing;

        // Vega gauge (turbulence)
        this.drawBarGauge(ctx, 10, y, 'VEGA', Math.abs(this.greeks.vega) / 10, 1, '#9b59b6');
        y += spacing;

        // Theta gauge (fuel tank)
        this.drawFuelTank(ctx, 10, y, this.fuel, Math.abs(this.greeks.theta));
        y += spacing;

        // Rho gauge (small)
        this.drawBarGauge(ctx, 10, y, 'RHO', Math.abs(this.greeks.rho) / 10, 1, '#34495e', 0.6);
    }

    /**
     * Draw a horizontal bar gauge
     */
    drawBarGauge(ctx, x, y, label, value, max, color, scale = 1.0) {
        const barWidth = 200 * scale;
        const barHeight = 20;
        const fillWidth = Math.min(Math.abs(value) / max, 1) * barWidth;

        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Courier New';
        ctx.fillText(label, x, y + 12);

        // Value text
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '10px Courier New';
        ctx.fillText(value.toFixed(3), x + barWidth + 10, y + 12);

        // Bar background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(x, y + 18, barWidth, barHeight);

        // Bar fill
        const gradient = ctx.createLinearGradient(x, 0, x + fillWidth, 0);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, this.lightenColor(color, 40));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y + 18, fillWidth, barHeight);

        // Border
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y + 18, barWidth, barHeight);
    }

    /**
     * Draw fuel tank for Theta
     */
    drawFuelTank(ctx, x, y, fuelLevel, burnRate) {
        const tankWidth = 60;
        const tankHeight = 40;
        const fillHeight = fuelLevel * tankHeight;

        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Courier New';
        ctx.fillText('THETA (FUEL)', x, y + 12);

        // Burn rate
        ctx.fillStyle = '#ff4444';
        ctx.font = '10px Courier New';
        ctx.fillText(`-${burnRate.toFixed(2)}/day`, x + tankWidth + 10, y + 12);

        // Tank outline
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y + 18, tankWidth, tankHeight);

        // Fuel fill
        const fuelColor = fuelLevel > 0.5 ? '#00ff00' : fuelLevel > 0.2 ? '#ffaa00' : '#ff4444';
        ctx.fillStyle = fuelColor;
        ctx.fillRect(x + 2, y + 18 + (tankHeight - fillHeight), tankWidth - 4, fillHeight - 2);

        // Percentage
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Courier New';
        const pct = `${(fuelLevel * 100).toFixed(0)}%`;
        const textWidth = ctx.measureText(pct).width;
        ctx.fillText(pct, x + tankWidth / 2 - textWidth / 2, y + 40);

        // Droplets animation (if burning)
        if (burnRate > 0 && fuelLevel > 0) {
            this.drawDroplets(ctx, x + tankWidth / 2, y + 18 + tankHeight, 3);
        }
    }

    /**
     * Draw fuel droplets
     */
    drawDroplets(ctx, x, y, count) {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.6)';
        for (let i = 0; i < count; i++) {
            const offset = (Date.now() / 100 + i * 10) % 20;
            ctx.beginPath();
            ctx.arc(x + (i - 1) * 8, y + offset, 2, 0, Math.PI * 2);
            ctx.fill();
        }
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
     * Show/hide HUD
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
