import { Application, Graphics, Texture } from 'pixi.js';

/** Radius of the shared circle texture in pixels. */
export const CIRCLE_TEX_RADIUS = 16;

interface AtlasEntry {
  circle: Texture;
}

// WeakMap keyed by Application ensures one atlas per app instance,
// automatically garbage-collected when the app is destroyed.
// A module-level singleton would break if multiple Application instances exist
// (e.g. HMR, tests, or future multi-canvas).
const atlasCache = new WeakMap<Application, AtlasEntry>();

export function getSharedTextures(app: Application): AtlasEntry {
  let entry = atlasCache.get(app);
  if (entry) return entry;

  const g = new Graphics();
  g.circle(CIRCLE_TEX_RADIUS, CIRCLE_TEX_RADIUS, CIRCLE_TEX_RADIUS);
  g.fill(0xffffff);
  const circle = app.renderer.generateTexture(g);
  g.destroy();

  entry = { circle };
  atlasCache.set(app, entry);
  return entry;
}

export function destroySharedTextures(app: Application): void {
  const entry = atlasCache.get(app);
  if (entry) {
    entry.circle.destroy(true);
    atlasCache.delete(app);
  }
}
