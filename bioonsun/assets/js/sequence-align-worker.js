// BioOnSun — Web Worker wrapper for the pairwise alignment core.
// Runs the O(n*m) DP computation off the main thread so long sequences don't
// freeze the page. Loaded relative to this file, so the import path is
// independent of which page (ko or en) created the worker.
importScripts('sequence-align-core.js');

self.onmessage = function (evt) {
  var data = evt.data || {};
  try {
    var result = self.BioOnSunAlignCore.alignSequences(data.seqA, data.seqB, data.opts);
    self.postMessage({ ok: true, jobId: data.jobId, result: result });
  } catch (e) {
    self.postMessage({ ok: false, jobId: data.jobId, error: e && e.message ? e.message : String(e) });
  }
};
