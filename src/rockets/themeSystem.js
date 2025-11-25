/**
 * Theme System - Visual mode switching
 * Supports Dark Orbit (default) and Neon Cyberpunk themes
 */

import * as THREE from 'three';

export const themes = {
    orbit: {
        name: 'Dark Orbit',
        background: 0x000000,
        rocket: {
            call: 0x4a90e2,
            put: 0xff4444
        },
        exhaust: {
            call: 0x00ff00,
            put: 0xff0000
        },
        ring: 0x00ff00,
        planet: 0x2a5a8a,
        hud: '#00ff00',
        bloom: 0.3,
        fog: 0x000000
    },
    cyberpunk: {
        name: 'Neon Cyberpunk',
        background: 0x1a0033,
        rocket: {
            call: 0xff00ff,
            put: 0x00ffff
        },
        exhaust: {
            call: 0x00ffff,
            put: 0xff00ff
        },
        ring: 0xff00ff,
        planet: 0x4a0066,
        hud: '#ff00ff',
        bloom: 1.5,
        fog: 0x330066
    }
};

export class ThemeSystem {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.currentTheme = 'orbit';

        // Load saved theme
        const saved = localStorage.getItem('optionaut-theme');
        if (saved && themes[saved]) {
            this.currentTheme = saved;
        }
    }

    applyTheme(themeName) {
        if (!themes[themeName]) {
            console.warn(`Theme "${themeName}" not found`);
            return;
        }

        const theme = themes[themeName];
        this.currentTheme = themeName;

        // Update scene background
        this.scene.background = new THREE.Color(theme.background);

        // Update fog if it exists
        if (this.scene.fog) {
            this.scene.fog.color = new THREE.Color(theme.fog);
        }

        // Update all rockets
        this.scene.traverse((object) => {
            // Update rocket materials
            if (object.userData.isRocket) {
                const rocketType = object.userData.rocketType || 'call';
                const color = theme.rocket[rocketType];

                if (object.material) {
                    object.material.color.setHex(color);
                    object.material.emissive.setHex(color);
                    object.material.emissiveIntensity = theme.bloom * 0.5;
                }
            }

            // Update exhaust particles
            if (object.userData.isExhaust) {
                const exhaustType = object.userData.exhaustType || 'call';
                const color = theme.exhaust[exhaustType];

                if (object.material) {
                    object.material.color.setHex(color);
                }
            }

            // Update breakeven rings
            if (object.userData.isBreakevenRing) {
                if (object.material) {
                    object.material.color.setHex(theme.ring);
                    object.material.emissive.setHex(theme.ring);
                    object.material.emissiveIntensity = theme.bloom * 0.5;
                }
            }

            // Update planet
            if (object.userData.isPlanet) {
                if (object.material) {
                    object.material.color.setHex(theme.planet);
                }
            }
        });

        // Update HUD colors
        this.updateHUDColors(theme.hud);

        // Save preference
        localStorage.setItem('optionaut-theme', themeName);

        console.log(`🎨 Theme changed to: ${theme.name}`);
    }

    updateHUDColors(color) {
        // Update Live HUD
        const liveHUD = document.getElementById('live-hud');
        if (liveHUD) {
            liveHUD.style.color = color;
            liveHUD.style.borderColor = color + '33'; // 20% opacity
        }

        // Update Greek HUD
        const greekHUD = document.getElementById('greek-hud');
        if (greekHUD) {
            const title = greekHUD.querySelector('div');
            if (title) title.style.color = color;
        }
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'orbit' ? 'cyberpunk' : 'orbit';
        this.applyTheme(newTheme);
        return newTheme;
    }

    getCurrentTheme() {
        return this.currentTheme;
    }

    getThemeName() {
        return themes[this.currentTheme].name;
    }
}
