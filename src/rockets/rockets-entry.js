import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { rocketState } from './rocketState.js';
import { Optionaut4DIntegration } from './optionaut4dIntegration.js';
import { VolSlider } from './volSlider.js';
import { ThemeSystem } from './themeSystem.js';
import { ExportSystem } from './exportSystem.js';
import { GIFExporter } from './gifExporter.js';

console.log('Option Rockets entry script started');

// Global variables
let scene, camera, renderer, controls, clock;
let underlyingPlanet = null;
let rockets = [];
let trajectoryLines = [];
let breakevenRings = [];
let controlsPanel = null;
let currentSpot = 100; // Underlying price
let timeToExpiry = 1.0; // Years
let currentRocket = null;
let cameraFollowTarget = null;
let cameraFollowEnabled = true;
let exhaustParticles = [];
let optionaut4D = null; // Optionaut 4D integration
let volSlider = null; // Volatility slider
let themeSystem = null; // Theme system
let exportSystem = null; // Export system
let gifExporter = null; // GIF exporter

// Navigation controls
let moveState = { forward: false, backward: false, left: false, right: false, up: false, down: false };
let mouseState = { isDown: false, lastX: 0, lastY: 0 };
let moveSpeed = 5.0;
let lookSpeed = 0.002;

const API_BASE_URL = 'http://localhost:5001/api';

// Update loading bar
function updateLoadingBar(progress) {
    const loadingBar = document.getElementById('loading-bar');
    if (loadingBar) {
        loadingBar.style.width = progress + '%';
    }
}

// Black-Scholes Greeks calculator (simplified)
function calculateGreeks(spot, strike, timeToExpiry, iv, r = 0.02, optionType = 'call') {
    if (timeToExpiry <= 0) {
        return {
            delta: optionType === 'call' ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0),
            gamma: 0,
            vega: 0,
            theta: 0,
            price: Math.max(0, optionType === 'call' ? spot - strike : strike - spot)
        };
    }

    const d1 = (Math.log(spot / strike) + (r + 0.5 * iv * iv) * timeToExpiry) / (iv * Math.sqrt(timeToExpiry));
    const d2 = d1 - iv * Math.sqrt(timeToExpiry);

    // Normal CDF approximation
    const normCDF = (x) => 0.5 * (1 + Math.sign(x) * (1 - Math.exp(-2 * x * x / Math.PI)));
    const normPDF = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

    const delta = optionType === 'call' ? normCDF(d1) : -normCDF(-d1);
    const gamma = normPDF(d1) / (spot * iv * Math.sqrt(timeToExpiry));
    const vega = spot * normPDF(d1) * Math.sqrt(timeToExpiry) * 0.01; // Per 1% IV change
    const theta = -(spot * normPDF(d1) * iv) / (2 * Math.sqrt(timeToExpiry)) - r * strike * Math.exp(-r * timeToExpiry) * normCDF(optionType === 'call' ? d2 : -d2);

    const price = optionType === 'call'
        ? spot * normCDF(d1) - strike * Math.exp(-r * timeToExpiry) * normCDF(d2)
        : strike * Math.exp(-r * timeToExpiry) * normCDF(-d2) - spot * normCDF(-d1);

    return { delta, gamma, vega, theta, price };
}

async function initScene() {
    try {
        console.log('Initializing Option Rockets scene');
        updateLoadingBar(10);

        // Initialize clock
        clock = new THREE.Clock();
        updateLoadingBar(15);

        // Camera setup
        console.log('Setting up camera');
        camera = new THREE.PerspectiveCamera(
            75, // Wider FOV for better rocket view
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        // Start closer to where rocket will be (more zoomed in)
        camera.position.set(50, 40, 60);
        camera.lookAt(30, 25, 0); // Look toward where rocket will spawn
        console.log('Camera set up');
        updateLoadingBar(20);

        // Renderer setup
        console.log('Setting up renderer');
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance"
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(renderer.domElement);
        console.log('Renderer set up');
        updateLoadingBar(30);

        // Scene setup
        console.log('Setting up scene');
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000011); // Deep space
        scene.fog = new THREE.Fog(0x000011, 50, 500);
        console.log('Scene set up');
        updateLoadingBar(40);

        // Lighting setup
        console.log('Setting up lighting');
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        sunLight.position.set(50, 100, 50);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        scene.add(sunLight);

        // Add stars
        const starsGeometry = new THREE.BufferGeometry();
        const starsVertices = [];
        for (let i = 0; i < 10000; i++) {
            const x = (Math.random() - 0.5) * 2000;
            const y = (Math.random() - 0.5) * 2000;
            const z = (Math.random() - 0.5) * 2000;
            starsVertices.push(x, y, z);
        }
        starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
        const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 });
        const stars = new THREE.Points(starsGeometry, starsMaterial);
        scene.add(stars);
        console.log('Lighting set up');
        updateLoadingBar(50);

        // Create underlying price planet (at origin)
        console.log('Creating underlying planet');
        const planetRadius = 12; // Slightly larger for better visibility
        const planetGeometry = new THREE.SphereGeometry(planetRadius, 32, 32);
        const planetMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a90e2,
            emissive: 0x1a3a5a,
            emissiveIntensity: 0.4,
            roughness: 0.7,
            metalness: 0.3
        });
        underlyingPlanet = new THREE.Mesh(planetGeometry, planetMaterial);
        underlyingPlanet.position.set(0, 0, 0);
        underlyingPlanet.castShadow = true;
        underlyingPlanet.receiveShadow = true;
        scene.add(underlyingPlanet);

        // Add planet label
        const planetLabel = createLabel('Underlying Price', 0, planetRadius + 3, 0);
        scene.add(planetLabel);
        console.log(`✅ Planet created at origin (0, 0, 0) with radius ${planetRadius}`);
        updateLoadingBar(60);

        // Create ground grid (profit = 0 plane)
        console.log('Creating ground grid');
        const gridHelper = new THREE.GridHelper(200, 50, 0x444444, 0x222222);
        gridHelper.position.y = -20;
        scene.add(gridHelper);

        // Add profit axis labels
        const profitLabel = createLabel('$0 Profit', 0, -18, 0);
        scene.add(profitLabel);
        updateLoadingBar(70);

        // Controls setup
        console.log('Setting up controls');
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 10;
        controls.maxDistance = 500;
        controls.target.set(30, 25, 0); // Target near where rocket will be
        controls.enabled = true; // Enable manual controls
        console.log('Controls set up');
        updateLoadingBar(80);

        // Setup keyboard and mouse navigation
        setupNavigationControls();

        // Create UI controls
        console.log('Creating UI controls');
        createControlsPanel();
        updateLoadingBar(90);

        // Create default rocket (0DTE SPY call) - wait a moment for scene to settle
        setTimeout(() => {
            const rocket = createRocket({
                type: 'call',
                strike: 100,
                spot: currentSpot,
                timeToExpiry: 0.0027, // ~1 day
                iv: 0.16,
                entry: 0.5
            });

            // Smoothly transition camera to follow rocket after creation
            setTimeout(() => {
                if (cameraFollowTarget && rocket) {
                    const targetPos = cameraFollowTarget.position.clone();
                    console.log(`📷 Positioning camera to follow rocket at: (${targetPos.x.toFixed(2)}, ${targetPos.y.toFixed(2)}, ${targetPos.z.toFixed(2)})`);

                    // Position camera behind and above rocket, ensuring we can see both planet and rocket
                    const toRocket = targetPos.clone();
                    if (toRocket.length() > 0.1) {
                        toRocket.normalize();
                    } else {
                        toRocket.set(1, 0, 0);
                    }

                    // Position camera zoomed in on rocket (Florida launch pad perspective)
                    // Position BEHIND rocket (away from origin) so planet doesn't block
                    const followDistance = 8; // Close for realistic perspective
                    const followHeight = 4; // Slightly above rocket

                    // Position BEHIND rocket (away from origin)
                    const rocketDistance = targetPos.length();
                    const idealPosition = targetPos.clone()
                        .add(toRocket.multiplyScalar(followDistance))
                        .add(new THREE.Vector3(0, followHeight, 0));

                    // Ensure camera is further from origin than rocket
                    if (idealPosition.length() <= rocketDistance + 2) {
                        const direction = idealPosition.clone().normalize();
                        idealPosition.copy(direction.multiplyScalar(rocketDistance + followDistance + 2));
                        idealPosition.y = Math.max(targetPos.y + followHeight, 5);
                    }

                    camera.position.copy(idealPosition);

                    // Look directly at rocket
                    controls.target.copy(targetPos);
                    camera.lookAt(controls.target);

                    const distToRocket = camera.position.distanceTo(targetPos);
                    console.log(`📷 ===== CAMERA POSITIONED (ZOOMED IN) =====`);
                    console.log(`📷 Camera: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
                    console.log(`📷 Rocket: (${targetPos.x.toFixed(2)}, ${targetPos.y.toFixed(2)}, ${targetPos.z.toFixed(2)})`);
                    console.log(`📷 Distance to rocket: ${distToRocket.toFixed(2)}`);
                    console.log(`📷 Camera dist from origin: ${camera.position.length().toFixed(2)}, Rocket dist: ${rocketDistance.toFixed(2)}`);
                    console.log(`📷 Camera is BEHIND rocket (further from origin) - planet won't block view`);
                }
            }, 500);
        }, 200);

        // Initialize Optionaut 4D Integration (contract parser, HUDs, profit zones)
        console.log('Initializing Optionaut 4D integration...');
        optionaut4D = new Optionaut4DIntegration(scene, createRocket, calculateGreeks);
        optionaut4D.currentSpot = currentSpot;
        optionaut4D.planetRadius = 12;
        optionaut4D.setRocketsArrayRef(rockets, exhaustParticles); // Pass array references for reset
        console.log('✅ Optionaut 4D integration ready');

        // Initialize Vol Slider
        console.log('Initializing vol slider...');
        volSlider = new VolSlider(calculateGreeks);
        volSlider.setRocketsRef(rockets);
        volSlider.onUpdate((newIV, adjustment) => {
            // Update Greek HUD when IV changes
            if (optionaut4D && rockets.length > 0 && rockets[0].group) {
                optionaut4D.updateGreekHUD(rockets[0].group);
            }
        });

        // Setup vol slider UI
        const ivSlider = document.getElementById('iv-slider');
        const ivDisplay = document.getElementById('iv-display');
        if (ivSlider && ivDisplay) {
            ivSlider.addEventListener('input', (e) => {
                const adjustment = parseFloat(e.target.value);
                ivDisplay.textContent = `${adjustment > 0 ? '+' : ''}${adjustment}%`;
                volSlider.handleIVChange(adjustment);
            });
        }
        console.log('✅ Vol slider ready');

        // Initialize Theme System
        console.log('Initializing theme system...');
        themeSystem = new ThemeSystem(scene, camera, renderer);
        themeSystem.applyTheme(themeSystem.getCurrentTheme()); // Apply saved theme

        // Setup theme toggle UI
        const themeToggle = document.getElementById('theme-toggle');
        const themeName = document.getElementById('theme-name');
        if (themeToggle && themeName) {
            themeName.textContent = themeSystem.getThemeName();
            themeToggle.addEventListener('click', () => {
                const newTheme = themeSystem.toggleTheme();
                themeName.textContent = themeSystem.getThemeName();
                console.log(`🎨 Switched to ${themeSystem.getThemeName()} theme`);
            });
        }
        console.log('✅ Theme system ready');

        // Initialize Export System
        console.log('Initializing export system...');
        exportSystem = new ExportSystem();
        gifExporter = new GIFExporter(renderer, scene, camera);

        // Setup JSON export
        optionaut4D.liveHUD.onJSONExport(() => {
            const missionData = exportSystem.exportMission({
                rockets,
                camera,
                controls,
                currentSpot,
                currentIV: volSlider.getCurrentIV(),
                currentTheme: themeSystem.getCurrentTheme()
            });
            exportSystem.downloadJSON(missionData);
        });

        // Setup GIF export
        optionaut4D.liveHUD.onGIFExport(async () => {
            const btn = optionaut4D.liveHUD.gifBtn;
            const originalText = btn.textContent;

            try {
                btn.disabled = true;
                btn.textContent = 'Capturing...';

                const blobUrl = await gifExporter.exportToGIF({
                    duration: 3000,
                    fps: 30,
                    width: 800,
                    height: 600,
                    quality: 10,
                    onProgress: (progress) => {
                        btn.textContent = `${Math.round(progress * 100)}%`;
                    }
                });

                gifExporter.downloadGIF(blobUrl);
                btn.textContent = '✓ Done!';

                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }, 2000);

            } catch (error) {
                console.error('GIF export failed:', error);
                btn.textContent = '✗ Failed';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }, 2000);
            }
        });
        console.log('✅ Export system ready');

        // Hide loading elements
        const loadingDiv = document.getElementById('loading');
        const loadingBarContainer = document.getElementById('loading-bar-container');
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (loadingBarContainer) loadingBarContainer.style.display = 'none';
        updateLoadingBar(100);

        // Start animation loop
        animate();
        console.log('Option Rockets scene initialization complete!');
    } catch (error) {
        console.error('Error during scene initialization:', error);
        updateLoadingBar(0);
    }
}

// Create a rocket representing an option
function createRocket(params) {
    const { type, strike, spot, timeToExpiry, iv, entry } = params;
    const greeks = calculateGreeks(spot, strike, timeToExpiry, iv, 0.02, type);

    // Rocket group
    const rocketGroup = new THREE.Group();

    // Enhanced rocket body (cylinder with fins) - larger for visibility
    const rocketScale = 1.5; // Scale up rocket for better visibility
    console.log(`🚀 Creating rocket with scale: ${rocketScale}x`);
    const bodyGeometry = new THREE.CylinderGeometry(0.6 * rocketScale, 0.7 * rocketScale, 3.5 * rocketScale, 16);
    const bodyColor = type === 'call' ? 0x4a90e2 : 0xe24a4a;
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyColor,
        emissiveIntensity: 0.5,
        roughness: 0.3,
        metalness: 0.7
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    rocketGroup.add(body);

    // Rocket nose (cone with tip)
    const noseGeometry = new THREE.ConeGeometry(0.6 * rocketScale, 1.5 * rocketScale, 16);
    const nose = new THREE.Mesh(noseGeometry, bodyMaterial);
    nose.position.x = 3.25 * rocketScale;
    nose.castShadow = true;
    rocketGroup.add(nose);

    // Add fins (3 fins for stability)
    for (let i = 0; i < 3; i++) {
        const finGeometry = new THREE.BoxGeometry(0.1, 0.8, 0.3);
        const fin = new THREE.Mesh(finGeometry, bodyMaterial);
        const angle = (i / 3) * Math.PI * 2;
        fin.position.x = -0.5;
        fin.position.y = Math.cos(angle) * 0.5;
        fin.position.z = Math.sin(angle) * 0.5;
        fin.rotation.z = Math.cos(angle) * 0.3;
        fin.rotation.y = Math.sin(angle) * 0.3;
        rocketGroup.add(fin);
    }

    // Position rocket based on strike (periapsis = closest approach to planet)
    // Strike maps to distance from planet - better scaling
    const strikeDistance = Math.abs(strike - spot) * 3; // Increased scale for better visibility
    const angle = 0; // Start at a fixed angle (0 degrees = positive X axis) for visibility
    // Ensure minimum distance from planet so rocket is visible
    const minDistance = 30; // Minimum 30 units from planet center (planet radius is 10)
    const actualDistance = Math.max(minDistance, strikeDistance);
    const x = Math.cos(angle) * actualDistance;
    const z = Math.sin(angle) * actualDistance;
    const y = Math.max(25, greeks.price * 15); // Height = option price, better scaling, minimum 25 units

    rocketGroup.position.set(x, y, z);
    console.log(`🚀 ===== ROCKET CREATED =====`);
    console.log(`🚀 Position: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
    console.log(`🚀 Strike: ${strike}, Spot: ${spot}, Distance from planet: ${actualDistance.toFixed(2)}`);
    console.log(`🚀 Greeks - Delta: ${greeks.delta.toFixed(3)}, Theta: ${greeks.theta.toFixed(3)}, Price: $${greeks.price.toFixed(2)}`);
    console.log(`🚀 Planet at origin (0, 0, 0), Rocket at X=${x.toFixed(2)}`);

    // Orient rocket based on delta (thrust direction)
    // Simplified orientation - just point forward with slight angle
    const deltaAngle = (greeks.delta - 0.5) * Math.PI * 0.2; // Reduced angle range
    if (type === 'put') {
        rocketGroup.rotation.y = Math.PI; // Puts point downward
    }
    rocketGroup.rotation.z = deltaAngle;
    rocketGroup.rotation.x = 0; // No pitch
    rocketGroup.rotation.order = 'XYZ'; // Set rotation order for stability

    // Create enhanced exhaust trail with particles (scaled to match rocket)
    const exhaustLength = Math.abs(greeks.delta) * 10 * rocketScale;
    const exhaustGeometry = new THREE.ConeGeometry(0.4 * rocketScale, exhaustLength, 8);
    const exhaustColor = type === 'call' ? 0x00ffff : 0xff4444;
    const exhaustMaterial = new THREE.MeshStandardMaterial({
        color: exhaustColor,
        emissive: exhaustColor,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.8
    });
    const exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
    exhaust.position.x = -1.75 * rocketScale - exhaustLength / 2;
    exhaust.rotation.z = Math.PI;
    rocketGroup.add(exhaust);

    // Create particle system for exhaust
    const particleCount = 100;
    const particlesGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const lifetimes = new Float32Array(particleCount);

    const exhaustStartX = -1.75 * rocketScale;
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3] = exhaustStartX;
        positions[i3 + 1] = (Math.random() - 0.5) * 0.8 * rocketScale;
        positions[i3 + 2] = (Math.random() - 0.5) * 0.8 * rocketScale;
        velocities[i3] = -Math.random() * 3 - 1.5;
        velocities[i3 + 1] = (Math.random() - 0.5) * 0.8;
        velocities[i3 + 2] = (Math.random() - 0.5) * 0.8;
        lifetimes[i] = Math.random();
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particlesMaterial = new THREE.PointsMaterial({
        color: exhaustColor,
        size: 0.1,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    particles.userData.velocities = velocities;
    particles.userData.lifetimes = lifetimes;
    particles.userData.resetPosition = () => {
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            positions[i3] = -1.25;
            positions[i3 + 1] = (Math.random() - 0.5) * 0.5;
            positions[i3 + 2] = (Math.random() - 0.5) * 0.5;
            lifetimes[i] = Math.random();
        }
        particlesGeometry.attributes.position.needsUpdate = true;
    };
    rocketGroup.add(particles);
    exhaustParticles.push(particles);

    // Create trajectory line
    const trajectory = createTrajectory(spot, strike, greeks, type);
    rocketGroup.add(trajectory);

    // Add breakeven rings
    const breakeven = strike + (type === 'call' ? entry : -entry);
    const breakevenRing = createBreakevenRing(breakeven, spot, type === 'call' ? 0x00ff00 : 0xff0000);
    scene.add(breakevenRing);
    breakevenRings.push(breakevenRing);

    // Add rocket label
    const label = createRocketLabel(type, strike, greeks.price.toFixed(2));
    label.position.set(x, y + 3, z);
    rocketGroup.add(label);

    scene.add(rocketGroup);
    rockets.push({
        group: rocketGroup,
        params: params,
        greeks: greeks,
        trajectory: trajectory,
        breakevenRing: breakevenRing
    });

    currentRocket = rocketGroup;
    cameraFollowTarget = rocketGroup; // Set as camera follow target

    // Store in rocket state for AI/human interaction
    const rocketId = `rocket_${Date.now()}`;
    rocketState.addRocket({
        id: rocketId,
        type,
        strike,
        spot,
        timeToExpiry,
        iv,
        entry,
        position: { x, y, z }
    });

    rocketGroup.userData.rocketId = rocketId;

    // Add physics properties to rocket with orbital mechanics
    rocketGroup.userData.velocity = new THREE.Vector3(0, 0, 0);
    rocketGroup.userData.acceleration = new THREE.Vector3(0, 0, 0);

    // Thrust system based on Greeks
    rocketGroup.userData.maxThrust = Math.abs(greeks.delta) * 15; // Max thrust based on delta
    rocketGroup.userData.fuel = 1.0; // Start with full fuel (1.0 = 100%)
    rocketGroup.userData.fuelBurnRate = Math.abs(greeks.theta) * 0.01; // Theta = fuel burn rate
    rocketGroup.userData.maxSpeed = 30; // Maximum speed

    // Calculate orbital velocity for stable orbit
    // v = sqrt(GM/r) where G*M is gravitational constant * planet mass
    const distanceFromPlanet = rocketGroup.position.length();
    const gravitationalParameter = 500; // Tuned for visual effect
    const orbitalSpeed = Math.sqrt(gravitationalParameter / distanceFromPlanet);

    // Give rocket initial orbital velocity (perpendicular to radius)
    const radiusVector = rocketGroup.position.clone().normalize();
    const tangentVector = new THREE.Vector3(-radiusVector.z, 0, radiusVector.x).normalize();
    rocketGroup.userData.velocity.copy(tangentVector.multiplyScalar(orbitalSpeed * 0.7)); // 70% of orbital velocity

    // Initialize lastDirection based on rocket's initial orientation (prevents spinning)
    const initialForward = new THREE.Vector3(1, 0, 0);
    initialForward.applyQuaternion(rocketGroup.quaternion);
    rocketGroup.userData.lastDirection = initialForward.clone();

    console.log(`✅ Created ${type} rocket: Strike=${strike}, Price=$${greeks.price.toFixed(2)}, Delta=${greeks.delta.toFixed(3)}`);
    console.log(`✅ Rocket stored in state with ID: ${rocketId}`);
    console.log(`✅ Max thrust: ${rocketGroup.userData.maxThrust.toFixed(2)}, Fuel burn rate: ${rocketGroup.userData.fuelBurnRate.toFixed(4)}`);
    console.log(`✅ Orbital velocity: ${orbitalSpeed.toFixed(2)}, Initial velocity: (${rocketGroup.userData.velocity.x.toFixed(2)}, ${rocketGroup.userData.velocity.y.toFixed(2)}, ${rocketGroup.userData.velocity.z.toFixed(2)})`);
    console.log(`✅ Distance from planet: ${distanceFromPlanet.toFixed(2)}`);

    return rocketGroup;
}

// Create trajectory line showing flight path
function createTrajectory(spot, strike, greeks, type) {
    const points = [];
    const segments = 50;

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // Curved trajectory based on gamma (curvature)
        const x = Math.cos(t * Math.PI * 2) * Math.abs(strike - spot) * 2;
        const y = greeks.price * 10 * (1 - t * 0.5); // Decay over time (theta)
        const z = Math.sin(t * Math.PI * 2) * Math.abs(strike - spot) * 2;
        points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, segments, 0.1, 8, false);
    const material = new THREE.MeshBasicMaterial({
        color: type === 'call' ? 0x4a90e2 : 0xe24a4a,
        transparent: true,
        opacity: 0.3
    });

    return new THREE.Mesh(geometry, material);
}

// Create breakeven ring (escape velocity milestone)
function createBreakevenRing(breakeven, spot, color) {
    const radius = Math.abs(breakeven - spot) * 2;
    const geometry = new THREE.RingGeometry(radius - 0.5, radius + 0.5, 64);
    const material = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    return ring;
}

// Create text label
function createLabel(text, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');

    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    context.font = 'bold 24px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(10, 2.5, 1);
    sprite.position.set(x, y, z);

    return sprite;
}

// Create rocket label
function createRocketLabel(type, strike, price) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');

    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = '#ffffff';
    context.font = 'bold 20px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`${type.toUpperCase()} $${strike}`, canvas.width / 2, canvas.height / 2 - 8);
    context.font = '14px Arial';
    context.fillText(`$${price}`, canvas.width / 2, canvas.height / 2 + 8);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(5, 1.25, 1);

    return sprite;
}

// Create UI controls panel (compact version)
function createControlsPanel() {
    controlsPanel = document.getElementById('controls');
    if (!controlsPanel) return;

    controlsPanel.innerHTML = '';
    controlsPanel.style.cssText = 'position: absolute; top: 10px; right: 10px; z-index: 1000; background: rgba(0, 0, 0, 0.85); padding: 12px; border-radius: 8px; min-width: 200px; max-width: 250px; font-family: Arial, sans-serif; font-size: 11px; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.5);';

    const container = document.createElement('div');

    // Compact title
    const title = document.createElement('div');
    title.textContent = '🚀 Option Rockets';
    title.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; font-weight: bold; color: #4a90e2;';
    container.appendChild(title);

    // Compact grid layout
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: 60px 1fr; gap: 6px 8px; align-items: center;';

    // Option type
    addGridRow(grid, 'Type:', 'select', 'option-type', '<option value="call">Call</option><option value="put">Put</option>');

    // Strike
    addGridRow(grid, 'Strike:', 'number', 'strike-input', '100', '1');

    // Spot
    addGridRow(grid, 'Spot:', 'number', 'spot-input', '100', '1');

    // IV
    addGridRow(grid, 'IV:', 'number', 'iv-input', '0.16', '0.01');

    // DTE
    addGridRow(grid, 'DTE:', 'number', 'dte-input', '1', '1');

    container.appendChild(grid);

    // Launch button
    const launchBtn = document.createElement('button');
    launchBtn.textContent = 'Launch Rocket';
    launchBtn.style.cssText = 'width: 100%; padding: 8px; margin-top: 12px; background: linear-gradient(135deg, #4caf50, #45a049); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; transition: transform 0.1s;';
    launchBtn.onmouseover = () => launchBtn.style.transform = 'scale(1.05)';
    launchBtn.onmouseout = () => launchBtn.style.transform = 'scale(1)';
    launchBtn.addEventListener('click', () => {
        const type = document.getElementById('option-type').value;
        const strike = parseFloat(document.getElementById('strike-input').value);
        const spot = parseFloat(document.getElementById('spot-input').value);
        const iv = parseFloat(document.getElementById('iv-input').value);
        const dte = parseFloat(document.getElementById('dte-input').value);
        const timeToExpiry = dte / 365;

        // KEEP existing rockets - support multi-leg strategies!
        // Don't remove old rockets, just add new ones
        console.log(`🚀 Keeping ${rockets.length} existing rocket(s), launching new one`);

        console.log(`🚀 Launching new rocket: ${type}, Strike=${strike}, Spot=${spot}, IV=${iv}, DTE=${dte}`);

        const newRocket = createRocket({
            type,
            strike,
            spot,
            timeToExpiry,
            iv,
            entry: 0.5
        });

        if (!newRocket) {
            console.error('❌ Failed to create rocket!');
            return;
        }

        // Update camera target to new rocket
        cameraFollowTarget = newRocket;
        currentSpot = spot;
        cameraFollowEnabled = true;

        console.log(`✅ New rocket launched! Camera will follow it.`);
        console.log(`✅ Rocket position: (${newRocket.position.x.toFixed(2)}, ${newRocket.position.y.toFixed(2)}, ${newRocket.position.z.toFixed(2)})`);

        // Immediately reposition camera to new rocket
        const targetPos = newRocket.position.clone();
        const toRocket = targetPos.clone();
        if (toRocket.length() > 0.1) {
            toRocket.normalize();
        } else {
            toRocket.set(1, 0, 0);
        }

        // Zoom out to get good view
        const followDistance = 25;
        const followHeight = 15;
        const idealPosition = targetPos.clone()
            .add(toRocket.multiplyScalar(followDistance))
            .add(new THREE.Vector3(0, followHeight, 0));

        camera.position.copy(idealPosition);
        controls.target.copy(targetPos);
        camera.lookAt(controls.target);

        console.log(`📷 Camera repositioned to follow new rocket at: (${targetPos.x.toFixed(2)}, ${targetPos.y.toFixed(2)}, ${targetPos.z.toFixed(2)})`);
    });
    container.appendChild(launchBtn);

    // Camera follow toggle
    const followLabel = document.createElement('label');
    followLabel.style.cssText = 'display: flex; align-items: center; margin-top: 10px; font-size: 10px; cursor: pointer;';
    const followCheckbox = document.createElement('input');
    followCheckbox.type = 'checkbox';
    followCheckbox.checked = true;
    followCheckbox.style.cssText = 'margin-right: 6px;';
    followCheckbox.addEventListener('change', (e) => {
        cameraFollowEnabled = e.target.checked;
        controls.enabled = !cameraFollowEnabled;
        console.log(`📷 Camera follow: ${cameraFollowEnabled ? 'ENABLED' : 'DISABLED'}`);
        if (!cameraFollowEnabled) {
            console.log(`📷 Manual navigation: WASD/Arrows to move, Mouse drag to look, Q/E up/down`);
        }
    });
    followLabel.appendChild(followCheckbox);
    followLabel.appendChild(document.createTextNode('Follow Rocket'));
    container.appendChild(followLabel);

    // Navigation help
    const helpDiv = document.createElement('div');
    helpDiv.style.cssText = 'margin-top: 10px; padding: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; font-size: 9px; color: #aaa;';
    helpDiv.innerHTML = 'WASD: Move<br>Mouse: Look<br>Q/E: Up/Down';
    container.appendChild(helpDiv);

    controlsPanel.appendChild(container);
}

function addGridRow(grid, labelText, inputType, inputId, defaultValue, step = null) {
    const label = document.createElement('div');
    label.textContent = labelText;
    label.style.cssText = 'font-size: 11px; color: #ccc;';
    grid.appendChild(label);

    let input;
    if (inputType === 'select') {
        input = document.createElement('select');
        input.innerHTML = defaultValue;
    } else {
        input = document.createElement('input');
        input.type = inputType;
        input.value = defaultValue;
        if (step) input.step = step;
    }
    input.id = inputId;
    input.style.cssText = 'padding: 4px; border: 1px solid #444; border-radius: 3px; background: rgba(255,255,255,0.1); color: white; font-size: 11px;';
    grid.appendChild(input);
}

// Setup navigation controls (WASD/Arrows + Mouse)
function setupNavigationControls() {
    // Keyboard controls
    window.addEventListener('keydown', (e) => {
        switch (e.key.toLowerCase()) {
            case 'w': case 'arrowup': moveState.forward = true; break;
            case 's': case 'arrowdown': moveState.backward = true; break;
            case 'a': case 'arrowleft': moveState.left = true; break;
            case 'd': case 'arrowright': moveState.right = true; break;
            case 'q': case ' ': moveState.up = true; break;
            case 'e': case 'shift': moveState.down = true; break;
        }
    });

    window.addEventListener('keyup', (e) => {
        switch (e.key.toLowerCase()) {
            case 'w': case 'arrowup': moveState.forward = false; break;
            case 's': case 'arrowdown': moveState.backward = false; break;
            case 'a': case 'arrowleft': moveState.left = false; break;
            case 'd': case 'arrowright': moveState.right = false; break;
            case 'q': case ' ': moveState.up = false; break;
            case 'e': case 'shift': moveState.down = false; break;
        }
    });

    // Mouse controls
    renderer.domElement.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Left mouse button
            mouseState.isDown = true;
            mouseState.lastX = e.clientX;
            mouseState.lastY = e.clientY;
        }
    });

    renderer.domElement.addEventListener('mouseup', () => {
        mouseState.isDown = false;
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
        if (mouseState.isDown && !cameraFollowEnabled) {
            const dx = e.clientX - mouseState.lastX;
            const dy = e.clientY - mouseState.lastY;

            // Rotate camera
            const spherical = new THREE.Spherical();
            spherical.setFromVector3(camera.position.clone().sub(controls.target));
            spherical.theta -= dx * lookSpeed;
            spherical.phi += dy * lookSpeed;
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

            const newPosition = new THREE.Vector3().setFromSpherical(spherical).add(controls.target);
            camera.position.copy(newPosition);
            camera.lookAt(controls.target);

            mouseState.lastX = e.clientX;
            mouseState.lastY = e.clientY;
        }
    });

    // Prevent context menu
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    console.log('✅ Navigation controls set up: WASD/Arrows to move, Mouse drag to look, Q/E to go up/down');
}

// Update navigation
function updateNavigation(delta) {
    if (cameraFollowEnabled) return; // Don't allow manual navigation when following

    const speed = moveSpeed * delta;
    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();

    // Get camera direction
    camera.getWorldDirection(direction);
    direction.y = 0; // Keep horizontal
    direction.normalize();

    // Get right vector
    right.crossVectors(direction, camera.up).normalize();

    // Apply movement
    if (moveState.forward) camera.position.addScaledVector(direction, speed);
    if (moveState.backward) camera.position.addScaledVector(direction, -speed);
    if (moveState.left) camera.position.addScaledVector(right, -speed);
    if (moveState.right) camera.position.addScaledVector(right, speed);
    if (moveState.up) camera.position.y += speed;
    if (moveState.down) camera.position.y -= speed;

    // Update controls target to maintain look direction
    const lookDirection = new THREE.Vector3();
    camera.getWorldDirection(lookDirection);
    controls.target.copy(camera.position.clone().add(lookDirection.multiplyScalar(10)));
}

// Update camera to follow rocket(s) - keeps them in frame
function updateCameraFollow() {
    if (!cameraFollowEnabled) {
        return;
    }

    // Get all active rockets
    const activeRockets = rockets.filter(r => r.group && r.group.visible);

    if (activeRockets.length === 0) {
        return; // No rockets to follow
    }

    // If we have a specific target, use it; otherwise use the most recent rocket
    let targetRocket = cameraFollowTarget;
    if (!targetRocket || !activeRockets.find(r => r.group === targetRocket)) {
        // Use most recently created rocket
        targetRocket = activeRockets[activeRockets.length - 1].group;
        cameraFollowTarget = targetRocket;
    }

    const targetPos = targetRocket.position.clone();

    // Calculate direction from origin (planet) to rocket
    const toRocket = targetPos.clone();
    if (toRocket.length() < 0.1) {
        toRocket.set(1, 0, 0);
    } else {
        toRocket.normalize();
    }

    // Dynamic camera: zoom out to keep rockets in frame
    // Calculate bounding box of all rockets
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    activeRockets.forEach(rocket => {
        const pos = rocket.group.position;
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
        minZ = Math.min(minZ, pos.z);
        maxZ = Math.max(maxZ, pos.z);
    });

    // Calculate center of all rockets
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const center = new THREE.Vector3(centerX, centerY, centerZ);

    // Calculate size of bounding box
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ, 20); // Minimum 20 units

    // Dynamic follow distance based on rocket spread
    const followDistance = Math.max(15, maxSize * 1.5); // Zoom out to keep all in frame
    const followHeight = Math.max(10, maxSize * 0.8); // Height based on spread

    // Position camera BEHIND the center (away from origin)
    const idealPosition = center.clone()
        .add(toRocket.multiplyScalar(followDistance))
        .add(new THREE.Vector3(0, followHeight, 0));

    // Ensure minimum height
    idealPosition.y = Math.max(idealPosition.y, centerY + 5);

    // Ensure camera is further from origin than rockets (so planet doesn't block)
    const centerDistance = center.length();
    const cameraDistance = idealPosition.length();
    if (cameraDistance <= centerDistance + 5) {
        const direction = idealPosition.clone().normalize();
        idealPosition.copy(direction.multiplyScalar(centerDistance + followDistance + 5));
        idealPosition.y = Math.max(centerY + followHeight, 10);
    }

    // Smooth camera movement
    camera.position.lerp(idealPosition, 0.2);

    // Look at center of all rockets
    controls.target.lerp(center, 0.2);
    camera.lookAt(controls.target);

    // Debug logging (throttled)
    if (Math.random() < 0.01) {
        const distToCenter = camera.position.distanceTo(center);
        console.log(`📷 Following ${activeRockets.length} rocket(s)`);
        console.log(`📷 Camera: (${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})`);
        console.log(`📷 Center: (${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)})`);
        console.log(`📷 Distance to center: ${distToCenter.toFixed(1)}, Follow distance: ${followDistance.toFixed(1)}`);
    }
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();

    // Update camera follow FIRST (if enabled) - this takes priority
    if (cameraFollowEnabled) {
        updateCameraFollow();
    } else {
        // Only allow manual navigation when follow is disabled
        updateNavigation(delta);
    }

    // Update controls (for damping)
    if (controls) {
        controls.update();
    }

    // Animate planet rotation
    if (underlyingPlanet) {
        underlyingPlanet.rotation.y += 0.002;
        // Pulsing glow effect
        const pulse = Math.sin(elapsedTime) * 0.1 + 0.3;
        underlyingPlanet.material.emissiveIntensity = pulse;
    }

    // Animate rockets with orbital physics
    rockets.forEach((rocket, index) => {
        if (rocket.group) {
            const rocketData = rocket.group.userData;

            // Reset acceleration
            rocketData.acceleration.set(0, 0, 0);

            // 1. GRAVITATIONAL ATTRACTION (inverse square law)
            const planetPosition = new THREE.Vector3(0, 0, 0);
            const toPlanet = planetPosition.clone().sub(rocket.group.position);
            const distanceToPlanet = toPlanet.length();

            if (distanceToPlanet > 0.1) {
                // F = GM/r^2, normalized direction
                const gravitationalParameter = 500; // Tuned constant
                const gravityMagnitude = gravitationalParameter / (distanceToPlanet * distanceToPlanet);
                const gravityForce = toPlanet.normalize().multiplyScalar(gravityMagnitude);
                rocketData.acceleration.add(gravityForce);
            }

            // 2. THRUST (based on Delta and remaining fuel)
            if (rocketData.fuel > 0) {
                // Calculate forward direction based on rocket's orientation
                const forward = new THREE.Vector3(1, 0, 0);
                forward.applyQuaternion(rocket.group.quaternion);

                // Apply thrust proportional to fuel remaining
                const currentThrust = rocketData.maxThrust * rocketData.fuel;
                const thrustForce = forward.multiplyScalar(currentThrust * delta);
                rocketData.acceleration.add(thrustForce);

                // Burn fuel (Theta = decay rate)
                rocketData.fuel -= rocketData.fuelBurnRate * delta;
                rocketData.fuel = Math.max(0, rocketData.fuel); // Clamp to 0
            }

            // 3. ATMOSPHERIC DRAG (based on Vega - IV turbulence)
            const dragCoefficient = 0.1;
            const dragForce = rocketData.velocity.clone().multiplyScalar(-dragCoefficient * delta);
            rocketData.acceleration.add(dragForce);

            // 4. Apply acceleration to velocity
            rocketData.velocity.add(rocketData.acceleration.clone().multiplyScalar(delta));

            // Limit maximum speed
            if (rocketData.velocity.length() > rocketData.maxSpeed) {
                rocketData.velocity.normalize().multiplyScalar(rocketData.maxSpeed);
            }

            // 5. Apply velocity to position
            const newPosition = rocket.group.position.clone().add(
                rocketData.velocity.clone().multiplyScalar(delta)
            );

            // Prevent crashing into planet (minimum safe distance)
            const planetRadius = 12;
            const minSafeDistance = planetRadius + 2;
            if (newPosition.length() < minSafeDistance) {
                // Bounce off planet surface
                const normal = newPosition.clone().normalize();
                newPosition.copy(normal.multiplyScalar(minSafeDistance));
                // Reflect velocity
                const velocityAlongNormal = rocketData.velocity.clone().projectOnVector(normal);
                rocketData.velocity.sub(velocityAlongNormal.multiplyScalar(1.5)); // Bounce with damping
            }

            // Update rocket position
            rocket.group.position.copy(newPosition);

            // KEEP ROCKET ORIENTATION FIXED - NO SPINNING
            // Orientation is set at creation and never changes

            // Debug: log rocket movement occasionally
            if (Math.random() < 0.01 && index === 0) { // Log ~1% of frames for first rocket
                const speed = rocketData.velocity.length();
                const distFromPlanet = rocket.group.position.length();
                console.log(`🚀 Rocket #${index}: Pos=(${newPosition.x.toFixed(1)}, ${newPosition.y.toFixed(1)}, ${newPosition.z.toFixed(1)})`);
                console.log(`🚀 Speed: ${speed.toFixed(2)}, Fuel: ${(rocketData.fuel * 100).toFixed(1)}%, Dist from planet: ${distFromPlanet.toFixed(1)}`);
            }

            // Update exhaust particles
            const particles = exhaustParticles[index];
            if (particles) {
                const positions = particles.geometry.attributes.position.array;
                const velocities = particles.userData.velocities;
                const lifetimes = particles.userData.lifetimes;

                for (let i = 0; i < positions.length / 3; i++) {
                    const i3 = i * 3;
                    lifetimes[i] -= delta * 2;

                    if (lifetimes[i] <= 0) {
                        // Reset particle
                        const exhaustStartX = -1.75 * 1.5; // Match rocketScale
                        positions[i3] = exhaustStartX;
                        positions[i3 + 1] = (Math.random() - 0.5) * 0.8 * 1.5;
                        positions[i3 + 2] = (Math.random() - 0.5) * 0.8 * 1.5;
                        lifetimes[i] = 1.0;
                    } else {
                        // Update particle position
                        positions[i3] += velocities[i3] * delta * 3;
                        positions[i3 + 1] += velocities[i3 + 1] * delta;
                        positions[i3 + 2] += velocities[i3 + 2] * delta;
                    }
                }
                particles.geometry.attributes.position.needsUpdate = true;
            }
        }
    });

    // Animate breakeven rings
    if (optionaut4D) {
        optionaut4D.animateRings(elapsedTime);
    }

    // Render scene
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Expose rocket state for AI/human interaction
window.rocketState = rocketState;
window.adjustRocket = function (rocketId, params) {
    const rocket = rockets.find(r => r.group?.userData?.rocketId === rocketId);
    if (!rocket) {
        console.warn(`Rocket ${rocketId} not found`);
        return false;
    }

    // Update state
    rocketState.updateRocketParams(rocketId, params);

    // Update visual rocket if position changed
    if (params.position) {
        rocket.group.position.set(params.position.x, params.position.y, params.position.z);
        console.log(`🚀 Adjusted rocket ${rocketId} position to: (${params.position.x}, ${params.position.y}, ${params.position.z})`);
    }

    // Recalculate if parameters changed
    if (params.strike || params.spot || params.iv || params.timeToExpiry) {
        const newGreeks = calculateGreeks(
            params.spot || rocket.params.spot,
            params.strike || rocket.params.strike,
            params.timeToExpiry || rocket.params.timeToExpiry,
            params.iv || rocket.params.iv,
            0.02,
            params.type || rocket.params.type
        );
        rocket.greeks = newGreeks;
        console.log(`🚀 Recalculated Greeks for rocket ${rocketId}`);
    }

    return true;
};

window.getRocketState = function () {
    return rocketState.export();
};

window.loadRocketState = function (jsonString) {
    return rocketState.import(jsonString);
};

console.log('✅ Rocket state API exposed:');
console.log('   window.rocketState - access rocket state manager');
console.log('   window.adjustRocket(id, params) - adjust rocket position/params');
console.log('   window.getRocketState() - export state as JSON');
console.log('   window.loadRocketState(json) - import state from JSON');

// Handle window resize
window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

// Initialize scene
initScene();

