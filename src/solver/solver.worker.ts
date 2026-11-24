import { createSearch, type SearchInput, type SearchProgress } from './search.ts';

export type Request = { runId: number } & ({ type: 'start'; input: SearchInput } | { type: 'continue' | 'pause' | 'cancel' });
export type Reply = { runId: number } & ({ type: 'progress'; progress: SearchProgress; running: boolean } | { type: 'error'; message: string });
let active: { runId: number; search: ReturnType<typeof createSearch>; progress?: SearchProgress; timer?: ReturnType<typeof setTimeout> } | undefined;

function send(message: Reply) { self.postMessage(message); }

function stop(session: NonNullable<typeof active>) {
  clearTimeout(session.timer);
  session.timer = undefined;
}

function run(session: NonNullable<typeof active>) {
  const deadline = performance.now() + 1500;
  function tick() {
    try {
      session.progress = session.search.step(12);
      const running = !session.progress.optimal && performance.now() < deadline;
      send({ type: 'progress', runId: session.runId, progress: session.progress, running });
      session.timer = running ? setTimeout(tick, 0) : undefined;
    } catch (error) {
      stop(session);
      send({ type: 'error', runId: session.runId, message: error instanceof Error ? error.message : 'Search failed' });
    }
  }
  session.timer = setTimeout(tick, 0);
}

self.addEventListener('message', ({ data }: MessageEvent<Request>) => {
  if (data.type === 'start') {
    if (active) stop(active);
    try {
      active = { runId: data.runId, search: createSearch(data.input) };
      run(active);
    } catch (error) {
      send({ type: 'error', runId: data.runId, message: error instanceof Error ? error.message : 'Search failed' });
    }
  } else if (active?.runId === data.runId) {
    if (data.type === 'continue' && active.timer === undefined) run(active);
    if (data.type === 'pause') {
      stop(active);
      send({ type: 'progress', runId: active.runId, progress: active.progress ?? active.search.step(0), running: false });
    }
    if (data.type === 'cancel') {
      stop(active);
      active = undefined;
    }
  }
});
