// BioOnSun — Blog template engine.
// Pure functions that build the static HTML for the blog index, tag pages,
// and individual post pages, plus small helpers (slugify, relative paths).
// Runs both in Node (for tests / tooling) and in the browser (admin tool),
// via the UMD wrapper below. It never touches the DOM.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BlogTemplates = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SITE_BASE = 'https://juonsun.com/bioonsun';
  var ADSENSE_CLIENT = 'ca-pub-4140362030045841';

  var TOOL_LINKS = [
    { file: 'reverse-complement.html', ko: 'Reverse Complement', en: 'Reverse Complement' },
    { file: 'gc-content.html', ko: 'GC 함량 계산기', en: 'GC Content Calculator' },
    { file: 'translate.html', ko: 'DNA→단백질 번역기', en: 'DNA→Protein Translator' },
    { file: 'fasta-cleanup.html', ko: 'FASTA 정리 도구', en: 'FASTA Cleanup Tool' },
    { file: 'sequence-align.html', ko: '서열 정렬 비교', en: 'Sequence Alignment' }
  ];

  var INFO_LINKS = [
    { file: 'about.html', ko: '소개', en: 'About' },
    { file: 'privacy.html', ko: '개인정보 처리방침', en: 'Privacy Policy' },
    { file: 'contact.html', ko: '문의하기', en: 'Contact' }
  ];

  // ---------------------------------------------------------------------
  // Generic helpers
  // ---------------------------------------------------------------------

  function htmlEscape(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Unicode-aware slug: keeps letters (incl. Hangul) and numbers, everything
  // else becomes a single hyphen. Falls back to "post"/"tag" if empty.
  function slugify(text, fallback) {
    var s = String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '');
    return s || (fallback || 'item');
  }

  function uniqueTags(posts) {
    var seen = {};
    var out = [];
    posts.forEach(function (p) {
      (p.tags || []).forEach(function (t) {
        var key = slugify(t, 'tag');
        if (!seen[key]) {
          seen[key] = { tag: t, slug: key };
          out.push(seen[key]);
        }
      });
    });
    out.sort(function (a, b) { return a.tag.localeCompare(b.tag, 'ko'); });
    return out;
  }

  // Relative path from a directory (array of segments under /bioonsun/) to
  // a target file (array of segments under /bioonsun/, including filename).
  function relFrom(fromDirSegments, toSegments) {
    var i = 0;
    var max = Math.min(fromDirSegments.length, toSegments.length - 1);
    while (i < max && fromDirSegments[i] === toSegments[i]) i++;
    var up = fromDirSegments.length - i;
    var down = toSegments.slice(i);
    return new Array(up + 1).join('../') + down.join('/');
  }

  // Canonical absolute URL for a set of segments under /bioonsun/.
  // Directory-style pages (segments ending in index.html) drop the filename
  // and keep a trailing slash, matching the rest of the site's convention.
  function canonicalUrl(toSegments) {
    var segs = toSegments.slice();
    if (segs[segs.length - 1] === 'index.html') {
      segs = segs.slice(0, -1);
      return SITE_BASE + '/' + segs.join('/') + (segs.length ? '/' : '/');
    }
    return SITE_BASE + '/' + segs.join('/');
  }

  function formatDateDisplay(dateStr, lang) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    if (!m) return dateStr || '';
    var y = m[1], mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (lang === 'en') {
      var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December'];
      return MONTHS[mo - 1] + ' ' + d + ', ' + y;
    }
    return y + '년 ' + mo + '월 ' + d + '일';
  }

  // ---------------------------------------------------------------------
  // Markdown post-processing: turn "> TIP: ..." / "> NOTE: ..." blockquotes
  // (already converted to <blockquote><p>TIP: ...</p></blockquote> by a
  // markdown renderer) into styled practitioner-tip / interpretation boxes.
  // ---------------------------------------------------------------------

  function applyCallouts(html) {
    return String(html || '').replace(
      /<blockquote>\s*<p>\s*(TIP|NOTE|해석)\s*:\s*/gi,
      function (whole, kind) {
        var isTip = /^tip$/i.test(kind);
        var cls = isTip ? 'callout callout-tip' : 'callout callout-note';
        var label = isTip ? '실무자 팁' : '결과 해석';
        return '<blockquote class="' + cls + '"><span class="callout-label">' + label + '</span><p>';
      }
    );
  }

  // ---------------------------------------------------------------------
  // Page shell (header / nav / footer) shared by all blog-family pages.
  // ---------------------------------------------------------------------

  function pageSegments(lang, extra) {
    var prefix = lang === 'en' ? ['en'] : [];
    return prefix.concat(extra || []);
  }

  function renderHead(opts) {
    // opts: { lang, fromDir, title, description, canonicalSegKo, canonicalSegEn, extra }
    // Returns { head, mainJsHref }.
    var koUrl = canonicalUrl(opts.canonicalSegKo);
    var enUrl = canonicalUrl(opts.canonicalSegEn);
    var selfUrl = opts.lang === 'en' ? enUrl : koUrl;
    var cssHref = relFrom(opts.fromDir, ['assets', 'css', 'style.css']);
    var faviconHref = relFrom(opts.fromDir, ['favicon.svg']);
    var mainJsHref = relFrom(opts.fromDir, ['assets', 'js', 'main.js']);
    var head = [
      '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADSENSE_CLIENT + '" crossorigin="anonymous"></script>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '<link rel="icon" href="' + faviconHref + '" type="image/svg+xml">',
      '<title>' + htmlEscape(opts.title) + '</title>',
      '<meta name="description" content="' + htmlEscape(opts.description) + '">',
      '<link rel="canonical" href="' + selfUrl + '">',
      '<link rel="alternate" hreflang="ko" href="' + koUrl + '">',
      '<link rel="alternate" hreflang="en" href="' + enUrl + '">',
      '<link rel="alternate" hreflang="x-default" href="' + enUrl + '">',
      '<link rel="stylesheet" href="' + cssHref + '">',
      opts.extraHead || ''
    ].filter(Boolean).join('\n');
    return { head: head, mainJsHref: mainJsHref };
  }

  function renderNav(opts) {
    // opts: { lang, fromDir, active }  active: 'home' | 'blog' | tool file | 'about' | ...
    var lang = opts.lang;
    var t = function (ko, en) { return lang === 'en' ? en : ko; };
    var homeSeg = pageSegments(lang, ['index.html']);
    var blogSeg = pageSegments(lang, ['blog', 'index.html']);

    var items = [];
    items.push({ key: 'home', seg: homeSeg, label: t('홈', 'Home') });
    TOOL_LINKS.forEach(function (tool) {
      items.push({ key: tool.file, seg: pageSegments(lang, [tool.file]), label: t(tool.ko, tool.en) });
    });
    items.push({ key: 'blog', seg: blogSeg, label: t('블로그', 'Blog') });
    INFO_LINKS.forEach(function (info) {
      items.push({ key: info.file, seg: pageSegments(lang, [info.file]), label: t(info.ko, info.en) });
    });

    var navLinks = items.map(function (it) {
      var href = relFrom(opts.fromDir, it.seg);
      var cls = it.key === opts.active ? ' class="active"' : '';
      return '      <a href="' + href + '"' + cls + '>' + htmlEscape(it.label) + '</a>';
    }).join('\n');

    // lang switch: same page, other language
    var relSegNoLang = opts.fromDir.slice(lang === 'en' ? 1 : 0).concat([opts.selfFile]);
    var koSeg = relSegNoLang;
    var enSeg = ['en'].concat(relSegNoLang);
    var koHref = relFrom(opts.fromDir, koSeg);
    var enHref = relFrom(opts.fromDir, enSeg);

    var langSwitch = '      <div class="lang-switch">\n' +
      '        <a href="' + koHref + '"' + (lang === 'ko' ? ' class="active"' : '') + '>KO</a>\n' +
      '        <a href="' + enHref + '"' + (lang === 'en' ? ' class="active"' : '') + '>EN</a>\n' +
      '      </div>';

    var toggleLabel = t('메뉴 열기', 'Open menu');
    var brandHref = relFrom(opts.fromDir, homeSeg);

    return [
      '<header class="site-header">',
      '  <div class="container">',
      '    <a href="' + brandHref + '" class="brand"><span class="brand-logo">B</span>Bio<span class="brand-dot">On</span>Sun</a>',
      '    <nav class="main-nav" id="mainNav">',
      navLinks,
      langSwitch,
      '    </nav>',
      '    <button class="nav-toggle" aria-label="' + toggleLabel + '" aria-expanded="false">☰</button>',
      '  </div>',
      '</header>'
    ].join('\n');
  }

  function renderFooter(opts) {
    var lang = opts.lang;
    var t = function (ko, en) { return lang === 'en' ? en : ko; };
    var blogSeg = pageSegments(lang, ['blog', 'index.html']);
    var blogHref = relFrom(opts.fromDir, blogSeg);

    var toolLis = TOOL_LINKS.map(function (tool) {
      var href = relFrom(opts.fromDir, pageSegments(lang, [tool.file]));
      return '          <li><a href="' + href + '">' + htmlEscape(t(tool.ko, tool.en)) + '</a></li>';
    }).join('\n');

    var infoLis = ['          <li><a href="' + blogHref + '">' + htmlEscape(t('블로그', 'Blog')) + '</a></li>']
      .concat(INFO_LINKS.map(function (info) {
        var href = relFrom(opts.fromDir, pageSegments(lang, [info.file]));
        return '          <li><a href="' + href + '">' + htmlEscape(t(info.ko, info.en)) + '</a></li>';
      })).join('\n');

    return [
      '<footer class="site-footer">',
      '  <div class="container">',
      '    <div class="footer-grid">',
      '      <div>',
      '        <h4>BioOnSun</h4>',
      '        <p class="small">' + htmlEscape(t(
        '무료 온라인 생물정보학 도구 모음입니다. 모든 계산은 여러분의 브라우저 안에서만 이루어지며, 입력한 서열 데이터는 서버로 전송되거나 저장되지 않습니다.',
        'A free collection of online bioinformatics tools. All calculations run in your browser only — sequence data is never sent to or stored on our servers.'
      )) + '</p>',
      '      </div>',
      '      <div>',
      '        <h4>' + t('도구', 'Tools') + '</h4>',
      '        <ul>',
      toolLis,
      '        </ul>',
      '      </div>',
      '      <div>',
      '        <h4>' + t('정보', 'Info') + '</h4>',
      '        <ul>',
      infoLis,
      '        </ul>',
      '      </div>',
      '    </div>',
      '    <div class="footer-bottom">',
      '      <span>&copy; 2026 BioOnSun (juonsun.com/bioonsun). All rights reserved.</span>',
      '      <span class="updated-note">' + htmlEscape(opts.updatedNote || '') + '</span>',
      '    </div>',
      '  </div>',
      '</footer>'
    ].join('\n');
  }

  function wrapDocument(lang, headInfo, bodyHtml) {
    return '<!DOCTYPE html>\n' +
      '<html lang="' + (lang === 'en' ? 'en' : 'ko') + '">\n' +
      '<head>\n' + headInfo.head + '\n</head>\n' +
      '<body>\n\n' +
      bodyHtml + '\n\n' +
      '<script src="' + headInfo.mainJsHref + '"></script>\n' +
      '</body>\n</html>\n';
  }

  // ---------------------------------------------------------------------
  // Blog index page (and tag-filtered index)
  // ---------------------------------------------------------------------

  function tagChipsHtml(tags, fromDir, lang, activeTagSlug) {
    if (!tags.length) return '';
    return '<div class="tag-chip-list">' + tags.map(function (t) {
      var href = relFrom(fromDir, pageSegments(lang, ['blog', 'tag', t.slug + '.html']));
      var isActive = t.slug === activeTagSlug;
      return '<a class="tag-chip' + (isActive ? ' is-static' : '') + '" href="' + href + '">#' + htmlEscape(t.tag) + '</a>';
    }).join('') + '</div>';
  }

  function blogCardHtml(post, lang, fromDir) {
    var pd = post[lang] || post.ko;
    var postHref = relFrom(fromDir, pageSegments(lang, ['blog', post.slug + '.html']));
    var tagLinks = (post.tags || []).map(function (tag) {
      var slug = slugify(tag, 'tag');
      var href = relFrom(fromDir, pageSegments(lang, ['blog', 'tag', slug + '.html']));
      return '<a class="tag-chip" href="' + href + '">#' + htmlEscape(tag) + '</a>';
    }).join('');
    return [
      '<article class="blog-card">',
      '  <span class="blog-card-date">' + htmlEscape(formatDateDisplay(post.date, lang)) + '</span>',
      '  <h3><a href="' + postHref + '">' + htmlEscape(pd.title) + '</a></h3>',
      '  <p class="blog-card-excerpt">' + htmlEscape(pd.excerpt || '') + '</p>',
      tagLinks ? '  <div class="tag-chip-list">' + tagLinks + '</div>' : '',
      '</article>'
    ].filter(Boolean).join('\n');
  }

  function renderIndexPage(opts) {
    // opts: { lang, posts, updatedNote }
    var lang = opts.lang;
    var t = function (ko, en) { return lang === 'en' ? en : ko; };
    var fromDir = pageSegments(lang, ['blog']);
    var posts = (opts.posts || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var tags = uniqueTags(posts);

    var head = renderHead({
      lang: lang,
      fromDir: fromDir,
      title: t('블로그 | BioOnSun', 'Blog | BioOnSun'),
      description: t(
        '실험 실무자를 위한 프로토콜, 팁, 결과 해석을 다루는 BioOnSun 블로그입니다.',
        'The BioOnSun blog — hands-on protocols, practitioner tips, and result-interpretation notes for the bench.'
      ),
      canonicalSegKo: pageSegments('ko', ['blog', 'index.html']),
      canonicalSegEn: pageSegments('en', ['blog', 'index.html'])
    });

    var nav = renderNav({ lang: lang, fromDir: fromDir, active: 'blog', selfFile: 'index.html' });
    var footer = renderFooter({ lang: lang, fromDir: fromDir, updatedNote: opts.updatedNote || '' });

    var grid;
    if (!posts.length) {
      grid = '<div class="blog-empty">' + htmlEscape(t(
        '아직 게시된 글이 없습니다. 첫 실험 프로토콜을 곧 준비하고 있습니다.',
        'No posts yet — the first protocol write-up is on its way.'
      )) + '</div>';
    } else {
      grid = '<div class="blog-grid">\n' + posts.map(function (p) { return blogCardHtml(p, lang, fromDir); }).join('\n') + '\n</div>';
    }

    var body = [
      nav,
      '<main>',
      '  <section class="hero" style="padding-bottom: 10px;">',
      '    <div class="container">',
      '      <span class="pill">BioOnSun Blog</span>',
      '      <h1>' + htmlEscape(t('실험 노트 & 프로토콜', 'Lab Notes & Protocols')) + '</h1>',
      '      <p class="lead">' + htmlEscape(t(
        '실무에서 바로 써먹는 실험 프로토콜과 팁, 결과를 해석하는 방법을 정리합니다.',
        'Practical protocols, bench tips, and notes on how to interpret your results.'
      )) + '</p>',
      '    </div>',
      '  </section>',
      '  <section style="border-top: none;">',
      '    <div class="container">',
      tags.length ? '      ' + tagChipsHtml(tags, fromDir, lang, null) : '',
      '      ' + grid,
      '    </div>',
      '  </section>',
      '</main>',
      footer
    ].filter(Boolean).join('\n');

    return wrapDocument(lang, head, body);
  }

  // ---------------------------------------------------------------------
  // Tag landing page
  // ---------------------------------------------------------------------

  function renderTagPage(opts) {
    // opts: { lang, tag, tagSlug, posts, updatedNote }
    var lang = opts.lang;
    var t = function (ko, en) { return lang === 'en' ? en : ko; };
    var fromDir = pageSegments(lang, ['blog', 'tag']);
    var posts = (opts.posts || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    var head = renderHead({
      lang: lang,
      fromDir: fromDir,
      title: '#' + opts.tag + ' | ' + t('블로그 | BioOnSun', 'Blog | BioOnSun'),
      description: t(
        '#' + opts.tag + ' 태그가 붙은 BioOnSun 블로그 글 모음입니다.',
        'BioOnSun blog posts tagged #' + opts.tag + '.'
      ),
      canonicalSegKo: pageSegments('ko', ['blog', 'tag', opts.tagSlug + '.html']),
      canonicalSegEn: pageSegments('en', ['blog', 'tag', opts.tagSlug + '.html'])
    });

    var nav = renderNav({ lang: lang, fromDir: fromDir, active: 'blog', selfFile: opts.tagSlug + '.html' });
    var footer = renderFooter({ lang: lang, fromDir: fromDir, updatedNote: opts.updatedNote || '' });
    var blogIndexHref = relFrom(fromDir, pageSegments(lang, ['blog', 'index.html']));

    var grid = posts.length
      ? '<div class="blog-grid">\n' + posts.map(function (p) { return blogCardHtml(p, lang, fromDir); }).join('\n') + '\n</div>'
      : '<div class="blog-empty">' + htmlEscape(t('이 태그의 글이 아직 없습니다.', 'No posts with this tag yet.')) + '</div>';

    var body = [
      nav,
      '<main>',
      '  <section class="hero" style="padding-bottom: 10px;">',
      '    <div class="container">',
      '      <span class="pill">' + htmlEscape(t('태그', 'Tag')) + '</span>',
      '      <h1>#' + htmlEscape(opts.tag) + '</h1>',
      '      <p class="blog-filter-note"><a href="' + blogIndexHref + '">&larr; ' + htmlEscape(t('전체 글 보기', 'View all posts')) + '</a></p>',
      '    </div>',
      '  </section>',
      '  <section style="border-top: none;">',
      '    <div class="container">',
      '      ' + grid,
      '    </div>',
      '  </section>',
      '</main>',
      footer
    ].join('\n');

    return wrapDocument(lang, head, body);
  }

  // ---------------------------------------------------------------------
  // Post page
  // ---------------------------------------------------------------------

  function renderPostPage(opts) {
    // opts: { lang, slug, date, tags, title, excerpt, bodyHtml, updatedNote }
    var lang = opts.lang;
    var t = function (ko, en) { return lang === 'en' ? en : ko; };
    var fromDir = pageSegments(lang, ['blog']);

    var jsonLd = '<script type="application/ld+json">\n' + JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: opts.title,
      description: opts.excerpt || '',
      datePublished: opts.date,
      dateModified: opts.date,
      author: { '@type': 'Organization', name: 'BioOnSun' },
      publisher: { '@type': 'Organization', name: 'BioOnSun' }
    }, null, 2) + '\n</script>';

    var head = renderHead({
      lang: lang,
      fromDir: fromDir,
      title: opts.title + ' | BioOnSun Blog',
      description: opts.excerpt || opts.title,
      canonicalSegKo: pageSegments('ko', ['blog', opts.slug + '.html']),
      canonicalSegEn: pageSegments('en', ['blog', opts.slug + '.html']),
      extraHead: jsonLd
    });

    var nav = renderNav({ lang: lang, fromDir: fromDir, active: 'blog', selfFile: opts.slug + '.html' });
    var footer = renderFooter({ lang: lang, fromDir: fromDir, updatedNote: opts.updatedNote || '' });
    var blogIndexHref = relFrom(fromDir, pageSegments(lang, ['blog', 'index.html']));

    var tagChips = (opts.tags || []).map(function (tag) {
      var slug = slugify(tag, 'tag');
      var href = relFrom(fromDir, pageSegments(lang, ['blog', 'tag', slug + '.html']));
      return '<a class="tag-chip" href="' + href + '">#' + htmlEscape(tag) + '</a>';
    }).join('');

    var body = [
      nav,
      '<main>',
      '  <section class="hero" style="padding-bottom: 10px;">',
      '    <div class="container">',
      '      <p class="blog-filter-note" style="margin-bottom:14px;"><a href="' + blogIndexHref + '">&larr; ' + htmlEscape(t('블로그 목록으로', 'Back to blog')) + '</a></p>',
      '      <div class="post-header">',
      '        <h1>' + htmlEscape(opts.title) + '</h1>',
      '        <div class="post-meta-row">',
      '          <span class="post-date">' + htmlEscape(formatDateDisplay(opts.date, lang)) + '</span>',
      '        </div>',
      tagChips ? '        <div class="tag-chip-list">' + tagChips + '</div>' : '',
      '      </div>',
      '    </div>',
      '  </section>',
      '  <section style="border-top: none;">',
      '    <div class="container post-body">',
      opts.bodyHtml,
      '    </div>',
      '  </section>',
      '  <div class="container">',
      '    <div class="ad-slot">' + htmlEscape(t('광고 영역', 'Ad placement')) + '</div>',
      '  </div>',
      '</main>',
      footer
    ].filter(Boolean).join('\n');

    return wrapDocument(lang, head, body);
  }

  return {
    htmlEscape: htmlEscape,
    slugify: slugify,
    uniqueTags: uniqueTags,
    relFrom: relFrom,
    canonicalUrl: canonicalUrl,
    formatDateDisplay: formatDateDisplay,
    applyCallouts: applyCallouts,
    pageSegments: pageSegments,
    renderIndexPage: renderIndexPage,
    renderTagPage: renderTagPage,
    renderPostPage: renderPostPage,
    TOOL_LINKS: TOOL_LINKS,
    INFO_LINKS: INFO_LINKS,
    SITE_BASE: SITE_BASE
  };
});
