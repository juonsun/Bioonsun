// BioOnSun — DNA/RNA -> Protein translation tool logic
// All computation happens locally in the browser; no sequence data is ever sent anywhere.
// Genetic code tables follow the NCBI standard "transl_table" definitions
// (https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi).
(function () {
  'use strict';

  // Fixed codon order shared by every NCBI genetic code table definition.
  var BASE1 = 'TTTTTTTTTTTTTTTTCCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAGGGGGGGGGGGGGGGG';
  var BASE2 = 'TTTTCCCCAAAAGGGGTTTTCCCCAAAAGGGGTTTTCCCCAAAAGGGGTTTTCCCCAAAAGGGG';
  var BASE3 = 'TCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAG';

  // { id: [ enName, koName, AAs(64), Starts(64) ] }
  var RAW_TABLES = {
    1: ['Standard', '표준 (Standard)',
      'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
      '---M------**--*----M---------------M----------------------------'.slice(0, 64)],
    2: ['Vertebrate Mitochondrial', '척추동물 미토콘드리아',
      'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSS**VVVVAAAADDEEGGGG',
      '----------**--------------------MMMM----------**---M------------'.slice(0, 64)],
    3: ['Yeast Mitochondrial', '효모 미토콘드리아',
      'FFLLSSSSYY**CCWWTTTTPPPPHHQQRRRRIIMMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
      '----------**----------------------MM---------------M------------'.slice(0, 64)],
    4: ['Mold/Protozoan/Coelenterate Mitochondrial; Mycoplasma/Spiroplasma', '곰팡이/원생동물/강장동물 미토콘드리아; 마이코플라스마/스피로플라스마',
      'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
      '--MM------**-------M------------MMMM---------------M------------'.slice(0, 64)],
    5: ['Invertebrate Mitochondrial', '무척추동물 미토콘드리아',
      'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSSSSVVVVAAAADDEEGGGG',
      '---M------**--------------------MMMM---------------M------------'.slice(0, 64)],
    6: ['Ciliate/Dasycladacean/Hexamita Nuclear', '섬모충류/다시클라두스류/헥사미타 핵',
      'FFLLSSSSYYQQCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
      '--------------*--------------------M----------------------------'.slice(0, 64)],
    9: ['Echinoderm/Flatworm Mitochondrial', '극피동물/편형동물 미토콘드리아',
      'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNNKSSSSVVVVAAAADDEEGGGG',
      '----------**-----------------------M---------------M------------'.slice(0, 64)],
    10: ['Euplotid Nuclear', '유플로티드 핵',
      'FFLLSSSSYY**CCCWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
      '----------**-----------------------M----------------------------'.slice(0, 64)],
    11: ['Bacterial, Archaeal and Plant Plastid', '세균/고균/식물 색소체(엽록체)',
      'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
      '---M------**--*----M------------MMMM---------------M------------'.slice(0, 64)],
    12: ['Alternative Yeast Nuclear', '효모 핵 (대체)',
      'FFLLSSSSYY**CC*WLLLSPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
      '----------**--*----M---------------M----------------------------'.slice(0, 64)],
    13: ['Ascidian Mitochondrial', '멍게류 미토콘드리아',
      'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSSGGVVVVAAAADDEEGGGG',
      '---M------**----------------------MM---------------M------------'.slice(0, 64)],
    14: ['Alternative Flatworm Mitochondrial', '편형동물 미토콘드리아 (대체)',
      'FFLLSSSSYYY*CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNNKSSSSVVVVAAAADDEEGGGG',
      '-----------*-----------------------M----------------------------'.slice(0, 64)],
    16: ['Chlorophycean Mitochondrial', '녹조류 미토콘드리아',
      'FFLLSSSSYY*LCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
      '----------*---*--------------------M----------------------------'.slice(0, 64)],
    21: ['Trematode Mitochondrial', '흡충류 미토콘드리아',
      'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNNKSSSSVVVVAAAADDEEGGGG',
      '----------**-----------------------M---------------M------------'.slice(0, 64)],
    22: ['Scenedesmus obliquus Mitochondrial', 'Scenedesmus obliquus 미토콘드리아',
      'FFLLSS*SYY*LCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
      '------*---*---*--------------------M----------------------------'.slice(0, 64)],
    23: ['Thraustochytrium Mitochondrial', 'Thraustochytrium 미토콘드리아',
      'FF*LSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
      '--*-------**--*-----------------M--M---------------M------------'.slice(0, 64)],
    24: ['Pterobranchia (Rhabdopleuridae) Mitochondrial', '익새류(Pterobranchia) 미토콘드리아',
      'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSSKVVVVAAAADDEEGGGG',
      '---M------**-------M---------------M---------------M------------'.slice(0, 64)],
    25: ['Candidate Division SR1 and Gracilibacteria', 'SR1 및 Gracilibacteria 후보군',
      'FFLLSSSSYY**CCGWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
      '---M------**-----------------------M---------------M------------'.slice(0, 64)]
  };

  var TABLE_ORDER = [1, 11, 2, 3, 4, 5, 6, 9, 10, 12, 13, 14, 16, 21, 22, 23, 24, 25];

  function buildTables() {
    var tables = {};
    Object.keys(RAW_TABLES).forEach(function (id) {
      var row = RAW_TABLES[id];
      var codonToAA = {};
      var starts = {};
      for (var i = 0; i < 64; i++) {
        var codon = BASE1[i] + BASE2[i] + BASE3[i];
        codonToAA[codon] = row[2][i];
        if (row[3][i] === 'M') starts[codon] = true;
      }
      tables[id] = { id: Number(id), en: row[0], ko: row[1], codonToAA: codonToAA, starts: starts };
    });
    return tables;
  }

  var TABLES = buildTables();

  // IUPAC ambiguity expansion to unambiguous A/C/G/T bases (U treated as T).
  var IUPAC_EXPAND = {
    A: ['A'], C: ['C'], G: ['G'], T: ['T'], U: ['T'],
    R: ['A', 'G'], Y: ['C', 'T'], S: ['G', 'C'], W: ['A', 'T'], K: ['G', 'T'], M: ['A', 'C'],
    B: ['C', 'G', 'T'], D: ['A', 'G', 'T'], H: ['A', 'C', 'T'], V: ['A', 'C', 'G'],
    N: ['A', 'C', 'G', 'T']
  };

  var AA3 = {
    A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', Q: 'Gln', E: 'Glu', G: 'Gly',
    H: 'His', I: 'Ile', L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe', P: 'Pro', S: 'Ser',
    T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val', '*': 'Stop', X: 'Xaa'
  };

  var COMPLEMENT = {
    A: 'T', T: 'A', U: 'A', C: 'G', G: 'C',
    R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K',
    B: 'V', V: 'B', D: 'H', H: 'D', N: 'N'
  };

  function reverseComplement(seq) {
    var out = [];
    for (var i = seq.length - 1; i >= 0; i--) {
      var ch = seq[i];
      var upper = ch.toUpperCase();
      var comp = COMPLEMENT[upper];
      if (comp === undefined) { out.push(ch); continue; }
      out.push(ch !== upper ? comp.toLowerCase() : comp);
    }
    return out.join('');
  }

  function translateCodon(codon, table) {
    var upper = codon.toUpperCase();
    var direct = table.codonToAA[upper];
    if (direct !== undefined) return direct;
    var sets = [];
    for (var i = 0; i < 3; i++) {
      var exp = IUPAC_EXPAND[upper[i]];
      if (!exp) return 'X';
      sets.push(exp);
    }
    var found = {};
    var count = 0;
    for (var a = 0; a < sets[0].length; a++) {
      for (var b = 0; b < sets[1].length; b++) {
        for (var c = 0; c < sets[2].length; c++) {
          var aa = table.codonToAA[sets[0][a] + sets[1][b] + sets[2][c]];
          if (aa !== undefined && !found[aa]) { found[aa] = true; count++; }
        }
      }
    }
    var keys = Object.keys(found);
    return keys.length === 1 ? keys[0] : 'X';
  }

  function isStartCodon(codon, table) {
    return !!table.starts[codon.toUpperCase()];
  }

  // Split raw textarea input into FASTA-ish records: [{ name, seq }]
  function parseRecords(text) {
    var lines = text.split(/\r\n|\r|\n/);
    var records = [];
    var current = null;
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (trimmed.charAt(0) === '>') {
        current = { name: trimmed.slice(1).trim() || null, seqLines: [] };
        records.push(current);
      } else {
        if (!current) { current = { name: null, seqLines: [] }; records.push(current); }
        current.seqLines.push(line);
      }
    });
    return records.map(function (r) {
      return { name: r.name, seq: r.seqLines.join('').replace(/[^A-Za-z]/g, '') };
    }).filter(function (r) { return r.seq.length > 0; });
  }

  function translateFrame(seq, offset, table) {
    var codons = [];
    for (var i = offset; i + 3 <= seq.length; i += 3) {
      var codon = seq.slice(i, i + 3).toUpperCase();
      var aa = translateCodon(codon, table);
      codons.push({ codon: codon, aa: aa, isStart: isStartCodon(codon, table), isStop: aa === '*' });
    }
    // Detect ORFs: run from a start codon to the next stop (or end of frame).
    var orfs = [];
    var openStart = -1;
    for (var j = 0; j < codons.length; j++) {
      if (openStart === -1 && codons[j].isStart) {
        openStart = j;
      } else if (openStart !== -1 && codons[j].isStop) {
        orfs.push({ start: openStart, end: j, length: j - openStart });
        openStart = -1;
      }
    }
    if (openStart !== -1) {
      orfs.push({ start: openStart, end: codons.length - 1, length: codons.length - 1 - openStart, openEnded: true });
    }
    orfs.sort(function (a, b) { return b.length - a.length; });
    return { codons: codons, orfs: orfs };
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Group consecutive codons sharing the same highlight class and render as HTML.
  function renderTokens(codons, format) {
    var groups = [];
    codons.forEach(function (c, idx) {
      var cls = c.isStop ? 'tok-stop' : (c.inOrf ? 'tok-orf' : 'tok-plain');
      var text = format === 'verbose' ? AA3[c.aa] || 'Xaa' : (c.aa || 'X');
      var last = groups[groups.length - 1];
      if (last && last.cls === cls) {
        last.parts.push(text);
      } else {
        groups.push({ cls: cls, parts: [text] });
      }
    });
    var sep = format === 'verbose' ? ' ' : '';
    return groups.map(function (g) {
      return '<span class="' + g.cls + '">' + escapeHtml(g.parts.join(sep)) + '</span>';
    }).join(sep);
  }

  function markOrfMembership(codons, orfs) {
    var flags = codons.map(function () { return false; });
    orfs.forEach(function (o) {
      for (var i = o.start; i <= o.end; i++) flags[i] = true;
    });
    return codons.map(function (c, i) {
      var copy = {};
      for (var k in c) copy[k] = c[k];
      copy.inOrf = flags[i];
      return copy;
    });
  }

  function compactString(codons) {
    return codons.map(function (c) { return c.aa || 'X'; }).join('');
  }

  function wrap(str, width) {
    if (str.length <= width) return str;
    var out = [];
    for (var i = 0; i < str.length; i += width) out.push(str.slice(i, i + width));
    return out.join('\n');
  }

  var FRAME_DEFS = [
    { key: 'f1', strand: 'fwd', offset: 0, sign: '+1' },
    { key: 'f2', strand: 'fwd', offset: 1, sign: '+2' },
    { key: 'f3', strand: 'fwd', offset: 2, sign: '+3' },
    { key: 'r1', strand: 'rev', offset: 0, sign: '-1' },
    { key: 'r2', strand: 'rev', offset: 1, sign: '-2' },
    { key: 'r3', strand: 'rev', offset: 2, sign: '-3' }
  ];

  function init(root) {
    var lang = root.getAttribute('data-i18n') === 'en' ? 'en' : 'ko';
    var i18n = lang === 'en' ? {
      copied: 'Copied to clipboard', cleared: 'Cleared', noInput: 'Paste a sequence first',
      forward: 'Forward frame', reverse: 'Reverse frame', nt: 'nt', aa: 'aa',
      orfHeading: 'Detected ORFs', orfNone: 'No ORFs detected in this frame',
      position: 'Position', length: 'Length', openEnded: 'no stop codon before end of frame',
      andMore: function (n) { return 'and ' + n + ' more'; },
      sequenceLabel: 'Sequence', placeholder: 'Paste a sequence to see the translation for each selected reading frame.',
      noAA: '(no complete codons in this frame)'
    } : {
      copied: '클립보드에 복사했습니다', cleared: '초기화했습니다', noInput: '먼저 서열을 입력해주세요',
      forward: '정방향 프레임', reverse: '역방향 프레임', nt: 'nt', aa: 'aa',
      orfHeading: '감지된 ORF', orfNone: '이 프레임에서는 ORF가 감지되지 않았습니다',
      position: '위치', length: '길이', openEnded: '프레임 끝까지 정지코돈 없음',
      andMore: function (n) { return '외 ' + n + '개 더'; },
      sequenceLabel: '서열', placeholder: '서열을 입력하면 선택한 리딩프레임의 번역 결과가 여기에 표시됩니다.',
      noAA: '(이 프레임에서 완전한 코돈이 없습니다)'
    };

    var input = root.querySelector('[data-role="input"]');
    var tableSelect = root.querySelector('[data-role="table"]');
    var frameButtons = root.querySelectorAll('[data-frame]');
    var formatButtons = root.querySelectorAll('[data-format]');
    var resultsEl = root.querySelector('[data-role="results"]');
    var statLength = root.querySelector('[data-role="stat-length"]');
    var statTable = root.querySelector('[data-role="stat-table"]');
    var btnCopy = root.querySelector('[data-role="copy"]');
    var btnDownload = root.querySelector('[data-role="download"]');
    var btnClear = root.querySelector('[data-role="clear"]');
    var btnSample = root.querySelector('[data-role="sample"]');

    var sampleSeq = root.getAttribute('data-sample') ||
      '>demo_sequence\nATGGCTCATTGGAAACGTGGCTGCACTAGTGGCTAA';

    var currentFormat = 'compact';
    var lastPlainOutput = '';

    // Populate genetic code table select.
    TABLE_ORDER.forEach(function (id) {
      var t = TABLES[id];
      var opt = document.createElement('option');
      opt.value = String(id);
      opt.textContent = (lang === 'en' ? t.en : t.ko) + ' (' + id + ')';
      tableSelect.appendChild(opt);
    });
    tableSelect.value = '1';

    function activeFrames() {
      var list = [];
      frameButtons.forEach(function (btn) {
        if (btn.classList.contains('active')) list.push(btn.getAttribute('data-frame'));
      });
      return list;
    }

    function run() {
      var text = input.value;
      var records = parseRecords(text);
      var table = TABLES[Number(tableSelect.value)] || TABLES[1];
      statTable.textContent = (lang === 'en' ? table.en : table.ko);

      var totalLen = 0;
      records.forEach(function (r) { totalLen += r.seq.length; });
      statLength.textContent = totalLen.toLocaleString();

      if (!records.length) {
        resultsEl.innerHTML = '<p class="result-placeholder">' + escapeHtml(i18n.placeholder) + '</p>';
        lastPlainOutput = '';
        return;
      }

      var frames = activeFrames();
      var htmlParts = [];
      var plainParts = [];

      records.forEach(function (rec, recIdx) {
        var fwd = rec.seq;
        var rev = reverseComplement(rec.seq);
        var recName = rec.name || (i18n.sequenceLabel + ' ' + (recIdx + 1));

        if (records.length > 1 || rec.name) {
          htmlParts.push('<h4 class="record-heading">' + escapeHtml(recName) + '</h4>');
        }

        FRAME_DEFS.forEach(function (fd) {
          if (frames.indexOf(fd.key) === -1) return;
          var strandSeq = fd.strand === 'fwd' ? fwd : rev;
          var result = translateFrame(strandSeq, fd.offset, table);
          var codonsWithOrf = markOrfMembership(result.codons, result.orfs);
          var aaCount = codonsWithOrf.length;
          var dirLabel = fd.strand === 'fwd' ? i18n.forward : i18n.reverse;

          var bodyHtml = aaCount
            ? '<div class="seq-mono">' + renderTokens(codonsWithOrf, currentFormat) + '</div>'
            : '<p class="small">' + escapeHtml(i18n.noAA) + '</p>';

          var orfHtml;
          if (result.orfs.length) {
            var shown = result.orfs.slice(0, 10);
            var items = shown.map(function (o) {
              var posText = (o.start * 3 + fd.offset + 1) + '–' + ((o.end + 1) * 3 + fd.offset) +
                (fd.strand === 'rev' ? ' (' + i18n.reverse + ')' : '');
              var lenText = o.length + ' ' + i18n.aa + (o.openEnded ? ' — ' + i18n.openEnded : '');
              return '<li>' + escapeHtml(i18n.position) + ' ' + escapeHtml(posText) + ' &middot; ' + escapeHtml(i18n.length) + ' ' + escapeHtml(lenText) + '</li>';
            }).join('');
            var moreText = result.orfs.length > 10 ? '<li class="small">' + escapeHtml(i18n.andMore(result.orfs.length - 10)) + '</li>' : '';
            orfHtml = '<ul class="orf-list">' + items + moreText + '</ul>';
          } else {
            orfHtml = '<p class="small">' + escapeHtml(i18n.orfNone) + '</p>';
          }

          htmlParts.push(
            '<div class="frame-card">' +
              '<div class="frame-card-head">' +
                '<span class="frame-badge">' + fd.sign + '</span>' +
                '<span>' + escapeHtml(dirLabel) + ' ' + fd.sign + " (5'→3')</span>" +
                '<span class="small frame-count">' + aaCount + ' ' + i18n.aa + '</span>' +
              '</div>' +
              bodyHtml +
              '<div class="orf-block"><span class="field-label-inline">' + escapeHtml(i18n.orfHeading) + '</span>' + orfHtml + '</div>' +
            '</div>'
          );

          var compact = compactString(codonsWithOrf);
          plainParts.push('>' + recName.replace(/\s+/g, '_') + '_frame' + fd.sign + '\n' + wrap(compact, 60));
        });
      });

      resultsEl.innerHTML = htmlParts.join('');
      lastPlainOutput = plainParts.join('\n\n');
    }

    frameButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.classList.toggle('active');
        run();
      });
    });

    formatButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        formatButtons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentFormat = btn.getAttribute('data-format');
        run();
      });
    });

    tableSelect.addEventListener('change', run);
    input.addEventListener('input', run);

    if (btnCopy) {
      btnCopy.addEventListener('click', function () {
        if (!lastPlainOutput) { window.BioOnSun.toast(i18n.noInput); return; }
        window.BioOnSun.copyText(lastPlainOutput, i18n.copied);
      });
    }
    if (btnDownload) {
      btnDownload.addEventListener('click', function () {
        if (!lastPlainOutput) { window.BioOnSun.toast(i18n.noInput); return; }
        window.BioOnSun.download('translate.fasta', lastPlainOutput);
      });
    }
    if (btnClear) {
      btnClear.addEventListener('click', function () {
        input.value = '';
        run();
        window.BioOnSun.toast(i18n.cleared);
        input.focus();
      });
    }
    if (btnSample) {
      btnSample.addEventListener('click', function () {
        input.value = sampleSeq;
        run();
      });
    }

    run();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-tool="translate"]').forEach(init);
  });

  // exposed for potential unit testing
  window.BioOnSunTranslate = { translateFrame: translateFrame, reverseComplement: reverseComplement, TABLES: TABLES };
})();
