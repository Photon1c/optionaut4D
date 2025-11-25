/**
 * Export System - Save and load missions
 * Enables strategy sharing via JSON export/import
 */

export class ExportSystem {
    constructor() {
        this.version = '1.0';
    }

    /**
     * Export current mission to JSON
     * @param {Object} sceneData - Scene state data
     * @returns {Object} JSON-serializable mission data
     */
    exportMission(sceneData) {
        const {
            rockets,
            camera,
            controls,
            currentSpot,
            currentIV,
            currentTheme
        } = sceneData;

        return {
            version: this.version,
            timestamp: Date.now(),
            metadata: {
                spot: currentSpot,
                iv: currentIV,
                theme: currentTheme
            },
            rockets: rockets.map(rocket => ({
                type: rocket.type,
                strike: rocket.strike,
                spot: rocket.spot || currentSpot,
                quantity: rocket.quantity || 1,
                timeToExpiry: rocket.timeToExpiry || 1.0,
                iv: rocket.iv || currentIV,
                entry: rocket.entry,
                ticker: rocket.ticker || 'SPY',
                greeks: rocket.greeks,
                position: rocket.group ? rocket.group.position.toArray() : [0, 0, 0],
                velocity: rocket.group?.userData?.velocity ?
                    rocket.group.userData.velocity.toArray() : [0, 0, 0]
            })),
            camera: {
                position: camera.position.toArray(),
                target: controls.target.toArray(),
                zoom: camera.zoom
            }
        };
    }

    /**
     * Download mission as JSON file
     * @param {Object} missionData - Mission data to export
     * @param {string} filename - Optional filename
     */
    downloadJSON(missionData, filename) {
        const json = JSON.stringify(missionData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `optionaut-mission-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`💾 Mission exported: ${a.download}`);
    }

    /**
     * Import mission from JSON
     * @param {string} jsonString - JSON mission data
     * @returns {Object} Parsed mission data
     */
    importMission(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            // Validate version
            if (!data.version) {
                throw new Error('Invalid mission file: missing version');
            }

            // Validate required fields
            if (!data.rockets || !Array.isArray(data.rockets)) {
                throw new Error('Invalid mission file: missing rockets data');
            }

            console.log(`📥 Mission imported: ${data.rockets.length} rockets`);
            return data;

        } catch (error) {
            console.error('Import error:', error);
            throw new Error(`Failed to import mission: ${error.message}`);
        }
    }

    /**
     * Load mission from file input
     * @param {File} file - JSON file
     * @returns {Promise<Object>} Parsed mission data
     */
    async loadFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = this.importMission(e.target.result);
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsText(file);
        });
    }
}
