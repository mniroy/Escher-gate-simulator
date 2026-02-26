import React, { useRef, useCallback, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, GizmoHelper, GizmoViewport, Html } from '@react-three/drei';
import * as THREE from 'three';

const POST_W = 0.12; // 120mm post width
const HINGE_R = 0.018;
const HINGE_COLOR = '#6b5b4f';

/* ————— Panel Mesh ————— */
function PanelMesh({ w, h, d, color, wireColor }) {
    return (
        <group>
            <mesh castShadow receiveShadow>
                <boxGeometry args={[w, h, d]} />
                <meshStandardMaterial color={color} transparent opacity={0.94} />
            </mesh>
            <lineSegments>
                <edgesGeometry args={[new THREE.BoxGeometry(w, h, d)]} />
                <lineBasicMaterial color={wireColor} />
            </lineSegments>
            {/* Dimension label above panel */}
            <Html position={[0, h / 2 + 0.1, 0]} center>
                <div style={{
                    background: 'rgba(255, 255, 255, 0.9)', color: '#444', padding: '2px 6px',
                    borderRadius: '3px', fontSize: '10px', fontWeight: '600',
                    border: '1px solid #ccc', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    pointerEvents: 'none', userSelect: 'none'
                }}>
                    {Math.round(w * 1000)} mm
                </div>
            </Html>
        </group>
    );
}

/* ————— Panel Label (3D Text Overlay) ————— */
function PanelLabel({ text, position }) {
    return (
        <Html position={position} center distanceFactor={4} occlude={false} zIndexRange={[10, 0]}>
            <div style={{
                background: 'rgba(30,30,30,0.82)',
                color: '#fff',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 700,
                letterSpacing: '0.5px',
                border: '1px solid rgba(255,255,255,0.15)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                userSelect: 'none',
                backdropFilter: 'blur(4px)',
            }}>
                {text}
            </div>
        </Html>
    );
}

/* ————— Hinge Cylinder ————— */
function Hinge({ height, position }) {
    return (
        <mesh position={position}>
            <cylinderGeometry args={[HINGE_R, HINGE_R, height * 0.92, 12]} />
            <meshStandardMaterial color={HINGE_COLOR} metalness={0.6} roughness={0.4} />
        </mesh>
    );
}

/* ————— Wheel (for folding panels on track) ————— */
function Wheel({ position }) {
    return (
        <group position={position}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.04, 0.04, 0.02, 16]} />
                <meshStandardMaterial color="#333" />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
                <boxGeometry args={[0.01, 0.05, 0.04]} />
                <meshStandardMaterial color="#666" metalness={0.8} />
            </mesh>
        </group>
    );
}

/* ————— Track Rail (for tracked bifold) ————— */
function TrackRail({ width, yPos, mirror }) {
    const sign = mirror ? -1 : 1;
    return (
        <group position={[0, yPos, 0]}>
            {/* Main rail beam */}
            <mesh position={[(width / 2) * sign, 0, 0]}>
                <boxGeometry args={[width + 0.12, 0.02, 0.06]} />
                <meshStandardMaterial color="#555" metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Rail groove line */}
            <mesh position={[(width / 2) * sign, 0.012, 0]}>
                <boxGeometry args={[width + 0.12, 0.005, 0.02]} />
                <meshStandardMaterial color="#222" />
            </mesh>
        </group>
    );
}

/* ————— Actuator (BFT-style geometry) ————— */
function Actuator({ position, postA, postB, gateB, angle, color, sign = 1, panelThick = 0.075, placement = 'Inside', stroke = 0 }) {
    // zMult: -1 for property side (Inside), 1 for street side (Outside)
    const zMult = placement === 'Outside' ? 1 : -1;
    const zDepth = (panelThick / 2 + 0.05) * Math.abs(zMult);
    const effectiveZDepth = zDepth * zMult;
    const effectivePostB = postB * zMult;

    // Point A: Fixed post bracket pivot.
    const pivotAX = -postA * sign;
    const pivotBX = gateB;

    const a = new THREE.Vector3(pivotAX, 0, effectivePostB);
    const b = new THREE.Vector3(pivotBX, 0, effectiveZDepth).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);

    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    if (len < 0.001) return null;

    const mat = new THREE.Matrix4().lookAt(a, b, new THREE.Object3D().up);
    const q = new THREE.Quaternion().setFromRotationMatrix(mat);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));

    const innerLen = len * 0.55;
    const outerLen = len * 0.55;
    const postSurfaceZ = (POST_W / 2) * zMult;
    const postSideX = (POST_W / 2) * -sign;

    return (
        <group position={position}>
            {/* Post Mounting Base (on post surface) */}
            <mesh position={[postSideX, 0, postSurfaceZ]}>
                <boxGeometry args={[0.02, 0.1, 0.04]} />
                <meshStandardMaterial color="#333" />
            </mesh>
            {/* Bracket Horizontal Arm */}
            <mesh position={[(postSideX + a.x) / 2, 0, postSurfaceZ]}>
                <boxGeometry args={[Math.abs(a.x - postSideX), 0.04, 0.02]} />
                <meshStandardMaterial color="#444" metalness={0.7} roughness={0.3} />
            </mesh>
            {/* Post bracket arm (depth connection) */}
            <mesh position={[a.x, 0, (postSurfaceZ + a.z) / 2]}>
                <boxGeometry args={[0.04, 0.04, Math.abs(a.z - postSurfaceZ)]} />
                <meshStandardMaterial color="#555" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* Panel bracket arm (rotates with panel) */}
            <group rotation={[0, angle, 0]}>
                <mesh position={[gateB, 0, effectiveZDepth / 2]}>
                    <boxGeometry args={[0.04, 0.04, Math.abs(effectiveZDepth)]} />
                    <meshStandardMaterial color="#555" metalness={0.6} roughness={0.4} />
                </mesh>
            </group>
            {/* Pivot ball joints */}
            <mesh position={a}><sphereGeometry args={[0.022, 12, 12]} /><meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} /></mesh>
            <mesh position={b}><sphereGeometry args={[0.022, 12, 12]} /><meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} /></mesh>
            {/* Actuator body */}
            <group position={mid} quaternion={q}>
                {/* Motor Housing (Rear side) */}
                <mesh position={[0, -len * 0.35, 0]}>
                    <boxGeometry args={[0.06, 0.12, 0.06]} />
                    <meshStandardMaterial color="#222" metalness={0.5} roughness={0.5} />
                </mesh>
                <mesh position={[0, len * 0.12, 0]}>
                    <cylinderGeometry args={[0.012, 0.012, innerLen, 10]} />
                    <meshStandardMaterial color="#bbb" metalness={0.9} roughness={0.1} />
                </mesh>
                <mesh position={[0, -len * 0.12, 0]}>
                    <cylinderGeometry args={[0.018, 0.018, outerLen, 10]} />
                    <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
                </mesh>
                {/* On-canvas measurements */}
                <Html position={[0, 0, 0.15]} center>
                    <div style={{
                        background: 'rgba(50, 40, 30, 0.85)', color: 'white', padding: '4px 8px', borderRadius: '4px',
                        fontSize: '11px', whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.2)',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)', pointerEvents: 'none', userSelect: 'none'
                    }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{Math.round(len * 1000)} mm</div>
                        <div style={{ fontSize: '9px', opacity: 0.8 }}>Stroke: {stroke} mm</div>
                    </div>
                </Html>
            </group>
        </group>
    );
}

/* ——————————————————————————————————————————————
   PER-PANEL CHAIN RENDERER
   
   Panel types:
     None  — fixed/rigid, no motion, follows parent
     Fold  — accordion hinge rotation (tracked: slides along rail while folding)
     Swing — single pivot rotation
     Slide — horizontal translation
   
   Tracked Fold Mechanics:
     In tracked mode, the top of each fold panel rides on a rail.
     As the panel folds, it also translates along X toward the post,
     causing panels to stack neatly against the post column.
     The fold angle is the same, but the origin translates.
—————————————————————————————————————————————— */
function PanelChain({ panels, panelW, height, thick, openPct, mirror, panelColor, wireColor, leafLabel }) {
    const sign = mirror ? -1 : 1;
    const maxFold = (80 * Math.PI) / 180;
    const maxSwing = (90 * Math.PI) / 180;
    const t = openPct / 100;
    const n = panels.length;

    // Phased animation: when the chain has both tracked Fold AND Slide panels,
    // the Slide panels complete first (0→50%), then the Fold panels start (50→100%).
    // This lets slide panels stack behind fold panels before folding begins.
    const hasTrackedFold = panels.some(p => p.type === 'Fold' && p.tracked);
    const hasSlide = panels.some(p => p.type === 'Slide');
    const phased = hasTrackedFold && hasSlide;

    const renderPanel = (idx) => {
        if (idx >= n) return null;
        const p = panels[idx];
        const labelText = `${leafLabel}${idx + 1}`;

        // Compute effective time for this panel type based on phased mode
        let effectiveT = t;
        if (phased) {
            if (p.type === 'Slide') {
                effectiveT = Math.min(1, t * 2); // completes in first half
            } else if (p.type === 'Fold' && p.tracked) {
                effectiveT = Math.max(0, (t - 0.5) * 2); // starts in second half
            }
        }

        // Staggered timing (for non-tracked panels)
        const localT = Math.min(1, Math.max(0, effectiveT * n - idx));

        // ——— NONE: Fixed panel, no independent motion ———
        if (p.type === 'None') {
            return (
                <group key={idx}>
                    <group position={[(panelW / 2) * sign, 0, 0]}>
                        <PanelMesh w={panelW} h={height} d={thick} color={'#c4b49a'} wireColor={wireColor} />
                        <PanelLabel text={`${labelText} ⊘`} position={[0, 0, thick / 2 + 0.05]} />
                    </group>
                    <group position={[panelW * sign, 0, 0]}>
                        {renderPanel(idx + 1)}
                    </group>
                </group>
            );
        }

        if (p.type === 'Slide') {
            const slideDir = mirror ? 1 : -1;
            const travel = localT * panelW * slideDir;
            // Small Z-offset: just enough to clear the previous panel's thickness
            const zOff = -thick * 1.1;

            return (
                <group key={idx}>
                    <Hinge height={height} position={[0, 0, 0]} />
                    <group position={[travel, 0, zOff]}>
                        <group position={[(panelW / 2) * sign, 0, 0]}>
                            <PanelMesh w={panelW} h={height} d={thick} color={panelColor} wireColor={wireColor} />
                            <PanelLabel text={labelText} position={[0, 0, thick / 2 + 0.05]} />
                        </group>
                        <group position={[panelW * sign, 0, -zOff]}>
                            {renderPanel(idx + 1)}
                        </group>
                    </group>
                </group>
            );
        }

        if (p.type === 'Swing') {
            const swingAngle = localT * maxSwing * sign;
            return (
                <group key={idx}>
                    <Hinge height={height} position={[0, 0, 0]} />
                    <group rotation={[0, swingAngle, 0]}>
                        <group position={[(panelW / 2) * sign, 0, 0]}>
                            <PanelMesh w={panelW} h={height} d={thick} color={panelColor} wireColor={wireColor} />
                            <PanelLabel text={labelText} position={[0, 0, thick / 2 + 0.05]} />
                        </group>
                        <group position={[panelW * sign, 0, 0]}>
                            {renderPanel(idx + 1)}
                        </group>
                    </group>
                </group>
            );
        }

        // ——— FOLD ———
        // Per-panel direction: Inward folds toward center, Outward folds away
        const panelDir = p.direction || 'Inward';
        const dirMultiplier = panelDir === 'Outward' ? -1 : 1;
        const isTracked = !!p.tracked;

        // Count fold index to alternate fold direction (accordion pattern)
        let foldIndex = 0;
        for (let i = 0; i <= idx; i++) {
            if (panels[i].type === 'Fold') foldIndex++;
        }
        const foldSign = foldIndex % 2 === 1 ? 1 : -1;

        if (isTracked) {
            // ═══ TRACKED BIFOLD KINEMATICS ═══
            // Real bifold constraint: the far end of the last panel rides the track (Z=0).
            //
            // In the recursive Three.js transform chain, rotations accumulate:
            //   P1 world rotation = P1_local
            //   P2 world rotation = P1_local + P2_local
            //
            // Track constraint requires:
            //   P1 world = +θ   →  P1_local = +θ
            //   P2 world = -θ   →  P2_local = -θ - θ = -2θ
            //   P3 world = +θ   →  P3_local = +θ - (-θ) = +2θ
            //   (alternating, subsequent panels need 2× local angle)
            //
            // Max θ = 90° (π/2). At θ=90°, adjacent panels fold 180° (flat against each other).
            //
            return (
                <group key={idx}>
                    <Hinge height={height} position={[0, 0, 0]} />
                    <group rotation={[0, foldAngle, 0]}>
                        <group position={[(panelW / 2) * sign, 0, 0]}>
                            <PanelMesh w={panelW} h={height} d={thick} color={panelColor} wireColor={wireColor} />
                            <PanelLabel text={labelText} position={[0, 0, thick / 2 + 0.05]} />
                            {/* Wheel at the bottom of the folding panel */}
                            <Wheel position={[0, -height / 2 - 0.04, 0]} />
                        </group>
                        <group position={[panelW * sign, 0, 0]}>
                            {renderPanel(idx + 1)}
                        </group>
                    </group>
                </group>
            );
        }

        // UNTRACKED FOLD (free-hanging accordion, staggered per panel)
        const foldAngle = localT * maxFold * foldSign * sign * dirMultiplier;
        return (
            <group key={idx}>
                <Hinge height={height} position={[0, 0, 0]} />
                <group rotation={[0, foldAngle, 0]}>
                    <group position={[(panelW / 2) * sign, 0, 0]}>
                        <PanelMesh w={panelW} h={height} d={thick} color={panelColor} wireColor={wireColor} />
                        <PanelLabel text={labelText} position={[0, 0, thick / 2 + 0.05]} />
                    </group>
                    <group position={[panelW * sign, 0, 0]}>
                        {renderPanel(idx + 1)}
                    </group>
                </group>
            </group>
        );
    };

    return renderPanel(0);
}

/* ————— Compute first panel angle for actuator ————— */
function getFirstPanelAngle(leaf, openPct, sign) {
    const t = openPct / 100;
    const p0 = leaf.panels[0];
    if (!p0 || p0.type === 'None' || p0.type === 'Slide') return 0;

    const n = leaf.panels.length;
    const hasTrackedFold = leaf.panels.some(p => p.type === 'Fold' && p.tracked);
    const hasSlide = leaf.panels.some(p => p.type === 'Slide');
    const phased = hasTrackedFold && hasSlide;

    let et = t;
    if (phased && p0.type === 'Fold' && p0.tracked) {
        et = Math.max(0, (t - 0.5) * 2);
    }

    if (p0.type === 'Swing') {
        const localT = Math.min(1, Math.max(0, et * n));
        return localT * (Math.PI / 2) * sign;
    }

    if (p0.type === 'Fold') {
        const dir = (p0.direction === 'Outward' ? -1 : 1);
        if (p0.tracked) {
            return et * (Math.PI / 2) * sign * dir;
        } else {
            const localT = Math.min(1, Math.max(0, et * n));
            return localT * ((80 * Math.PI) / 180) * sign * dir;
        }
    }
    return 0;
}

/* ————— Gate Assembly ————— */
function GateAssembly({ openPercent, config, motor, overloaded, groupRef }) {
    if (!config) return null;
    const { left, right, totalWidth, height, material, splitRatio } = config;

    const W = totalWidth / 1000;
    const H = height / 1000;
    const leftW = W * splitRatio;
    const rightW = W * (1 - splitRatio);
    const thick = material === '4x6' ? 0.10 : 0.075;

    const leftPanelW = leftW / left.panels.length;
    const rightPanelW = rightW / right.panels.length;

    const panelColor = '#d7b485';
    const wireColor = overloaded ? '#c44536' : '#8c5a2b';
    const postColor = '#dbd2c5';
    const actColor = overloaded ? '#c44536' : '#4a3b32';

    // Auto-calculate actuator A/B/C per BFT standards
    const calcActGeom = (leaf, panelWm) => {
        const pw = panelWm * 1000;
        const p0 = leaf.panels[0];

        let postA = 180 / 1000;
        let postB = 180 / 1000;

        // Specialized mounting for outward folding with inside actuator
        if (p0?.type === 'Fold' && p0?.dir === 'Outward' && leaf.actuator?.placement === 'Inside') {
            postA = 220 / 1000;
            postB = 300 / 1000;
        }

        const gateB = Math.round(Math.max(250, Math.min(600, pw * 0.25))) / 1000;

        // Calculate stroke for the label
        let maxDeg = 0;
        if (p0?.type === 'Swing') maxDeg = 90;
        else if (p0?.type === 'Fold') maxDeg = p0.tracked ? 90 : 80;
        const maxRad = (maxDeg * Math.PI) / 180;

        const zD = 0.09;
        const distClosed = Math.hypot(gateB - (-postA), -zD - (-postB));
        const bxOpen = gateB * Math.cos(maxRad) + (-zD) * Math.sin(maxRad);
        const bzOpen = -gateB * Math.sin(maxRad) + (-zD) * Math.cos(maxRad);
        const distOpen = Math.hypot(bxOpen - (-postA), bzOpen - (-postB));
        const stroke = Math.round(Math.abs(distOpen - distClosed) * 1000);

        return { postA, postB, gateB, stroke };
    };
    const leftAct = calcActGeom(left, leftPanelW);
    const rightAct = calcActGeom(right, rightPanelW);

    const hasSlider = [...left.panels, ...right.panels].some((p) => p.type === 'Slide');
    const leftHasTracked = left.panels.some((p) => p.type === 'Fold' && p.tracked);
    const rightHasTracked = right.panels.some((p) => p.type === 'Fold' && p.tracked);

    return (
        <group ref={groupRef} position={[0, H / 2, 0]}>
            {/* Ground rail for sliders */}
            {hasSlider && (
                <mesh position={[0, -H / 2 - 0.01, -0.06]}>
                    <boxGeometry args={[W * 3, 0.015, 0.04]} />
                    <meshStandardMaterial color="#666" />
                </mesh>
            )}

            {/* LEFT */}
            <group position={[-W / 2, 0, 0]}>
                <mesh position={[-POST_W / 2, 0, 0]} castShadow>
                    <boxGeometry args={[POST_W, H + 0.3, POST_W]} />
                    <meshStandardMaterial color={postColor} />
                </mesh>
                {/* Track rail at bottom if any fold panel has tracked=true */}
                {leftHasTracked && (
                    <TrackRail width={leftW} yPos={-H / 2 - 0.08} mirror={false} />
                )}
                <PanelChain
                    panels={left.panels} panelW={leftPanelW} height={H} thick={thick}
                    openPct={openPercent} mirror={false} panelColor={panelColor} wireColor={wireColor}
                    leafLabel="L"
                />
                {/* Left Actuator */}
                {left.actuator?.enabled && (
                    <Actuator
                        position={[0, -H * 0.25, 0]}
                        postA={leftAct.postA}
                        postB={leftAct.postB}
                        gateB={leftAct.gateB}
                        angle={getFirstPanelAngle(left, openPercent, 1)}
                        color={actColor}
                        sign={1}
                        panelThick={thick}
                        placement={left.actuator.placement}
                        stroke={leftAct.stroke}
                    />
                )}
            </group>

            {/* RIGHT */}
            <group position={[W / 2, 0, 0]}>
                <mesh position={[POST_W / 2, 0, 0]} castShadow>
                    <boxGeometry args={[POST_W, H + 0.3, POST_W]} />
                    <meshStandardMaterial color={postColor} />
                </mesh>
                {rightHasTracked && (
                    <TrackRail width={rightW} yPos={-H / 2 - 0.08} mirror={true} />
                )}
                <PanelChain
                    panels={right.panels} panelW={rightPanelW} height={H} thick={thick}
                    openPct={openPercent} mirror={true} panelColor={panelColor} wireColor={wireColor}
                    leafLabel="R"
                />
                {/* Right Actuator */}
                {right.actuator?.enabled && (
                    <Actuator
                        position={[0, -H * 0.25, 0]}
                        postA={rightAct.postA}
                        postB={rightAct.postB}
                        gateB={rightAct.gateB}
                        angle={getFirstPanelAngle(right, openPercent, -1)}
                        color={actColor}
                        sign={-1}
                        panelThick={thick}
                        placement={right.actuator.placement}
                        stroke={rightAct.stroke}
                    />
                )}
            </group>
        </group>
    );
}

/* ————— Camera Controllers ————— */
function CamFit({ ctrlRef, gateRef, trigger }) {
    const { camera } = useThree();
    const anim = useRef(false);
    const tP = useRef(new THREE.Vector3());
    const tL = useRef(new THREE.Vector3());
    const prev = useRef(0);
    useFrame(() => {
        if (trigger > prev.current && gateRef.current && ctrlRef.current) {
            prev.current = trigger;
            const box = new THREE.Box3().setFromObject(gateRef.current);
            const c = box.getCenter(new THREE.Vector3());
            const s = box.getSize(new THREE.Vector3());
            const d = (Math.max(s.x, s.y, s.z) / 2) / Math.tan((camera.fov * Math.PI / 180) / 2) * 1.6;
            tP.current.set(c.x, c.y + s.y * 0.3, c.z + d);
            tL.current.copy(c);
            anim.current = true;
        }
        if (anim.current && ctrlRef.current) {
            camera.position.lerp(tP.current, 0.08);
            ctrlRef.current.target.lerp(tL.current, 0.08);
            ctrlRef.current.update();
            if (camera.position.distanceTo(tP.current) < 0.01) anim.current = false;
        }
    });
    return null;
}

function CamPreset({ ctrlRef, gateRef, cmd }) {
    const { camera } = useThree();
    const anim = useRef(false);
    const tP = useRef(new THREE.Vector3());
    const tL = useRef(new THREE.Vector3());
    const prev = useRef(null);
    useFrame(() => {
        if (cmd && cmd !== prev.current && gateRef.current && ctrlRef.current) {
            prev.current = cmd;
            const box = new THREE.Box3().setFromObject(gateRef.current);
            const c = box.getCenter(new THREE.Vector3());
            const s = box.getSize(new THREE.Vector3());
            const d = (Math.max(s.x, s.y, s.z) / 2) / Math.tan((camera.fov * Math.PI / 180) / 2) * 1.8;
            const v = cmd.split('-')[0];
            if (v === 'front') tP.current.set(c.x, c.y, c.z + d);
            else if (v === 'top') tP.current.set(c.x, c.y + d, c.z + 0.01);
            else if (v === 'right') tP.current.set(c.x + d, c.y, c.z);
            else tP.current.set(c.x + d * 0.6, c.y + d * 0.5, c.z + d * 0.6);
            tL.current.copy(c);
            anim.current = true;
        }
        if (anim.current && ctrlRef.current) {
            camera.position.lerp(tP.current, 0.08);
            ctrlRef.current.target.lerp(tL.current, 0.08);
            ctrlRef.current.update();
            if (camera.position.distanceTo(tP.current) < 0.02) anim.current = false;
        }
    });
    return null;
}

/* ————— HUD ————— */
function Hud({ onFit, onFront, onTop, onRight, onIso }) {
    const s = {
        background: 'rgba(40,40,40,0.85)', color: '#ccc', border: '1px solid rgba(80,80,80,0.6)',
        borderRadius: '4px', padding: '6px 10px', cursor: 'pointer', fontSize: '11px',
        fontFamily: "'Inter',sans-serif", fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px',
    };
    return (
        <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 6, zIndex: 10 }}>
            <button style={s} onClick={onFit}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                Fit
            </button>
            <button style={s} onClick={onFront}>Front</button>
            <button style={s} onClick={onTop}>Top</button>
            <button style={s} onClick={onRight}>Right</button>
            <button style={s} onClick={onIso}>Iso</button>
        </div>
    );
}

/* ————— Main Export ————— */
export default function GateSim({ openPercent, config, motor, overloaded }) {
    const ctrlRef = useRef();
    const gateRef = useRef();
    const [fitT, setFitT] = useState(0);
    const [viewCmd, setViewCmd] = useState(null);
    const camY = config ? (config.height / 1000) * 0.8 : 1.5;

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <Canvas shadows camera={{ position: [0, camY + 2, 6], fov: 40, near: 0.01, far: 500 }}
                style={{ background: 'linear-gradient(180deg, #2b2b2b 0%, #1a1a1a 100%)' }}>
                <ambientLight intensity={0.4} />
                <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
                <directionalLight position={[-4, 3, -2]} intensity={0.3} color="#b0c4de" />
                <pointLight position={[0, 6, 0]} intensity={0.3} />
                <GateAssembly openPercent={openPercent} config={config} motor={motor} overloaded={overloaded} groupRef={gateRef} />
                <Grid infiniteGrid cellSize={0.25} sectionSize={1} sectionColor="#555" cellColor="#333" fadeDistance={30} fadeStrength={1.5} />
                <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                    <GizmoViewport axisColors={['#ff4444', '#44cc44', '#4488ff']} labelColor="white" />
                </GizmoHelper>
                <CamFit ctrlRef={ctrlRef} gateRef={gateRef} trigger={fitT} />
                <CamPreset ctrlRef={ctrlRef} gateRef={gateRef} cmd={viewCmd} />
                <OrbitControls ref={ctrlRef} minPolarAngle={0} maxPolarAngle={Math.PI / 2 + 0.1} target={[0, camY, 0]}
                    enableDamping dampingFactor={0.08} rotateSpeed={0.7} panSpeed={0.8} zoomSpeed={1.2} />
            </Canvas>
            <Hud onFit={() => setFitT((v) => v + 1)} onFront={() => setViewCmd('front-' + Date.now())}
                onTop={() => setViewCmd('top-' + Date.now())} onRight={() => setViewCmd('right-' + Date.now())}
                onIso={() => setViewCmd('iso-' + Date.now())} />
            <div style={{ position: 'absolute', top: 12, left: 12, color: '#888', fontSize: '11px', fontFamily: "'Inter',monospace", fontWeight: 500, userSelect: 'none' }}>
                GateSim · 3D Viewport
            </div>
        </div>
    );
}
