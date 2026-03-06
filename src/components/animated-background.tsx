'use client';

import { useEffect, useRef, useState } from 'react';

const GPU_BUFFER_USAGE_COPY_DST = 0x0008;
const GPU_BUFFER_USAGE_UNIFORM = 0x0040;

type WebGPUBuffer = object;
type WebGPUShaderModule = object;
type WebGPUBindGroup = object;
type WebGPUCommandBuffer = object;
type WebGPUTextureView = object;

interface WebGPUTexture {
  createView(): WebGPUTextureView;
}

interface WebGPUCanvasContext {
  configure(config: {
    alphaMode: 'premultiplied';
    device: WebGPUDevice;
    format: string;
  }): void;
  getCurrentTexture(): WebGPUTexture;
}

interface WebGPURenderPipeline {
  getBindGroupLayout(index: number): object;
}

interface WebGPURenderPassEncoder {
  setPipeline(pipeline: WebGPURenderPipeline): void;
  setBindGroup(index: number, bindGroup: WebGPUBindGroup): void;
  draw(vertexCount: number): void;
  end(): void;
}

interface WebGPUCommandEncoder {
  beginRenderPass(descriptor: {
    colorAttachments: Array<{
      clearValue: { a: number; b: number; g: number; r: number };
      loadOp: 'clear';
      storeOp: 'store';
      view: WebGPUTextureView;
    }>;
  }): WebGPURenderPassEncoder;
  finish(): WebGPUCommandBuffer;
}

interface WebGPUQueue {
  submit(commandBuffers: WebGPUCommandBuffer[]): void;
  writeBuffer(buffer: WebGPUBuffer, bufferOffset: number, data: Float32Array): void;
}

interface WebGPUDevice {
  queue: WebGPUQueue;
  createBindGroup(descriptor: {
    entries: Array<{
      binding: number;
      resource: { buffer: WebGPUBuffer };
    }>;
    layout: object;
  }): WebGPUBindGroup;
  createBuffer(descriptor: { size: number; usage: number }): WebGPUBuffer;
  createCommandEncoder(): WebGPUCommandEncoder;
  createRenderPipeline(descriptor: {
    fragment: {
      entryPoint: 'fsMain';
      module: WebGPUShaderModule;
      targets: Array<{
        blend: {
          alpha: {
            dstFactor: 'one-minus-src-alpha';
            operation: 'add';
            srcFactor: 'one';
          };
          color: {
            dstFactor: 'one-minus-src-alpha';
            operation: 'add';
            srcFactor: 'src-alpha';
          };
        };
        format: string;
      }>;
    };
    layout: 'auto';
    primitive: { topology: 'triangle-list' };
    vertex: {
      entryPoint: 'vsMain';
      module: WebGPUShaderModule;
    };
  }): WebGPURenderPipeline;
  createShaderModule(descriptor: { code: string }): WebGPUShaderModule;
}

interface WebGPUAdapter {
  requestDevice(): Promise<WebGPUDevice>;
}

interface WebGPU {
  getPreferredCanvasFormat(): string;
  requestAdapter(): Promise<WebGPUAdapter | null>;
}

interface BeamLayer {
  blur: number;
  delay: number;
  duration: number;
  height: string;
  id: string;
  left?: string;
  opacity: number;
  reverse: boolean;
  right?: string;
  rotate: number;
  theme: 'light' | 'dark';
  top: string;
  width: string;
}

interface ParticleLayer {
  delay: number;
  duration: number;
  id: string;
  left: string;
  opacity: number;
  size: number;
  theme: 'light' | 'dark';
  top: string;
  xDrift: number;
}

interface BackgroundVariant {
  darkBeams: BeamLayer[];
  darkParticles: ParticleLayer[];
  darkSurfaceOpacity: number;
  lightBeams: BeamLayer[];
  lightParticles: ParticleLayer[];
  lightSurfaceOpacity: number;
}

const SESSION_SEED_KEY = 'hud-queue-background-seed';
const TARGET_FRAME_TIME = 1000 / 24;

const OCEAN_BEAMS_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec2<f32>,
  time: f32,
  intensity: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(3.0, 1.0)
  );

  let position = positions[vertexIndex];
  var output: VertexOutput;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = position * 0.5 + vec2<f32>(0.5, 0.5);
  return output;
}

fn beam(centeredX: f32, depth: f32, offset: f32, width: f32, sway: f32) -> f32 {
  let perspective = mix(width, width * 2.8, depth);
  let distance = abs(centeredX - offset - sway);
  return smoothstep(perspective, 0.0, distance);
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let uv = input.uv;
  let aspect = uniforms.resolution.x / max(uniforms.resolution.y, 1.0);
  let centered = vec2<f32>((uv.x - 0.5) * aspect, uv.y);
  let t = uniforms.time * 0.12;

  let swayA = sin(uv.y * 7.5 - t * 1.6) * 0.045;
  let swayB = cos(uv.y * 6.0 + t * 0.9) * 0.035;
  let swayC = sin(uv.y * 9.0 + t * 1.1) * 0.025;

  var shafts = 0.0;
  shafts += beam(centered.x, uv.y, -0.32, 0.035, swayA) * 0.95;
  shafts += beam(centered.x, uv.y, -0.06, 0.028, swayB) * 1.15;
  shafts += beam(centered.x, uv.y, 0.24, 0.03, swayC) * 0.85;

  let shimmer = 0.7 + 0.3 * sin((centered.x * 22.0) - (uv.y * 10.0) + (t * 1.7));
  let depthFade = exp(-uv.y * 2.7);
  let surfaceGlow = exp(-uv.y * 9.5);
  let haze = exp(-uv.y * 4.8) * 0.09;
  let vignette = smoothstep(1.3, 0.18, length(vec2<f32>(centered.x * 1.05, uv.y * 0.85)));

  let light = shafts * shimmer * depthFade * vignette;
  let glow = surfaceGlow * 0.22 + haze * vignette;

  let color =
    vec3<f32>(0.06, 0.18, 0.30) * glow +
    vec3<f32>(0.22, 0.54, 0.74) * light * 0.34 +
    vec3<f32>(0.48, 0.80, 0.95) * light * surfaceGlow * 0.24;

  let alpha = clamp((light * 0.23) + (glow * 0.34), 0.0, 0.22) * uniforms.intensity;
  return vec4<f32>(color, alpha);
}
`;

function configureCanvas(
  canvas: HTMLCanvasElement,
  context: WebGPUCanvasContext,
  device: WebGPUDevice,
  format: string,
) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
  const width = Math.max(1, Math.round(window.innerWidth * pixelRatio));
  const height = Math.max(1, Math.round(window.innerHeight * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.configure({
    alphaMode: 'premultiplied',
    device,
    format,
  });

  return { height, pixelRatio, width };
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function getSessionSeed() {
  if (typeof window === 'undefined') {
    return 1;
  }

  const existingSeed = window.sessionStorage.getItem(SESSION_SEED_KEY);
  if (existingSeed) {
    return Number(existingSeed) || 1;
  }

  const nextSeed = Math.floor(Math.random() * 2147483646) + 1;
  window.sessionStorage.setItem(SESSION_SEED_KEY, String(nextSeed));
  return nextSeed;
}

function createBeamLayer(theme: 'light' | 'dark', random: () => number, index: number): BeamLayer {
  const fromLeft = random() > (theme === 'light' ? 0.28 : 0.38);
  const widthBase = theme === 'light' ? 24 : 28;
  const widthRange = theme === 'light' ? 20 : 22;
  const heightBase = theme === 'light' ? 58 : 66;
  const heightRange = theme === 'light' ? 18 : 24;
  const rotateBase = theme === 'light' ? 6 : 10;
  const rotateRange = theme === 'light' ? 20 : 26;
  const blurBase = theme === 'light' ? 34 : 42;
  const blurRange = theme === 'light' ? 26 : 30;

  return {
    blur: Math.round(blurBase + random() * blurRange),
    delay: Number((random() * 8).toFixed(2)),
    duration: Number((22 + random() * 16).toFixed(2)),
    height: `${Math.round(heightBase + random() * heightRange)}%`,
    id: `${theme}-${index}`,
    left: fromLeft ? `${Math.round(-16 + random() * 40)}%` : undefined,
    opacity: Number(((theme === 'light' ? 0.9 : 0.78) + random() * 0.24).toFixed(2)),
    reverse: random() > 0.5,
    right: fromLeft ? undefined : `${Math.round(-10 + random() * 18)}%`,
    rotate: Number((((fromLeft ? 1 : -1) * (rotateBase + random() * rotateRange))).toFixed(2)),
    theme,
    top: `${Math.round(-20 + random() * 14)}%`,
    width: `${Math.round(widthBase + random() * widthRange)}%`,
  };
}

function createParticleLayer(theme: 'light' | 'dark', random: () => number, index: number): ParticleLayer {
  const isLight = theme === 'light';

  return {
    delay: Number((random() * 10).toFixed(2)),
    duration: Number(((isLight ? 20 : 24) + random() * (isLight ? 14 : 18)).toFixed(2)),
    id: `${theme}-particle-${index}`,
    left: `${Math.round(random() * 100)}%`,
    opacity: Number(((isLight ? 0.42 : 0.28) + random() * (isLight ? 0.22 : 0.14)).toFixed(2)),
    size: Number(((isLight ? 3.5 : 3) + random() * (isLight ? 5.5 : 4.5)).toFixed(2)),
    theme,
    top: `${Math.round(10 + random() * 82)}%`,
    xDrift: Number((((random() - 0.5) * (isLight ? 28 : 10))).toFixed(2)),
  };
}

function createBackgroundVariant(seed: number): BackgroundVariant {
  const random = createSeededRandom(seed);
  const lightCount = 3 + Math.floor(random() * 3);
  const darkCount = 3 + Math.floor(random() * 2);
  const lightParticleCount = 14 + Math.floor(random() * 10);
  const darkParticleCount = 8 + Math.floor(random() * 6);

  return {
    darkBeams: Array.from({ length: darkCount }, (_, index) => createBeamLayer('dark', random, index)),
    darkParticles: Array.from({ length: darkParticleCount }, (_, index) => createParticleLayer('dark', random, index)),
    darkSurfaceOpacity: Number((0.88 + random() * 0.18).toFixed(2)),
    lightBeams: Array.from({ length: lightCount }, (_, index) => createBeamLayer('light', random, index)),
    lightParticles: Array.from({ length: lightParticleCount }, (_, index) => createParticleLayer('light', random, index)),
    lightSurfaceOpacity: Number((1.02 + random() * 0.2).toFixed(2)),
  };
}

const DEFAULT_VARIANT = createBackgroundVariant(7);

function getBeamStyle(beam: BeamLayer) {
  const isLight = beam.theme === 'light';
  const color = isLight ? '127, 195, 220' : '132, 210, 255';
  const startAlpha = isLight ? 0.28 : 0.18;
  const midAlpha = isLight ? 0.12 : 0.06;
  const tailAlpha = isLight ? 0.035 : 0.015;

  return {
    animation: `ocean-beam-drift ${beam.duration}s ease-in-out ${beam.delay}s infinite ${beam.reverse ? 'alternate-reverse' : 'alternate'}`,
    background: `linear-gradient(180deg, rgba(${color}, ${startAlpha}) 0%, rgba(${color}, ${midAlpha}) 24%, rgba(${color}, ${tailAlpha}) 50%, transparent 74%)`,
    filter: `blur(${beam.blur}px)`,
    height: beam.height,
    left: beam.left,
    maskImage: 'linear-gradient(180deg, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.34) 48%, transparent 100%)',
    opacity: beam.opacity,
    right: beam.right,
    top: beam.top,
    transform: `rotate(${beam.rotate}deg)`,
    width: beam.width,
  } as const;
}

function getParticleStyle(particle: ParticleLayer) {
  const isLight = particle.theme === 'light';
  const color = isLight ? '132, 182, 201' : '176, 226, 255';

  return {
    animation: `${isLight ? 'light-mote-drift' : 'dark-bubble-rise'} ${particle.duration}s linear ${particle.delay}s infinite`,
    background: `radial-gradient(circle, rgba(${color}, ${isLight ? 0.72 : 0.3}) 0%, rgba(${color}, ${isLight ? 0.34 : 0.12}) 46%, transparent 76%)`,
    boxShadow: isLight
      ? `0 0 ${particle.size * 4}px rgba(${color}, 0.18)`
      : `0 0 ${particle.size * 4}px rgba(${color}, 0.12)`,
    height: `${particle.size}px`,
    left: particle.left,
    opacity: particle.opacity,
    top: particle.top,
    transform: `translate3d(0, 0, 0)`,
    width: `${particle.size}px`,
    ['--particle-x-drift' as '--particle-x-drift']: `${particle.xDrift}px`,
  } as const;
}

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [variant, setVariant] = useState<BackgroundVariant>(DEFAULT_VARIANT);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cancelled = false;
    let animationFrameId = 0;
    let cleanupResize = () => {};
    let lastFrameTime = 0;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setVariant(createBackgroundVariant(getSessionSeed()));

    const setupWebGPU = async () => {
      const gpu = (navigator as Navigator & { gpu?: WebGPU }).gpu;
      if (!gpu) {
        return;
      }

      const adapter = await gpu.requestAdapter();
      if (!adapter || cancelled) {
        return;
      }

      const device = await adapter.requestDevice();
      if (!device || cancelled) {
        return;
      }

      const context = canvas.getContext('webgpu') as WebGPUCanvasContext | null;
      if (!context) {
        return;
      }

      const format = gpu.getPreferredCanvasFormat();
      let viewport = configureCanvas(canvas, context, device, format);

      const uniformValues = new Float32Array(4);
      const uniformBuffer = device.createBuffer({
        size: uniformValues.byteLength,
        usage: GPU_BUFFER_USAGE_COPY_DST | GPU_BUFFER_USAGE_UNIFORM,
      });

      const shaderModule = device.createShaderModule({ code: OCEAN_BEAMS_SHADER });
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        primitive: {
          topology: 'triangle-list',
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fsMain',
          targets: [
            {
              format,
              blend: {
                color: {
                  srcFactor: 'src-alpha',
                  dstFactor: 'one-minus-src-alpha',
                  operation: 'add',
                },
                alpha: {
                  srcFactor: 'one',
                  dstFactor: 'one-minus-src-alpha',
                  operation: 'add',
                },
              },
            },
          ],
        },
        vertex: {
          module: shaderModule,
          entryPoint: 'vsMain',
        },
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: uniformBuffer,
            },
          },
        ],
      });

      const handleResize = () => {
        viewport = configureCanvas(canvas, context, device, format);
      };

      window.addEventListener('resize', handleResize);
      cleanupResize = () => window.removeEventListener('resize', handleResize);

      const startTime = performance.now();

      const renderFrame = (frameTime: number) => {
        if (cancelled) {
          return;
        }

        if (document.hidden) {
          animationFrameId = window.requestAnimationFrame(renderFrame);
          return;
        }

        if (!prefersReducedMotion && frameTime - lastFrameTime < TARGET_FRAME_TIME) {
          animationFrameId = window.requestAnimationFrame(renderFrame);
          return;
        }

        lastFrameTime = frameTime;

        const elapsed = prefersReducedMotion ? 0 : (performance.now() - startTime) / 1000;
        uniformValues[0] = viewport.width;
        uniformValues[1] = viewport.height;
        uniformValues[2] = elapsed;
        uniformValues[3] = prefersReducedMotion ? 0.72 : 1;
        device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();

        device.queue.submit([encoder.finish()]);

        if (!prefersReducedMotion) {
          animationFrameId = window.requestAnimationFrame(renderFrame);
        }
      };

      renderFrame();
    };

    void setupWebGPU();

    return () => {
      cancelled = true;
      cleanupResize();

      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden transition-opacity duration-700"
    >
      <div className="absolute inset-0 z-0 dark:hidden bg-[radial-gradient(circle_at_16%_-4%,rgba(232,245,250,0.78),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(167,214,226,0.42),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0))]" />
      <div className="absolute inset-0 z-0 hidden dark:block bg-[radial-gradient(circle_at_top,rgba(56,111,154,0.22),transparent_32%),linear-gradient(180deg,rgba(3,8,18,0.06),rgba(3,8,18,0.01))]" />
      <div
        className="ocean-motion absolute inset-x-0 top-0 z-10 h-[32%] dark:hidden"
        style={{
          animation: 'ocean-surface-pulse 18s ease-in-out infinite',
          opacity: variant.lightSurfaceOpacity,
          background:
            'radial-gradient(circle at 50% 0%, rgba(196, 231, 240, 0.2) 0%, rgba(196, 231, 240, 0.08) 24%, transparent 56%)',
        }}
      />
      <div
        className="ocean-motion absolute inset-x-0 top-0 z-10 hidden h-[38%] dark:block"
        style={{
          animation: 'ocean-surface-pulse 16s ease-in-out infinite',
          opacity: variant.darkSurfaceOpacity,
          background:
            'radial-gradient(circle at 50% 0%, rgba(121, 205, 255, 0.10) 0%, rgba(121, 205, 255, 0.03) 26%, transparent 58%)',
        }}
      />
      {variant.lightBeams.map((beam) => (
        <div
          key={beam.id}
          className="ocean-motion absolute z-10 rounded-full dark:hidden"
          style={getBeamStyle(beam)}
        />
      ))}
      {variant.darkBeams.map((beam) => (
        <div
          key={beam.id}
          className="ocean-motion absolute z-10 hidden rounded-full dark:block"
          style={getBeamStyle(beam)}
        />
      ))}
      <canvas ref={canvasRef} className="absolute inset-0 z-20 h-full w-full opacity-[0.46] mix-blend-multiply dark:opacity-72 dark:mix-blend-normal" />
      {variant.lightParticles.map((particle) => (
        <div
          key={particle.id}
          className="ocean-particle absolute z-30 rounded-full dark:hidden"
          style={getParticleStyle(particle)}
        />
      ))}
      {variant.darkParticles.map((particle) => (
        <div
          key={particle.id}
          className="ocean-particle absolute z-30 hidden rounded-full dark:block"
          style={getParticleStyle(particle)}
        />
      ))}
      <div className="absolute inset-0 z-20 dark:hidden bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0),rgba(227,241,247,0.72)_72%)]" />
      <div className="absolute inset-0 z-20 hidden dark:block bg-[radial-gradient(circle_at_50%_120%,rgba(1,7,18,0),rgba(1,7,18,0.58)_72%)]" />
    </div>
  );
}
