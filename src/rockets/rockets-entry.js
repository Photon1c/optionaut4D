import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { rocketState } from './rocketState.js';
import { Optionaut4DIntegration } from './optionaut4dIntegration.js';
import { VolSlider } from './volSlider.js';
import { ThemeSystem } from './themeSystem.js';
import { ExportSystem } from './exportSystem.js';
import { GIFExporter } from './gifExporter.js';
import { RocketHUD } from './rocketHUD.js';
import { createRocketModel, createExhaustParticles } from './rocketmodel.js';
import { 
    createMoneynessRocket, 
    createHorizonDome, 
    createStratosphericFog,
    updateRocketAnimation,
    updateExplosion,
    createImpactExplosion
} from './rocketEnhancements.js';
import { calculateProfitLoss, calculateIntrinsicValue, isInTheMoney, calculateBreakeven } from './rocketMetrics.js';

console.log('Option Rockets entry script started');

// Global variables
let scene, camera, renderer, controls, clock;
let underlyingPlanet = null;
let rockets = [];
let trajectoryLines = [];
let breakevenRings = [];
let controlsPanel = null;
let currentSpot = 680; // Underlying price (default SPY price)
let timeToExpiry = 1.0; // Years
let currentRocket = null;
let cameraFollowTarget = null;
let cameraFollowEnabled = false;
let exhaustParticles = [];
let optionaut4D = null; // Optionaut 4D integration
let volSlider = null; // Volatility slider
let themeSystem = null; // Theme system
let exportSystem = null; // Export system
let gifExporter = null; // GIF exporter
let rocketHUD = null; // Per-rocket HUD
let raycaster = null; // For clicking on rockets
let mouse = new THREE.Vector2(); // Mouse position for raycasting
let hoveredGauge = null; // Currently hovered gauge for tooltip
let gaugeTooltips = new Map(); // Map of gauge sprites to tooltip divs
let isInitializing = false; // Prevent multiple initializations
let isInitialized = false; // Track initialization state

// API configuration
const API_BASE_URL = 'http://localhost:5001/api';
let backendAvailable = true; // Track if backend is available (stop trying if not)

// Navigation controls
let moveState = { forward: false, backward: false, left: false, right: false, up: false, down: false };
let mouseState = { isDown: false, lastX: 0, lastY: 0 };
let moveSpeed = 5.0;
let lookSpeed = 0.002;

// Fetch real-time spot price from backend
async function fetchSpotPrice(ticker = 'SPY') {
    // If backend is unavailable, return fallback immediately without trying
    if (!backendAvailable) {
        return 680; // Fallback to default SPY price
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/stock/${ticker}`);
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        const data = await response.json();
        
        // Try multiple possible field names for the price
        const price = data.price || data.current_price || data.last_price || data.close || data.last || data.value;
        
        if (price && typeof price === 'number' && price > 0) {
            console.log(`✅ Fetched ${ticker} price: $${price.toFixed(2)} from API`);
            return price;
        } else {
            // Backend responded but price not found - mark as unavailable and use fallback
            backendAvailable = false;
            console.warn(`⚠️ Backend unavailable: Price not found in API response. Using default price $680.`);
            return 680; // Fallback to default SPY price
        }
    } catch (error) {
        // Backend is not available - mark as unavailable and stop trying
        backendAvailable = false;
        console.warn(`⚠️ Backend unavailable (${API_BASE_URL}). Using default price $680. Price updates disabled.`);
        return 680; // Fallback to default SPY price
    }
}



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
    // Prevent multiple initializations
    if (isInitializing) {
        console.warn('⚠️ Scene initialization already in progress, skipping...');
        return;
    }
    
    // If already initialized, clean up first (handles page reloads)
    if (isInitialized) {
        console.warn('⚠️ Scene already initialized, cleaning up first...');
        cleanupScene();
        // Wait a bit for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    isInitializing = true;
    
    try {
        console.log('Initializing Option Rockets scene');

        // Fetch real spot price (will use fallback if backend unavailable)
        console.log('Fetching real-time spot price...');
        currentSpot = await fetchSpotPrice('SPY');
        if (backendAvailable) {
            console.log(`✅ Current SPY Price: $${currentSpot}`);
        } else {
            console.log(`ℹ️ Using default SPY Price: $${currentSpot} (backend unavailable)`);
        }
        
        // Update LiveHUD immediately with real price
        if (optionaut4D && optionaut4D.liveHUD) {
            optionaut4D.liveHUD.updateSpotPrice(currentSpot, 'SPY');
        }

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
        // Set initial camera position from user preference
        camera.position.set(-8.11, 28.13, 33.51);
        console.log('Camera set up');
        updateLoadingBar(20);

        // Renderer setup
        console.log('Setting up renderer');
        
        // Check if renderer already exists and dispose it properly
        if (renderer) {
            console.warn('⚠️ Existing renderer found, disposing...');
            try {
                // Stop animation loop first
                if (renderer.setAnimationLoop) {
                    renderer.setAnimationLoop(null);
                }
                // Dispose renderer
                renderer.dispose();
                // Remove canvas from DOM
                if (renderer.domElement && renderer.domElement.parentNode) {
                    renderer.domElement.parentNode.removeChild(renderer.domElement);
                }
                renderer = null;
                // Wait a bit for context to be fully released
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
                console.warn('Error disposing existing renderer:', e);
            }
        }
        
        // Check if canvas already exists in body and remove it
        const existingCanvas = document.querySelector('canvas');
        if (existingCanvas && existingCanvas.parentNode) {
            console.warn('⚠️ Existing canvas found, removing...');
            try {
                existingCanvas.parentNode.removeChild(existingCanvas);
                // Wait a bit for context to be fully released
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
                console.warn('Error removing existing canvas:', e);
            }
        }
        
        // Try to create renderer with retry mechanism
        let rendererCreated = false;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (!rendererCreated && retryCount < maxRetries) {
            try {
                renderer = new THREE.WebGLRenderer({
                    antialias: true,
                    powerPreference: "high-performance",
                    preserveDrawingBuffer: false, // Better performance
                    failIfMajorPerformanceCaveat: false // Allow fallback
                });
                
                // Verify context was created
                if (!renderer.getContext()) {
                    throw new Error('WebGL context not available');
                }
                
                // Handle context loss
                renderer.domElement.addEventListener('webglcontextlost', (event) => {
                    console.warn('⚠️ WebGL context lost');
                    event.preventDefault();
                    // Mark as not initialized so we can reinitialize
                    isInitialized = false;
                });
                
                renderer.domElement.addEventListener('webglcontextrestored', () => {
                    console.log('✅ WebGL context restored');
                    // Reinitialize if needed
                    if (!isInitialized) {
                        console.log('🔄 Reinitializing scene after context restore...');
                        initScene();
                    }
                });
                
                renderer.setSize(window.innerWidth, window.innerHeight);
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                document.body.appendChild(renderer.domElement);
                console.log('✅ Renderer set up successfully');
                rendererCreated = true;
                updateLoadingBar(30);
            } catch (error) {
                retryCount++;
                console.warn(`⚠️ Error creating WebGL renderer (attempt ${retryCount}/${maxRetries}):`, error);
                
                if (retryCount < maxRetries) {
                    // Wait longer between retries
                    const waitTime = retryCount * 500; // 500ms, 1000ms, 1500ms
                    console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                    console.error('❌ Failed to create WebGL renderer after', maxRetries, 'attempts');
                    throw new Error(`Error creating WebGL context after ${maxRetries} attempts: ${error.message}`);
                }
            }
        }

        // Scene setup
        console.log('Setting up scene');
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000011); // Deep space
        scene.fog = new THREE.Fog(0x000011, 50, 500);
        
        // Add horizon dome (Truman Show boundary) and stratospheric fog
        console.log('Creating horizon dome and atmospheric effects...');
        const horizonDome = createHorizonDome(scene);
        const stratosphericFog = createStratosphericFog(scene);
        scene.userData.horizonDome = horizonDome;
        scene.userData.stratosphericFog = stratosphericFog;
        
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

        // Add planet label - position below planet to avoid being covered by rockets
        const planetLabel = createLabel('Underlying Price', 0, -planetRadius - 3, 0);
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
        controls.target.set(-5.53, 23.61, 24.97); // Set initial target from user preference
        controls.enabled = true; // Enable manual controls
        camera.lookAt(controls.target); // Look at the target
        console.log('Controls set up');
        updateLoadingBar(80);
        
        // Initialize raycaster for gauge hover detection
        raycaster = new THREE.Raycaster();
        console.log('Raycaster initialized for gauge hover detection');

        // Setup keyboard and mouse navigation
        setupNavigationControls();

        // Create UI controls
        console.log('Creating UI controls');
        createControlsPanel();
        updateLoadingBar(90);
        
        // Create title and info panel
        createTitleAndInfoPanel();

        // Create default rocket (690 SPY Call, 60 DTE, IV 14%)
            const rocket = createRocket({
                type: 'call',
                strike: 690,
                spot: currentSpot,
                timeToExpiry: 60 / 365, // 60 days to expiry
                iv: 0.14, // 14% IV
                entry: 0.5
            });

        // Camera position is set to user preference above, skip automatic repositioning
        // (User has specified initial camera position via display_camera())
        if (rocket) {
            cameraFollowTarget = rocket;
            console.log(`📷 Camera set to user preference position, rocket will be followed if enabled`);
        }

        // Initialize Optionaut 4D Integration (contract parser, HUDs, profit zones)
        console.log('Initializing Optionaut 4D integration...');
        optionaut4D = new Optionaut4DIntegration(scene, createRocket, calculateGreeks);
        optionaut4D.currentSpot = currentSpot;
        optionaut4D.planetRadius = 12;
        optionaut4D.setRocketsArrayRef(rockets, exhaustParticles); // Pass array references for reset
        
        // Expose camera follow variables for Optionaut4D integration
        window.cameraFollowTarget = cameraFollowTarget;
        window.cameraFollowEnabled = cameraFollowEnabled;
        
        // Expose camera and controls for display_camera function
        window._rocketCamera = camera;
        window._rocketControls = controls;
        
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

        // Setup periodic spot price updates for LiveHUD (only if backend is available)
        if (backendAvailable) {
            console.log('Setting up periodic spot price updates...');
            const updateSpotPrice = async () => {
                // Check flag before making request
                if (!backendAvailable) {
                    return; // Stop trying if backend is unavailable
                }
                
                try {
                    const newSpot = await fetchSpotPrice('SPY');
                    // Only update if backend is still available and price changed
                    if (backendAvailable && newSpot && newSpot !== currentSpot && newSpot > 0) {
                        const oldSpot = currentSpot;
                        currentSpot = newSpot;
                        if (optionaut4D) {
                            optionaut4D.currentSpot = newSpot;
                            if (optionaut4D.liveHUD) {
                                optionaut4D.liveHUD.updateSpotPrice(newSpot, 'SPY');
                            }
                        }
                        console.log(`📊 Updated SPY price: $${oldSpot.toFixed(2)} → $${newSpot.toFixed(2)}`);
                    } else if (backendAvailable && newSpot === currentSpot) {
                        // Price unchanged, but log periodically for debugging
                        if (Math.random() < 0.1) { // Log 10% of the time
                            console.log(`📊 SPY price unchanged: $${newSpot.toFixed(2)}`);
                        }
                    }
                } catch (error) {
                    // Error already handled in fetchSpotPrice, just stop trying
                    backendAvailable = false;
                }
            };
            // Update every 5 seconds
            setInterval(updateSpotPrice, 5000);
            console.log('✅ Spot price updates scheduled (every 5 seconds)');
        } else {
            console.log('ℹ️ Backend unavailable - periodic price updates disabled');
        }

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
        updateLoadingBar(100);
        isInitialized = true;
        console.log('✅ Scene initialization complete');
    } catch (error) {
        console.error('❌ Error during scene initialization:', error);
        isInitialized = false;
        updateLoadingBar(0);
        throw error;
    } finally {
        isInitializing = false;
    }
}

// Cleanup function
function cleanupScene() {
    console.log('🧹 Cleaning up scene...');
    
    // Stop animation loop first
    if (renderer) {
        try {
            renderer.setAnimationLoop(null);
        } catch (e) {
            console.warn('Error stopping animation loop:', e);
        }
    }
    
    // Dispose renderer
    if (renderer) {
        try {
            // Get context before disposing
            const context = renderer.getContext();
            if (context) {
                // Force lose context if still active
                const loseContext = context.getExtension('WEBGL_lose_context');
                if (loseContext) {
                    loseContext.loseContext();
                }
            }
            renderer.dispose();
            if (renderer.domElement && renderer.domElement.parentNode) {
                renderer.domElement.parentNode.removeChild(renderer.domElement);
            }
        } catch (e) {
            console.warn('Error disposing renderer:', e);
        }
        renderer = null;
    }
    
    // Remove any remaining canvas elements
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
        try {
            if (canvas.parentNode) {
                canvas.parentNode.removeChild(canvas);
            }
        } catch (e) {
            console.warn('Error removing canvas:', e);
        }
    });
    
    // Clear arrays
    rockets = [];
    trajectoryLines = [];
    breakevenRings = [];
    exhaustParticles = [];
    
    // Reset state
    isInitialized = false;
    isInitializing = false;
    
    console.log('✅ Scene cleaned up');
}

// Create a rocket representing an option
function createRocket(params) {
    const { type, strike, spot, timeToExpiry, iv, entry } = params;
    const greeks = calculateGreeks(spot, strike, timeToExpiry, iv, 0.02, type);

    const rocketScale = 2.125; // Reduced by 15% from 2.5
    console.log(`🚀 Creating rocket with scale: ${rocketScale}x`);
    
    // Create rocket model using the clean model builder
    const exhaustLength = Math.abs(greeks.delta) * 8 * rocketScale;
    
    // Create particle system callback
    const createParticles = (params) => {
        const particles = createExhaustParticles({
            startX: params.startX,
            baseRadius: params.baseRadius,
            color: type === 'call' ? 0x00ffff : 0xff4444,
            count: 150
        });
        exhaustParticles.push(particles);
        return particles;
    };
    
    const rocketGroup = createRocketModel({
        type,
        scale: rocketScale,
        exhaustLength,
        createParticles
    });

    // Position will be set later relative to spot price planet
    // Initial position will be calculated when spot price planet is created

    // Orient rocket based on delta (thrust direction)
    const deltaAngle = (greeks.delta - 0.5) * Math.PI * 0.2;
    if (type === 'put') {
        rocketGroup.rotation.y = Math.PI; // Puts point in opposite direction
    }
    rocketGroup.rotation.z = deltaAngle;
    rocketGroup.rotation.x = 0;
    rocketGroup.rotation.order = 'XYZ';
    
    // Store exhaust parameters for particle animation (from rocket model)
    const exhaustBaseRadius = rocketGroup.userData.exhaustBaseRadius || (0.6 * rocketScale * 0.65);
    rocketGroup.userData.exhaustStartX = 0; // Rocket base
    rocketGroup.userData.exhaustBaseRadius = exhaustBaseRadius;

    // Create trajectory line
    const trajectory = createTrajectory(spot, strike, greeks, type);
    rocketGroup.add(trajectory);

    // Add breakeven rings
    const breakeven = strike + (type === 'call' ? entry : -entry);
    const breakevenRing = createBreakevenRing(breakeven, spot, type === 'call' ? 0x00ff00 : 0xff0000);
    scene.add(breakevenRing);
    breakevenRings.push(breakevenRing);

    // Add launch price line (strike price reference line)
    const launchPriceLine = createLaunchPriceLine(strike, spot, type);
    scene.add(launchPriceLine);
    if (launchPriceLine.userData.label) {
        scene.add(launchPriceLine.userData.label);
    }

    scene.add(rocketGroup);
    // Store spot price and launch price per rocket (like optionaut-app)
    const launchPrice = strike; // Fixed launch/strike price
    const currentSpotPrice = spot; // Current spot price (can change)
    // Premium is the entry price (what was paid to open the position)
    // If entry is provided, use it; otherwise use the initial option price
    const premium = entry !== undefined && entry !== null ? entry : greeks.price;
    
    // Create individual spot price planet for this rocket
    const spotPricePlanet = createSpotPricePlanet(currentSpotPrice, rockets.length);
    const planetAngle = (rockets.length * 60) * (Math.PI / 180); // Space planets around origin
    const planetRadius = 12;
    
    // Spot price planet will be positioned at rocket center (updated in animate loop)
    // Initially position it at origin, will be moved to rocket center
    spotPricePlanet.position.set(0, 0, 0);
    if (spotPricePlanet.userData.label) {
        const labelPlanetRadius = 1.5; // Match the smaller planet size
        spotPricePlanet.userData.label.position.set(0, labelPlanetRadius, 0);
        scene.add(spotPricePlanet.userData.label);
    }
    scene.add(spotPricePlanet);
    
    // Calculate P/L
    const profitLoss = calculateProfitLoss(greeks.price, premium, 1);
    const intrinsicValue = calculateIntrinsicValue(currentSpotPrice, strike, type);
    const isITM = isInTheMoney(currentSpotPrice, strike, type);
    
    // Calculate angle for spacing rockets around spot planet
    const rocketAngle = planetAngle;
    
    // Position rocket relative to its spot price planet (not origin)
    // Use improved scaling with sigmoid-like function for smoother OTM/ATM behavior
    const strikeDiff = Math.abs(strike - currentSpotPrice);
    const strikePercent = strikeDiff / currentSpotPrice; // Percentage difference
    
    // Sigmoid-like scaling: closer to ATM = closer to planet, far OTM = further but bounded
    // Use logarithmic scaling for better distribution
    const baseDistance = Math.log(1 + strikePercent * 10) * 2; // Logarithmic scaling
    const minDistance = 3; // Much closer minimum distance
    const maxDistance = 20; // Reduced max distance
    const actualDistance = Math.max(minDistance, Math.min(maxDistance, baseDistance));
    
    // Determine direction: ITM moves away from planet, OTM moves toward planet
    // For calls: ITM = spot > strike (away), OTM = spot < strike (toward)
    // For puts: ITM = spot < strike (away), OTM = spot > strike (toward)
    const directionMultiplier = isITM ? 1 : -1; // ITM: away (+1), OTM: toward (-1)
    
    // Calculate rocket position based on spot price location
    const spotX = (currentSpotPrice - 680) * 0.3; // Scale spot price to X position (centered around 680)
    const spotZ = Math.sin(rocketAngle) * 20; // Space rockets around
    
    // Rocket position relative to spot price location
    const rocketX = spotX + Math.cos(rocketAngle) * actualDistance * directionMultiplier;
    const rocketZ = spotZ + Math.sin(rocketAngle) * actualDistance * directionMultiplier;
    // Height = option price (scaled appropriately)
    const rocketY = Math.max(15, greeks.price * 20);
    
    rocketGroup.position.set(rocketX, rocketY, rocketZ);
    
    // Update target position
    rocketGroup.userData.targetPosition = new THREE.Vector3(rocketX, rocketY, rocketZ);
    rocketGroup.userData.strikeDistance = actualDistance;
    rocketGroup.userData.angle = rocketAngle;
    rocketGroup.userData.spotPlanetPosition = new THREE.Vector3(rocketX, rocketY, rocketZ); // Planet follows rocket
    rocketGroup.userData.isWarpSpeed = false; // Initialize warp speed flag
    rocketGroup.userData.isWarpSpeed = false; // Initialize warp speed flag
    
    // Create Greek gauges - position ABOVE rocket in horizontal row for better visibility
    // Ensure gauges are well above planet surface (planet radius is 12, so use Y > 20)
    const gaugeHeight = Math.max(rocketY + 8, 25); // Well above rocket, minimum 25 to clear planet
    const gaugeSpacing = 5; // Horizontal spacing between gauges
    const gaugeStartX = rocketX - (gaugeSpacing * 2); // Center the row around rocket (adjusted for 5 gauges)
    
    // Position gauges in a horizontal row above the rocket
    const gaugeY = gaugeHeight;
    const gaugeZ = rocketZ;
    
    const deltaGauge = createGreekGauge('Delta', 'Δ', greeks.delta, greeks.delta > 0 ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)', new THREE.Vector3(gaugeStartX, gaugeY, gaugeZ));
    const gammaGauge = createGreekGauge('Gamma', 'Γ', greeks.gamma, 'rgb(168, 85, 247)', new THREE.Vector3(gaugeStartX + gaugeSpacing, gaugeY, gaugeZ));
    const thetaGauge = createGreekGauge('Theta', 'Θ', Math.abs(greeks.theta), 'rgb(245, 158, 11)', new THREE.Vector3(gaugeStartX + gaugeSpacing * 2, gaugeY, gaugeZ));
    const vegaGauge = createGreekGauge('Vega', 'ν', greeks.vega, 'rgb(59, 130, 246)', new THREE.Vector3(gaugeStartX + gaugeSpacing * 3, gaugeY, gaugeZ));
    const ivGauge = createGreekGauge('IV', 'σ', iv, 'rgb(255, 100, 150)', new THREE.Vector3(gaugeStartX + gaugeSpacing * 4, gaugeY, gaugeZ));
    
    // Ensure gauges are visible
    deltaGauge.visible = true;
    gammaGauge.visible = true;
    thetaGauge.visible = true;
    vegaGauge.visible = true;
    ivGauge.visible = true;
    
    // Make gauges larger for better visibility
    deltaGauge.scale.set(4, 6, 1);
    gammaGauge.scale.set(4, 6, 1);
    thetaGauge.scale.set(4, 6, 1);
    vegaGauge.scale.set(4, 6, 1);
    ivGauge.scale.set(4, 6, 1);
    
    scene.add(deltaGauge);
    scene.add(gammaGauge);
    scene.add(thetaGauge);
    scene.add(vegaGauge);
    scene.add(ivGauge);
    
    // Create hover tooltips for each gauge
    createGaugeTooltip(deltaGauge, 'Delta', 'Price sensitivity to underlying movement');
    createGaugeTooltip(gammaGauge, 'Gamma', 'Rate of change of delta');
    createGaugeTooltip(thetaGauge, 'Theta', 'Time decay (daily)');
    createGaugeTooltip(vegaGauge, 'Vega', 'Sensitivity to volatility changes');
    createGaugeTooltip(ivGauge, 'IV', 'Implied volatility');
    
    console.log(`✅ Created 5 Greek gauges (including IV) for ${type} $${strike} at position (${gaugeStartX.toFixed(2)}, ${gaugeY.toFixed(2)}, ${gaugeZ.toFixed(2)})`);
    
    // Add rocket label (positioned relative to rocket group)
    const label = createRocketLabel(type, strike, greeks.price.toFixed(2));
    label.position.set(0, 3, 0); // Above rocket (relative to group origin)
    rocketGroup.add(label);

    rockets.push({
        group: rocketGroup,
        params: params,
        greeks: greeks,
        trajectory: trajectory,
        breakevenRing: breakevenRing,
        launchPriceLine: launchPriceLine,
        spotPrice: currentSpotPrice, // Per-rocket spot price (like optionaut-app)
        launchPrice: launchPrice, // Fixed launch/strike price for reference line
        premium: premium, // Premium paid (for P/L calculation)
        initialOptionPrice: greeks.price, // Store initial option price for P/L calculation
        profitLoss: profitLoss, // Current P/L
        intrinsicValue: intrinsicValue,
        isITM: isITM,
        spotPricePlanet: spotPricePlanet, // Individual spot price planet
        greekGauges: [deltaGauge, gammaGauge, thetaGauge, vegaGauge, ivGauge], // Greek gauges (including IV)
        launchTime: Date.now() // Track when rocket was launched
    });
    
    // Store premium for P/L calculation (logged only when spot changes significantly)
    
    // Store in rocket group userData for easy access
    rocketGroup.userData.spotPrice = currentSpotPrice;
    rocketGroup.userData.launchPrice = launchPrice;
    rocketGroup.userData.rocketIndex = rockets.length - 1;

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
        position: { x: rocketX, y: rocketY, z: rocketZ }
    });

    rocketGroup.userData.rocketId = rocketId;

    // Add physics properties to rocket with orbital mechanics
    rocketGroup.userData.velocity = new THREE.Vector3(0, 0, 0);
    rocketGroup.userData.acceleration = new THREE.Vector3(0, 0, 0);

            // Thrust system based on Greeks - FURTHER REDUCED to prevent runaway
            rocketGroup.userData.maxThrust = Math.abs(greeks.delta) * 1.5; // Max thrust based on delta (further reduced)
            rocketGroup.userData.fuel = 1.0; // Start with full fuel (1.0 = 100%)
            rocketGroup.userData.fuelBurnRate = Math.abs(greeks.theta) * 0.003; // Theta = fuel burn rate (further reduced)
            rocketGroup.userData.maxSpeed = 5; // Maximum speed (further reduced to prevent runaway)

    // Calculate orbital velocity for stable orbit
    // v = sqrt(GM/r) where G*M is gravitational constant * planet mass
    const distanceFromPlanet = rocketGroup.position.length();
    const gravitationalParameter = 500; // Tuned for visual effect
    const orbitalSpeed = Math.sqrt(gravitationalParameter / distanceFromPlanet);

            // Give rocket minimal initial orbital velocity to prevent runaway
            // Start with zero velocity - let physics take over naturally
            rocketGroup.userData.velocity.set(0, 0, 0); // Start stationary to prevent runaway

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

// Create launch price line (like optionaut-app) - horizontal line at strike price height
function createLaunchPriceLine(strike, currentSpot, type) {
    // Calculate height based on strike price distance from spot
    const priceDistance = Math.abs(strike - currentSpot);
    const height = priceDistance * 2; // Scale factor
    
    // Create a horizontal line/circle at the strike price level
    const radius = Math.abs(strike - currentSpot) * 3; // Horizontal distance
    const geometry = new THREE.RingGeometry(radius - 1, radius + 1, 64);
    const lineColor = type === 'call' ? 0x00ffff : 0xff4444;
    const material = new THREE.MeshBasicMaterial({
        color: lineColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
        emissive: lineColor,
        emissiveIntensity: 0.3
    });
    const lineRing = new THREE.Mesh(geometry, material);
    lineRing.rotation.x = -Math.PI / 2; // Horizontal plane
    lineRing.position.y = height; // At strike price height
    
    // Add label sprite - position it much closer to the ring/globe surface
    // Move label down very close to the ring for better visibility
    const labelYOffset = -4; // Negative to move down much closer to ring surface
    const label = createLabel(`Strike: $${strike}`, 0, height + labelYOffset, 0);
    lineRing.userData.label = label;
    
    return lineRing;
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

// Create individual spot price planet for each rocket (like optionaut-app)
function createSpotPricePlanet(spotPrice, rocketIndex) {
    const planetRadius = 1.5; // 50% smaller - fits on rocket center
    const planetGeometry = new THREE.SphereGeometry(planetRadius, 16, 16);
    const planetMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        emissive: 0x004400,
        emissiveIntensity: 0.6,
        roughness: 0.6,
        metalness: 0.4
    });
    const spotPlanet = new THREE.Mesh(planetGeometry, planetMaterial);
    
    // Position at origin initially (will be updated to rocket center)
    spotPlanet.position.set(0, 0, 0);
    spotPlanet.castShadow = true;
    spotPlanet.receiveShadow = true;
    
    // Add label - position on planet surface (at planet radius, not above it)
    const label = createLabel(`Spot: $${spotPrice.toFixed(2)}`, 0, planetRadius, 0);
    spotPlanet.userData.label = label;
    
    return spotPlanet;
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

// Create hover tooltip for gauge
function createGaugeTooltip(gaugeSprite, name, description) {
    const tooltip = document.createElement('div');
    tooltip.className = 'gauge-tooltip';
    tooltip.style.cssText = `
        position: fixed;
        background: rgba(0, 0, 0, 0.9);
        color: #ffffff;
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid rgba(100, 200, 255, 0.5);
        font-family: Arial, sans-serif;
        font-size: 12px;
        pointer-events: none;
        z-index: 10000;
        display: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.8);
        max-width: 200px;
    `;
    
    tooltip.innerHTML = `
        <div style="font-weight: bold; color: #64c8ff; margin-bottom: 4px;">${name}</div>
        <div style="color: #aaaaaa; font-size: 11px;">${description}</div>
    `;
    
    document.body.appendChild(tooltip);
    gaugeTooltips.set(gaugeSprite, tooltip);
    gaugeSprite.userData.tooltip = tooltip;
    gaugeSprite.userData.tooltipName = name;
}

// Create Greek gauge display (2D sprite with gauge visualization)
function createGreekGauge(name, symbol, value, color, position) {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 120;
    const context = canvas.getContext('2d');

    // Background
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    context.lineWidth = 2;
    context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    // Gauge fill (normalized value 0-1)
    const normalizedValue = Math.min(Math.max(Math.abs(value), 0), 1);
    const fillHeight = normalizedValue * (canvas.height - 20);
    
    // Gradient fill
    const gradient = context.createLinearGradient(0, canvas.height - 20, 0, canvas.height - 20 - fillHeight);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, color.replace(')', ', 0.5)').replace('rgb', 'rgba'));
    context.fillStyle = gradient;
    context.fillRect(10, canvas.height - 10 - fillHeight, canvas.width - 20, fillHeight);

    // Symbol
    context.fillStyle = '#ffffff';
    context.font = 'bold 24px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(symbol, canvas.width / 2, 30);

    // Value
    context.font = 'bold 12px monospace';
    context.fillText(value.toFixed(3), canvas.width / 2, canvas.height - 5);

    // Name
    context.font = '10px Arial';
    context.fillStyle = '#aaaaaa';
    context.fillText(name, canvas.width / 2, 50);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(3, 4.5, 1);
    sprite.position.copy(position);
    sprite.userData.canvas = canvas;
    sprite.userData.name = name;
    sprite.userData.symbol = symbol;
    sprite.userData.color = color;
    sprite.userData.lastValue = value;

    return sprite;
}

// Update Greek gauge display
function updateGreekGauge(sprite, name, symbol, value, color) {
    const canvas = sprite.userData.canvas;
    if (!canvas) return;
    
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    context.lineWidth = 2;
    context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    // Gauge fill (normalized value 0-1)
    const normalizedValue = Math.min(Math.max(Math.abs(value), 0), 1);
    const fillHeight = normalizedValue * (canvas.height - 20);
    
    // Gradient fill
    const gradient = context.createLinearGradient(0, canvas.height - 20, 0, canvas.height - 20 - fillHeight);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, color.replace(')', ', 0.5)').replace('rgb', 'rgba'));
    context.fillStyle = gradient;
    context.fillRect(10, canvas.height - 10 - fillHeight, canvas.width - 20, fillHeight);

    // Symbol
    context.fillStyle = '#ffffff';
    context.font = 'bold 24px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(symbol, canvas.width / 2, 30);

    // Value
    context.font = 'bold 12px monospace';
    context.fillText(value.toFixed(3), canvas.width / 2, canvas.height - 5);

    // Name
    context.font = '10px Arial';
    context.fillStyle = '#aaaaaa';
    context.fillText(name, canvas.width / 2, 50);

    sprite.material.map.needsUpdate = true;
    sprite.userData.lastValue = value;
}

// Create UI controls panel (compact version)
function createControlsPanel() {
    controlsPanel = document.getElementById('controls');
    if (!controlsPanel) {
        console.warn('⚠️ Controls panel element not found!');
        return;
    }

    controlsPanel.innerHTML = '';
    
    // Check if top bar exists (for manual version) and adjust positioning
    const topBar = document.getElementById('top-bar');
    const topOffset = topBar ? '70px' : '10px';
    
    controlsPanel.style.cssText = `position: fixed; top: ${topOffset}; right: 10px; z-index: 1000; background: rgba(0, 0, 0, 0.85); padding: 12px; border-radius: 8px; min-width: 200px; max-width: 250px; font-family: Arial, sans-serif; font-size: 11px; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.5); border: 1px solid rgba(74, 144, 226, 0.3);`;
    
    console.log('✅ Controls panel created at top:', topOffset);

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
    addGridRow(grid, 'Strike:', 'number', 'strike-input', '690', '1');

    // Spot
    addGridRow(grid, 'Spot:', 'number', 'spot-input', '690', '1');

    // IV
    addGridRow(grid, 'IV:', 'number', 'iv-input', '0.14', '0.01');

    // DTE
    addGridRow(grid, 'DTE:', 'number', 'dte-input', '60', '1');

    container.appendChild(grid);

    // Launch button
    const launchBtn = document.createElement('button');
    launchBtn.textContent = 'Launch Rocket';
    launchBtn.style.cssText = 'width: 100%; padding: 8px; margin-top: 12px; background: linear-gradient(135deg, #4caf50, #45a049); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; transition: transform 0.1s;';
    launchBtn.onmouseover = () => launchBtn.style.transform = 'scale(1.05)';
    launchBtn.onmouseout = () => launchBtn.style.transform = 'scale(1)';
    launchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        try {
            // Get input values
            const typeEl = document.getElementById('option-type');
            const strikeEl = document.getElementById('strike-input');
            const spotEl = document.getElementById('spot-input');
            const ivEl = document.getElementById('iv-input');
            const dteEl = document.getElementById('dte-input');
            
            // Validate elements exist
            if (!typeEl || !strikeEl || !spotEl || !ivEl || !dteEl) {
                console.error('❌ Control inputs not found!', { typeEl, strikeEl, spotEl, ivEl, dteEl });
                alert('Error: Control inputs not found. Please refresh the page.');
                return;
            }
            
            const type = typeEl.value || 'call';
            const strike = parseFloat(strikeEl.value) || 100;
            const spot = parseFloat(spotEl.value) || 100;
            const iv = parseFloat(ivEl.value) || 0.16;
            const dte = parseFloat(dteEl.value) || 1;
        const timeToExpiry = dte / 365;

            // Validate inputs
            if (isNaN(strike) || isNaN(spot) || isNaN(iv) || isNaN(dte)) {
                console.error('❌ Invalid input values', { strike, spot, iv, dte });
                alert('Please enter valid numbers for all fields.');
                return;
            }

        // KEEP existing rockets - support multi-leg strategies!
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
                alert('Failed to create rocket. Check console for details.');
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
            
            // Update rockets list UI to show new rocket's spot price slider
            if (window.updateRocketsListUI) {
                window.updateRocketsListUI();
            }
        } catch (error) {
            console.error('❌ Error launching rocket:', error);
            alert(`Error launching rocket: ${error.message}`);
        }
    });
    container.appendChild(launchBtn);

    // Camera follow toggle
    const followLabel = document.createElement('label');
    followLabel.style.cssText = 'display: flex; align-items: center; margin-top: 10px; font-size: 10px; cursor: pointer;';
    const followCheckbox = document.createElement('input');
    followCheckbox.type = 'checkbox';
    followCheckbox.checked = false;
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
    
    // Rockets list container (for per-rocket spot price sliders)
    const rocketsListContainer = document.createElement('div');
    rocketsListContainer.id = 'rockets-list';
    rocketsListContainer.style.cssText = 'margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(74, 144, 226, 0.3); max-height: 400px; overflow-y: auto;';
    container.appendChild(rocketsListContainer);
    
    // Function to update rockets list UI
    window.updateRocketsListUI = function() {
        updateRocketsListUI();
    };
    
    function updateRocketsListUI() {
        if (!rocketsListContainer) return;
        rocketsListContainer.innerHTML = '';
        
        if (rockets.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.textContent = 'No rockets launched yet';
            emptyMsg.style.cssText = 'text-align: center; color: #666; font-size: 10px; padding: 10px;';
            rocketsListContainer.appendChild(emptyMsg);
            return;
        }
        
        rockets.forEach((rocket, index) => {
            const rocketCard = createRocketSpotSlider(rocket, index);
            rocketsListContainer.appendChild(rocketCard);
        });
    }

    controlsPanel.appendChild(container);
    
    // Update rockets list periodically
    setInterval(updateRocketsListUI, 1000);
    updateRocketsListUI(); // Initial update
}

// Create spot price slider for individual rocket
function createRocketSpotSlider(rocket, index) {
    const card = document.createElement('div');
    card.style.cssText = 'margin-bottom: 10px; padding: 8px; background: rgba(74, 144, 226, 0.1); border-radius: 4px; border: 1px solid rgba(74, 144, 226, 0.3);';
    
    const params = rocket.params || {};
    const strike = params.strike || 100;
    const type = params.type || 'call';
    const currentSpot = rocket.spotPrice !== undefined ? rocket.spotPrice : (params.spot || 100);
    
    // Title
    const title = document.createElement('div');
    title.textContent = `${type.toUpperCase()} $${strike}`;
    title.style.cssText = 'font-size: 11px; font-weight: bold; color: #4a90e2; margin-bottom: 6px;';
    card.appendChild(title);
    
    // Spot price slider
    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    
    const sliderLabel = document.createElement('label');
    sliderLabel.textContent = 'Spot:';
    sliderLabel.style.cssText = 'font-size: 10px; color: #aaa; min-width: 35px;';
    sliderContainer.appendChild(sliderLabel);
    
    const slider = document.createElement('input');
    slider.type = 'range';
    // Even range centered on strike - ensure smooth slider movement
    const range = 50; // ±50 from strike for good range
    slider.min = Math.max(0, strike - range);
    slider.max = strike + range;
    slider.step = 1.0; // Smooth step size (1 dollar increments)
    slider.value = currentSpot;
    slider.style.cssText = 'flex: 1; height: 4px;';
    slider.addEventListener('input', (e) => {
        const newSpot = parseFloat(e.target.value);
        updateRocketSpotPrice(index, newSpot);
        spotDisplay.textContent = `$${newSpot.toFixed(2)}`;
    });
    sliderContainer.appendChild(slider);
    
    const spotDisplay = document.createElement('span');
    spotDisplay.textContent = `$${currentSpot.toFixed(2)}`;
    spotDisplay.style.cssText = 'font-size: 10px; color: #00ff00; font-weight: bold; min-width: 60px; text-align: right; font-family: monospace;';
    sliderContainer.appendChild(spotDisplay);
    
    card.appendChild(sliderContainer);
    
    // P/L display
    const plDisplay = document.createElement('div');
    plDisplay.style.cssText = 'margin-top: 6px; font-size: 11px; font-family: monospace;';
    const updatePLDisplay = () => {
        const currentSpot = rocket.spotPrice !== undefined ? rocket.spotPrice : (params.spot || 100);
        // P/L calculation: premium is the entry price (what was paid to open the position)
        let premium = rocket.premium;
        if (premium === undefined || premium === null || isNaN(premium) || premium <= 0) {
            premium = params.entry;
            if (premium === undefined || premium === null || isNaN(premium) || premium <= 0) {
                premium = rocket.initialOptionPrice;
                if (premium === undefined || premium === null || isNaN(premium) || premium <= 0) {
                    premium = greeks.price; // Last resort
                }
            }
        }
        premium = Math.max(0.01, premium); // Ensure valid positive number
        const greeks = rocket.greeks || calculateGreeks(currentSpot, strike, params.timeToExpiry || 0.0027, params.iv || 0.16, 0.02, type);
        const profitLoss = calculateProfitLoss(greeks.price, premium, 1);
        const isITM = isInTheMoney(currentSpot, strike, type);
        plDisplay.innerHTML = `P/L: <span style="color: ${profitLoss >= 0 ? '#00ff00' : '#ff4444'}; font-weight: bold;">${profitLoss >= 0 ? '+' : ''}$${profitLoss.toFixed(2)}</span> <span style="color: ${isITM ? '#00ff00' : '#888'}; font-size: 10px;">(${isITM ? 'ITM' : 'OTM'})</span>`;
    };
    updatePLDisplay();
    card.appendChild(plDisplay);
    
    // Update P/L when slider changes
    slider.addEventListener('input', () => {
        setTimeout(updatePLDisplay, 50); // Small delay to let animation loop update Greeks
    });
    
    return card;
}

// Update rocket spot price and recalculate position/Greeks
function updateRocketSpotPrice(rocketIndex, newSpotPrice) {
    if (rocketIndex < 0 || rocketIndex >= rockets.length) return;
    
    const rocket = rockets[rocketIndex];
    rocket.spotPrice = newSpotPrice;
    
    // Update stored spot price in rocket group
    if (rocket.group) {
        rocket.group.userData.spotPrice = newSpotPrice;
    }
    
    // Recalculate Greeks with new spot price
    const params = rocket.params;
    const newGreeks = calculateGreeks(
        newSpotPrice,
        params.strike,
        params.timeToExpiry,
        params.iv,
        0.02,
        params.type
    );
    rocket.greeks = newGreeks;
    
    console.log(`📊 Updated rocket #${rocketIndex} spot price to $${newSpotPrice.toFixed(2)}`);
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
    
    // Handle 'i' key for info panel (separate handler to avoid conflicts)
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'i' && !e.target.matches('input, textarea, select')) {
            e.preventDefault();
            toggleInfoPanel();
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
        // Always update mouse position for gauge hover detection
        mouseState.lastX = e.clientX;
        mouseState.lastY = e.clientY;
        
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

// Update camera to follow rocket(s) - centers on the followed rocket
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

    // Calculate direction from camera to rocket for optimal viewing angle
    const cameraToRocket = targetPos.clone().sub(camera.position);
    const distanceToRocket = cameraToRocket.length();
    
    // Optimal viewing distance: close enough to see details, far enough to see context
    const optimalDistance = 30;
    const minDistance = 15;
    const maxDistance = 60;
    
    // Calculate ideal camera position - offset from rocket at good viewing angle
    const viewAngle = Math.PI / 6; // 30 degrees above horizontal
    const viewAzimuth = Math.PI / 4; // 45 degrees around
    
    // Calculate offset vector
    const offsetX = Math.cos(viewAzimuth) * Math.cos(viewAngle) * optimalDistance;
    const offsetY = Math.sin(viewAngle) * optimalDistance;
    const offsetZ = Math.sin(viewAzimuth) * Math.cos(viewAngle) * optimalDistance;
    
    const idealPosition = new THREE.Vector3(
        targetPos.x + offsetX,
        targetPos.y + offsetY,
        targetPos.z + offsetZ
    );

    // Ensure minimum height above planet (don't go below ground)
    idealPosition.y = Math.max(idealPosition.y, 20);

    // Smooth camera movement - faster when far away
    const lerpSpeed = distanceToRocket > 50 ? 0.3 : 0.15;
    camera.position.lerp(idealPosition, lerpSpeed);

    // Look directly at the rocket (not center of all rockets)
    controls.target.lerp(targetPos, lerpSpeed);
    camera.lookAt(controls.target);

    // Debug logging (throttled)
    if (Math.random() < 0.01) {
        const distToRocket = camera.position.distanceTo(targetPos);
        console.log(`📷 Following rocket at: (${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)}, ${targetPos.z.toFixed(1)})`);
        console.log(`📷 Camera: (${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})`);
        console.log(`📷 Distance to rocket: ${distToRocket.toFixed(1)}`);
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

    // Animate spot price planets rotation
    rockets.forEach((rocket) => {
        if (rocket.spotPricePlanet) {
            rocket.spotPricePlanet.rotation.y += 0.002;
            const pulse = Math.sin(elapsedTime + rocket.spotPricePlanet.position.x * 0.1) * 0.1 + 0.4;
            rocket.spotPricePlanet.material.emissiveIntensity = pulse;
        }
    });

    // Update rockets based on spot price (anchored positioning like optionaut-app)
    rockets.forEach((rocket, index) => {
        if (rocket.group) {
            // Get current spot price for this rocket
            const currentSpot = rocket.spotPrice !== undefined ? rocket.spotPrice : rocket.params.spot;
            const strike = rocket.params.strike;
            // P/L calculation: premium is the entry price (what was paid to open the position)
            // Priority: stored premium > params.entry > initialOptionPrice > current price as last resort
            let premium = rocket.premium;
            if (premium === undefined || premium === null || isNaN(premium) || premium <= 0) {
                premium = rocket.params.entry;
                if (premium === undefined || premium === null || isNaN(premium) || premium <= 0) {
                    premium = rocket.initialOptionPrice;
                    if (premium === undefined || premium === null || isNaN(premium) || premium <= 0) {
                        // Last resort: use current price (but this means P/L will be 0 initially)
                        premium = newGreeks.price;
                    }
                }
            }
            // Ensure premium is a valid positive number
            premium = Math.max(0.01, premium); // Minimum 1 cent
            
            // Recalculate Greeks with current spot price
            const newGreeks = calculateGreeks(
                currentSpot,
                strike,
                rocket.params.timeToExpiry,
                rocket.params.iv,
                0.02,
                rocket.params.type
            );
            rocket.greeks = newGreeks;
            
            // Update P/L calculation
            const newProfitLoss = calculateProfitLoss(newGreeks.price, premium, 1);
            const newIntrinsicValue = calculateIntrinsicValue(currentSpot, strike, rocket.params.type);
            const newIsITM = isInTheMoney(currentSpot, strike, rocket.params.type);
            rocket.profitLoss = newProfitLoss;
            rocket.intrinsicValue = newIntrinsicValue;
            rocket.isITM = newIsITM;
            
            // Clear P/L calculation logging (only log when spot changes significantly)
            if (!rocket.lastLoggedSpot || Math.abs(rocket.lastLoggedSpot - currentSpot) > 5) {
                console.log(`💰 P/L Calculation for ${rocket.params.type.toUpperCase()} $${strike}:`);
                console.log(`   Premium Paid: $${premium.toFixed(2)} (entry price when position opened)`);
                console.log(`   Current Option Price: $${newGreeks.price.toFixed(2)} (Black-Scholes at spot $${currentSpot.toFixed(2)})`);
                console.log(`   P/L Formula: (Current Price - Premium) × 100 = ($${newGreeks.price.toFixed(2)} - $${premium.toFixed(2)}) × 100`);
                console.log(`   Profit/Loss: $${newProfitLoss >= 0 ? '+' : ''}${newProfitLoss.toFixed(2)}`);
                console.log(`   Status: ${newIsITM ? 'ITM' : 'OTM'} | Delta: ${newGreeks.delta.toFixed(3)}`);
                rocket.lastLoggedSpot = currentSpot;
            }
            
            // Position rocket relative to its spot price planet (not origin)
            // Use improved scaling with sigmoid-like function for smoother OTM/ATM behavior
            const strikeDiff = Math.abs(strike - currentSpot);
            const strikePercent = strikeDiff / currentSpot; // Percentage difference
            
            // Sigmoid-like scaling: closer to ATM = closer to planet, far OTM = further but bounded
            // Use logarithmic scaling for better distribution
            const baseDistance = Math.log(1 + strikePercent * 10) * 2; // Logarithmic scaling
            const minDistance = 3; // Much closer minimum distance
            const maxDistance = 20; // Reduced max distance
            const actualDistance = Math.max(minDistance, Math.min(maxDistance, baseDistance));
            const angle = rocket.group.userData.angle || (index * 60) * (Math.PI / 180);
            
            // Determine direction: ITM moves away from spot price, OTM moves toward spot price
            // For calls: ITM = spot > strike (away), OTM = spot < strike (toward)
            // For puts: ITM = spot < strike (away), OTM = spot > strike (toward)
            const isITM = (rocket.params.type === 'call' && currentSpot > strike) || (rocket.params.type === 'put' && currentSpot < strike);
            // Fixed: OTM should move toward spot (negative), ITM should move away (positive)
            // When OTM: spot < strike for calls or spot > strike for puts, rocket should be closer to spot (lower Y)
            const directionMultiplier = isITM ? 1 : -1; // ITM: away (+1), OTM: toward (-1)
            
            // Calculate spot price location in 3D space
            const spotX = (currentSpot - 680) * 0.3; // Scale spot price to X position (centered around 680)
            const spotZ = Math.sin(angle) * 20; // Space rockets around
            const spotY = Math.max(15, newGreeks.price * 20); // Spot price height (same as option price)
            
            // Rocket position relative to spot price location
            // When OTM (directionMultiplier = -1), rocket moves toward spot (closer, lower)
            // When ITM (directionMultiplier = 1), rocket moves away from spot (further, higher)
            const targetX = spotX + Math.cos(angle) * actualDistance * directionMultiplier;
            const targetZ = spotZ + Math.sin(angle) * actualDistance * directionMultiplier;
            // Height = option price (scaled appropriately)
            // OTM options should be lower (closer to spot), ITM options should be higher (further from spot)
            // Fixed: Invert the logic - OTM should move DOWN (negative offset), ITM should move UP (positive offset)
            const baseHeight = Math.max(15, newGreeks.price * 20);
            // When OTM: move DOWN (negative), when ITM: move UP (positive)
            const heightOffset = isITM ? actualDistance * 0.5 : -actualDistance * 0.5; // ITM higher, OTM lower
            const targetY = baseHeight + heightOffset;
            
            const targetPosition = new THREE.Vector3(targetX, targetY, targetZ);
            
            // Update spot price planet position - position right before the top cone
            if (rocket.spotPricePlanet) {
                // Calculate rocket's forward direction in world space
                const rocketForward = new THREE.Vector3(1, 0, 0); // Rocket's local +X direction
                rocketForward.applyQuaternion(rocket.group.quaternion);
                
                // Get rocket dimensions
                const rocketLength = rocket.group.userData.rocketLength || (4.7 * 2.125); // bodyLength + noseLength
                const bodyLength = 3.5 * 2.125; // Body length from rocket model
                const noseLength = 1.2 * 2.125; // Nose length from rocket model
                
                // Position planet closer to nose cone (at junction of body and nose, or slightly into nose)
                // Front of body is at bodyLength/2, nose starts at bodyLength, so position at bodyLength + small offset
                const offsetFromCenter = (bodyLength / 2) + (noseLength * 0.2); // Closer to nose cone
                const planetOffset = rocketForward.clone().multiplyScalar(offsetFromCenter);
                const planetPosition = targetPosition.clone().add(planetOffset);
                
                // Smooth movement - use same lerp speed as rocket movement to keep them connected
                const planetLerpSpeed = 15.0 * delta;
                rocket.spotPricePlanet.position.lerp(planetPosition, planetLerpSpeed);
                
                // Update planet label - position on planet surface (above planet)
                if (rocket.spotPricePlanet.userData.label) {
                    const labelPlanetRadius = 1.5; // Match the smaller planet size
                    rocket.spotPricePlanet.userData.label.position.lerp(
                        new THREE.Vector3(planetPosition.x, planetPosition.y + labelPlanetRadius, planetPosition.z),
                        10.0 * delta
                    );
                    
                    // Update label text
                    const labelSprite = rocket.spotPricePlanet.userData.label;
                    if (labelSprite.material && labelSprite.material.map) {
                        const canvas = labelSprite.material.map.image;
                        if (canvas) {
                            const context = canvas.getContext('2d');
                            context.clearRect(0, 0, canvas.width, canvas.height);
                            context.fillStyle = 'rgba(0, 0, 0, 0.7)';
                            context.fillRect(0, 0, canvas.width, canvas.height);
                            context.fillStyle = '#00ff00';
                            context.font = 'bold 16px Arial';
                            context.textAlign = 'center';
                            context.textBaseline = 'middle';
                            context.fillText(`Spot: $${currentSpot.toFixed(2)}`, canvas.width / 2, canvas.height / 2);
                            labelSprite.material.map.needsUpdate = true;
                        }
                    }
                }
                
                // Store spot planet position for rocket positioning (same as rocket position now)
                rocket.group.userData.spotPlanetPosition = targetPosition.clone();
            }
            
            // Check for extreme ITM (warp speed condition) - delta > 0.9 for calls, delta < -0.9 for puts
            // For calls: extreme ITM when delta > 0.9
            // For puts: extreme ITM when delta < -0.9
            const deltaValue = rocket.params.type === 'call' ? newGreeks.delta : -newGreeks.delta;
            const extremeITM = deltaValue > 0.9;
            const wasExtremeITM = rocket.group.userData.isWarpSpeed || false;
            rocket.group.userData.isWarpSpeed = extremeITM;
            
            // Check for deeply OTM (crash condition) - delta < 0.15 for calls/puts (more lenient threshold)
            const deeplyOTM = Math.abs(newGreeks.delta) < 0.15;
            const wasDeeplyOTM = rocket.group.userData.wasDeeplyOTM || false;
            rocket.group.userData.wasDeeplyOTM = deeplyOTM;
            
            // Debug OTM crash detection (throttled)
            if (deeplyOTM && Math.random() < 0.05) {
                console.log(`⚠️ Deeply OTM detected: Delta=${newGreeks.delta.toFixed(3)}, Distance to planet=${targetPosition.distanceTo(rocket.spotPricePlanet ? rocket.spotPricePlanet.position : targetPosition).toFixed(2)}`);
            }
            
            // When deeply OTM, make rocket move toward planet (crash trajectory)
            if (deeplyOTM && !rocket.group.userData.hasCrashed) {
                const planetPos = rocket.spotPricePlanet ? rocket.spotPricePlanet.position : targetPosition;
                const planetRadius = 1.5;
                const distanceToPlanet = targetPosition.distanceTo(planetPos);
                
                // Apply stronger gravity effect - pull rocket toward planet with increasing force
                const deltaMagnitude = Math.abs(newGreeks.delta);
                const gravityStrength = 0.8 + (0.15 - deltaMagnitude) * 5; // Much stronger as delta approaches 0
                const directionToPlanet = planetPos.clone().sub(targetPosition).normalize();
                const gravityPull = directionToPlanet.multiplyScalar(gravityStrength * delta * 20);
                targetPosition.add(gravityPull);
                
                // Add spinning/tumbling effect as rocket falls
                rocket.group.rotation.x += delta * 1.5;
                rocket.group.rotation.y += delta * 1.2;
                rocket.group.rotation.z += delta * 1.8;
                
                // Trigger crash when rocket is very close to planet (more lenient threshold)
                if (distanceToPlanet < planetRadius + 3) {
                    rocket.group.userData.hasCrashed = true;
                    
                    // Create dramatic colored impact explosion at planet surface
                    const crashPosition = planetPos.clone();
                    const explosion = createImpactExplosion(crashPosition, 400); // Even more particles
                    scene.add(explosion);
                    rocket.group.userData.explosion = explosion;
                    
                    // Add dramatic red damage glow to rocket with pulsing
                    rocket.group.traverse((child) => {
                        if (child.isMesh && child.material) {
                            if (child.material.emissive !== undefined) {
                                if (!child.userData.originalEmissive) {
                                    child.userData.originalEmissive = child.material.emissive.getHex();
                                }
                                child.material.emissive.setHex(0xff0000);
                                child.material.emissiveIntensity = 1.2;
                            }
                        }
                    });
                    
                    // Make rocket tumble/rotate when crashed
                    rocket.group.userData.isCrashed = true;
                    rocket.group.userData.crashTime = elapsedTime;
                    
                    // Snap rocket to planet surface
                    targetPosition.copy(planetPos);
                    
                    // Add continuous smoke trail effect
                    if (!rocket.group.userData.crashSmoke) {
                        // Create animated smoke particles at crash site
                        const smokeGeometry = new THREE.BufferGeometry();
                        const smokeCount = 100;
                        const smokePositions = new Float32Array(smokeCount * 3);
                        const smokeVelocities = new Float32Array(smokeCount * 3);
                        for (let i = 0; i < smokeCount * 3; i += 3) {
                            smokePositions[i] = crashPosition.x + (Math.random() - 0.5) * 3;
                            smokePositions[i + 1] = crashPosition.y + Math.random() * 1;
                            smokePositions[i + 2] = crashPosition.z + (Math.random() - 0.5) * 3;
                            // Upward velocity
                            smokeVelocities[i] = (Math.random() - 0.5) * 0.5;
                            smokeVelocities[i + 1] = Math.random() * 0.8 + 0.2;
                            smokeVelocities[i + 2] = (Math.random() - 0.5) * 0.5;
                        }
                        smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
                        const smokeMaterial = new THREE.PointsMaterial({
                            color: 0x333333,
                            size: 0.8,
                            transparent: true,
                            opacity: 0.7,
                            blending: THREE.NormalBlending
                        });
                        const smoke = new THREE.Points(smokeGeometry, smokeMaterial);
                        smoke.userData.positions = smokePositions;
                        smoke.userData.velocities = smokeVelocities;
                        scene.add(smoke);
                        rocket.group.userData.crashSmoke = smoke;
                    }
                    
                    console.log(`💥 Rocket crashed into planet! Delta: ${newGreeks.delta.toFixed(3)}, Distance: ${distanceToPlanet.toFixed(2)}`);
                }
            }
            
            // Apply crash rotation/tumbling if crashed
            if (rocket.group.userData.isCrashed) {
                // More dramatic tumbling with acceleration
                const crashAge = elapsedTime - (rocket.group.userData.crashTime || elapsedTime);
                const tumbleSpeed = 2.0 + crashAge * 0.5; // Accelerating tumble
                rocket.group.rotation.x += delta * tumbleSpeed;
                rocket.group.rotation.y += delta * (tumbleSpeed * 0.9);
                rocket.group.rotation.z += delta * (tumbleSpeed * 1.1);
                
                // Pulsing red glow
                rocket.group.traverse((child) => {
                    if (child.isMesh && child.material && child.material.emissiveIntensity !== undefined) {
                        child.material.emissiveIntensity = 1.0 + Math.sin(elapsedTime * 8) * 0.4;
                    }
                });
                
                // Animate smoke particles
                if (rocket.group.userData.crashSmoke && rocket.group.userData.crashSmoke.userData.positions) {
                    const smoke = rocket.group.userData.crashSmoke;
                    const positions = smoke.userData.positions;
                    const velocities = smoke.userData.velocities;
                    for (let i = 0; i < positions.length; i += 3) {
                        positions[i] += velocities[i] * delta;
                        positions[i + 1] += velocities[i + 1] * delta;
                        positions[i + 2] += velocities[i + 2] * delta;
                        // Fade out over time
                        velocities[i + 1] *= 0.98; // Slow down
                    }
                    smoke.geometry.attributes.position.needsUpdate = true;
                }
            }
            
            // Handle warp drive animation when deeply ITM (but don't stray too far)
            if (extremeITM && !wasExtremeITM) {
                // Just entered warp speed - activate effects
                rocket.group.userData.warpEffect = true;
                
                // Add dramatic blue warp glow with pulsing
                rocket.group.traverse((child) => {
                    if (child.isMesh && child.material) {
                        if (child.material.emissive !== undefined) {
                            if (!child.userData.originalEmissive) {
                                child.userData.originalEmissive = child.material.emissive.getHex();
                            }
                            child.material.emissive.setHex(0x00aaff);
                            child.material.emissiveIntensity = 1.5;
                        }
                    }
                });
                
                // Create warp trail particles with colors
                if (!rocket.group.userData.warpTrail) {
                    const trailGeometry = new THREE.BufferGeometry();
                    const trailCount = 150; // More particles for better trail
                    const trailPositions = new Float32Array(trailCount * 3);
                    const trailColors = new Float32Array(trailCount * 3);
                    for (let i = 0; i < trailCount * 3; i += 3) {
                        trailPositions[i] = targetPosition.x;
                        trailPositions[i + 1] = targetPosition.y;
                        trailPositions[i + 2] = targetPosition.z;
                        // Blue/cyan colors with variation
                        trailColors[i] = 0.0; // R
                        trailColors[i + 1] = 0.6 + Math.random() * 0.4; // G
                        trailColors[i + 2] = 1.0; // B
                    }
                    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
                    trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
                    const trailMaterial = new THREE.PointsMaterial({
                        size: 0.4,
                        vertexColors: true,
                        transparent: true,
                        opacity: 0.9,
                        blending: THREE.AdditiveBlending
                    });
                    const trail = new THREE.Points(trailGeometry, trailMaterial);
                    scene.add(trail);
                    rocket.group.userData.warpTrail = trail;
                    rocket.group.userData.trailPositions = trailPositions;
                    rocket.group.userData.trailColors = trailColors;
                }
                
                console.log(`🚀 Warp drive engaged! Delta: ${newGreeks.delta.toFixed(3)}, Type: ${rocket.params.type}`);
            } else if (!extremeITM && wasExtremeITM) {
                // Just exited warp speed - disable effects
                rocket.group.userData.warpEffect = false;
                rocket.group.traverse((child) => {
                    if (child.isMesh && child.material && child.userData.originalEmissive !== undefined) {
                        child.material.emissive.setHex(child.userData.originalEmissive);
                        child.material.emissiveIntensity = 0.5;
                    }
                });
                
                // Remove warp trail
                if (rocket.group.userData.warpTrail) {
                    scene.remove(rocket.group.userData.warpTrail);
                    rocket.group.userData.warpTrail.geometry.dispose();
                    rocket.group.userData.warpTrail.material.dispose();
                    rocket.group.userData.warpTrail = null;
                }
                
                console.log(`🚀 Warp drive disengaged. Delta: ${newGreeks.delta.toFixed(3)}`);
            }
            
            // Apply warp speed animation (pulsing, rotation, but limit distance from planet)
            if (extremeITM) {
                // More dramatic pulsing effect with multiple frequencies
                const pulse1 = Math.sin(elapsedTime * 8) * 0.12;
                const pulse2 = Math.sin(elapsedTime * 15) * 0.08;
                const pulse = 1.0 + pulse1 + pulse2;
                rocket.group.scale.set(pulse, pulse, pulse);
                
                // Faster rotation effect with wobble
                const rotationSpeed = 1.2 + Math.sin(elapsedTime * 6) * 0.3;
                rocket.group.rotation.x += delta * rotationSpeed;
                rocket.group.rotation.z += delta * (rotationSpeed * 0.9);
                rocket.group.rotation.y += delta * Math.sin(elapsedTime * 4) * 0.2; // Wobble
                
                // Update warp trail with fading
                if (rocket.group.userData.warpTrail && rocket.group.userData.trailPositions) {
                    const trailPositions = rocket.group.userData.trailPositions;
                    const trailColors = rocket.group.userData.trailColors;
                    
                    // Shift trail positions backward and fade
                    for (let i = trailPositions.length - 3; i > 0; i -= 3) {
                        trailPositions[i] = trailPositions[i - 3];
                        trailPositions[i + 1] = trailPositions[i - 2];
                        trailPositions[i + 2] = trailPositions[i - 1];
                        
                        // Fade colors
                        if (trailColors) {
                            const fadeFactor = i / trailPositions.length;
                            trailColors[i] = 0.0; // R
                            trailColors[i + 1] = 0.5 * fadeFactor; // G
                            trailColors[i + 2] = 1.0 * fadeFactor; // B
                        }
                    }
                    // Add new position at front with full brightness
                    trailPositions[0] = targetPosition.x;
                    trailPositions[1] = targetPosition.y;
                    trailPositions[2] = targetPosition.z;
                    if (trailColors) {
                        trailColors[0] = 0.0;
                        trailColors[1] = 0.7 + Math.random() * 0.3;
                        trailColors[2] = 1.0;
                    }
                    rocket.group.userData.warpTrail.geometry.attributes.position.needsUpdate = true;
                    if (trailColors) {
                        rocket.group.userData.warpTrail.geometry.attributes.color.needsUpdate = true;
                    }
                }
                
                // Enhanced emissive pulsing with color shift
                rocket.group.traverse((child) => {
                    if (child.isMesh && child.material && child.material.emissiveIntensity !== undefined) {
                        const warpPulse = Math.sin(elapsedTime * 12) * 0.5 + 1.5;
                        child.material.emissiveIntensity = warpPulse;
                        
                        // Slight color shift toward cyan/white
                        if (child.material.emissive) {
                            const colorShift = Math.sin(elapsedTime * 8) * 0.1;
                            const r = Math.min(1.0, 0.0 + colorShift);
                            const g = Math.min(1.0, 0.7 + colorShift);
                            const b = 1.0;
                            child.material.emissive.setRGB(r, g, b);
                        }
                    }
                });
                
                // Add velocity lines effect (streak effect)
                if (!rocket.group.userData.warpStreaks) {
                    const streakGeometry = new THREE.BufferGeometry();
                    const streakCount = 20;
                    const streakPositions = new Float32Array(streakCount * 6); // Start and end points
                    for (let i = 0; i < streakCount; i++) {
                        const angle = (i / streakCount) * Math.PI * 2;
                        const radius = 2;
                        const startIdx = i * 6;
                        streakPositions[startIdx] = targetPosition.x;
                        streakPositions[startIdx + 1] = targetPosition.y;
                        streakPositions[startIdx + 2] = targetPosition.z;
                        streakPositions[startIdx + 3] = targetPosition.x + Math.cos(angle) * radius;
                        streakPositions[startIdx + 4] = targetPosition.y + Math.sin(angle) * radius;
                        streakPositions[startIdx + 5] = targetPosition.z;
                    }
                    streakGeometry.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3));
                    const streakMaterial = new THREE.LineBasicMaterial({
                        color: 0x00aaff,
                        transparent: true,
                        opacity: 0.6
                    });
                    const streaks = new THREE.LineSegments(streakGeometry, streakMaterial);
                    scene.add(streaks);
                    rocket.group.userData.warpStreaks = streaks;
                } else {
                    // Update streak positions
                    const streaks = rocket.group.userData.warpStreaks;
                    const positions = streaks.geometry.attributes.position.array;
                    for (let i = 0; i < positions.length; i += 6) {
                        positions[i] = targetPosition.x;
                        positions[i + 1] = targetPosition.y;
                        positions[i + 2] = targetPosition.z;
                    }
                    streaks.geometry.attributes.position.needsUpdate = true;
                }
                
                // Ensure rocket doesn't stray too far from planet (limit max distance)
                const maxDistanceFromPlanet = 25; // Don't go further than 25 units
                const planetPos = rocket.spotPricePlanet ? rocket.spotPricePlanet.position : new THREE.Vector3(0, 0, 0);
                const distanceFromPlanet = targetPosition.distanceTo(planetPos);
                if (distanceFromPlanet > maxDistanceFromPlanet) {
                    // Scale back position to stay within bounds
                    const direction = targetPosition.clone().sub(planetPos).normalize();
                    targetPosition.copy(planetPos).add(direction.multiplyScalar(maxDistanceFromPlanet));
                }
            } else {
                // Reset scale when not in warp
                rocket.group.scale.lerp(new THREE.Vector3(1, 1, 1), 5 * delta);
                
                // Remove warp streaks if they exist
                if (rocket.group.userData.warpStreaks) {
                    scene.remove(rocket.group.userData.warpStreaks);
                    rocket.group.userData.warpStreaks.geometry.dispose();
                    rocket.group.userData.warpStreaks.material.dispose();
                    rocket.group.userData.warpStreaks = null;
                }
            }
            
            // Smoothly move rocket to target position
            const moveSpeed = extremeITM ? 20.0 : 10.0; // Faster movement when in warp speed
            rocket.group.position.lerp(targetPosition, moveSpeed * delta);
            
            // Update spot planet position to follow rocket
            rocket.group.userData.spotPlanetPosition = targetPosition.clone();
            
            // Update orientation based on delta (tilt)
            const deltaAngle = (newGreeks.delta - 0.5) * Math.PI * 0.2;
            const targetRotation = rocket.params.type === 'put' ? Math.PI : 0;
            rocket.group.rotation.y = THREE.MathUtils.lerp(rocket.group.rotation.y, targetRotation, 5 * delta);
            rocket.group.rotation.z = THREE.MathUtils.lerp(rocket.group.rotation.z, deltaAngle, 5 * delta);
            
            // Enhanced moneyness-based animation (if rocket has moneyness data)
            if (rocket.group.userData.moneyness) {
                updateRocketAnimation(rocket.group, elapsedTime, delta);
            }
            
            // Update explosion effects if present
            if (rocket.group.userData.explosion) {
                updateExplosion(rocket.group.userData.explosion, delta);
            }
            
            // Store updated target position
            rocket.group.userData.targetPosition = targetPosition;
            
            // Update Greek gauges - position ABOVE rocket in horizontal row
            if (rocket.greekGauges && rocket.greekGauges.length >= 5) {
                const [deltaGauge, gammaGauge, thetaGauge, vegaGauge, ivGauge] = rocket.greekGauges;
                // Ensure gauges are well above planet surface (planet radius is 12, so use Y > 20)
                const gaugeHeight = Math.max(targetY + 8, 25); // Well above rocket, minimum 25 to clear planet
                const gaugeSpacing = 5; // Horizontal spacing between gauges
                const gaugeStartX = targetX - (gaugeSpacing * 2); // Center the row around rocket (adjusted for 5 gauges)
                
                // Position gauges in a horizontal row above the rocket
                const gaugeY = gaugeHeight;
                const gaugeZ = targetZ;
                
                // Update gauge positions (horizontal row - 5 gauges now)
                deltaGauge.position.lerp(new THREE.Vector3(gaugeStartX, gaugeY, gaugeZ), 10.0 * delta);
                gammaGauge.position.lerp(new THREE.Vector3(gaugeStartX + gaugeSpacing, gaugeY, gaugeZ), 10.0 * delta);
                thetaGauge.position.lerp(new THREE.Vector3(gaugeStartX + gaugeSpacing * 2, gaugeY, gaugeZ), 10.0 * delta);
                vegaGauge.position.lerp(new THREE.Vector3(gaugeStartX + gaugeSpacing * 3, gaugeY, gaugeZ), 10.0 * delta);
                ivGauge.position.lerp(new THREE.Vector3(gaugeStartX + gaugeSpacing * 4, gaugeY, gaugeZ), 10.0 * delta);
                
                // Update gauge values (recreate sprites if values changed significantly)
                // For performance, we'll update periodically or on significant change
                if (Math.abs(newGreeks.delta - (deltaGauge.userData.lastValue || 0)) > 0.01) {
                    updateGreekGauge(deltaGauge, 'Delta', 'Δ', newGreeks.delta, newGreeks.delta > 0 ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)');
                    deltaGauge.userData.lastValue = newGreeks.delta;
                }
                if (Math.abs(newGreeks.gamma - (gammaGauge.userData.lastValue || 0)) > 0.001) {
                    updateGreekGauge(gammaGauge, 'Gamma', 'Γ', newGreeks.gamma, 'rgb(168, 85, 247)');
                    gammaGauge.userData.lastValue = newGreeks.gamma;
                }
                if (Math.abs(Math.abs(newGreeks.theta) - (thetaGauge.userData.lastValue || 0)) > 0.01) {
                    updateGreekGauge(thetaGauge, 'Theta', 'Θ', Math.abs(newGreeks.theta), 'rgb(245, 158, 11)');
                    thetaGauge.userData.lastValue = Math.abs(newGreeks.theta);
                }
                if (Math.abs(newGreeks.vega - (vegaGauge.userData.lastValue || 0)) > 0.01) {
                    updateGreekGauge(vegaGauge, 'Vega', 'ν', newGreeks.vega, 'rgb(59, 130, 246)');
                    vegaGauge.userData.lastValue = newGreeks.vega;
                }
                // Update IV gauge (IV comes from params, not Greeks)
                const currentIV = rocket.params.iv || 0.16;
                if (Math.abs(currentIV - (ivGauge.userData.lastValue || 0)) > 0.001) {
                    updateGreekGauge(ivGauge, 'IV', 'σ', currentIV, 'rgb(255, 100, 150)');
                    ivGauge.userData.lastValue = currentIV;
                }
            }

            // Animate exhaust cone based on delta/thrust
            const exhaustCone = rocket.group.userData.exhaustCone;
            if (exhaustCone && exhaustCone.material) {
                // Calculate thrust intensity based on delta (0-1 range)
                const deltaMagnitude = Math.abs(newGreeks.delta);
                const thrustIntensity = Math.min(deltaMagnitude * 1.5, 1.0); // Scale delta to 0-1
                
                // Pulsing effect: combine base intensity with time-based pulse
                const pulseSpeed = 8.0; // How fast it pulses
                const pulseAmount = 0.15; // How much it pulses (15%)
                const pulse = Math.sin(elapsedTime * pulseSpeed) * pulseAmount + 1.0;
                
                // Dynamic exhaust length based on thrust
                const baseLength = exhaustCone.userData.baseLength || 5.0;
                const lengthMultiplier = 0.7 + (thrustIntensity * 0.5); // 0.7x to 1.2x
                const currentLength = baseLength * lengthMultiplier * pulse;
                
                // Dynamic exhaust radius based on thrust
                const baseTipRadius = exhaustCone.userData.baseTipRadius || 1.0;
                const radiusMultiplier = 0.8 + (thrustIntensity * 0.4); // 0.8x to 1.2x
                const currentRadius = baseTipRadius * radiusMultiplier * pulse;
                
                // Update exhaust geometry (recreate if size changed significantly)
                if (!exhaustCone.userData.lastLength || Math.abs(exhaustCone.userData.lastLength - currentLength) > 0.1) {
                    const newGeometry = new THREE.ConeGeometry(currentRadius, currentLength, 12);
                    exhaustCone.geometry.dispose();
                    exhaustCone.geometry = newGeometry;
                    exhaustCone.position.x = -currentLength / 2; // Reposition to keep tip at rocket base
                    exhaustCone.userData.lastLength = currentLength;
                }
                
                // Animate emissive intensity and opacity based on thrust
                const baseEmissive = 0.9;
                const baseOpacity = 0.75;
                const intensityVariation = thrustIntensity * 0.3; // Up to 30% variation
                exhaustCone.material.emissiveIntensity = baseEmissive + (intensityVariation * pulse);
                exhaustCone.material.opacity = baseOpacity + (thrustIntensity * 0.2 * pulse);
                
                // Add slight flicker for realism
                const flicker = (Math.random() - 0.5) * 0.05; // Small random variation
                exhaustCone.material.emissiveIntensity = Math.max(0.5, exhaustCone.material.emissiveIntensity + flicker);
                
                // Warp speed effect for extreme ITM (delta > 0.9)
                if (rocket.group.userData.isWarpSpeed) {
                    // Intensify exhaust for warp speed
                    exhaustCone.material.emissiveIntensity = Math.min(2.0, exhaustCone.material.emissiveIntensity * 1.5);
                    exhaustCone.material.opacity = Math.min(1.0, exhaustCone.material.opacity * 1.2);
                    
                    // Add pulsing glow effect
                    const warpPulse = Math.sin(elapsedTime * 15) * 0.3 + 1.0;
                    exhaustCone.material.emissiveIntensity *= warpPulse;
                    
                    // Make exhaust longer and wider for warp effect
                    const warpLengthMultiplier = 1.5;
                    const warpRadiusMultiplier = 1.3;
                    if (!exhaustCone.userData.warpGeometry) {
                        const warpGeometry = new THREE.ConeGeometry(
                            currentRadius * warpRadiusMultiplier,
                            currentLength * warpLengthMultiplier,
                            12
                        );
                        exhaustCone.geometry.dispose();
                        exhaustCone.geometry = warpGeometry;
                        exhaustCone.position.x = -(currentLength * warpLengthMultiplier) / 2;
                        exhaustCone.userData.warpGeometry = true;
                    }
                } else {
                    // Reset to normal geometry when not in warp
                    if (exhaustCone.userData.warpGeometry) {
                        const normalGeometry = new THREE.ConeGeometry(currentRadius, currentLength, 12);
                        exhaustCone.geometry.dispose();
                        exhaustCone.geometry = normalGeometry;
                        exhaustCone.position.x = -currentLength / 2;
                        exhaustCone.userData.warpGeometry = false;
                    }
                }
            }
            
            // Add warp speed visual effects (particle trails, speed lines)
            if (rocket.group.userData.isWarpSpeed) {
                // Add glowing trail effect
                if (!rocket.group.userData.warpTrail) {
                    const trailGeometry = new THREE.ConeGeometry(0.5, 8, 8);
                    const trailMaterial = new THREE.MeshBasicMaterial({
                        color: 0x00ffff,
                        transparent: true,
                        opacity: 0.6,
                        emissive: 0x00ffff,
                        emissiveIntensity: 1.0
                    });
                    const warpTrail = new THREE.Mesh(trailGeometry, trailMaterial);
                    warpTrail.rotation.z = Math.PI / 2;
                    warpTrail.position.set(-4, 0, 0); // Behind rocket
                    rocket.group.add(warpTrail);
                    rocket.group.userData.warpTrail = warpTrail;
                }
                
                // Animate warp trail
                if (rocket.group.userData.warpTrail) {
                    const trail = rocket.group.userData.warpTrail;
                    trail.material.opacity = 0.4 + Math.sin(elapsedTime * 20) * 0.3;
                    trail.material.emissiveIntensity = 1.0 + Math.sin(elapsedTime * 20) * 0.5;
                    trail.scale.y = 1.0 + Math.sin(elapsedTime * 15) * 0.3;
                }
            } else {
                // Remove warp trail when not in warp speed
                if (rocket.group.userData.warpTrail) {
                    rocket.group.remove(rocket.group.userData.warpTrail);
                    rocket.group.userData.warpTrail.geometry.dispose();
                    rocket.group.userData.warpTrail.material.dispose();
                    rocket.group.userData.warpTrail = null;
                }
            }

            // Update exhaust particles
            const particles = exhaustParticles[index];
            if (particles) {
                const positions = particles.geometry.attributes.position.array;
                const velocities = particles.userData.velocities;
                const lifetimes = particles.userData.lifetimes;
                const rocketData = rocket.group.userData;

                for (let i = 0; i < positions.length / 3; i++) {
                    const i3 = i * 3;
                    lifetimes[i] -= delta * 2;

                    if (lifetimes[i] <= 0) {
                        // Reset particle at exhaust base
                        const exhaustStartX = rocketData.exhaustStartX !== undefined ? rocketData.exhaustStartX : 0;
                        const exhaustBaseRadius = rocketData.exhaustBaseRadius !== undefined ? rocketData.exhaustBaseRadius : 1.0;
                        positions[i3] = exhaustStartX;
                        // Random position within exhaust base radius
                        const radius = Math.random() * exhaustBaseRadius;
                        const angle = Math.random() * Math.PI * 2;
                        positions[i3 + 1] = Math.cos(angle) * radius;
                        positions[i3 + 2] = Math.sin(angle) * radius;
                        lifetimes[i] = 1.0;
                    } else {
                        // Update particle position - velocity based on thrust
                        const deltaMagnitude = Math.abs(newGreeks.delta);
                        const thrustMultiplier = 0.5 + (deltaMagnitude * 1.5); // Scale particle speed with thrust
                        positions[i3] += velocities[i3] * delta * 3 * thrustMultiplier;
                        positions[i3 + 1] += velocities[i3 + 1] * delta * thrustMultiplier;
                        positions[i3 + 2] += velocities[i3 + 2] * delta * thrustMultiplier;
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
    
    // Update per-rocket HUD if visible
    if (rocketHUD && rocketHUD.visible) {
        rocketHUD.update();
    }

    // Handle gauge hover detection
    handleGaugeHover();

    // Render scene
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Handle mouse hover over gauges for tooltips
function handleGaugeHover() {
    if (!raycaster || !camera || !renderer) return;
    
    // Update mouse position from current mouse state
    const rect = renderer.domElement.getBoundingClientRect();
    if (mouseState.lastX && mouseState.lastY) {
        mouse.x = ((mouseState.lastX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((mouseState.lastY - rect.top) / rect.height) * 2 + 1;
    } else {
        return; // No mouse position available
    }
    
    // Update raycaster
    raycaster.setFromCamera(mouse, camera);
    
    // Collect all gauge sprites
    const allGauges = [];
    rockets.forEach(rocket => {
        if (rocket.greekGauges) {
            allGauges.push(...rocket.greekGauges);
        }
    });
    
    if (allGauges.length === 0) return;
    
    // Find intersections
    const intersects = raycaster.intersectObjects(allGauges, false);
    
    // Hide all tooltips first
    gaugeTooltips.forEach((tooltip, gauge) => {
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    });
    
    // Show tooltip for hovered gauge
    if (intersects.length > 0) {
        const hoveredGaugeSprite = intersects[0].object;
        const tooltip = gaugeTooltips.get(hoveredGaugeSprite);
        
        if (tooltip) {
            // Get screen position of gauge
            const vector = new THREE.Vector3();
            vector.setFromMatrixPosition(hoveredGaugeSprite.matrixWorld);
            vector.project(camera);
            
            const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
            
            // Position tooltip near gauge
            tooltip.style.left = (x + 20) + 'px';
            tooltip.style.top = (y - 10) + 'px';
            tooltip.style.display = 'block';
            hoveredGauge = hoveredGaugeSprite;
        }
    } else {
        hoveredGauge = null;
    }
}

// Handle clicking on rockets
function onRocketClick(event) {
    if (!raycaster || !camera || !renderer) return;
    
    // Calculate mouse position in normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update raycaster
    raycaster.setFromCamera(mouse, camera);
    
    // Get all rocket groups
    const rocketGroups = rockets.map(r => r.group).filter(g => g);
    
    // Find intersections
    const intersects = raycaster.intersectObjects(rocketGroups, true);
    
    if (intersects.length > 0) {
        // Find which rocket was clicked
        let clickedRocket = null;
        let clickedRocketData = null;
        
        for (const intersect of intersects) {
            // Traverse up to find the rocket group
            let obj = intersect.object;
            while (obj && obj.parent) {
                if (rocketGroups.includes(obj)) {
                    clickedRocket = obj;
                    break;
                }
                obj = obj.parent;
            }
            if (clickedRocket) break;
        }
        
        if (clickedRocket) {
            // Find rocket data
            clickedRocketData = rockets.find(r => r.group === clickedRocket);
            
            if (clickedRocketData && rocketHUD) {
                // Get Greeks from rocket data or userData
                const greeks = clickedRocketData.greeks || clickedRocket.userData.greeks || {};
                const params = clickedRocketData.params || clickedRocket.userData.params || {};
                rocketHUD.show(clickedRocket, greeks, params);
                console.log(`🎯 Clicked on rocket: ${params.type} $${params.strike}`);
            }
        }
    } else {
        // Clicked on empty space - hide HUD
        if (rocketHUD) {
            rocketHUD.hide();
        }
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

// Display camera coordinates function
window.display_camera = function() {
    // Get camera and controls from window (exposed during initialization)
    const cam = window._rocketCamera;
    const ctrl = window._rocketControls;
    
    if (!cam) {
        console.error('❌ Camera not initialized. Make sure the scene has loaded.');
        console.error('   Try waiting a moment after page load, then call display_camera() again.');
        return null;
    }
    
    if (!ctrl) {
        console.error('❌ Controls not initialized. Make sure the scene has loaded.');
        console.error('   Try waiting a moment after page load, then call display_camera() again.');
        return null;
    }
    
    const pos = cam.position.clone();
    const target = ctrl.target.clone();
    
    // Calculate rotation from position and target
    const direction = new THREE.Vector3().subVectors(target, pos).normalize();
    const distance = pos.distanceTo(target);
    const spherical = new THREE.Spherical();
    spherical.setFromVector3(direction);
    
    const cameraInfo = {
        position: {
            x: parseFloat(pos.x.toFixed(2)),
            y: parseFloat(pos.y.toFixed(2)),
            z: parseFloat(pos.z.toFixed(2))
        },
        target: {
            x: parseFloat(target.x.toFixed(2)),
            y: parseFloat(target.y.toFixed(2)),
            z: parseFloat(target.z.toFixed(2))
        },
        rotation: {
            theta: parseFloat((spherical.theta * 180 / Math.PI).toFixed(2)),
            phi: parseFloat((spherical.phi * 180 / Math.PI).toFixed(2)),
            radius: parseFloat(distance.toFixed(2))
        },
        // Copy-paste ready code
        code: `camera.position.set(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)});\ncontrols.target.set(${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)});\ncontrols.update();`
    };
    
    console.log('📷 ===== CAMERA INFORMATION =====');
    console.log('Position:', cameraInfo.position);
    console.log('Target:', cameraInfo.target);
    console.log('Distance:', cameraInfo.rotation.radius);
    console.log('Rotation (spherical):', { theta: cameraInfo.rotation.theta + '°', phi: cameraInfo.rotation.phi + '°' });
    console.log('\n📋 Copy-paste code to restore camera:');
    console.log(cameraInfo.code);
    console.log('================================');
    
    return cameraInfo;
};

// Create title and info panel
function createTitleAndInfoPanel() {
    // Create title at top center
    const title = document.createElement('div');
    title.id = 'rocket-title';
    title.textContent = '🚀 Optionaut 4D';
    title.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 32px;
        font-weight: bold;
        color: #4a90e2;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
        z-index: 1000;
        pointer-events: none;
        font-family: Arial, sans-serif;
    `;
    document.body.appendChild(title);
    
    // Create info panel
    const infoPanel = document.createElement('div');
    infoPanel.id = 'info-panel';
    infoPanel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 600px;
        max-height: 80vh;
        background: rgba(0, 0, 0, 0.95);
        color: #ffffff;
        font-family: Arial, sans-serif;
        padding: 30px;
        border-radius: 12px;
        border: 3px solid #4a90e2;
        z-index: 2000;
        overflow-y: auto;
        display: none;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    `;
    
    infoPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 style="color: #4a90e2; margin: 0; font-size: 24px;">🚀 Optionaut 4D - Information</h2>
            <button id="close-info" style="
                background: #4a90e2;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: bold;
                font-size: 14px;
            ">Close (I)</button>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h3 style="color: #00ffff; margin: 10px 0;">🎯 What is Optionaut 4D?</h3>
            <p style="line-height: 1.6; font-size: 14px;">
                Optionaut 4D is an interactive 3D visualization of options trading. Each rocket represents an option contract,
                with its position, movement, and thrust based on the option's Greeks (Delta, Gamma, Theta, Vega).
            </p>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h3 style="color: #00ff00; margin: 10px 0;">🌍 Scene Elements</h3>
            <ul style="line-height: 1.8; font-size: 14px;">
                <li><strong>Blue Planet (Center):</strong> Represents the underlying asset price (SPY)</li>
                <li><strong>Green Planets:</strong> Individual spot price planets for each rocket</li>
                <li><strong>Rockets:</strong> Option contracts - position shows strike vs spot, height shows option price</li>
                <li><strong>Greek Gauges:</strong> Display Delta, Gamma, Theta, and Vega values above each rocket</li>
                <li><strong>Cyan Exhaust:</strong> Thrust intensity based on Delta (option sensitivity)</li>
            </ul>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h3 style="color: #ffaa00; margin: 10px 0;">📊 Understanding the Visualization</h3>
            <ul style="line-height: 1.8; font-size: 14px;">
                <li><strong>ITM (In-The-Money):</strong> Rockets move away from their planet</li>
                <li><strong>OTM (Out-The-Money):</strong> Rockets move toward their planet (can "crash" into it)</li>
                <li><strong>Rocket Height:</strong> Option premium/price</li>
                <li><strong>Exhaust Intensity:</strong> Delta magnitude (price sensitivity)</li>
                <li><strong>Rocket Position:</strong> Strike price distance from spot price</li>
            </ul>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h3 style="color: #ff00ff; margin: 10px 0;">🎮 Controls</h3>
            <ul style="line-height: 1.8; font-size: 14px;">
                <li><strong>WASD / Arrow Keys:</strong> Move camera</li>
                <li><strong>Q / Space:</strong> Move camera up</li>
                <li><strong>E / Shift:</strong> Move camera down</li>
                <li><strong>Mouse Drag:</strong> Rotate camera (when follow disabled)</li>
                <li><strong>I Key:</strong> Toggle this information panel</li>
                <li><strong>Hover over Gauges:</strong> See tooltips with Greek explanations</li>
            </ul>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h3 style="color: #ffff00; margin: 10px 0;">🔧 Console Functions</h3>
            <ul style="line-height: 1.8; font-size: 14px;">
                <li><strong>display_camera():</strong> Show current camera coordinates</li>
                <li><strong>window.rocketState:</strong> Access rocket state manager</li>
                <li><strong>window.adjustRocket(id, params):</strong> Adjust rocket parameters</li>
            </ul>
        </div>
        
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #4a90e2;">
            <p style="color: #888; font-size: 12px; margin: 0;">
                Press <strong>I</strong> to close this panel
            </p>
        </div>
    `;
    
    document.body.appendChild(infoPanel);
    
    // Close button handler
    const closeBtn = document.getElementById('close-info');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            toggleInfoPanel();
        });
    }
    
    // ESC key to close
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && infoPanel.style.display === 'block') {
            toggleInfoPanel();
        }
    });
}

// Toggle info panel
function toggleInfoPanel() {
    const infoPanel = document.getElementById('info-panel');
    if (!infoPanel) return;
    
    if (infoPanel.style.display === 'none' || infoPanel.style.display === '') {
        infoPanel.style.display = 'block';
    } else {
        infoPanel.style.display = 'none';
    }
}

console.log('✅ Rocket state API exposed:');
console.log('   window.rocketState - access rocket state manager');
console.log('   window.adjustRocket(id, params) - adjust rocket position/params');
console.log('   window.getRocketState() - export state as JSON');
console.log('   window.loadRocketState(json) - import state from JSON');
console.log('   window.display_camera() - display current camera coordinates');

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

