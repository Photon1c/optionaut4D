/**
 * Optionaut 4D Integration Module
 * Connects contract parser, HUDs, and profit zones to the main scene
 */

import { parseContract, calculateDTE, validateContract } from './contractParser.js';
import { LiveHUD } from './liveHUD.js';
import { GreekHUD } from './greekHUD.js';
import { createBreakevenRing, createMaxProfitRing, createLossZone, animateRing, calculateBreakevens } from './profitZones.js';

export class Optionaut4DIntegration {
    constructor(scene, createRocketFn, calculateGreeksFn) {
        this.scene = scene;
        this.createRocket = createRocketFn;
        this.calculateGreeks = calculateGreeksFn;

        this.liveHUD = null;
        this.greekHUD = null;
        this.selectedRocket = null;
        this.breakevenRings = [];
        this.lossZone = null;

        this.currentSpot = 100;
        this.planetRadius = 12;

        // Store reference to rockets array for reset
        this.rocketsArrayRef = null;
        this.exhaustParticlesRef = null;

        this.init();
    }

    init() {
        // Create HUDs
        this.liveHUD = new LiveHUD();
        this.greekHUD = new GreekHUD();

        // Create loss zone
        this.lossZone = createLossZone(this.planetRadius);
        this.scene.add(this.lossZone);

        // Setup contract input
        this.setupContractInput();

        // Setup reset button
        this.liveHUD.onReset(() => this.resetScene());

        console.log('✅ Optionaut 4D Integration initialized');
    }

    setupContractInput() {
        const contractText = document.getElementById('contract-text');
        const launchBtn = document.getElementById('launch-btn');
        const parseStatus = document.getElementById('parse-status');

        if (!contractText || !launchBtn || !parseStatus) {
            console.warn('Contract input elements not found');
            return;
        }

        // Handle launch button click
        launchBtn.addEventListener('click', async () => {
            await this.handleContractLaunch(contractText.value, parseStatus, launchBtn);
        });

        // Handle Enter key
        contractText.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                await this.handleContractLaunch(contractText.value, parseStatus, launchBtn);
            }
        });
    }

    async handleContractLaunch(text, statusEl, btnEl) {
        if (!text || text.trim().length === 0) {
            this.showParseStatus(statusEl, 'Please enter a contract', 'error');
            return;
        }

        // Disable button during parse
        btnEl.disabled = true;
        btnEl.textContent = 'Parsing...';
        statusEl.className = '';
        statusEl.style.display = 'none';

        try {
            // Parse contract
            const contract = await parseContract(text);

            // Validate
            if (!validateContract(contract)) {
                throw new Error('Invalid contract data');
            }

            // Show success
            this.showParseStatus(statusEl, `✓ ${contract.quantity} ${contract.ticker} ${contract.strike}${contract.type[0].toUpperCase()}`, 'success');

            // Launch rocket
            this.launchRocketFromContract(contract);

            // Update HUDs
            this.updateLiveHUD(contract);

        } catch (error) {
            console.error('Parse error:', error);
            this.showParseStatus(statusEl, `✗ ${error.message}`, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = 'Launch 🚀';
        }
    }

    showParseStatus(el, message, type) {
        el.textContent = message;
        el.className = type;
        el.style.display = 'block';

        // Auto-hide after 3 seconds
        setTimeout(() => {
            el.style.display = 'none';
        }, 3000);
    }

    launchRocketFromContract(contract) {
        const { quantity, ticker, strike, type, expiry, premium } = contract;

        // Calculate time to expiry
        const dte = calculateDTE(expiry);
        const timeToExpiry = dte / 365;

        // Use premium or estimate
        const entryPrice = premium || (type === 'call' ? strike * 0.05 : strike * 0.03);

        // Create rocket for each quantity
        const absQuantity = Math.abs(quantity);
        for (let i = 0; i < absQuantity; i++) {
            const rocket = this.createRocket({
                type: type,
                strike: strike,
                spot: this.currentSpot,
                timeToExpiry: timeToExpiry,
                iv: 0.16, // Default IV
                entry: entryPrice,
                quantity: quantity > 0 ? 1 : -1, // Long or short
                ticker: ticker
            });

            // Select first rocket
            if (i === 0) {
                this.selectRocket(rocket, contract);
            }
        }

        // Create breakeven rings
        if (premium) {
            const breakevens = calculateBreakevens({ type, strike, premium, quantity });
            breakevens.forEach(be => {
                const ring = createBreakevenRing(be, this.currentSpot, this.planetRadius);
                this.scene.add(ring);
                this.breakevenRings.push(ring);
            });
        }

        console.log(`🚀 Launched ${absQuantity} ${type} rocket(s) at strike ${strike}`);
    }

    selectRocket(rocket, contract) {
        this.selectedRocket = rocket;

        // Update Greek HUD with rocket's Greeks
        if (rocket.userData && rocket.userData.greeks) {
            const greeks = rocket.userData.greeks;
            const fuel = rocket.userData.fuel || 1.0;
            this.greekHUD.update(greeks, fuel);
        }
    }

    updateLiveHUD(contract) {
        const { ticker, expiry } = contract;
        const dte = calculateDTE(expiry);

        this.liveHUD.updateSpotPrice(this.currentSpot, ticker);
        this.liveHUD.updateDTE(dte);
        // P/L will be calculated in animation loop
    }

    updateGreekHUD(rocket) {
        if (!rocket || !rocket.userData) return;

        const greeks = rocket.userData.greeks || {
            delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0
        };
        const fuel = rocket.userData.fuel || 1.0;

        this.greekHUD.update(greeks, fuel);
    }

    animateRings(time) {
        this.breakevenRings.forEach(ring => {
            animateRing(ring, time);
        });
    }

    setRocketsArrayRef(rocketsArray, exhaustParticlesArray) {
        this.rocketsArrayRef = rocketsArray;
        this.exhaustParticlesRef = exhaustParticlesArray;
    }

    resetScene() {
        console.log('🔄 Resetting scene...');

        // Remove all rockets from scene
        if (this.rocketsArrayRef) {
            this.rocketsArrayRef.forEach(rocket => {
                if (rocket.group) {
                    this.scene.remove(rocket.group);
                }
            });
            this.rocketsArrayRef.length = 0; // Clear array
        }

        // Remove all exhaust particles
        if (this.exhaustParticlesRef) {
            this.exhaustParticlesRef.forEach(particles => {
                if (particles) {
                    this.scene.remove(particles);
                    if (particles.geometry) particles.geometry.dispose();
                    if (particles.material) particles.material.dispose();
                }
            });
            this.exhaustParticlesRef.length = 0; // Clear array
        }

        // Remove all breakeven rings
        this.breakevenRings.forEach(ring => {
            this.scene.remove(ring);
            if (ring.geometry) ring.geometry.dispose();
            if (ring.material) ring.material.dispose();
        });
        this.breakevenRings = [];

        // Reset HUDs
        this.liveHUD.updatePL(0);
        this.liveHUD.updateSpotPrice(this.currentSpot, 'SPY');
        this.liveHUD.updateDTE(7);

        this.greekHUD.update({
            delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0
        }, 1.0);

        this.selectedRocket = null;

        console.log('✅ Scene reset complete');
    }

    destroy() {
        if (this.liveHUD) this.liveHUD.destroy();
        if (this.greekHUD) this.greekHUD.destroy();
        if (this.lossZone) this.scene.remove(this.lossZone);
        this.breakevenRings.forEach(ring => this.scene.remove(ring));
    }
}
