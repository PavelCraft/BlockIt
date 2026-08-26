// Shared selector engine. Runs in the page MAIN world before the shadow hook.
// Native CSS stays the fast first step; BlockIt-only pseudo classes are filters.
(() => {
  const CUSTOM_NAMES = new Set([
    'attr-name', 'attr', 'text', 'own-text', 'html', 'class-name', 'attrs',
    'within', 'near', 'children', 'accessible', 'visible', 'size', 'style',
    'property', 'in-frame', 'in-shadow', 'frame-has', 'has-frame',
    'class-count', 'attribute-count'
  ]);

  const closedRoot = element => globalThis.__blockItGetClosedShadowRoot?.(element) || null;
  const frameReports = new WeakMap();

  // Some pages and copied map output render URLs as Markdown links. In a CSS
  // attribute value the readable part is the URL that the user meant to use.
  function normalizeCssSelector(selector) {
    return String(selector).replace(/(['"])\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)\1/g, '$1$2$1');
  }

  function looksLikeCssSelector(selector) {
    const value = String(selector).trim();
    return /^[a-zA-Z*][\w-]*(?:\s|[.#[:>+~]|$)/.test(value);
  }

  function roots() {
    const result = [], visited = new Set();
    const visit = root => {
      if (!root || visited.has(root)) return;
      visited.add(root); result.push(root);
      root.querySelectorAll?.('*').forEach(host => visit(host.shadowRoot || closedRoot(host)));
    };
    visit(document);
    return result;
  }

  function readCall(text, start) {
    let depth = 1, quote = '', escaped = false, regex = false;
    for (let index = start; index < text.length; index++) {
      const char = text[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === '/') {
        if (regex && text[index - 1] !== '\\') { regex = false; continue; }
        if (!regex && (index === start || /[(:,=\s]/.test(text[index - 1]))) { regex = true; continue; }
      }
      if (regex) continue;
      if (char === '(') depth++;
      if (char === ')' && --depth === 0) return { value: text.slice(start, index), end: index + 1 };
    }
    throw new Error('Unclosed BlockIt pseudo class');
  }

  function parse(selector) {
    const filters = [];
    let css = '', index = 0, quote = '', bracketDepth = 0;
    while (index < selector.length) {
      const char = selector[index];
      if (quote) {
        css += char;
        if (char === '\\') { css += selector[++index] || ''; }
        else if (char === quote) quote = '';
        index++; continue;
      }
      if (char === '"' || char === "'") { quote = char; css += char; index++; continue; }
      if (char === '[') { bracketDepth++; css += char; index++; continue; }
      if (char === ']') { bracketDepth--; css += char; index++; continue; }
      if (!bracketDepth && char === ':') {
        const match = selector.slice(index + 1).match(/^([a-z-]+)\(/i);
        if (match && CUSTOM_NAMES.has(match[1])) {
          const name = match[1];
          const call = readCall(selector, index + 2 + name.length);
          filters.push({ name, value: call.value.trim() });
          index = call.end; continue;
        }
      }
      css += char; index++;
    }
    css = css.trim() || '*';
    // A concise BlockIt extension for dynamic attribute names. For example,
    // [data-*] means "there is an attribute whose name starts with data-".
    css = css.replace(/\[([a-zA-Z_][\w-]*)-\*(?:(\^=|\$=|\*=|~=|\|=|=)(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g,
      (_, prefix, operator, doubleQuoted, singleQuoted, bare) => {
        filters.push({
          name: 'attr-wildcard',
          prefix: `${prefix}-`,
          operator: operator || '',
          expected: doubleQuoted ?? singleQuoted ?? bare ?? ''
        });
        return '';
      });
    css = css.trim() || '*';
    return { css, filters };
  }

  function regex(value) {
    const match = value.trim().match(/^\/((?:\\.|[^/])*)\/([dgimsuvy]*)$/);
    if (!match) throw new Error('Expected /regular expression/');
    return new RegExp(match[1], match[2]);
  }

  function splitArgs(value) {
    const parts = [], start = { at: 0 };
    let depth = 0, quote = '', inRegex = false, escaped = false;
    for (let index = 0; index <= value.length; index++) {
      const char = value[index] || ',';
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === '/') {
        if (inRegex && value[index - 1] !== '\\') { inRegex = false; continue; }
        if (!inRegex && (index === 0 || /[,(=\s]/.test(value[index - 1]))) { inRegex = true; continue; }
      }
      if (inRegex) continue;
      if (char === '(' || char === '[') depth++;
      else if (char === ')' || char === ']') depth--;
      else if (char === ',' && depth === 0) { parts.push(value.slice(start.at, index).trim()); start.at = index + 1; }
    }
    return parts.filter(Boolean);
  }

  function textOf(element, ownOnly) {
    if (!ownOnly) return (element.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    return [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent).join(' ').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function matchesInRoots(selector) {
    const parsed = parse(selector), result = new Set();
    for (const root of roots()) {
      try { root.querySelectorAll(parsed.css).forEach(element => result.add(element)); }
      catch { throw new Error(`Invalid CSS part: ${parsed.css}`); }
    }
    return [...result].filter(element => parsed.filters.every(filter => matchFilter(element, filter)));
  }

  function compare(actual, expression) {
    const match = expression.trim().match(/^(width|height|top|left|right|bottom)\s*(<=|>=|=|<|>)\s*(-?[\d.]+)$/);
    if (!match) throw new Error('Expected size condition such as height<100');
    const value = actual.getBoundingClientRect()[match[1]], expected = Number(match[3]);
    return ({ '<': value < expected, '<=': value <= expected, '=': value === expected, '>=': value >= expected, '>': value > expected })[match[2]];
  }

  function attributeTerms(value) {
    const list = value.trim().replace(/^\[\s*|\s*\]$/g, '');
    return splitArgs(list).map(term => term.startsWith('/') ? { pattern: regex(term) } : { name: term.replace(/^['"]|['"]$/g, '') });
  }

  function matchFilter(element, filter) {
    const value = filter.value;
    if (filter.name === 'attr-wildcard') return [...element.attributes].some(attr => {
      if (!attr.name.startsWith(filter.prefix)) return false;
      if (!filter.operator) return true;
      if (filter.operator === '=') return attr.value === filter.expected;
      if (filter.operator === '^=') return attr.value.startsWith(filter.expected);
      if (filter.operator === '$=') return attr.value.endsWith(filter.expected);
      if (filter.operator === '*=') return attr.value.includes(filter.expected);
      if (filter.operator === '~=') return attr.value.split(/\s+/).includes(filter.expected);
      return attr.value === filter.expected || attr.value.startsWith(`${filter.expected}-`);
    });
    if (filter.name === 'attr-name') return [...element.attributes].some(attr => regex(value).test(attr.name));
    if (filter.name === 'attr') {
      const [name, attrValue] = splitArgs(value);
      if (!name || !attrValue) throw new Error('Expected :attr(/name/, /value/)');
      const namePattern = regex(name), valuePattern = regex(attrValue);
      return [...element.attributes].some(attr => namePattern.test(attr.name) && valuePattern.test(attr.value));
    }
    if (filter.name === 'class-count') return compareCount(element.classList.length, value);
    if (filter.name === 'attribute-count') return compareCount(element.attributes.length, value);
    if (filter.name === 'text') return regex(value).test(textOf(element, false));
    if (filter.name === 'own-text') return regex(value).test(textOf(element, true));
    if (filter.name === 'html') return regex(value).test(element.outerHTML);
    if (filter.name === 'class-name') return [...element.classList].some(name => regex(value).test(name));
    if (filter.name === 'attrs') return attributeTerms(value).every(term => term.pattern
      ? [...element.attributes].some(attr => term.pattern.test(attr.name))
      : element.hasAttribute(term.name));
    if (filter.name === 'within') {
      for (let parent = element.parentElement || element.getRootNode()?.host; parent; parent = parent.parentElement || parent.getRootNode()?.host) {
        if (matchesSelector(parent, value)) return true;
      }
      return false;
    }
    if (filter.name === 'near') return [...(element.parentElement?.children || [])]
      .some(sibling => sibling !== element && matchesSelector(sibling, value));
    if (filter.name === 'children') {
      const [childSelector, amount = '>=1'] = splitArgs(value);
      const count = [...element.children].filter(child => matchesSelector(child, childSelector)).length;
      return compareCount(count, amount);
    }
    if (filter.name === 'accessible') return matchAccessible(element, value);
    if (filter.name === 'visible') {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    }
    if (filter.name === 'size') return splitArgs(value).every(condition => compare(element, condition));
    if (filter.name === 'style') {
      const [name, expected] = splitArgs(value);
      if (!name || expected === undefined) throw new Error('Expected :style(name, value)');
      return getComputedStyle(element).getPropertyValue(name.trim()) === expected.replace(/^['"]|['"]$/g, '').trim();
    }
    if (filter.name === 'property') {
      const [name, expected] = splitArgs(value);
      if (!name || expected === undefined) throw new Error('Expected :property(name, value)');
      return String(element[name.trim()]) === expected.replace(/^['"]|['"]$/g, '').trim();
    }
    if (filter.name === 'in-frame') return matchFrameContext(value);
    if (filter.name === 'in-shadow') {
      const root = element.getRootNode();
      return root instanceof ShadowRoot && matchesSelector(root.host, value);
    }
    if (filter.name === 'frame-has') return frameHas(element, value);
    if (filter.name === 'has-frame') {
      const [frameSelector, innerSelector] = splitArgs(value);
      if (!frameSelector || !innerSelector) throw new Error('Expected :has-frame(iframe, selector)');
      const direct = frameSelector.trim().startsWith('>');
      const selector = direct ? frameSelector.trim().slice(1).trim() : frameSelector.trim();
      const frames = direct
        ? [...element.children].filter(child => matchesSelector(child, selector))
        : [...element.querySelectorAll(selector)].filter(child => matchesSelector(child, selector));
      return frames.some(frame => frameHas(frame, innerSelector));
    }
    return true;
  }

  function compareCount(count, expression) {
    const match = String(expression).trim().match(/^(<=|>=|=|<|>)?\s*(\d+)$/);
    if (!match) throw new Error('Expected child count such as >=1');
    const expected = Number(match[2]), operator = match[1] || '=';
    return ({ '<': count < expected, '<=': count <= expected, '=': count === expected, '>=': count >= expected, '>': count > expected })[operator];
  }

  function matchesSelector(element, selector) {
    const parsed = parse(selector);
    try { return element.matches(parsed.css) && parsed.filters.every(filter => matchFilter(element, filter)); }
    catch { return false; }
  }

  function matchAccessible(element, value) {
    const terms = Object.fromEntries(splitArgs(value).map(part => {
      const separator = part.indexOf('=');
      return separator < 0 ? [part.trim(), ''] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }));
    const role = element.getAttribute('role') || implicitRole(element);
    const labelledBy = element.getAttribute('aria-labelledby');
    const label = element.getAttribute('aria-label') || (labelledBy && labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ')) || textOf(element, false);
    return (!terms.role || role === unquote(terms.role)) && (!terms.name || regex(terms.name).test(label));
  }

  function implicitRole(element) {
    if (element.matches('button,input[type="button"],input[type="submit"]')) return 'button';
    if (element.matches('a[href]')) return 'link';
    if (element.matches('input[type="checkbox"]')) return 'checkbox';
    return '';
  }

  function unquote(value) { return value.replace(/^['"]|['"]$/g, ''); }

  function matchFrameContext(value) {
    const [kind, patternText] = value.split(/=(.+)/);
    const pattern = regex(patternText || kind);
    if (!parent || parent === window) return false;
    if ((kind || '').trim() === 'title') return pattern.test(document.title);
    return pattern.test(location.href);
  }

  function reportFrameMatches(ruleKey, innerSelector) {
    let matched = false;
    try { matched = matchesInRoots(innerSelector).length > 0; } catch {}
    if (parent !== window) parent.postMessage({ source: 'blockit', action: 'frame-match', ruleKey, matched }, '*');
    return matched;
  }

  function frameHas(element, innerSelector) {
    if (element.localName !== 'iframe') return false;
    try {
      if (element.contentDocument && matchesInDocument(element.contentDocument, innerSelector).length) return true;
    } catch {}
    return !!frameReports.get(element.contentWindow)?.has(innerSelector);
  }

  function matchesInDocument(doc, selector) {
    const parsed = parse(selector);
    try { return [...doc.querySelectorAll(parsed.css)].filter(element => parsed.filters.every(filter => matchFilter(element, filter))); }
    catch { return []; }
  }

  window.addEventListener('message', event => {
    if (event.data?.source !== 'blockit' || event.data?.action !== 'frame-match' || event.source === window) return;
    if (!event.data.matched) return;
    const key = event.data.ruleKey;
    for (const root of roots()) {
      root.querySelectorAll?.('iframe').forEach(frame => {
        if (frame.contentWindow !== event.source) return;
        const set = frameReports.get(event.source) || new Set();
        set.add(key); frameReports.set(event.source, set);
      });
    }
    globalThis.__blockItSelectorEngine?.scheduleApply?.();
  });

  globalThis.__blockItSelectorEngine = {
    parse, find: matchesInRoots, matches: matchesSelector, reportFrameMatches,
    normalizeCssSelector, looksLikeCssSelector,
    getFrameHasFilters(selector) {
      return parse(selector).filters.flatMap(filter => {
        if (filter.name === 'frame-has') return [filter.value];
        if (filter.name === 'has-frame') return splitArgs(filter.value).slice(1, 2);
        return [];
      });
    },
    roots
  };
})();
