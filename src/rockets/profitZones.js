/**
 * Breakeven Rings & Profit Zones
 * Visualizes breakeven points, max profit, and loss zones
 */

import * as THREE from 'three';

/**
 * Create a glowing ring at a breakeven price
 * @param {number} price - Breakeven price
 * @param {number} spotPrice - Current spot price
 * @param {number} planetRadius - Planet radius
 * @param {number} color - Ring color
 * @returns {THREE.Mesh} Ring mesh
 */
export function createBreakevenRing(price, spotPrice, planetRadius, color = 0x00ff00) {
    // Calculate ring radius based on price distance from spot
    const priceDistance = Math.abs(price - spotPrice);
    const radius = planetRadius + (priceDistance * 2); // Scale factor for visibility

    const geometry = new THREE.RingGeometry(radius - 0.5, radius + 0.5, 64);
    const material = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
        emissive: color,
        emissiveIntensity: 0.5
    });

    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2; // Lay flat
    ring.position.y = 0.5; // Slightly above ground

    // Add pulsing animation data
    ring.userData.pulsePhase = Math.random() * Math.PI * 2;
    ring.userData.baseOpacity = 0.6;

    return ring;
}

/**
 * Create max profit ring (for defined-risk trades)
 * @param {number} maxProfitPrice - Price at max profit
 * @param {number} spotPrice - Current spot price
 * @param {number} planetRadius - Planet radius
 * @returns {THREE.Mesh} Ring mesh
 */
export function createMaxProfitRing(maxProfitPrice, spotPrice, planetRadius) {
    const priceDistance = Math.abs(maxProfitPrice - spotPrice);
    const radius = planetRadius + (priceDistance * 2);

    const geometry = new THREE.RingGeometry(radius - 0.3, radius + 0.3, 64);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4
    });

    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.6;

    return ring;
}

/**
 * Create loss zone (red crater below zero profit)
 * @param {number} planetRadius - Planet radius
 * @returns {THREE.Mesh} Loss zone mesh
 */
export function createLossZone(planetRadius) {
    const geometry = new THREE.CircleGeometry(planetRadius * 1.5, 64);
    const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.2
    });

    const zone = new THREE.Mesh(geometry, material);
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = -0.5; // Below ground

    return zone;
}

/**
 * Update ring pulsing animation
 * @param {THREE.Mesh} ring - Ring mesh
 * @param {number} time - Current time
 */
export function animateRing(ring, time) {
    if (!ring.userData.pulsePhase) return;

    const pulse = Math.sin(time * 2 + ring.userData.pulsePhase) * 0.2 + 0.8;
    ring.material.opacity = ring.userData.baseOpacity * pulse;
    ring.material.emissiveIntensity = 0.3 + pulse * 0.3;
}

/**
 * Calculate breakeven prices for an option
 * @param {Object} contract - Contract data {type, strike, premium, quantity}
 * @returns {Array<number>} Breakeven prices
 */
export function calculateBreakevens(contract) {
    const { type, strike, premium, quantity } = contract;

    if (!premium) return []; // Can't calculate without premium

    const breakevens = [];

    if (type === 'call') {
        // Long call: breakeven = strike + premium
        // Short call: breakeven = strike + premium (but inverted P/L)
        breakevens.push(strike + premium);
    } else {
        // Long put: breakeven = strike - premium
        // Short put: breakeven = strike - premium (but inverted P/L)
        breakevens.push(strike - premium);
    }

    return breakevens;
}
