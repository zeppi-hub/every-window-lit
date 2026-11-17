import { createSystem } from '@iwsdk/core';

/** At most this many device pixels per CSS pixel: twice on a Retina screen, and no more, for the desktop's fill rate. */
const MOST = 2;

/**
 * The desktop emulator's view at the screen's own sharpness (dev server
 * only, registered by dev-tools.ts in the emulator). IWER sizes the canvas
 * it draws the XR view into to the window in CSS pixels as a session
 * starts (iwer XRDevice onBaseLayerSet), so on a Retina screen the browser
 * blows the whole picture up two times and every word on the sill reads
 * blurred; the layer takes its size from the canvas every frame
 * (XRWebGLLayer framebufferWidth), so the canvas is set to the window in
 * device pixels while presenting, checked every frame, since IWER may set
 * it back. A headset never runs this.
 */
export class EmulatorResolutionSystem extends createSystem({}) {
  update(): void {
    if (!this.renderer.xr.isPresenting) return;
    const canvas = this.renderer.domElement;
    const k = Math.min(window.devicePixelRatio || 1, MOST);
    const w = Math.round(window.innerWidth * k);
    const h = Math.round(window.innerHeight * k);
    if (canvas.width !== w || canvas.height !== h) {
      // Its size on the page stays the window's: only the pixels behind it grow.
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      canvas.width = w;
      canvas.height = h;
      console.info(`[emulator] view drawn at ${w} x ${h} (${k}x the window)`);
    }
  }
}
