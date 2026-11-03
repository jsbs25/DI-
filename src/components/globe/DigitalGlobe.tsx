import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GlobeUserNode, GlobeCountryStat, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  createRealisticEarthDayTexture,
  createRealisticEarthRoughnessTexture,
  createRealisticEarthBumpTexture,
  createRealisticEarthNightTexture,
  createRealisticEarthCloudTexture,
  createRealisticMilkyWayTexture,
  latLngToVector3
} from './proceduralEarthTextures.ts';
import {
  createJupiterTexture,
  createSaturnRingTexture
} from '../../universe/proceduralPlanets.ts';
import {
  ArrowRight,
  Compass,
  Orbit,
  Network,
  Volume2,
  VolumeX,
  Sparkles,
  MapPin,
  ExternalLink,
  RotateCw,
  Eye,
  EyeOff,
  Cloud,
  ChevronRight
} from 'lucide-react';

interface DigitalGlobeProps {
  nodes: GlobeUserNode[];
  countries: GlobeCountryStat[];
  activeCountry: string | null;
  currentUserId?: string;
  focusCoordinates?: { lat: number; lng: number; timestamp?: number } | null;
  onSelectCountry: (countryCode: string | null) => void;
  onSelectUser: (user: GlobeUserNode) => void;
  onExploreUniverse?: () => void;
  lang: Language;
}

export const DigitalGlobe: React.FC<DigitalGlobeProps> = ({
  nodes,
  countries,
  activeCountry,
  currentUserId,
  focusCoordinates,
  onSelectCountry,
  onSelectUser,
  onExploreUniverse,
  lang
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const t = translations[lang] || translations.zh;

  // Camera & Mode state
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showBeacons, setShowBeacons] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<GlobeUserNode | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  // Mutable Three.js loop state
  const stateRef = useRef({
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,
    renderer: null as THREE.WebGLRenderer | null,
    earthGroup: null as THREE.Group | null,
    cloudsMesh: null as THREE.Mesh | null,
    jupiterMesh: null as THREE.Mesh | null,
    saturnGroup: null as THREE.Group | null,
    moonMesh: null as THREE.Mesh | null,
    asteroidBelt: [] as {
      mesh: THREE.Mesh;
      baseX: number;
      baseY: number;
      baseZ: number;
      speed: number;
      rot: THREE.Vector3;
    }[],
    beaconGroup: null as THREE.Group | null,
    interactiveMeshes: [] as { mesh: THREE.Object3D; data: GlobeUserNode }[],
    autoRotate: true,
    showBeacons: true,
    isDragging: false,
    previousMousePosition: { x: 0, y: 0 },
    rotationVelocity: { x: 0, y: 0.001 },
    targetCameraDistance: 13.5,
    cameraDistance: 13.5,
    targetCameraPos: new THREE.Vector3(0, 0, 13.5),
    targetCameraLookAt: new THREE.Vector3(0, 0, 0),
    currentCameraLookAt: new THREE.Vector3(0, 0, 0),
    targetSphericalRotation: null as { x: number; y: number } | null,
    frameId: 0
  });

  // Sync state
  useEffect(() => {
    stateRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    stateRef.current.showBeacons = showBeacons;
    if (stateRef.current.beaconGroup) {
      stateRef.current.beaconGroup.visible = showBeacons;
    }
  }, [showBeacons]);

  // Smoothly fly camera to country or citizen coordinate
  const flyToCoordinates = useCallback((lat: number, lng: number) => {
    setIsZoomedIn(true);
    if (!stateRef.current.earthGroup) return;
    setAutoRotate(false);
    stateRef.current.autoRotate = false;

    const targetY = -((lng + 90) * (Math.PI / 180));
    const targetX = lat * (Math.PI / 180);

    stateRef.current.targetSphericalRotation = { x: targetX, y: targetY };
    stateRef.current.targetCameraPos.set(0.6, 0.2, 7.5);
    stateRef.current.targetCameraLookAt.set(0.6, 0.2, 0);
  }, []);

  useEffect(() => {
    if (activeCountry) {
      const match = countries.find(c => c.code.toLowerCase() === activeCountry.toLowerCase());
      if (match) flyToCoordinates(match.lat, match.lng);
    }
  }, [activeCountry, countries, flyToCoordinates]);

  useEffect(() => {
    if (focusCoordinates) {
      flyToCoordinates(focusCoordinates.lat, focusCoordinates.lng);
    }
  }, [focusCoordinates, flyToCoordinates]);

  // Toggle between Cinematic Overview and Close-up Earth Orbit
  const handleToggleExplore = () => {
    if (isZoomedIn) {
      // Zoom out to cinematic vista
      setIsZoomedIn(false);
      stateRef.current.targetCameraPos.set(0, 0, 13.5);
      stateRef.current.targetCameraLookAt.set(0, 0, 0);
      stateRef.current.targetSphericalRotation = null;
      setAutoRotate(true);
    } else {
      // Zoom in to Earth
      setIsZoomedIn(true);
      stateRef.current.targetCameraPos.set(0.6, 0.2, 8.2);
      stateRef.current.targetCameraLookAt.set(0.6, 0.2, 0);
    }
  };

  // MAIN THREE.JS LIVE 3D WEBGL ENGINE
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Detect GPU capabilities
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    stateRef.current.scene = scene;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1500);
    camera.position.set(0, 0, 13.5);
    stateRef.current.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    stateRef.current.renderer = renderer;

    // 3. DEEP SPACE BACKDROP & ASTROMETRIC STARS
    // 3.1 Milky Way Celestial Sky Sphere
    const skyGeo = new THREE.SphereGeometry(300, 48, 48);
    const skyMat = new THREE.MeshBasicMaterial({
      map: createRealisticMilkyWayTexture(2048, 1024),
      side: THREE.BackSide,
      depthWrite: false
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // 3.2 Deep Space Star Points with realistic magnitude distribution
    const starCount = isSoftwareGl ? 900 : 2500;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 110 + Math.random() * 150;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      starPos[i * 3 + 2] = r * Math.cos(ph);

      const b = 0.6 + Math.random() * 0.4;
      const isBlue = Math.random() > 0.8;
      const isGold = Math.random() > 0.85;
      starCol[i * 3] = isGold ? 1.0 : isBlue ? 0.85 * b : b;
      starCol[i * 3 + 1] = isGold ? 0.9 * b : isBlue ? 0.92 * b : b;
      starCol[i * 3 + 2] = isBlue ? 1.0 : isGold ? 0.7 * b : b;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    const starMat = new THREE.PointsMaterial({
      size: 1.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true
    });
    scene.add(new THREE.Points(starGeo, starMat));

    // 4. LIGHTING RIG (MATCHING THE REFERENCE IMAGE SUN ANGLE: TOP-LEFT SUNLIGHT)
    // Primary Sunlight casting crisp planetary light from upper-left
    const sunLight = new THREE.DirectionalLight(0xfffbf0, 3.8);
    sunLight.position.set(-28, 22, 24);
    scene.add(sunLight);

    // Subtle cosmic rim back light for deep space definition
    const cosmicRimLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    cosmicRimLight.position.set(24, -12, -18);
    scene.add(cosmicRimLight);

    // Deep space ambient fill (slightly raised to reveal the night hemisphere,
    // which was previously near-black and looked flat)
    const ambientLight = new THREE.AmbientLight(0x223044, 1.7);
    scene.add(ambientLight);

    // Natural skylight: blue sky from above, dark ocean below — this gives the
    // planet's unlit side the soft blue fill of scattered light instead of black.
    const hemiLight = new THREE.HemisphereLight(0x3d5a80, 0x0a1020, 0.9);
    scene.add(hemiLight);

    // 5. CENTRAL REALISTIC EARTH SYSTEM
    const earthRadius = 4.5;
    const earthGroup = new THREE.Group();
    // Positioned slightly right to harmoniously frame the hero typography on the left
    earthGroup.position.set(0.65, 0.25, 0);
    earthGroup.rotation.x = 0.234; // 23.4° axial tilt
    scene.add(earthGroup);
    stateRef.current.earthGroup = earthGroup;

    // 5.1 Earth Albedo, Specular Oceans & Mountain Relief
    const dayTexture = createRealisticEarthDayTexture();
    const nightTexture = createRealisticEarthNightTexture();
    const roughnessTexture = createRealisticEarthRoughnessTexture();
    const bumpTexture = createRealisticEarthBumpTexture();

    const earthGeo = new THREE.SphereGeometry(earthRadius, isSoftwareGl ? 40 : 64, isSoftwareGl ? 40 : 64);
    const earthMat = new THREE.MeshStandardMaterial({
      map: dayTexture,
      roughnessMap: roughnessTexture,
      roughness: 0.6,
      metalness: 0.0,
      bumpMap: bumpTexture,
      bumpScale: 0.035,
      emissiveMap: nightTexture,
      emissive: new THREE.Color(0xffe6b0),
      emissiveIntensity: 0.5
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earthMesh);

    // 5.2 Atmospheric Rayleigh Scattering Rim Glow
    // A Fresnel-based shader: glow is strongest at the limb (where the view
    // grazes the sphere) and fades to nothing facing the camera — this is what
    // produces a believable thin blue atmosphere halo rather than a flat disc.
    const atmoGeo = new THREE.SphereGeometry(earthRadius * 1.04, 96, 96);
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          // BackSide sphere: flip the normal so the rim faces outward
          vec3 n = normalize(vNormal);
          float fresnel = pow(1.0 - abs(dot(n, vViewDir)), 3.5);

          // Rayleigh-ish blue: deeper blue at the limb, paler toward the edge
          vec3 deepBlue = vec3(0.08, 0.32, 0.95);
          vec3 paleBlue = vec3(0.38, 0.72, 1.0);
          vec3 atmoColor = mix(deepBlue, paleBlue, fresnel * 0.8);

          float alpha = fresnel * 1.35;
          gl_FragColor = vec4(atmoColor, 1.0) * alpha;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });
    earthGroup.add(new THREE.Mesh(atmoGeo, atmoMat));

    // Inner atmosphere: a subtle forward-scattered glow just above the surface
    const innerAtmoGeo = new THREE.SphereGeometry(earthRadius * 1.008, 64, 64);
    const innerAtmoMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec3 n = normalize(vNormal);
          float fresnel = pow(1.0 - abs(dot(n, vViewDir)), 2.0);
          gl_FragColor = vec4(0.5, 0.78, 1.0, 1.0) * fresnel * 0.35;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      transparent: true,
      depthWrite: false
    });
    earthGroup.add(new THREE.Mesh(innerAtmoGeo, innerAtmoMat));

    // 5.3 Dynamic Weather Cloud Layer
    const cloudsGeo = new THREE.SphereGeometry(earthRadius * 1.012, 48, 48);
    const cloudsTexture = createRealisticEarthCloudTexture();
    const cloudsMat = new THREE.MeshStandardMaterial({
      map: cloudsTexture,
      transparent: true,
      opacity: 0.82,
      blending: THREE.NormalBlending,
      depthWrite: false
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    earthGroup.add(cloudsMesh);
    stateRef.current.cloudsMesh = cloudsMesh;

    // 5.4 Human Citizen Beacons
    const beaconGroup = new THREE.Group();
    earthGroup.add(beaconGroup);
    stateRef.current.beaconGroup = beaconGroup;

    const interactiveMeshes: { mesh: THREE.Object3D; data: GlobeUserNode }[] = [];
    nodes.forEach(node => {
      const isMe = currentUserId && node.userId === currentUserId;
      const pos = latLngToVector3(node.lat, node.lng, earthRadius * 1.014);
      const normal = pos.clone().normalize();

      const singleBeacon = new THREE.Group();
      singleBeacon.position.copy(pos);
      singleBeacon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

      const auraGeo = new THREE.RingGeometry(0.04, isMe ? 0.22 : 0.14, 24);
      const auraMat = new THREE.MeshBasicMaterial({
        color: isMe ? 0x10b981 : 0x06b6d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      const auraMesh = new THREE.Mesh(auraGeo, auraMat);
      auraMesh.rotation.x = Math.PI / 2;
      singleBeacon.add(auraMesh);

      const pearlGeo = new THREE.SphereGeometry(isMe ? 0.12 : 0.08, 16, 16);
      const pearlMat = new THREE.MeshStandardMaterial({
        color: isMe ? 0x34d399 : 0x38bdf8,
        emissive: isMe ? 0x059669 : 0x0284c7,
        emissiveIntensity: 2.2
      });
      const pearlMesh = new THREE.Mesh(pearlGeo, pearlMat);
      pearlMesh.position.y = 0.1;
      singleBeacon.add(pearlMesh);

      beaconGroup.add(singleBeacon);
      interactiveMeshes.push({ mesh: pearlMesh, data: node });
    });
    stateRef.current.interactiveMeshes = interactiveMeshes;

    // 6. CELESTIAL BACKGROUND: JUPITER (UPPER RIGHT)
    const jupiterGeo = new THREE.SphereGeometry(2.2, 36, 36);
    const jupiterMat = new THREE.MeshStandardMaterial({
      map: createJupiterTexture(1024, 512),
      roughness: 0.85,
      metalness: 0.05
    });
    const jupiterMesh = new THREE.Mesh(jupiterGeo, jupiterMat);
    jupiterMesh.position.set(11.5, 5.0, -9.5);
    jupiterMesh.rotation.x = 0.05;
    scene.add(jupiterMesh);
    stateRef.current.jupiterMesh = jupiterMesh;

    // 7. CELESTIAL BACKGROUND: SATURN WITH RINGS (MID RIGHT)
    const saturnGroup = new THREE.Group();
    saturnGroup.position.set(8.2, 0.4, -7.0);
    saturnGroup.rotation.z = -0.38;
    saturnGroup.rotation.x = 0.48;

    const saturnGeo = new THREE.SphereGeometry(1.2, 32, 32);
    const saturnMat = new THREE.MeshStandardMaterial({
      color: 0xecd5b0,
      roughness: 0.82,
      metalness: 0.08
    });
    const saturnMesh = new THREE.Mesh(saturnGeo, saturnMat);
    saturnGroup.add(saturnMesh);

    // Saturn Rings with Cassini Division
    const ringGeo = new THREE.RingGeometry(1.5, 3.2, 64);
    const ringPos = ringGeo.attributes.position;
    const ringUv = ringGeo.attributes.uv;
    for (let i = 0; i < ringPos.count; i++) {
      const vx = ringPos.getX(i);
      const vy = ringPos.getY(i);
      const dist = Math.sqrt(vx * vx + vy * vy);
      const u = (dist - 1.5) / (3.2 - 1.5);
      ringUv.setXY(i, u, 0.5);
    }
    ringGeo.attributes.uv.needsUpdate = true;

    const ringMat = new THREE.MeshStandardMaterial({
      map: createSaturnRingTexture(1024),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      roughness: 0.6
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    saturnGroup.add(ringMesh);
    scene.add(saturnGroup);
    stateRef.current.saturnGroup = saturnGroup;

    // 8. CELESTIAL BACKGROUND: MOON (UPPER LEFT ABOVE EARTH)
    const moonGeo = new THREE.SphereGeometry(0.55, 24, 24);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xd0d5dd,
      roughness: 0.95
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.set(-6.8, 5.2, -4.5);
    scene.add(moonMesh);
    stateRef.current.moonMesh = moonMesh;

    // 9. FOREGROUND 3D ASTEROID BELT (陨石带 / 小行星群)
    // Irregular rocky dodecahedron geometry generator
    const createFacetedRockGeometry = (radius: number) => {
      const geo = new THREE.DodecahedronGeometry(radius, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const noise = 1 + Math.sin(vx * 4.2) * Math.cos(vy * 3.8) * 0.35;
        pos.setXYZ(i, vx * noise, vy * noise, vz * noise);
      }
      geo.computeVertexNormals();
      return geo;
    };

    const asteroidBelt: {
      mesh: THREE.Mesh;
      baseX: number;
      baseY: number;
      baseZ: number;
      speed: number;
      rot: THREE.Vector3;
    }[] = [];

    const asteroidCount = isSoftwareGl ? 35 : 75;
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x948b82,
      roughness: 0.88,
      metalness: 0.12
    });

    for (let i = 0; i < asteroidCount; i++) {
      // Distribute along an arc sweeping from bottom-left to bottom-right across the foreground
      const t = i / asteroidCount; // 0 to 1
      const sz = 0.08 + Math.random() * 0.38 + (i % 7 === 0 ? 0.3 : 0);
      const rockGeo = createFacetedRockGeometry(sz);
      const rockMesh = new THREE.Mesh(rockGeo, rockMat);

      // Sweeping curve across bottom foreground
      const angle = (t - 0.5) * 1.8;
      const x = Math.sin(angle) * 14.5;
      const y = -4.6 + Math.cos(angle) * 1.5 + (Math.random() - 0.5) * 1.8;
      const z = 2.5 + Math.cos(angle) * 3.5 + (Math.random() - 0.5) * 2.5;

      rockMesh.position.set(x, y, z);
      rockMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(rockMesh);

      asteroidBelt.push({
        mesh: rockMesh,
        baseX: x,
        baseY: y,
        baseZ: z,
        speed: 0.02 + Math.random() * 0.04,
        rot: new THREE.Vector3(
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02
        )
      });
    }
    stateRef.current.asteroidBelt = asteroidBelt;

    // 10. RAYCASTING & POINTER INTERACTION
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      stateRef.current.isDragging = true;
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
      stateRef.current.previousMousePosition = { x: cx, y: cy };
      stateRef.current.targetSphericalRotation = null;
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;

      if (stateRef.current.isDragging && stateRef.current.earthGroup) {
        const dx = cx - stateRef.current.previousMousePosition.x;
        const dy = cy - stateRef.current.previousMousePosition.y;
        stateRef.current.earthGroup.rotation.y += dx * 0.005;
        stateRef.current.earthGroup.rotation.x += dy * 0.005;
        stateRef.current.rotationVelocity = { x: dy * 0.002, y: dx * 0.002 };
        stateRef.current.previousMousePosition = { x: cx, y: cy };
      }

      // Check pin raycast hover
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const candidateObjects = stateRef.current.interactiveMeshes.map(m => m.mesh);
      const intersects = raycaster.intersectObjects(candidateObjects, true);
      if (intersects.length > 0) {
        const found = stateRef.current.interactiveMeshes.find(
          item => item.mesh === intersects[0].object
        );
        if (found) {
          setHoveredNode(found.data);
          setHoverPosition({ x: cx, y: cy });
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      setHoveredNode(null);
      setHoverPosition(null);
      renderer.domElement.style.cursor = 'default';
    };

    const onPointerUp = () => {
      stateRef.current.isDragging = false;
    };

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const candidateObjects = stateRef.current.interactiveMeshes.map(m => m.mesh);
      const intersects = raycaster.intersectObjects(candidateObjects, true);
      if (intersects.length > 0) {
        const found = stateRef.current.interactiveMeshes.find(
          item => item.mesh === intersects[0].object
        );
        if (found) {
          flyToCoordinates(found.data.lat, found.data.lng);
          onSelectUser(found.data);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * 0.008;
      stateRef.current.targetCameraPos.z = Math.max(
        6.5,
        Math.min(20.0, stateRef.current.targetCameraPos.z + zoomDelta)
      );
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    dom.addEventListener('click', onClick);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // Touch
    dom.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp, { passive: true });

    // Window resize
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // 11. ANIMATION LOOP
    const clock = new THREE.Clock();
    const animate = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Camera position & look-at smooth dampening
      camera.position.lerp(stateRef.current.targetCameraPos, 0.06);
      stateRef.current.currentCameraLookAt.lerp(stateRef.current.targetCameraLookAt, 0.06);
      camera.lookAt(stateRef.current.currentCameraLookAt);

      // Earth rotation
      if (stateRef.current.earthGroup) {
        if (stateRef.current.targetSphericalRotation) {
          stateRef.current.earthGroup.rotation.y = THREE.MathUtils.damp(
            stateRef.current.earthGroup.rotation.y,
            stateRef.current.targetSphericalRotation.y,
            3.5,
            delta
          );
          stateRef.current.earthGroup.rotation.x = THREE.MathUtils.damp(
            stateRef.current.earthGroup.rotation.x,
            stateRef.current.targetSphericalRotation.x,
            3.5,
            delta
          );
        } else if (!stateRef.current.isDragging) {
          if (stateRef.current.autoRotate) {
            stateRef.current.earthGroup.rotation.y += 0.0012;
          } else {
            stateRef.current.earthGroup.rotation.y += stateRef.current.rotationVelocity.y;
            stateRef.current.earthGroup.rotation.x += stateRef.current.rotationVelocity.x;
            stateRef.current.rotationVelocity.x *= 0.94;
            stateRef.current.rotationVelocity.y *= 0.94;
          }
        }
      }

      // Weather cloud rotation
      if (stateRef.current.cloudsMesh) {
        stateRef.current.cloudsMesh.rotation.y += 0.0005;
      }

      // Jupiter slow axial rotation
      if (stateRef.current.jupiterMesh) {
        stateRef.current.jupiterMesh.rotation.y += 0.0004;
      }

      // Saturn slow axial rotation
      if (stateRef.current.saturnGroup) {
        stateRef.current.saturnGroup.rotation.y += 0.0003;
      }

      // Asteroid belt orbital drift and tumbling
      stateRef.current.asteroidBelt.forEach(item => {
        item.mesh.rotation.x += item.rot.x;
        item.mesh.rotation.y += item.rot.y;
        item.mesh.rotation.z += item.rot.z;
        const wave = Math.sin(elapsed * 0.4 + item.baseX * 0.2) * 0.15;
        item.mesh.position.y = item.baseY + wave;
      });

      renderer.render(scene, camera);
      stateRef.current.frameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(stateRef.current.frameId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);

      dom.removeEventListener('mousedown', onPointerDown);
      dom.removeEventListener('click', onClick);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('touchstart', onPointerDown);

      renderer.dispose();
      if (container.contains(dom)) container.removeChild(dom);
    };
  }, [nodes, currentUserId, onSelectUser, flyToCoordinates]);

  return (
    <div className="relative w-full h-full min-h-[calc(100vh-4rem)] flex-1 overflow-hidden bg-[#010309] select-none">
      {/* ============================================================== */}
      {/* 1. LIVE THREE.JS 3D WEBGL UNIVERSE CANVAS                      */}
      {/* ============================================================== */}
      <div ref={mountRef} className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing" />

      {/* ============================================================== */}
      {/* 2. WORLD-CLASS USER HERO OVERLAY                               */}
      {/* ============================================================== */}
      <div className="relative z-10 h-full min-h-[calc(100vh-4rem)] max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 flex flex-col justify-between pt-14 sm:pt-20 pb-8 pointer-events-none">
        {/* Left Hero Title & CTA */}
        <div className="max-w-xl pointer-events-auto">
          <h1 className="font-extrabold text-5xl sm:text-6xl md:text-7xl tracking-tight text-white font-sans drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)]">
            EARTH ONE
          </h1>
          <h2 className="font-bold text-3xl sm:text-4xl md:text-5xl text-slate-100 tracking-tight mt-2 font-sans drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)]">
            A New World Awaits
          </h2>
          <p className="text-base sm:text-lg text-slate-300 mt-5 font-normal leading-relaxed drop-shadow-md">
            Explore the universe, discover infinite possibilities.
          </p>

          {/* Start Exploring Action Button */}
          <div className="mt-8 flex items-center space-x-4">
            <button
              onClick={handleToggleExplore}
              className="inline-flex items-center space-x-3 px-8 py-3.5 rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-sm sm:text-base shadow-xl shadow-blue-500/40 border border-cyan-300/50 cursor-pointer transition-all hover:scale-105 active:scale-95 group"
            >
              <span>{isZoomedIn ? 'Overview View' : 'Start Exploring'}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
            </button>

            {onExploreUniverse && (
              <button
                onClick={onExploreUniverse}
                className="inline-flex items-center space-x-2 px-5 py-3.5 rounded-full bg-slate-900/80 hover:bg-slate-800/90 border border-slate-700/80 text-slate-200 text-sm font-medium backdrop-blur-md cursor-pointer transition-all hover:text-white"
              >
                <Orbit className="w-4 h-4 text-purple-400" />
                <span>Solar System</span>
              </button>
            )}
          </div>
        </div>

        {/* Bottom Cards Row: Universe Overview + Our Galaxy */}
        <div className="w-full flex flex-col lg:flex-row items-end justify-between gap-6 pointer-events-auto pt-10">
          {/* Bottom Left: Universe Overview Card */}
          <div className="w-full max-w-lg p-5 rounded-3xl bg-slate-950/70 border border-slate-800/80 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 tracking-wide mb-4">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>Universe Overview</span>
            </div>

            <div className="flex items-center justify-between">
              {/* Stat 1 */}
              <div>
                <div className="font-bold text-2xl sm:text-3xl text-white font-mono">
                  8.0B+
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  People on Earth
                </div>
              </div>

              <div className="h-9 w-[1px] bg-slate-800" />

              {/* Stat 2 */}
              <div>
                <div className="font-bold text-2xl sm:text-3xl text-white font-mono">
                  8
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Planets
                </div>
              </div>

              <div className="h-9 w-[1px] bg-slate-800" />

              {/* Stat 3 */}
              <div>
                <div className="font-bold text-2xl sm:text-3xl text-white font-mono">
                  100B+
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Stars in Galaxy
                </div>
              </div>

              {/* Telemetry Waveform */}
              <div className="hidden sm:block pl-2">
                <svg className="w-24 h-9 overflow-visible" viewBox="0 0 100 36">
                  <path
                    d="M 0,22 Q 15,22 25,10 T 50,26 T 75,6 T 100,18"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Bottom Right: Our Galaxy Card */}
          <div
            onClick={onExploreUniverse || handleToggleExplore}
            className="w-full max-w-sm p-4 rounded-3xl bg-slate-950/70 hover:bg-slate-900/80 border border-slate-800/80 backdrop-blur-xl shadow-2xl flex items-center space-x-4 cursor-pointer transition-all hover:scale-[1.02] group"
          >
            {/* Galaxy Thumbnail */}
            <div className="w-16 h-16 rounded-2xl overflow-hidden border border-purple-500/40 shadow-lg shadow-purple-500/20 shrink-0 relative bg-[#040817] flex items-center justify-center">
              <Orbit className="w-9 h-9 text-purple-400 animate-spin" style={{ animationDuration: '30s' }} />
              <div className="absolute inset-0 bg-gradient-to-tr from-purple-600/30 via-cyan-500/20 to-transparent" />
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm sm:text-base text-white group-hover:text-cyan-300 transition-colors">
                Our Galaxy
              </h4>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                A vast home in the cosmos
              </p>
              <div className="mt-2 text-xs font-semibold text-cyan-400 flex items-center space-x-1 group-hover:translate-x-1 transition-transform">
                <span>Learn More</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Centered Footer Motto */}
        <div className="w-full text-center mt-6 pt-4 border-t border-slate-900/80 text-[11px] text-slate-500 font-mono tracking-wider">
          EARTH ONE · Explore the Universe · Build a Better Tomorrow
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. RIGHT FLOATING VERTICAL ACTION RAIL                         */}
      {/* ============================================================== */}
      <aside className="fixed right-6 top-1/2 -translate-y-1/2 z-20 flex flex-col space-y-3 pointer-events-auto">
        <div className="p-2 rounded-2xl bg-slate-950/70 border border-slate-800/80 backdrop-blur-xl shadow-2xl flex flex-col space-y-3 text-slate-400">
          {/* Orbit switch */}
          <button
            onClick={handleToggleExplore}
            className={`p-2.5 rounded-xl transition-all cursor-pointer ${
              isZoomedIn
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40'
                : 'hover:bg-slate-800/80 hover:text-white'
            }`}
            title={isZoomedIn ? 'Zoom out to cosmos' : 'Inspect Earth close-up'}
          >
            <Orbit className="w-4 h-4" />
          </button>

          {/* Solar explorer */}
          {onExploreUniverse && (
            <button
              onClick={onExploreUniverse}
              className="p-2.5 rounded-xl hover:bg-slate-800/80 hover:text-purple-300 transition-colors cursor-pointer"
              title="Solar System Engine"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}

          {/* Citizen beacons */}
          <button
            onClick={() => setShowBeacons(!showBeacons)}
            className={`p-2.5 rounded-xl transition-colors cursor-pointer ${
              showBeacons ? 'text-cyan-400 bg-cyan-950/60' : 'hover:bg-slate-800/80 hover:text-white'
            }`}
            title="Toggle Citizen Beacons"
          >
            <Network className="w-4 h-4" />
          </button>

          {/* Auto rotate toggle */}
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-2.5 rounded-xl transition-colors cursor-pointer ${
              autoRotate ? 'text-cyan-400' : 'text-slate-600'
            }`}
            title="Auto Rotation"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Deep Space Sound */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors cursor-pointer"
            title={soundEnabled ? 'Mute' : 'Play Cosmic Sound'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* ============================================================== */}
      {/* 4. HOVERED CITIZEN TOOLTIP                                     */}
      {/* ============================================================== */}
      {hoveredNode && hoverPosition && (
        <div
          className="fixed z-40 pointer-events-none px-4 py-3 rounded-2xl bg-slate-950/90 border border-cyan-400/50 text-slate-100 shadow-2xl backdrop-blur-xl text-xs max-w-xs animate-in fade-in"
          style={{
            left: `${hoverPosition.x + 16}px`,
            top: `${hoverPosition.y - 25}px`
          }}
        >
          <div className="flex items-center space-x-3 mb-1">
            <img
              src={hoveredNode.avatar}
              alt={hoveredNode.displayName}
              className="w-8 h-8 rounded-full object-cover border border-cyan-400 shadow"
            />
            <div>
              <div className="font-bold text-white flex items-center space-x-1.5">
                <span>{hoveredNode.displayName}</span>
                <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-cyan-300 font-mono">
                  {hoveredNode.countryCode}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center space-x-1 mt-0.5">
                <MapPin className="w-3 h-3 text-cyan-400" />
                <span>{hoveredNode.cityName}, {hoveredNode.countryName}</span>
              </p>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-cyan-400 font-semibold flex items-center space-x-1">
            <ExternalLink className="w-3 h-3" />
            <span>Click to visit citizen space</span>
          </div>
        </div>
      )}
    </div>
  );
};
