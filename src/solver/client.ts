import type { SearchInput } from './search.ts';
import type { Reply, Request } from './solver.worker.ts';

export function createSolverClient(worker: Worker, receive: (message: Reply) => void) {
  let runId = 0;
  let active = false;
  const post = (message: Request) => worker.postMessage(message);
  worker.addEventListener('message', ({ data }: MessageEvent<Reply>) => {
    if (active && data.runId === runId) receive(data);
  });
  worker.addEventListener('error', () => {
    if (active) receive({ type: 'error', runId, message: 'The simulation stopped. Run it again to retry.' });
  });
  return {
    start(input: SearchInput) { active = true; post({ type: 'start', runId: ++runId, input }); },
    pause() { if (active) post({ type: 'pause', runId }); },
    continue() { if (active) post({ type: 'continue', runId }); },
    cancel() {
      if (active) post({ type: 'cancel', runId });
      active = false;
    },
  };
}
