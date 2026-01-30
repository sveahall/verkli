"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function hexToVec3(hex: string): THREE.Vector3 {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return new THREE.Vector3(r, g, b);
}

type GradientCanvasProps = {
  colors: [string, string, string, string];
  speed?: number;
  grain?: boolean;
  className?: string;
};

export default function GradientCanvas({
  colors,
  speed = 0.25,
  grain = false,
  className = "fixed inset-0 -z-10",
}: GradientCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const [c1, c2, c3, c4] = colors.map(hexToVec3);

    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const geometry = new THREE.PlaneGeometry(2, 2);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uMouseStrength: { value: 1 },
        uColor1: { value: c1 },
        uColor2: { value: c2 },
        uColor3: { value: c3 },
        uColor4: { value: c4 },
      },
      fragmentShader: `
        precision highp float;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec2 uMouse;
        uniform float uMouseStrength;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        uniform vec3 uColor4;

        void main() {
          vec2 uv = gl_FragCoord.xy / uResolution.xy;

          float wave = sin(uv.y * 4.0 + uTime) * 0.1;
          vec3 color = mix(uColor1, uColor2, uv.y + wave);
          color = mix(color, uColor3, uv.y * 0.2 + uv.x * 0.2);
          color = mix(color, uColor4, uv.x * 0.1);

          float mouseInfluence = 0.0;
          vec2 mouseOffset = uv - uMouse;
          float dist = length(mouseOffset);
          mouseInfluence = 0.12 * uMouseStrength * exp(-dist * 2.5);
          color += vec3(mouseInfluence * 0.5, mouseInfluence * 0.4, mouseInfluence * 0.6);

          float centerDist = length(uv - vec2(0.5, 0.5));
          float centerGlow = 0.08 * (1.0 - smoothstep(0.0, 0.7, centerDist));
          color += vec3(centerGlow, centerGlow * 0.9, centerGlow * 1.1);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const mouseTarget = { x: 0.5, y: 0.5 };
    const mouseCurrent = { x: 0.5, y: 0.5 };
    let isTouchDevice = false;
    try {
      isTouchDevice = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    } catch {
      isTouchDevice = false;
    }
    material.uniforms.uMouseStrength.value = isTouchDevice ? 0.25 : 1.0;

    const handleResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseTarget.x = e.clientX / window.innerWidth;
      mouseTarget.y = 1.0 - e.clientY / window.innerHeight;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouseTarget.x = e.touches[0].clientX / window.innerWidth;
        mouseTarget.y = 1.0 - e.touches[0].clientY / window.innerHeight;
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    let frameId: number;
    const animate = () => {
      const lerp = isTouchDevice ? 0.03 : 0.08;
      mouseCurrent.x += (mouseTarget.x - mouseCurrent.x) * lerp;
      mouseCurrent.y += (mouseTarget.y - mouseCurrent.y) * lerp;
      material.uniforms.uMouse.value.set(mouseCurrent.x, mouseCurrent.y);
      material.uniforms.uTime.value += speed;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [colors, speed]);

  return (
    <div className={className} aria-hidden>
      <div ref={mountRef} className="absolute inset-0" />
      {grain && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      )}
    </div>
  );
}
