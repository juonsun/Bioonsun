// BioOnSun — Pairwise sequence alignment core logic
// Needleman-Wunsch (global) / Smith-Waterman (local) alignment with affine
// gap penalties (Gotoh's algorithm). Pure computation, no DOM dependency —
// safe to run inside a Web Worker or under Node for unit testing.
(function (root) {
  'use strict';

  // ---- BLOSUM62 substitution matrix (Henikoff & Henikoff, 1992) ----------
  // Standard 20-amino-acid substitution scores, as used by NCBI BLASTP and
  // most pairwise/multiple protein aligners (incl. EBI Clustal Omega defaults).
  var BLOSUM62 = {
    A: { A: 4, R: -1, N: -2, D: -2, C: 0, Q: -1, E: -1, G: 0, H: -2, I: -1, L: -1, K: -1, M: -1, F: -2, P: -1, S: 1, T: 0, W: -3, Y: -2, V: 0 },
    R: { A: -1, R: 5, N: 0, D: -2, C: -3, Q: 1, E: 0, G: -2, H: 0, I: -3, L: -2, K: 2, M: -1, F: -3, P: -2, S: -1, T: -1, W: -3, Y: -2, V: -3 },
    N: { A: -2, R: 0, N: 6, D: 1, C: -3, Q: 0, E: 0, G: 0, H: 1, I: -3, L: -3, K: 0, M: -2, F: -3, P: -2, S: 1, T: 0, W: -4, Y: -2, V: -3 },
    D: { A: -2, R: -2, N: 1, D: 6, C: -3, Q: 0, E: 2, G: -1, H: -1, I: -3, L: -4, K: -1, M: -3, F: -3, P: -1, S: 0, T: -1, W: -4, Y: -3, V: -3 },
    C: { A: 0, R: -3, N: -3, D: -3, C: 9, Q: -3, E: -4, G: -3, H: -3, I: -1, L: -1, K: -3, M: -1, F: -2, P: -3, S: -1, T: -1, W: -2, Y: -2, V: -1 },
    Q: { A: -1, R: 1, N: 0, D: 0, C: -3, Q: 5, E: 2, G: -2, H: 0, I: -3, L: -2, K: 1, M: 0, F: -3, P: -1, S: 0, T: -1, W: -2, Y: -1, V: -2 },
    E: { A: -1, R: 0, N: 0, D: 2, C: -4, Q: 2, E: 5, G: -2, H: 0, I: -3, L: -3, K: 1, M: -2, F: -3, P: -1, S: 0, T: -1, W: -3, Y: -2, V: -2 },
    G: { A: 0, R: -2, N: 0, D: -1, C: -3, Q: -2, E: -2, G: 6, H: -2, I: -4, L: -4, K: -2, M: -3, F: -3, P: -2, S: 0, T: -2, W: -2, Y: -3, V: -3 },
    H: { A: -2, R: 0, N: 1, D: -1, C: -3, Q: 0, E: 0, G: -2, H: 8, I: -3, L: -3, K: -1, M: -2, F: -1, P: -2, S: -1, T: -2, W: -2, Y: 2, V: -3 },
    I: { A: -1, R: -3, N: -3, D: -3, C: -1, Q: -3, E: -3, G: -4, H: -3, I: 4, L: 2, K: -3, M: 1, F: 0, P: -3, S: -2, T: -1, W: -3, Y: -1, V: 3 },
    L: { A: -1, R: -2, N: -3, D: -4, C: -1, Q: -2, E: -3, G: -4, H: -3, I: 2, L: 4, K: -2, M: 2, F: 0, P: -3, S: -2, T: -1, W: -2, Y: -1, V: 1 },
    K: { A: -1, R: 2, N: 0, D: -1, C: -3, Q: 1, E: 1, G: -2, H: -1, I: -3, L: -2, K: 5, M: -1, F: -3, P: -1, S: 0, T: -1, W: -3, Y: -2, V: -2 },
    M: { A: -1, R: -1, N: -2, D: -3, C: -1, Q: 0, E: -2, G: -3, H: -2, I: 1, L: 2, K: -1, M: 5, F: 0, P: -2, S: -1, T: -1, W: -1, Y: -1, V: 1 },
    F: { A: -2, R: -3, N: -3, D: -3, C: -2, Q: -3, E: -3, G: -3, H: -1, I: 0, L: 0, K: -3, M: 0, F: 6, P: -4, S: -2, T: -2, W: 1, Y: 3, V: -1 },
    P: { A: -1, R: -2, N: -2, D: -1, C: -3, Q: -1, E: -1, G: -2, H: -2, I: -3, L: -3, K: -1, M: -2, F: -4, P: 7, S: -1, T: -1, W: -4, Y: -3, V: -2 },
    S: { A: 1, R: -1, N: 1, D: 0, C: -1, Q: 0, E: 0, G: 0, H: -1, I: -2, L: -2, K: 0, M: -1, F: -2, P: -1, S: 4, T: 1, W: -3, Y: -2, V: -2 },
    T: { A: 0, R: -1, N: 0, D: -1, C: -1, Q: -1, E: -1, G: -2, H: -2, I: -1, L: -1, K: -1, M: -1, F: -2, P: -1, S: 1, T: 5, W: -2, Y: -2, V: 0 },
    W: { A: -3, R: -3, N: -4, D: -4, C: -2, Q: -2, E: -3, G: -2, H: -2, I: -3, L: -2, K: -3, M: -1, F: 1, P: -4, S: -3, T: -2, W: 11, Y: 2, V: -3 },
    Y: { A: -2, R: -2, N: -2, D: -3, C: -2, Q: -1, E: -2, G: -3, H: 2, I: -1, L: -1, K: -2, M: -1, F: 3, P: -3, S: -2, T: -2, W: 2, Y: 7, V: -1 },
    V: { A: 0, R: -3, N: -3, D: -3, C: -1, Q: -2, E: -2, G: -3, H: -3, I: 3, L: 1, K: -2, M: 1, F: -1, P: -2, S: -2, T: 0, W: -3, Y: -1, V: 4 }
  };

  var MAX_LEN = 2000;

  // ---- Sequence type detection --------------------------------------------

  var NT_CHARS = 'ACGTURYSWKMBDHVN';

  function detectType(rawSeq) {
    var s = String(rawSeq || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!s.length) return 'dna';
    var ntCount = 0, tCount = 0, uCount = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (NT_CHARS.indexOf(c) !== -1) ntCount++;
      if (c === 'T') tCount++;
      if (c === 'U') uCount++;
    }
    var ntFraction = ntCount / s.length;
    if (ntFraction >= 0.9) {
      return uCount > tCount ? 'rna' : 'dna';
    }
    return 'protein';
  }

  // ---- Input parsing (single sequence, optionally FASTA) -----------------

  // Extracts a single sequence from pasted text. If the text is FASTA
  // (starts with a ">" header), only the first record is used — any
  // subsequent ">" record is discarded (truncated flag is set so the UI can
  // warn the user). Non-letter characters (whitespace, digits, gaps) are
  // stripped from the sequence body.
  function parseSingleInput(text) {
    if (!text) return { header: null, seq: '', truncated: false };
    var lines = String(text).split(/\r\n|\r|\n/);
    var header = null;
    var bodyLines = [];
    var headerSeen = false;
    var truncated = false;
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (trimmed.charAt(0) === '>') {
        if (headerSeen || bodyLines.length > 0) { truncated = true; break; }
        header = trimmed.slice(1).trim();
        headerSeen = true;
        continue;
      }
      bodyLines.push(lines[i]);
    }
    var seq = bodyLines.join('').replace(/[^A-Za-z]/g, '').toUpperCase();
    return { header: header, seq: seq, truncated: truncated };
  }

  // ---- Scoring functions ---------------------------------------------------

  function nucleotideScoreFn(matchScore, mismatchScore) {
    return function (x, y) {
      if (x === 'N' || y === 'N') return 0;
      return x === y ? matchScore : mismatchScore;
    };
  }

  function proteinScoreFn() {
    return function (x, y) {
      var row = BLOSUM62[x];
      if (row && typeof row[y] === 'number') return row[y];
      return x === y ? 4 : -1;
    };
  }

  // ---- Gotoh affine-gap alignment (global / local) -------------------------

  var NEG = -1e15;

  function gotohAlign(seqA, seqB, options) {
    options = options || {};
    var isLocal = options.mode === 'local';
    var gapOpen = options.gapOpen != null ? options.gapOpen : 10;
    var gapExtend = options.gapExtend != null ? options.gapExtend : 0.5;
    var scoreFn = options.scoreFn;

    var a = seqA;
    var b = seqB;
    var n = a.length, m = b.length;

    if (n === 0 || m === 0) {
      return {
        alignedA: a + repeatChar('-', m),
        alignedB: repeatChar('-', n) + b,
        score: 0, startA: n ? 1 : 0, endA: n, startB: m ? 1 : 0, endB: m
      };
    }

    var W = m + 1;
    var size = (n + 1) * W;

    var M = new Float32Array(size);
    var Ix = new Float32Array(size);
    var Iy = new Float32Array(size);
    var tbM = new Uint8Array(size);
    var tbIx = new Uint8Array(size);
    var tbIy = new Uint8Array(size);

    function idx(i, j) { return i * W + j; }

    M[idx(0, 0)] = 0;
    Ix[idx(0, 0)] = NEG;
    Iy[idx(0, 0)] = NEG;

    var i, j;
    for (i = 1; i <= n; i++) {
      if (isLocal) {
        M[idx(i, 0)] = 0; Ix[idx(i, 0)] = NEG; Iy[idx(i, 0)] = NEG;
      } else {
        M[idx(i, 0)] = NEG;
        Ix[idx(i, 0)] = -(gapOpen + (i - 1) * gapExtend);
        Iy[idx(i, 0)] = NEG;
      }
    }
    for (j = 1; j <= m; j++) {
      if (isLocal) {
        M[idx(0, j)] = 0; Ix[idx(0, j)] = NEG; Iy[idx(0, j)] = NEG;
      } else {
        M[idx(0, j)] = NEG;
        Iy[idx(0, j)] = -(gapOpen + (j - 1) * gapExtend);
        Ix[idx(0, j)] = NEG;
      }
    }

    for (i = 1; i <= n; i++) {
      var ai = a.charAt(i - 1);
      var rowBase = i * W;
      var prevRowBase = (i - 1) * W;
      for (j = 1; j <= m; j++) {
        var bj = b.charAt(j - 1);
        var cIdx = rowBase + j;
        var diagIdx = prevRowBase + (j - 1);
        var upIdx = prevRowBase + j;
        var leftIdx = rowBase + (j - 1);

        var s = scoreFn(ai, bj);
        var dM = M[diagIdx], dIx = Ix[diagIdx], dIy = Iy[diagIdx];
        var best = dM, src = 1;
        if (dIx > best) { best = dIx; src = 2; }
        if (dIy > best) { best = dIy; src = 3; }
        var mVal = s + best;
        var mSrc = src;
        if (isLocal && mVal < 0) { mVal = 0; mSrc = 0; }
        M[cIdx] = mVal;
        tbM[cIdx] = mSrc;

        var openX = M[upIdx] - gapOpen;
        var extX = Ix[upIdx] - gapExtend;
        if (openX >= extX) { Ix[cIdx] = openX; tbIx[cIdx] = 1; }
        else { Ix[cIdx] = extX; tbIx[cIdx] = 2; }

        var openY = M[leftIdx] - gapOpen;
        var extY = Iy[leftIdx] - gapExtend;
        if (openY >= extY) { Iy[cIdx] = openY; tbIy[cIdx] = 1; }
        else { Iy[cIdx] = extY; tbIy[cIdx] = 2; }
      }
    }

    var endI = n, endJ = m, endState, bestScore;
    if (isLocal) {
      bestScore = 0; endI = 0; endJ = 0; endState = 'M';
      for (var ii = 0; ii <= n; ii++) {
        var base = ii * W;
        for (var jj = 0; jj <= m; jj++) {
          var v = M[base + jj];
          if (v > bestScore) { bestScore = v; endI = ii; endJ = jj; }
        }
      }
    } else {
      var fIdx = idx(n, m);
      bestScore = M[fIdx]; endState = 'M';
      if (Ix[fIdx] > bestScore) { bestScore = Ix[fIdx]; endState = 'Ix'; }
      if (Iy[fIdx] > bestScore) { bestScore = Iy[fIdx]; endState = 'Iy'; }
    }

    // Traceback
    var outA = [], outB = [];
    var ci = endI, cj = endJ, state = endState;
    while (ci > 0 || cj > 0) {
      if (state === 'M') {
        if (ci === 0 || cj === 0) break;
        var code = tbM[idx(ci, cj)];
        if (isLocal && code === 0) break; // fresh local start marker
        outA.push(a.charAt(ci - 1));
        outB.push(b.charAt(cj - 1));
        ci--; cj--;
        state = code === 1 ? 'M' : (code === 2 ? 'Ix' : 'Iy');
      } else if (state === 'Ix') {
        if (ci === 0) break;
        var codeX = tbIx[idx(ci, cj)];
        outA.push(a.charAt(ci - 1));
        outB.push('-');
        ci--;
        state = codeX === 1 ? 'M' : 'Ix';
      } else {
        if (cj === 0) break;
        var codeY = tbIy[idx(ci, cj)];
        outA.push('-');
        outB.push(b.charAt(cj - 1));
        cj--;
        state = codeY === 1 ? 'M' : 'Iy';
      }
    }
    outA.reverse(); outB.reverse();

    return {
      alignedA: outA.join(''),
      alignedB: outB.join(''),
      score: bestScore,
      startA: ci + 1, endA: endI,
      startB: cj + 1, endB: endJ
    };
  }

  function repeatChar(ch, n) {
    var out = '';
    for (var i = 0; i < n; i++) out += ch;
    return out;
  }

  // ---- Conservation symbols + stats ----------------------------------------

  function buildSymbols(alignedA, alignedB, type, scoreFn) {
    var symbolLine = '';
    var identityCount = 0, similarityCount = 0, gapCount = 0;
    var diffPositions = [];
    var len = alignedA.length;
    for (var k = 0; k < len; k++) {
      var ca = alignedA.charAt(k), cb = alignedB.charAt(k);
      if (ca === '-' || cb === '-') {
        gapCount++;
        symbolLine += ' ';
        diffPositions.push(k + 1);
        continue;
      }
      if (ca === cb) {
        identityCount++;
        symbolLine += '*';
        continue;
      }
      diffPositions.push(k + 1);
      if (type === 'protein' && scoreFn(ca, cb) > 0) {
        similarityCount++;
        symbolLine += ':';
      } else {
        symbolLine += ' ';
      }
    }
    return {
      symbolLine: symbolLine,
      identityCount: identityCount,
      similarityCount: similarityCount,
      gapCount: gapCount,
      identity: len ? (identityCount / len) * 100 : 0,
      similarity: len ? ((identityCount + similarityCount) / len) * 100 : 0,
      gapPct: len ? (gapCount / len) * 100 : 0,
      diffPositions: diffPositions
    };
  }

  // ---- High-level entry point ----------------------------------------------

  // opts: { mode: 'global'|'local', seqType: 'auto'|'dna'|'rna'|'protein',
  //         match, mismatch, gapOpen, gapExtend }
  function alignSequences(seqA, seqB, opts) {
    opts = opts || {};
    if (!seqA || !seqB) throw new Error('EMPTY_SEQUENCE');
    if (seqA.length > MAX_LEN || seqB.length > MAX_LEN) throw new Error('TOO_LONG');

    var typeA = detectType(seqA);
    var typeB = detectType(seqB);
    var resolvedType = (opts.seqType && opts.seqType !== 'auto')
      ? opts.seqType
      : (typeA === 'protein' || typeB === 'protein' ? 'protein' : (typeA === 'rna' || typeB === 'rna' ? 'rna' : 'dna'));

    var scoreFn, usedMatrix;
    if (resolvedType === 'protein') {
      scoreFn = proteinScoreFn();
      usedMatrix = 'BLOSUM62';
    } else {
      scoreFn = nucleotideScoreFn(opts.match != null ? opts.match : 1, opts.mismatch != null ? opts.mismatch : -1);
      usedMatrix = null;
    }

    var gapOpen = opts.gapOpen != null ? opts.gapOpen : 10;
    var gapExtend = opts.gapExtend != null ? opts.gapExtend : 0.5;

    var result = gotohAlign(seqA.toUpperCase(), seqB.toUpperCase(), {
      mode: opts.mode === 'local' ? 'local' : 'global',
      gapOpen: gapOpen,
      gapExtend: gapExtend,
      scoreFn: scoreFn
    });

    var symbols = buildSymbols(result.alignedA, result.alignedB, resolvedType, scoreFn);

    return {
      alignedA: result.alignedA,
      alignedB: result.alignedB,
      score: result.score,
      alignLength: result.alignedA.length,
      identity: symbols.identity,
      identityCount: symbols.identityCount,
      similarity: symbols.similarity,
      similarityCount: symbols.similarityCount,
      gapCount: symbols.gapCount,
      gapPct: symbols.gapPct,
      symbolLine: symbols.symbolLine,
      diffPositions: symbols.diffPositions,
      resolvedType: resolvedType,
      typeA: typeA,
      typeB: typeB,
      usedMatrix: usedMatrix,
      gapOpen: gapOpen,
      gapExtend: gapExtend,
      mode: opts.mode === 'local' ? 'local' : 'global',
      startA: result.startA, endA: result.endA,
      startB: result.startB, endB: result.endB,
      lengthA: seqA.length, lengthB: seqB.length
    };
  }

  var api = {
    MAX_LEN: MAX_LEN,
    BLOSUM62: BLOSUM62,
    detectType: detectType,
    parseSingleInput: parseSingleInput,
    nucleotideScoreFn: nucleotideScoreFn,
    proteinScoreFn: proteinScoreFn,
    gotohAlign: gotohAlign,
    buildSymbols: buildSymbols,
    alignSequences: alignSequences
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.BioOnSunAlignCore = api;
})(typeof self !== 'undefined' ? self : this);
