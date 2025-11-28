// rocketState.js
// Stores and manages rocket positions and states for human/AI interaction

export class RocketState {
    constructor() {
        this.rockets = []; // Array of rocket configurations
        this.currentRocketIndex = 0;
    }

    // Add or update a rocket configuration
    addRocket(config) {
        const rocket = {
            id: config.id || `rocket_${Date.now()}`,
            type: config.type || 'call',
            strike: config.strike || 100,
            spot: config.spot || 100,
            timeToExpiry: config.timeToExpiry || 0.0027,
            iv: config.iv || 0.16,
            entry: config.entry || 0.5,
            position: config.position || null, // {x, y, z} - can be manually set
            enabled: config.enabled !== false
        };
        
        const existingIndex = this.rockets.findIndex(r => r.id === rocket.id);
        if (existingIndex >= 0) {
            this.rockets[existingIndex] = rocket;
        } else {
            this.rockets.push(rocket);
        }
        
        return rocket;
    }

    // Get all rockets
    getRockets() {
        return this.rockets.filter(r => r.enabled);
    }

    // Get rocket by ID
    getRocket(id) {
        return this.rockets.find(r => r.id === id);
    }

    // Update rocket position (for AI/human adjustment)
    updateRocketPosition(id, position) {
        const rocket = this.rockets.find(r => r.id === id);
        if (rocket) {
            rocket.position = position;
            return true;
        }
        return false;
    }

    // Update rocket parameters
    updateRocketParams(id, params) {
        const rocket = this.rockets.find(r => r.id === id);
        if (rocket) {
            Object.assign(rocket, params);
            return true;
        }
        return false;
    }

    // Remove rocket
    removeRocket(id) {
        const index = this.rockets.findIndex(r => r.id === id);
        if (index >= 0) {
            this.rockets.splice(index, 1);
            return true;
        }
        return false;
    }

    // Clear all rockets
    clear() {
        this.rockets = [];
    }

    // Export state (for saving)
    export() {
        return JSON.stringify(this.rockets, null, 2);
    }

    // Import state (for loading)
    import(jsonString) {
        try {
            this.rockets = JSON.parse(jsonString);
            return true;
        } catch (e) {
            console.error('Failed to import rocket state:', e);
            return false;
        }
    }
}

export const rocketState = new RocketState();



