/**
 * RocketModel - Clean rocket geometry creation
 * Creates a unified, properly oriented rocket model
 */

import * as THREE from 'three';

/**
 * Create a rocket model with proper orientation
 * Rocket points along +X axis: nose at front (+X), exhaust at back (base at x=0)
 * 
 * @param {Object} params - Rocket parameters
 * @param {string} params.type - 'call' or 'put'
 * @param {number} params.scale - Scale factor for rocket size
 * @param {number} params.exhaustLength - Length of exhaust plume
 * @param {Function} params.createParticles - Function to create particle system
 * @returns {THREE.Group} Rocket group with all components
 */
export function createRocketModel(params) {
    const {
        type = 'call',
        scale = 2.5,
        exhaustLength = 5.0,
        createParticles = null
    } = params;

    const rocketGroup = new THREE.Group();

    // Rocket dimensions (pointing along +X axis)
    const bodyLength = 3.5 * scale;
    const bodyRadius = 0.6 * scale;
    const noseLength = 1.2 * scale;

    // Material colors
    const bodyColor = type === 'call' ? 0x4a90e2 : 0xe24a4a;
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyColor,
        emissiveIntensity: 0.5,
        roughness: 0.3,
        metalness: 0.7
    });

    // ============================================
    // MAIN BODY CYLINDER
    // ============================================
    // Body extends from x=0 (base) to x=bodyLength (front)
    const bodyGeometry = new THREE.CylinderGeometry(bodyRadius, bodyRadius * 1.05, bodyLength, 16);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.z = Math.PI / 2; // Rotate cylinder to horizontal (along X axis)
    body.position.x = bodyLength / 2; // Center the body
    body.castShadow = true;
    body.receiveShadow = true;
    rocketGroup.add(body);

    // ============================================
    // NOSE CONE (at front/top)
    // ============================================
    // Nose cone points forward (in +X direction) - tip at front
    const noseGeometry = new THREE.ConeGeometry(bodyRadius, noseLength, 16);
    const nose = new THREE.Mesh(noseGeometry, bodyMaterial);
    // Position nose at the front of the body - tip points forward
    nose.position.x = bodyLength + noseLength / 2;
    nose.rotation.z = Math.PI / 2; // Rotate to horizontal (along X axis)
    nose.rotation.y = Math.PI; // Flip so tip points in +X direction (forward)
    nose.castShadow = true;
    nose.receiveShadow = true;
    rocketGroup.add(nose);

    // ============================================
    // FINS (at base)
    // ============================================
    const finHeight = bodyLength * 0.35;
    const finWidth = bodyRadius * 0.55;
    const finThickness = bodyRadius * 0.08;

    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;

        // Create fin shape (triangle)
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

        // Position fin at base of rocket (near x=0)
        fin.position.x = finThickness / 2;
        fin.position.y = Math.cos(angle) * (bodyRadius + finThickness / 2);
        fin.position.z = Math.sin(angle) * (bodyRadius + finThickness / 2);

        // Rotate fin to align with rocket body
        fin.rotation.y = angle + Math.PI / 2;
        fin.rotation.z = Math.PI / 2;

        fin.castShadow = true;
        fin.receiveShadow = true;
        rocketGroup.add(fin);
    }

    // ============================================
    // DECORATIVE BANDS
    // ============================================
    const bandMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        emissive: 0x0a0a0a,
        emissiveIntensity: 0.1,
        roughness: 0.6,
        metalness: 0.4
    });

    // Band near nose
    const topBand = new THREE.Mesh(
        new THREE.CylinderGeometry(bodyRadius * 1.02, bodyRadius * 1.02, bodyLength * 0.04, 16),
        bandMaterial
    );
    topBand.rotation.z = Math.PI / 2;
    topBand.position.x = bodyLength * 0.75;
    rocketGroup.add(topBand);

    // Band at base (exhaust end)
    const baseBand = new THREE.Mesh(
        new THREE.CylinderGeometry(bodyRadius * 1.04, bodyRadius * 1.06, bodyLength * 0.05, 16),
        bandMaterial
    );
    baseBand.rotation.z = Math.PI / 2;
    baseBand.position.x = bodyLength * 0.15;
    rocketGroup.add(baseBand);

    // ============================================
    // EXHAUST PLUME (at base, pointing backward)
    // ============================================
    // Make exhaust 50% smaller
    const exhaustBaseRadius = bodyRadius * 0.325; // 50% of 0.65
    const exhaustTipRadius = bodyRadius * 0.65; // 50% of 1.3
    
    const exhaustColor = type === 'call' ? 0x00ffff : 0xff4444;
    const exhaustMaterial = new THREE.MeshStandardMaterial({
        color: exhaustColor,
        emissive: exhaustColor,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.75
    });

    // Exhaust cone: narrow end at rocket base (x=0), expanding backward (-X direction)
    // ConeGeometry(radius, height) - creates cone pointing in +Y, tip at +height/2, base at -height/2
    // We want: narrow end (tip) at x=0, wide end (base) at negative X
    const exhaustGeometry = new THREE.ConeGeometry(exhaustTipRadius, exhaustLength, 12);
    const exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
    
    // Position: tip at rocket base (x=0), base expands to negative X
    exhaust.position.x = -exhaustLength / 2; // Center so tip is at x=0
    exhaust.rotation.z = -Math.PI / 2; // Rotate so cone points in -X direction
    exhaust.rotation.y = Math.PI; // Rotate 180 degrees to flip the cone
    
    // Store exhaust reference for animation
    exhaust.userData.isExhaust = true;
    exhaust.userData.baseLength = exhaustLength;
    exhaust.userData.baseTipRadius = exhaustTipRadius;
    exhaust.userData.basePositionX = -exhaustLength / 2;
    
    rocketGroup.add(exhaust);
    rocketGroup.userData.exhaustCone = exhaust; // Store reference for animation

    // ============================================
    // PARTICLE SYSTEM (if provided)
    // ============================================
    if (createParticles) {
        const particles = createParticles({
            startX: 0, // At rocket base
            baseRadius: exhaustBaseRadius,
            color: exhaustColor
        });
        if (particles) {
            rocketGroup.add(particles);
        }
    }

    // Store dimensions for reference
    rocketGroup.userData.rocketLength = bodyLength + noseLength;
    rocketGroup.userData.bodyRadius = bodyRadius;
    rocketGroup.userData.exhaustBaseRadius = exhaustBaseRadius;

    return rocketGroup;
}

/**
 * Create exhaust particle system
 * 
 * @param {Object} params - Particle parameters
 * @param {number} params.startX - X position where particles start (rocket base)
 * @param {number} params.baseRadius - Radius of exhaust base
 * @param {number} params.color - Particle color
 * @param {number} params.count - Number of particles (default 150)
 * @returns {THREE.Points} Particle system
 */
export function createExhaustParticles(params) {
    const {
        startX = 0,
        baseRadius = 1.0,
        color = 0x00ffff,
        count = 150
    } = params;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const lifetimes = new Float32Array(count);

    // Initialize particles at exhaust base
    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        
        // Random position within exhaust base radius
        const radius = Math.random() * baseRadius;
        const angle = Math.random() * Math.PI * 2;
        positions[i3] = startX;
        positions[i3 + 1] = Math.cos(angle) * radius;
        positions[i3 + 2] = Math.sin(angle) * radius;
        
        // Velocity: particles flow backward (-X direction)
        velocities[i3] = -Math.random() * 4 - 2; // Backward flow
        velocities[i3 + 1] = (Math.random() - 0.5) * 1.0; // Sideways spread
        velocities[i3 + 2] = (Math.random() - 0.5) * 1.0; // Sideways spread
        
        lifetimes[i] = Math.random();
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: color,
        size: 0.12 * (baseRadius / 1.0),
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geometry, material);
    
    // Store data for animation
    particles.userData.positions = positions;
    particles.userData.velocities = velocities;
    particles.userData.lifetimes = lifetimes;
    particles.userData.startX = startX;
    particles.userData.baseRadius = baseRadius;

    return particles;
}

