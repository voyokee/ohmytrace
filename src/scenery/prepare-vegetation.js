import { sampleVegetation } from './vegetation-sampling.js';

export async function yieldToMain(signal) {
  if (globalThis.scheduler?.yield) await globalThis.scheduler.yield();
  else await new Promise(resolve => setTimeout(resolve, 0));
  signal?.throwIfAborted();
}

export async function prepareVegetation(options, readPixels, signal) {
  signal.throwIfAborted();
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./vegetation-worker.js', import.meta.url), { type: 'module' });
      const cleanup = () => { signal.removeEventListener('abort', abort); worker.terminate(); };
      const abort = () => { cleanup(); reject(signal.reason); };
      signal.addEventListener('abort', abort, { once: true });
      worker.onmessage = ({ data }) => {
        cleanup();
        if (data.error) reject(new Error(data.error)); else resolve(data.plants);
      };
      worker.onerror = event => { event.preventDefault(); cleanup(); reject(new Error(event.message)); };
      try {
        const data = readPixels();
        worker.postMessage({ ...options, data }, [data.buffer]);
      } catch (error) { cleanup(); reject(error); }
    });
  } catch (error) {
    signal.throwIfAborted();
    // Older browsers/CSP may disallow module workers. Yield small chunks instead.
    return sampleVegetation({ ...options, data: readPixels() }, () => yieldToMain(signal));
  }
}
