/**
 * Volatility Slider - Real-time IV adjustment
 * Allows traders to see "what-if" scenarios by adjusting implied volatility
 */

export class VolSlider {
    constructor(calculateGreeksFn) {
        this.calculateGreeks = calculateGreeksFn;
        this.baseIV = 0.16; // Default 16% IV
        this.currentAdjustment = 0; // -50% to +50%
        this.rocketsRef = null;
        this.onUpdateCallback = null;
    }

    setRocketsRef(rocketsArray) {
        this.rocketsRef = rocketsArray;
    }

    onUpdate(callback) {
        this.onUpdateCallback = callback;
    }

    handleIVChange(adjustmentPercent) {
        this.currentAdjustment = adjustmentPercent;
        const multiplier = 1 + (adjustmentPercent / 100);
        const newIV = this.baseIV * multiplier;

        if (!this.rocketsRef) return;

        // Recalculate Greeks for all rockets
        this.rocketsRef.forEach(rocket => {
            if (!rocket.baseParams) {
                // Store original params on first adjustment
                rocket.baseParams = {
                    spot: rocket.spot || 100,
                    strike: rocket.strike,
                    timeToExpiry: rocket.timeToExpiry || 1.0,
                    type: rocket.type
                };
            }

            // Recalculate Greeks with new IV
            const { spot, strike, timeToExpiry, type } = rocket.baseParams;
            const newGreeks = this.calculateGreeks(
                spot,
                strike,
                timeToExpiry,
                newIV,
                0.02, // risk-free rate
                type
            );

            // Update rocket's Greeks
            if (rocket.group && rocket.group.userData) {
                rocket.group.userData.greeks = newGreeks;
                rocket.greeks = newGreeks;
            }

            // Update Vega particle intensity
            this.updateVegaParticles(rocket, newIV);
        });

        // Notify listeners (e.g., Greek HUD)
        if (this.onUpdateCallback) {
            this.onUpdateCallback(newIV, adjustmentPercent);
        }

        console.log(`📊 IV adjusted to ${(newIV * 100).toFixed(1)}% (${adjustmentPercent > 0 ? '+' : ''}${adjustmentPercent}%)`);
    }

    updateVegaParticles(rocket, newIV) {
        // Adjust particle intensity based on Vega
        // Higher IV = more chaotic particles
        if (!rocket.exhaustParticles) return;

        const vegaIntensity = Math.abs(rocket.greeks?.vega || 0) / 10;
        const ivMultiplier = newIV / this.baseIV;
        const particleScale = vegaIntensity * ivMultiplier;

        // Update particle system if it exists
        if (rocket.exhaustParticles && rocket.exhaustParticles.material) {
            // Increase particle size and opacity for higher IV
            rocket.exhaustParticles.material.size = 0.5 + (particleScale * 0.5);
            rocket.exhaustParticles.material.opacity = 0.6 + (particleScale * 0.2);
        }
    }

    reset() {
        this.currentAdjustment = 0;
        this.handleIVChange(0);
    }

    getCurrentIV() {
        return this.baseIV * (1 + this.currentAdjustment / 100);
    }
}
