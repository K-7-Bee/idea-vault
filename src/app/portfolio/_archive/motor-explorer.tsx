"use client";

import type { BufferGeometry, Mesh, MeshStandardMaterial } from "three";
import { useEffect, useRef, useState } from "react";

// A stylised electric motor in 3D: drag to turn it, scroll or pinch to zoom, click a part to
// learn what it does. three.js only loads in the browser, once the panel is near the screen.

const PARTS: Record<string, string> = {
  "Stator housing": "The fixed outer shell. It holds the stator windings, whose magnetic field pushes the rotor around.",
  "Front rim": "An end bell. It closes the housing and carries a bearing for the shaft.",
  "Rear rim": "The other end bell, with the second bearing that keeps the rotor centred.",
  Rotor: "The spinning core. It turns as it chases the stator's rotating magnetic field.",
  "Drive shaft": "Passes the rotor's torque out of the motor to whatever it drives.",
  "Cooling fin": "Adds surface area so the heat from the windings escapes into the air.",
};

type Controls = { pause: () => void; reset: () => void; select: (name: string | null) => void };

export default function MotorExplorer() {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls>(null);
  const [status, setStatus] = useState<"idle" | "ready" | "failed">("idle");
  const [spinning, setSpinning] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dispose = () => {};
    let cancelled = false;

    async function start() {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (cancelled || !el) return;

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      const home = new THREE.Vector3(5, 3.5, 6);
      camera.position.copy(home);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      el.replaceChildren(renderer.domElement);
      renderer.domElement.className = "block h-full w-full cursor-grab active:cursor-grabbing";
      renderer.domElement.setAttribute("aria-hidden", "true");

      const orbit = new OrbitControls(camera, renderer.domElement);
      orbit.enableDamping = true;
      orbit.minDistance = 3;
      orbit.maxDistance = 13;

      const blue = new THREE.MeshStandardMaterial({ color: 0x60b5ff, metalness: 0.6, roughness: 0.3 });
      const teal = new THREE.MeshStandardMaterial({ color: 0x76abae, metalness: 0.8, roughness: 0.25 });
      const slate = new THREE.MeshStandardMaterial({ color: 0x3d434e, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });

      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      const light = new THREE.PointLight(0x60b5ff, 90);
      light.position.set(4, 5, 5);
      scene.add(light);
      const fill = new THREE.PointLight(0x76abae, 40);
      fill.position.set(-5, -2, -4);
      scene.add(fill);

      const assembly = new THREE.Group();
      scene.add(assembly);
      const meshes: Mesh[] = [];
      const part = (
        geometry: BufferGeometry,
        material: MeshStandardMaterial,
        name: string,
        position: [number, number, number],
        rotation?: [number, number, number],
      ) => {
        // Each part gets its own copy of the material so it can light up on its own.
        const mesh = new THREE.Mesh(geometry, material.clone());
        mesh.position.set(...position);
        if (rotation) mesh.rotation.set(...rotation);
        mesh.userData.name = name;
        assembly.add(mesh);
        meshes.push(mesh);
      };

      part(new THREE.CylinderGeometry(1.25, 1.25, 2.3, 32, 1, true), slate, "Stator housing", [0, 0, 0], [0, 0, Math.PI / 2]);
      part(new THREE.TorusGeometry(1.25, 0.09, 12, 40), blue, "Front rim", [1.15, 0, 0], [0, Math.PI / 2, 0]);
      part(new THREE.TorusGeometry(1.25, 0.09, 12, 40), blue, "Rear rim", [-1.15, 0, 0], [0, Math.PI / 2, 0]);
      part(new THREE.CylinderGeometry(0.63, 0.63, 2.65, 24), teal, "Rotor", [0, 0, 0], [0, 0, Math.PI / 2]);
      part(new THREE.CylinderGeometry(0.16, 0.16, 3.7, 16), blue, "Drive shaft", [0, 0, 0], [0, 0, Math.PI / 2]);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        part(new THREE.BoxGeometry(1.6, 0.12, 0.25), teal, "Cooling fin", [0, Math.cos(a) * 1.36, Math.sin(a) * 1.36], [a, 0, 0]);
      }

      const highlight = (name: string | null) => {
        for (const m of meshes) {
          const mat = m.material as MeshStandardMaterial;
          mat.emissive.set(m.userData.name === name ? 0x60b5ff : 0x000000);
          mat.emissiveIntensity = m.userData.name === name ? 0.55 : 0;
        }
      };

      // Clicks only count when the pointer barely moved, so dragging to rotate doesn't select.
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let down = { x: 0, y: 0 };
      const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
      const onUp = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const name = (raycaster.intersectObjects(meshes)[0]?.object.userData.name as string) ?? null;
        highlight(name);
        selectedRef.current = name;
        setSelected(name);
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);

      let spin = !reduced;
      controls.current = {
        select: highlight,
        pause: () => (spin = !spin),
        reset: () => {
          camera.position.copy(home);
          orbit.target.set(0, 0, 0);
          orbit.update();
        },
      };

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      // Only draw while the panel is on screen.
      let frameId = 0;
      let visible = true;
      const frame = () => {
        if (spin) assembly.rotation.y += 0.004;
        orbit.update();
        renderer.render(scene, camera);
        frameId = visible ? requestAnimationFrame(frame) : 0;
      };
      const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !frameId) frameId = requestAnimationFrame(frame);
      });
      io.observe(el);
      frameId = requestAnimationFrame(frame);

      setStatus("ready");
      setSpinning(spin);
      highlight(selectedRef.current);

      dispose = () => {
        cancelAnimationFrame(frameId);
        io.disconnect();
        ro.disconnect();
        orbit.dispose();
        for (const m of meshes) {
          m.geometry.dispose();
          (m.material as MeshStandardMaterial).dispose();
        }
        renderer.dispose();
        controls.current = null;
      };
    }

    // Wait until the panel is close to the screen before loading three.js.
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        near.disconnect();
        start().catch((err) => {
          console.error(err);
          if (!cancelled) setStatus("failed");
        });
      },
      { rootMargin: "400px" },
    );
    near.observe(el);

    return () => {
      cancelled = true;
      near.disconnect();
      dispose();
    };
  }, []);

  const button =
    "rounded-full border border-pf-line bg-pf-glass px-4 py-2 text-sm transition-colors hover:border-pf-blue disabled:opacity-40";

  return (
    <div>
      <div
        role="group"
        aria-label="Motor model. Use the part buttons below for a keyboard-accessible explanation."
        className="relative h-80 overflow-hidden rounded-2xl border border-pf-line bg-[radial-gradient(circle,#3f4a58,var(--pf-deep)_75%)]"
      >
        {status !== "ready" && (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-pf-muted">
            {status === "failed" ? "The 3D model couldn't load. Explore every part using the diagram and buttons below." : "Loading 3D model… You can also explore the parts below."}
          </p>
        )}
        {/* three.js owns this box: it puts its canvas here, so React keeps nothing else inside. */}
        <div ref={host} className="absolute inset-0" />
      </div>
      <figure className="mt-5 rounded-2xl border border-pf-line bg-pf-deep p-4">
        <svg viewBox="0 0 400 180" role="img" aria-labelledby="motor-diagram-title motor-diagram-description" className="h-auto w-full">
          <title id="motor-diagram-title">Simplified motor cross-section</title>
          <desc id="motor-diagram-description">A housing surrounds the rotor. The shaft runs through the rotor and both end rims. Cooling fins sit outside the housing.</desc>
          <g fill="none" strokeWidth="3">
            <rect x="80" y="50" width="240" height="90" rx="10" stroke="#eeeeee" />
            <rect x="105" y="75" width="190" height="40" rx="6" stroke="#76abae" />
            <path d="M30 95h340M90 50v90M310 50v90" stroke="#60b5ff" />
            <path d="M125 40v10m35-10v10m35-10v10m35-10v10m35-10v10" stroke="#76abae" />
          </g>
          <g fill="#eeeeee" fontSize="13" textAnchor="middle">
            <text x="200" y="26">Cooling fins</text>
            <text x="200" y="68">Housing</text>
            <text x="200" y="90">Rotor</text>
            <text x="200" y="164">Drive shaft through the centre</text>
            <text x="56" y="126">Rim</text><text x="344" y="126">Rim</text>
          </g>
        </svg>
        <figcaption className="mt-2 text-xs leading-relaxed text-pf-muted">Concept diagram, not to scale. Choose a part to read its role, with or without the 3D view.</figcaption>
      </figure>
      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">Explore a motor part</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.keys(PARTS).map((name) => (
            <button key={name} type="button" aria-pressed={selected === name} aria-controls="motor-part-description" onClick={() => {
              selectedRef.current = name;
              setSelected(name);
              controls.current?.select(name);
            }} className={`${button} ${selected === name ? "border-pf-blue bg-pf-blue/10 text-pf-blue" : ""}`}>{name}</button>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={status !== "ready"}
          onClick={() => {
            controls.current?.pause();
            setSpinning((s) => !s);
          }}
          className={button}
        >
          {spinning ? "Pause rotation" : "Resume rotation"}
        </button>
        <button type="button" disabled={status !== "ready"} onClick={() => controls.current?.reset()} className={button}>
          Reset view
        </button>
      </div>
      <p id="motor-part-description" aria-live="polite" className="mt-4 min-h-[3lh] font-mono text-sm leading-relaxed text-pf-blue">
        {selected ? (
          <>
            <span className="text-pf-ink">{selected}.</span> {PARTS[selected]}
          </>
        ) : (
          "Choose a part above, or click it in the 3D view, to learn what it does."
        )}
      </p>
    </div>
  );
}
