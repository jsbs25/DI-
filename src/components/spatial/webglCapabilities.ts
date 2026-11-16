export interface WebGPUProbeResult {
  supported: boolean;
  adapterName?: string;
}

export function detectWebGLSupport(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext | null): boolean {
  if (!gl) return false;
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
      if (/SwiftShader|llvmpipe|softpipe|Software Rasterizer|Apple Software/i.test(renderer)) {
        return true;
      }
    }
    const vendor = String(gl.getParameter(gl.RENDERER) || '');
    return /SwiftShader|llvmpipe|softpipe|Software/i.test(vendor);
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Non-blocking capability probe for progressive WebGPU enhancement visibility.
 * Never throws; returns cleanly on unsupported browsers or headless environments.
 */
export async function probeWebGPUCapability(): Promise<WebGPUProbeResult> {
  if (typeof navigator === 'undefined') return { supported: false };
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<any> } }).gpu;
  if (!gpu || typeof gpu.requestAdapter !== 'function') {
    return { supported: false };
  }
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { supported: false };
    const info = adapter.info || (await (adapter as any).requestAdapterInfo?.().catch(() => null));
    const adapterName =
      info?.description || info?.architecture || info?.vendor || 'WebGPU Adapter';
    return { supported: true, adapterName: String(adapterName) };
  } catch {
    return { supported: false };
  }
}
