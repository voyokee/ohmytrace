import { sampleVegetation } from './vegetation-sampling.js';
self.onmessage = async ({ data }) => {
  try { self.postMessage({ plants: await sampleVegetation(data) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
