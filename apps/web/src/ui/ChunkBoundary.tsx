import { Component, type ComponentType, lazy, type ReactNode, useState } from "react";

/** The chunks whose last import failed, each with the way to ask for it again. */
const failed = new Set<() => void>();

/**
 * `React.lazy` keeps a failed import for good: offline once, the screen stays broken until a reload. This one
 * forgets the failure, so Réessayer (`retryChunks`) asks the network again. Once its file is in (`preload`),
 * it renders at once, without the one empty frame `lazy` costs even for a file already loaded.
 */
export function lazyChunk<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  let ready: ComponentType<P> | undefined;
  const loadOnce = () =>
    load().then((module) => {
      ready = module.default;
      return module;
    });
  const make = () =>
    lazy(() =>
      loadOnce().catch((error: unknown) => {
        failed.add(reset);
        throw error;
      }),
    );
  let current = make();
  function reset() {
    current = make();
  }
  // biome-ignore lint/correctness/noComponentHookFactories: made once per chunk at module level, never in a render
  function Chunk(props: P) {
    // Picked once per mount: switching from the lazy to the loaded one would remount the screen.
    const [Current] = useState<ComponentType<P>>(() => ready ?? current);
    return <Current {...props} />;
  }
  /** Fetches the file ahead of its first render; a failure waits for that render to try again. */
  Chunk.preload = () => {
    loadOnce().catch(() => undefined);
  };
  return Chunk;
}

export function retryChunks() {
  for (const reset of failed) reset();
  failed.clear();
}

type Props = {
  children: ReactNode;
  /** What shows instead, with the way to try again. */
  fallback: (retry: () => void) => ReactNode;
  onError?: () => void;
};

/**
 * Around every `Suspense`: a chunk that did not load (offline, a new version deployed) breaks its own block,
 * never the whole app.
 */
export class ChunkBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onError?.();
  }

  retry = () => {
    retryChunks();
    this.setState({ failed: false });
  };

  override render() {
    return this.state.failed ? this.props.fallback(this.retry) : this.props.children;
  }
}
