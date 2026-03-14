import { Application, Graphics, Texture } from 'pixi.js';

interface AtlasEntry {
  circle8: Texture;
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
  g.circle(4, 4, 4);
  g.fill(0xffffff);
  const circle8 = app.renderer.generateTexture(g);
  g.destroy();

  entry = { circle8 };
  atlasCache.set(app, entry);
  return entry;
}

export function destroySharedTextures(app: Application): void {
  const entry = atlasCache.get(app);
  if (entry) {
    entry.circle8.destroy(true);
    atlasCache.delete(app);
  }
}
