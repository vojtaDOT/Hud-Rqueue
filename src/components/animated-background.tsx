'use client';

import { useEffect, useRef } from 'react';

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
  const pixelRatio = window.devicePixelRatio || 1;
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

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cancelled = false;
    let animationFrameId = 0;
    let cleanupResize = () => {};

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

      const renderFrame = () => {
        if (cancelled) {
          return;
        }

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
      <div className="absolute inset-0 dark:hidden bg-[radial-gradient(circle_at_16%_-4%,rgba(232,245,250,0.78),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(167,214,226,0.42),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0))]" />
      <div className="absolute inset-0 hidden dark:block bg-[radial-gradient(circle_at_top,rgba(56,111,154,0.22),transparent_32%),linear-gradient(180deg,rgba(3,8,18,0.06),rgba(3,8,18,0.01))]" />
      <div
        className="ocean-motion absolute -top-[10%] left-[-12%] h-[64%] w-[42%] rotate-[14deg] rounded-full blur-3xl dark:hidden"
        style={{
          animation: 'ocean-beam-drift 30s ease-in-out infinite alternate',
          background:
            'linear-gradient(180deg, rgba(135, 208, 224, 0.14) 0%, rgba(135, 208, 224, 0.06) 24%, rgba(135, 208, 224, 0.016) 48%, transparent 72%)',
          maskImage:
            'linear-gradient(180deg, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.34) 50%, transparent 100%)',
        }}
      />
      <div
        className="ocean-motion absolute -top-[18%] left-[24%] h-[70%] w-[28%] rotate-[9deg] rounded-full blur-[60px] dark:hidden"
        style={{
          animation: 'ocean-beam-drift 34s ease-in-out infinite alternate-reverse',
          background:
            'linear-gradient(180deg, rgba(124, 194, 217, 0.11) 0%, rgba(124, 194, 217, 0.04) 28%, rgba(124, 194, 217, 0.01) 54%, transparent 76%)',
          maskImage:
            'linear-gradient(180deg, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.26) 44%, transparent 100%)',
        }}
      />
      <div
        className="ocean-motion absolute inset-x-0 top-0 h-[32%] dark:hidden"
        style={{
          animation: 'ocean-surface-pulse 18s ease-in-out infinite',
          background:
            'radial-gradient(circle at 50% 0%, rgba(196, 231, 240, 0.14) 0%, rgba(196, 231, 240, 0.04) 24%, transparent 56%)',
        }}
      />
      <div
        className="ocean-motion absolute -top-[12%] left-[-14%] hidden h-[72%] w-[48%] rotate-[16deg] rounded-full blur-3xl dark:block"
        style={{
          animation: 'ocean-beam-drift 24s ease-in-out infinite alternate',
          background:
            'linear-gradient(180deg, rgba(132, 210, 255, 0.18) 0%, rgba(132, 210, 255, 0.06) 24%, rgba(132, 210, 255, 0.015) 44%, transparent 72%)',
          maskImage:
            'linear-gradient(180deg, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.38) 46%, transparent 100%)',
        }}
      />
      <div
        className="ocean-motion absolute -top-[20%] left-[18%] hidden h-[86%] w-[34%] rotate-[10deg] rounded-full blur-[56px] dark:block"
        style={{
          animation: 'ocean-beam-drift 28s ease-in-out infinite alternate-reverse',
          background:
            'linear-gradient(180deg, rgba(118, 195, 245, 0.12) 0%, rgba(118, 195, 245, 0.045) 28%, rgba(118, 195, 245, 0.012) 54%, transparent 76%)',
          maskImage:
            'linear-gradient(180deg, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.28) 44%, transparent 100%)',
        }}
      />
      <div
        className="ocean-motion absolute -top-[18%] right-[-8%] hidden h-[82%] w-[42%] -rotate-[12deg] rounded-full blur-3xl dark:block"
        style={{
          animation: 'ocean-beam-drift 26s ease-in-out infinite alternate',
          background:
            'linear-gradient(180deg, rgba(142, 222, 255, 0.14) 0%, rgba(142, 222, 255, 0.04) 26%, rgba(142, 222, 255, 0.01) 52%, transparent 78%)',
          maskImage:
            'linear-gradient(180deg, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.3) 42%, transparent 100%)',
        }}
      />
      <div
        className="ocean-motion absolute inset-x-0 top-0 hidden h-[38%] dark:block"
        style={{
          animation: 'ocean-surface-pulse 16s ease-in-out infinite',
          background:
            'radial-gradient(circle at 50% 0%, rgba(121, 205, 255, 0.10) 0%, rgba(121, 205, 255, 0.03) 26%, transparent 58%)',
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-[0.34] mix-blend-multiply dark:opacity-85 dark:mix-blend-normal" />
      <div className="absolute inset-0 dark:hidden bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0),rgba(227,241,247,0.72)_72%)]" />
      <div className="absolute inset-0 hidden dark:block bg-[radial-gradient(circle_at_50%_120%,rgba(1,7,18,0),rgba(1,7,18,0.58)_72%)]" />
    </div>
  );
}
