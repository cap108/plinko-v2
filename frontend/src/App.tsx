import { useRef, useEffect } from 'react';
import { Application, Text, TextStyle } from 'pixi.js';

export default function App() {
  const boardRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const resizeCallbackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = boardRef.current;
    if (!container) return;

    let destroyed = false;

    (async () => {
      const app = new Application();
      await app.init({
        background: 0x0a0e1a,
        resizeTo: container,
        antialias: true,
        resolution: window.devicePixelRatio ?? 1,
        autoDensity: true,
      });

      if (destroyed) {
        app.destroy({ removeView: true }, { children: true });
        return;
      }

      container.appendChild(app.canvas);
      appRef.current = app;

      const style = new TextStyle({
        fontFamily: 'Orbitron, system-ui',
        fontSize: 48,
        fontWeight: 'bold',
        fill: 0x00e5ff,
      });
      const text = new Text({ text: 'PlinkoVibe', style });
      text.anchor.set(0.5);

      const center = () => {
        text.x = app.screen.width / 2;
        text.y = app.screen.height / 2;
      };
      center();
      resizeCallbackRef.current = center;
      app.renderer.on('resize', center);

      app.stage.addChild(text);
    })();

    return () => {
      destroyed = true;
      if (appRef.current) {
        if (resizeCallbackRef.current) {
          appRef.current.renderer.off('resize', resizeCallbackRef.current);
          resizeCallbackRef.current = null;
        }
        appRef.current.destroy({ removeView: true }, { children: true });
        appRef.current = null;
      }
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Header */}
      <header className="h-14 flex items-center px-4 border-b border-border-subtle">
        <h1 className="text-accent-cyan font-bold text-lg font-heading">
          PlinkoVibe
        </h1>
      </header>

      {/* Main layout: controls | board | stats */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left sidebar (controls — Phase 5) */}
        <aside className="hidden lg:block w-72 border-r border-border-subtle p-4">
          <p className="text-text-secondary text-sm">Controls</p>
        </aside>

        {/* Board region — PixiJS renders here */}
        <div className="flex-1 flex items-center justify-center p-4">
          {/* Phase 2: change role to "application" when board becomes interactive */}
          <div
            ref={boardRef}
            className="w-full max-w-lg aspect-[3/4]"
            role="img"
            aria-label="Plinko game board"
          />
        </div>

        {/* Right sidebar (stats — Phase 5) */}
        <aside className="hidden lg:block w-72 border-l border-border-subtle p-4">
          <p className="text-text-secondary text-sm">Stats</p>
        </aside>

        {/* Mobile placeholder — visible below lg breakpoint */}
        <div className="lg:hidden border-t border-border-subtle p-4">
          <p className="text-text-secondary text-sm text-center">
            Controls &amp; stats — Phase 5
          </p>
        </div>
      </main>
    </div>
  );
}
