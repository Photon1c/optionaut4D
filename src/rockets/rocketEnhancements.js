/**
 * Rocket Enhancements - Surreal, narrative-driven financial visualizations
 * ITM: Warp-capable starships toward horizon dome
 * ATM: Ethereal hover in stratosphere
 * OTM: Derelict crashers spiraling to planetary surface
 */

import * as THREE from 'three';

// ============================================
// PROPULSION SHADER (Plasma Exhaust)
// ============================================

const propulsionVertexShader = `
    uniform float time;
    uniform float intensity;
    uniform float pulseSpeed;
    
    varying vec3 vPosition;
    varying float vDistance;
    
    void main() {
        vPosition = position;
        vDistance = length(position);
        
        // Curl noise displacement for plasma effect
        vec3 pos = position;
        float noise = sin(pos.x * 2.0 + time * pulseSpeed) * 
                      cos(pos.y * 2.0 + time * pulseSpeed * 1.3) * 
                      sin(pos.z * 2.0 + time * pulseSpeed * 0.7);
        
        // Displace outward based on distance and intensity
        vec3 normal = normalize(position);
        pos += normal * noise * intensity * 0.3;
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const propulsionFragmentShader = `
    uniform float time;
    uniform float intensity;
    uniform vec3 coreColor;
    uniform vec3 edgeColor;
    
    varying vec3 vPosition;
    varying float vDistance;
    
    void main() {
        // Gradient from core (white-hot) to edge (purple haze)
        float dist = vDistance;
        float gradient = 1.0 - smoothstep(0.0, 1.0, dist);
        
        // Pulsing core
        float pulse = sin(time * 10.0) * 0.3 + 0.7;
        vec3 color = mix(edgeColor, coreColor, gradient * pulse);
        
        // Intensity-based brightness
        float brightness = intensity * (0.8 + gradient * 0.4);
        
        // Alpha fade at edges
        float alpha = smoothstep(1.0, 0.3, dist) * brightness;
        
        gl_FragColor = vec4(color * brightness, alpha);
    }
`;

/**
 * Create enhanced propulsion cone with shader
 */
export function createPropulsionCone(params) {
    const {
        baseRadius = 1.0,
        length = 5.0,
        color = 0x00ffff,
        intensity = 1.0
    } = params;
    
    // Inverted cone geometry (flared nozzle)
    const geometry = new THREE.ConeGeometry(baseRadius * 1.5, length, 16);
    
    // Shader material
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            intensity: { value: intensity },
            pulseSpeed: { value: 10.0 },
            coreColor: { value: new THREE.Vector3(1.0, 1.0, 1.0) }, // White-hot core
            edgeColor: { value: new THREE.Vector3(0.5, 0.2, 1.0) }  // Purple edge
        },
        vertexShader: propulsionVertexShader,
        fragmentShader: propulsionFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    
    const cone = new THREE.Mesh(geometry, material);
    cone.userData.isPropulsion = true;
    cone.userData.baseLength = length;
    cone.userData.baseRadius = baseRadius;
    cone.userData.intensity = intensity;
    
    return cone;
}

// ============================================
// MONEYNESS-BASED ROCKET SCALING
// ============================================

/**
 * Create rocket with moneyness-based scaling
 */
export function createMoneynessRocket(params) {
    const {
        delta = 0.5,
        gamma = 0.01,
        iv = 0.2,
        type = 'call',
        baseScale = 2.125
    } = params;
    
    const absDelta = Math.abs(delta);
    const rocketGroup = new THREE.Group();
    
    // Determine moneyness category
    let moneyness = 'ATM';
    let scaleX, scaleY, scaleZ;
    let bodyLength, bodyRadius, noseLength;
    
    if (absDelta > 0.8) {
        // ITM: Elongate body, wide fins
        moneyness = 'ITM';
        scaleZ = 2.0 + delta * 5.0; // Elongate
        scaleX = 1.2; // Wide fins
        scaleY = 1.2;
        bodyLength = 3.5 * baseScale * scaleZ;
        bodyRadius = 0.6 * baseScale * scaleX;
        noseLength = 1.2 * baseScale * scaleZ;
    } else if (absDelta > 0.2) {
        // ATM: Compact, sleek
        moneyness = 'ATM';
        scaleX = scaleY = scaleZ = 1.2;
        bodyLength = 3.5 * baseScale;
        bodyRadius = 0.6 * baseScale;
        noseLength = 1.2 * baseScale;
    } else {
        // OTM: Crumpled, asymmetrical
        moneyness = 'OTM';
        scaleX = 0.8 + Math.random() * 0.2; // Random asymmetry
        scaleY = 0.8 + Math.random() * 0.2;
        scaleZ = 0.5;
        bodyLength = 3.5 * baseScale * scaleZ;
        bodyRadius = 0.6 * baseScale * Math.min(scaleX, scaleY);
        noseLength = 1.2 * baseScale * scaleZ;
    }
    
    // Material colors
    const bodyColor = type === 'call' ? 0x4a90e2 : 0xe24a4a;
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyColor,
        emissiveIntensity: moneyness === 'ITM' ? 0.8 : (moneyness === 'OTM' ? 0.2 : 0.5),
        roughness: moneyness === 'OTM' ? 0.8 : 0.3,
        metalness: moneyness === 'OTM' ? 0.2 : 0.7
    });
    
    // Main body
    const bodyGeometry = new THREE.CylinderGeometry(bodyRadius, bodyRadius * 1.05, bodyLength, 16);
    
    // OTM: Add dents via geometry modification
    if (moneyness === 'OTM') {
        const positions = bodyGeometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const i3 = i * 3;
            if (Math.random() < 0.1) { // 10% of vertices
                positions.array[i3] *= (0.85 + Math.random() * 0.15); // Random dents
                positions.array[i3 + 1] *= (0.85 + Math.random() * 0.15);
            }
        }
        positions.needsUpdate = true;
    }
    
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.z = Math.PI / 2;
    body.position.x = bodyLength / 2;
    body.scale.set(scaleX, scaleY, 1.0);
    body.castShadow = true;
    body.receiveShadow = true;
    rocketGroup.add(body);
    
    // Nose cone
    const noseGeometry = new THREE.ConeGeometry(bodyRadius, noseLength, 16);
    
    // ITM: Add warp drive vortex (torus) on nose
    if (moneyness === 'ITM') {
        const vortexGeometry = new THREE.TorusGeometry(bodyRadius * 0.8, bodyRadius * 0.2, 8, 16);
        const vortexMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x0088ff,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.7
        });
        const vortex = new THREE.Mesh(vortexGeometry, vortexMaterial);
        vortex.position.x = bodyLength + noseLength;
        vortex.rotation.z = Math.PI / 2;
        vortex.userData.isVortex = true;
        rocketGroup.add(vortex);
    }
    
    const nose = new THREE.Mesh(noseGeometry, bodyMaterial);
    nose.position.x = bodyLength + noseLength / 2;
    nose.rotation.z = Math.PI / 2;
    nose.rotation.y = Math.PI;
    nose.castShadow = true;
    rocketGroup.add(nose);
    
    // Fins (wider for ITM)
    const finHeight = bodyLength * (moneyness === 'ITM' ? 0.5 : 0.35);
    const finWidth = bodyRadius * (moneyness === 'ITM' ? 0.7 : 0.55);
    const finThickness = bodyRadius * 0.08;
    
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const finShape = new THREE.Shape();
        finShape.moveTo(0, 0);
        finShape.lineTo(finWidth, 0);
        finShape.lineTo(finWidth * 0.7, finHeight);
        finShape.lineTo(0, finHeight * 0.85);
        finShape.lineTo(0, 0);
        
        const finGeometry = new THREE.ExtrudeGeometry(finShape, {
            depth: finThickness,
            bevelEnabled: false
        });
        
        const fin = new THREE.Mesh(finGeometry, bodyMaterial);
        fin.position.x = finThickness / 2;
        fin.position.y = Math.cos(angle) * (bodyRadius + finThickness / 2);
        fin.position.z = Math.sin(angle) * (bodyRadius + finThickness / 2);
        fin.rotation.y = angle + Math.PI / 2;
        fin.rotation.z = Math.PI / 2;
        fin.castShadow = true;
        rocketGroup.add(fin);
    }
    
    // Enhanced propulsion cone
    const exhaustLength = Math.abs(delta) * 8 * baseScale;
    const exhaustIntensity = Math.abs(delta) * iv * 2.0; // Scale with delta and IV
    const exhaustColor = type === 'call' ? 0x00ffff : 0xff4444;
    
    const propulsion = createPropulsionCone({
        baseRadius: bodyRadius * 0.65,
        length: exhaustLength,
        color: exhaustColor,
        intensity: exhaustIntensity
    });
    
    propulsion.position.x = -exhaustLength / 2;
    propulsion.rotation.z = -Math.PI / 2;
    propulsion.rotation.y = Math.PI;
    rocketGroup.add(propulsion);
    rocketGroup.userData.propulsion = propulsion;
    
    // Store metadata
    rocketGroup.userData.moneyness = moneyness;
    rocketGroup.userData.delta = delta;
    rocketGroup.userData.scale = { x: scaleX, y: scaleY, z: scaleZ };
    rocketGroup.userData.bodyLength = bodyLength;
    rocketGroup.userData.bodyRadius = bodyRadius;
    rocketGroup.userData.isWarping = false;
    rocketGroup.userData.isCrashed = false;
    
    return rocketGroup;
}

// ============================================
// HORIZON DOME (Truman Show boundary)
// ============================================

/**
 * Create horizon dome at z=1000 with light bending
 */
export function createHorizonDome(scene) {
    const domeGroup = new THREE.Group();
    
    // Curved dome geometry (hemisphere)
    const domeRadius = 1000;
    const domeGeometry = new THREE.SphereGeometry(domeRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    
    // Starry sky material
    const domeMaterial = new THREE.MeshStandardMaterial({
        color: 0x000011,
        emissive: 0x001122,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.6,
        side: THREE.BackSide
    });
    
    const dome = new THREE.Mesh(domeGeometry, domeMaterial);
    dome.position.z = domeRadius;
    dome.rotation.x = Math.PI / 2;
    domeGroup.add(dome);
    
    // Add stars (particles)
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 5000;
    const starPositions = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount; i++) {
        const i3 = i * 3;
        const radius = domeRadius * 0.95;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI / 2;
        
        starPositions[i3] = radius * Math.sin(phi) * Math.cos(theta);
        starPositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        starPositions[i3 + 2] = domeRadius + radius * Math.cos(phi);
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2.0,
        transparent: true,
        opacity: 0.8
    });
    
    const stars = new THREE.Points(starGeometry, starMaterial);
    stars.position.z = domeRadius;
    domeGroup.add(stars);
    
    scene.add(domeGroup);
    return domeGroup;
}

// ============================================
// ATMOSPHERIC FOG (Stratospheric layer)
// ============================================

/**
 * Create volumetric fog layer for ATM rockets
 */
export function createStratosphericFog(scene) {
    const fogGroup = new THREE.Group();
    
    // Fog plane at y=400-600
    const fogGeometry = new THREE.PlaneGeometry(2000, 200, 50, 10);
    
    const fogMaterial = new THREE.MeshStandardMaterial({
        color: 0x88aaff,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide
    });
    
    const fogPlane = new THREE.Mesh(fogGeometry, fogMaterial);
    fogPlane.position.y = 500;
    fogPlane.rotation.x = -Math.PI / 2;
    fogGroup.add(fogPlane);
    
    scene.add(fogGroup);
    return fogGroup;
}

// ============================================
// IMPACT EFFECTS (OTM crash)
// ============================================

/**
 * Create explosion particles on impact
 */
export function createImpactExplosion(position, count = 150) {
    const explosionGroup = new THREE.Group();
    
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const lifetimes = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        
        // Start at impact position
        positions[i3] = position.x;
        positions[i3 + 1] = position.y;
        positions[i3 + 2] = position.z;
        
        // Scatter velocity
        const angle = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const speed = Math.random() * 10 + 5;
        velocities[i3] = speed * Math.sin(phi) * Math.cos(angle);
        velocities[i3 + 1] = speed * Math.sin(phi) * Math.sin(angle);
        velocities[i3 + 2] = speed * Math.cos(phi);
        
        lifetimes[i] = 0;
        
        // Fire colors (red-orange-yellow)
        const colorMix = Math.random();
        colors[i3] = 1.0; // Red
        colors[i3 + 1] = colorMix * 0.5; // Orange
        colors[i3 + 2] = colorMix * 0.2; // Yellow
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
        size: 3.0,
        vertexColors: true,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending
    });
    
    const particles = new THREE.Points(geometry, material);
    particles.userData.positions = positions;
    particles.userData.velocities = velocities;
    particles.userData.lifetimes = lifetimes;
    particles.userData.maxLifetime = 2.0; // 2 seconds
    
    explosionGroup.add(particles);
    explosionGroup.userData.particles = particles;
    explosionGroup.userData.isExploding = true;
    
    return explosionGroup;
}

/**
 * Create smoke trail for crashed rocket
 */
export function createSmokeTrail(rocket) {
    const smokeGroup = new THREE.Group();
    
    const smokeGeometry = new THREE.BufferGeometry();
    const smokeCount = 50;
    const positions = new Float32Array(smokeCount * 3);
    const opacities = new Float32Array(smokeCount);
    
    for (let i = 0; i < smokeCount; i++) {
        const i3 = i * 3;
        positions[i3] = rocket.position.x + (Math.random() - 0.5) * 2;
        positions[i3 + 1] = rocket.position.y + Math.random() * 5;
        positions[i3 + 2] = rocket.position.z + (Math.random() - 0.5) * 2;
        opacities[i] = Math.random() * 0.5;
    }
    
    smokeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const smokeMaterial = new THREE.PointsMaterial({
        color: 0x333333,
        size: 8.0,
        transparent: true,
        opacity: 0.3,
        blending: THREE.NormalBlending
    });
    
    const smoke = new THREE.Points(smokeGeometry, smokeMaterial);
    smoke.userData.positions = positions;
    smoke.userData.opacities = opacities;
    
    smokeGroup.add(smoke);
    return smokeGroup;
}

// ============================================
// ANIMATION UPDATE FUNCTION
// ============================================

/**
 * Update rocket animation based on moneyness
 */
export function updateRocketAnimation(rocket, time, deltaTime) {
    const moneyness = rocket.userData.moneyness;
    const absDelta = Math.abs(rocket.userData.delta);
    
    // Update propulsion shader
    if (rocket.userData.propulsion) {
        const propulsion = rocket.userData.propulsion;
        propulsion.material.uniforms.time.value = time;
        
        // Pulsing scale
        const pulse = 1.0 + Math.sin(time * 10.0) * 0.2;
        propulsion.scale.set(1.0, 1.0, pulse);
    }
    
    // ITM: Accelerate toward horizon (z=1000)
    if (moneyness === 'ITM' && absDelta > 0.8) {
        const speed = absDelta * 50.0 * deltaTime;
        rocket.position.z += speed;
        
        // Clamp at z=950 (near horizon)
        if (rocket.position.z > 950) {
            rocket.position.z = 950;
            rocket.userData.isWarping = true;
        }
        
        // Warp drive vortex rotation
        const vortex = rocket.children.find(child => child.userData.isVortex);
        if (vortex) {
            vortex.rotation.x += deltaTime * 5.0;
            vortex.rotation.y += deltaTime * 3.0;
        }
        
        // Subtle dome refraction effect (scale up slightly)
        if (rocket.position.z > 800) {
            const warpScale = 1.0 + (rocket.position.z - 800) / 200 * 0.2;
            rocket.scale.set(warpScale, warpScale, warpScale);
        }
    }
    
    // ATM: Idle hover with breathing oscillation
    if (moneyness === 'ATM') {
        const baseY = 500;
        const oscillation = Math.sin(time * 0.5) * 20;
        rocket.position.y = baseY + oscillation;
        
        // Gentle roll
        rocket.rotation.z += 0.01 * deltaTime;
    }
    
    // OTM: Chaotic descent
    if (moneyness === 'OTM' && absDelta < 0.2) {
        if (!rocket.userData.isCrashed) {
            const gravity = 9.8 * (1.0 - absDelta);
            rocket.position.y -= gravity * deltaTime * 10.0;
            
            // Random tumble
            rocket.rotation.x += (Math.random() - 0.5) * 0.05 * deltaTime * 60;
            rocket.rotation.y += (Math.random() - 0.5) * 0.05 * deltaTime * 60;
            
            // Impact detection
            if (rocket.position.y <= 0) {
                rocket.position.y = 0;
                rocket.userData.isCrashed = true;
                
                // Create explosion
                if (!rocket.userData.explosion) {
                    const explosion = createImpactExplosion(rocket.position.clone());
                    rocket.parent.add(explosion);
                    rocket.userData.explosion = explosion;
                }
                
                // Add damage glow
                rocket.children.forEach(child => {
                    if (child.material && child.material.emissive) {
                        child.material.emissive.setHex(0xff0000);
                        child.material.emissiveIntensity = 0.5 + Math.sin(time * 10) * 0.3;
                    }
                });
            }
        }
    }
}

/**
 * Update explosion particles
 */
export function updateExplosion(explosion, deltaTime) {
    if (!explosion.userData.isExploding) return;
    
    const particles = explosion.userData.particles;
    const positions = particles.userData.positions;
    const velocities = particles.userData.velocities;
    const lifetimes = particles.userData.lifetimes;
    const maxLifetime = particles.userData.maxLifetime;
    
    let allDead = true;
    
    for (let i = 0; i < positions.length / 3; i++) {
        const i3 = i * 3;
        lifetimes[i] += deltaTime;
        
        if (lifetimes[i] < maxLifetime) {
            allDead = false;
            
            // Update position
            positions[i3] += velocities[i3] * deltaTime;
            positions[i3 + 1] += velocities[i3 + 1] * deltaTime;
            positions[i3 + 2] += velocities[i3 + 2] * deltaTime;
            
            // Fade alpha
            const alpha = 1.0 - (lifetimes[i] / maxLifetime);
            // Note: PointsMaterial doesn't support per-particle alpha, would need custom shader
        }
    }
    
    particles.geometry.attributes.position.needsUpdate = true;
    
    // Fade out material
    particles.material.opacity = Math.max(0, 1.0 - (lifetimes[0] / maxLifetime));
    
    if (allDead && lifetimes[0] > maxLifetime) {
        explosion.userData.isExploding = false;
        // Could remove explosion here if needed
    }
}

