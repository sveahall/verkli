"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function GradientBackground() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

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
      },
      fragmentShader: `
        precision highp float;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec2 uMouse;
        uniform float uMouseStrength;

        void main() {
          vec2 uv = gl_FragCoord.xy / uResolution.xy;

          float wave = sin(uv.y * 4.0 + uTime * 0.2) * 0.1;
          vec3 color1 = vec3(0.07, 0.08, 0.12);
          vec3 color2 = vec3(0.45, 0.35, 0.75);
          vec3 color3 = vec3(0.5, 0.75, 0.65);

          vec3 color = mix(color1, color2, uv.y + wave);
          color = mix(color, color3, uv.x * 0.4);

          float mouseInfluence = 0.0;
          vec2 mouseOffset = uv - uMouse;
          float dist = length(mouseOffset);
          mouseInfluence = 0.15 * uMouseStrength * exp(-dist * 2.5);
          color += vec3(mouseInfluence * 0.5, mouseInfluence * 0.4, mouseInfluence * 0.6);

          float centerDist = length(uv - vec2(0.5, 0.5));
          float centerGlow = 0.12 * (1.0 - smoothstep(0.0, 0.7, centerDist));
          color += vec3(centerGlow, centerGlow * 0.9, centerGlow * 1.1);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const mouseTarget = { x: 0.25, y: 0.25 };
    const mouseCurrent = { x: 0.25, y: 0.25 };
    let isTouchDevice = false;
    try {
      isTouchDevice = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    } catch {
      isTouchDevice = false;
    }
    const mouseStrength = isTouchDevice ? 0.25 : 1.0;
    material.uniforms.uMouseStrength.value = mouseStrength;

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
      material.uniforms.uTime.value += 0.05;
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
  }, []);

  return <div ref={mountRef} className="fixed inset-0 -z-10" aria-hidden />;
}
