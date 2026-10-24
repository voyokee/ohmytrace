import { makeWorldForest } from './world-data.js';
self.onmessage = ({ data }) => {
  try {
    const forest = makeWorldForest(data.day, data.height, { constrained: data.constrained });
    self.postMessage({ forest });
  } catch (error) { self.postMessage({ error: error.message }); }
};
