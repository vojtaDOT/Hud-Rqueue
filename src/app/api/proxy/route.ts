import { NextRequest, NextResponse } from 'next/server';

const PREVIEW_BLOCKED_PATTERNS = [
    'demos\\.telma\\.ai',
    'mchats',
    'cookiebot',
    'onetrust',
    'trustarc',
    'quantcast',
    'cookie-consent',
    'dgp-cookie-consent',
    'cookies\\.min\\.js',
    'consentmanager',
];

function stripProblematicThirdPartySnippets(html: string): string {
    const blocked = PREVIEW_BLOCKED_PATTERNS.join('|');
    return html
        .replace(new RegExp(`<script[^>]+(?:${blocked})[^>]*>\\s*</script>`, 'gi'), '')
        .replace(new RegExp(`<link[^>]+(?:${blocked})[^>]*>`, 'gi'), '')
        .replace(
            new RegExp(`<script\\b[^>]*>(?:(?!<\\/script>)[\\s\\S])*?(?:${blocked})(?:(?!<\\/script>)[\\s\\S])*?<\\/script>`, 'gi'),
            '',
        );
}

function parseOriginCandidate(value: string | null): string | null {
    if (!value) return null;
    try {
        const parsed = new URL(value);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.origin;
        }
    } catch {
        return null;
    }
    return null;
}

function getRequestOrigin(request: NextRequest): string {
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const originHeader = parseOriginCandidate(request.headers.get('origin'));
    const refererOrigin = parseOriginCandidate(request.headers.get('referer'));

    if (forwardedHost) {
        const inferredProto = forwardedProto
            || (refererOrigin?.startsWith('https://') ? 'https' : null)
            || request.nextUrl.protocol.replace(':', '');
        return `${inferredProto}://${forwardedHost}`;
    }

    if (originHeader) {
        return originHeader;
    }

    if (refererOrigin) {
        return refererOrigin;
    }

    const host = request.headers.get('host');
    if (host) {
        const inferredProto = forwardedProto
            || (refererOrigin?.startsWith('https://') ? 'https' : null)
            || request.nextUrl.protocol.replace(':', '');
        return `${inferredProto}://${host}`;
    }

    return request.nextUrl.origin;
}

// User agents to rotate
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

// Get a consistent user agent for a domain (so resources load correctly)
function getUserAgentForDomain(domain: string): string {
    const hash = domain.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return USER_AGENTS[hash % USER_AGENTS.length];
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Helper function to return HTML error page
function htmlErrorResponse(message: string, status: number = 500) {
    const safeMessageHtml = escapeHtml(message);
    const safeMessageJson = JSON.stringify(message);
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Chyba načítání</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    background: #f5f5f5;
                }
                .error-container {
                    background: white;
                    padding: 2rem;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    max-width: 500px;
                    text-align: center;
                }
                .error-title {
                    color: #dc2626;
                    font-size: 1.5rem;
                    margin-bottom: 1rem;
                }
                .error-message {
                    color: #666;
                    margin-bottom: 1rem;
                }
                .retry-btn {
                    background: #7c3aed;
                    color: white;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.875rem;
                }
                .retry-btn:hover {
                    background: #6d28d9;
                }
            </style>
        </head>
        <body>
            <div class="error-container">
                <div class="error-title">Chyba načítání stránky</div>
                <div class="error-message">${safeMessageHtml}</div>
                <div class="error-message">Pro Playwright přepněte režim v horním panelu preview.</div>
                <button class="retry-btn" onclick="window.location.reload()">
                    Načíst znovu
                </button>
            </div>
            <script>
                (function notifyParent() {
                    try {
                        window.parent.postMessage({ type: 'proxy-error', message: ${safeMessageJson} }, '*');
                    } catch (error) {
                        console.warn('Could not post proxy error to parent frame', error);
                    }
                })();
            </script>
        </body>
        </html>
    `;
    return new NextResponse(html, {
        status,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
        },
    });
}

export async function GET(request: NextRequest) {
    try {
        const appOrigin = getRequestOrigin(request);
        const searchParams = request.nextUrl.searchParams;
        const targetUrl = searchParams.get('url');

        if (!targetUrl) {
            return htmlErrorResponse('URL parametr je povinný', 400);
        }

        // Validate URL
        let url: URL;
        try {
            url = new URL(targetUrl);
        } catch {
            return htmlErrorResponse('Neplatná URL adresa', 400);
        }

        // Only allow http/https
        if (!['http:', 'https:'].includes(url.protocol)) {
            return htmlErrorResponse('Povolené jsou pouze HTTP a HTTPS URL', 400);
        }

        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const userAgent = getUserAgentForDomain(url.hostname);

        try {
            // Fetch the content with timeout - use modern browser headers
            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': userAgent,
                    'Accept': request.headers.get('accept') || '*/*',
                    'Accept-Language': request.headers.get('accept-language') || 'cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': request.headers.get('accept-encoding') || 'gzip, deflate, br',
                    'Cache-Control': request.headers.get('cache-control') || 'no-cache',
                    'Pragma': request.headers.get('pragma') || 'no-cache',
                    'DNT': request.headers.get('dnt') || '1',
                    'Sec-Ch-Ua': request.headers.get('sec-ch-ua') || '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                    'Sec-Ch-Ua-Mobile': request.headers.get('sec-ch-ua-mobile') || '?0',
                    'Sec-Ch-Ua-Platform': request.headers.get('sec-ch-ua-platform') || '"Windows"',
                    'Sec-Fetch-Dest': request.headers.get('sec-fetch-dest') || 'empty',
                    'Sec-Fetch-Mode': request.headers.get('sec-fetch-mode') || 'cors',
                    'Sec-Fetch-Site': request.headers.get('sec-fetch-site') || 'cross-site',
                    ...(request.headers.get('sec-fetch-user') ? { 'Sec-Fetch-User': request.headers.get('sec-fetch-user')! } : {}),
                    ...(request.headers.get('upgrade-insecure-requests') ? { 'Upgrade-Insecure-Requests': request.headers.get('upgrade-insecure-requests')! } : {}),
                    'Referer': url.origin + '/',
                },
                signal: controller.signal,
                redirect: 'follow',
            });

            clearTimeout(timeoutId);

            const contentType = response.headers.get('content-type') || '';
            const isHtml = contentType.includes('text/html');

            if (!response.ok) {
                console.error(`Proxy fetch failed: ${response.status} ${response.statusText} for ${targetUrl}`);
                return htmlErrorResponse(
                    `Nepodařilo se načíst stránku ${url.hostname}: ${response.statusText} (${response.status})`,
                    response.status,
                );
            }

            if (isHtml) {
                let html = await response.text();

                html = stripProblematicThirdPartySnippets(html);

                // Strip Content-Security-Policy meta tags
                html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, '');

                // Strip X-Frame-Options meta tags
                html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi, '');

                // Strip existing base tags to avoid conflicts
                html = html.replace(/<base[^>]*>/gi, '');

                const baseUrlForRelative = url.href;
                const proxyBase = `${appOrigin}/api/proxy?url=`;

                // Prevent infinite loops
                const isAlreadyProxied = (urlValue: string) => {
                    return urlValue.includes('/api/proxy?url=') ||
                        urlValue.includes('/api/proxy?url%3D') ||
                        urlValue.startsWith('/api/proxy') ||
                        decodeURIComponent(urlValue).includes('/api/proxy?url=');
                };

                // Helper function to proxy a single URL
                const proxyUrl = (urlValue: string): string => {
                    if (!urlValue || urlValue.trim() === '') return urlValue;

                    const trimmedUrl = urlValue.trim();

                    if (/^(data:|javascript:|mailto:|tel:|#|blob:)/i.test(trimmedUrl)) {
                        return urlValue;
                    }

                    if (isAlreadyProxied(trimmedUrl)) {
                        return urlValue;
                    }

                    try {
                        let absoluteUrl: string;

                        if (trimmedUrl.startsWith('//')) {
                            absoluteUrl = url.protocol + trimmedUrl;
                        } else if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
                            absoluteUrl = trimmedUrl;
                        } else {
                            absoluteUrl = new URL(trimmedUrl, baseUrlForRelative).href;
                        }

                        return `${proxyBase}${encodeURIComponent(absoluteUrl)}`;
                    } catch {
                        try {
                            if (trimmedUrl.startsWith('/')) {
                                return `${proxyBase}${encodeURIComponent(url.origin + trimmedUrl)}`;
                            }
                            return urlValue;
                        } catch {
                            return urlValue;
                        }
                    }
                };

                // Frame-buster prevention + AJAX/Fetch interception script
                const injectedScripts = `
                <script id="proxy-init-scripts">
                (function(){
                    // === FETCH/XHR INTERCEPTION ===
                    var RUNTIME_ORIGIN = (window.location && window.location.origin) ? window.location.origin : '${appOrigin}';
                    var PROXY_BASE = RUNTIME_ORIGIN + '/api/proxy?url=';
                    var ORIGINAL_ORIGIN = '${url.origin}';
                    var ORIGINAL_HREF = '${url.href}';
                    
                    function shouldProxy(urlStr) {
                        if (!urlStr) return false;
                        if (urlStr.startsWith('data:') || urlStr.startsWith('blob:') || urlStr.startsWith('javascript:')) return false;
                        if (urlStr.includes('/api/proxy')) return false;
                        return true;
                    }
                    
                    function makeAbsolute(urlStr) {
                        if (urlStr.startsWith('//')) return '${url.protocol}' + urlStr;
                        if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) return urlStr;
                        if (urlStr.startsWith('/')) return ORIGINAL_ORIGIN + urlStr;
                        // Relative URL
                        try {
                            return new URL(urlStr, ORIGINAL_HREF).href;
                        } catch(e) {
                            return ORIGINAL_ORIGIN + '/' + urlStr;
                        }
                    }
                    
                    function proxyUrl(urlStr) {
                        if (!shouldProxy(urlStr)) return urlStr;
                        var absolute = makeAbsolute(urlStr);
                        return PROXY_BASE + encodeURIComponent(absolute);
                    }
                    
                    // Override fetch
                    var originalFetch = window.fetch;
                    window.fetch = function(input, init) {
                        var url = input;
                        if (typeof input === 'string') {
                            url = proxyUrl(input);
                        } else if (input instanceof Request) {
                            url = new Request(proxyUrl(input.url), input);
                        } else if (input && input.url) {
                            input.url = proxyUrl(input.url);
                        }
                        return originalFetch.call(this, url, init);
                    };
                    
                    // Override XMLHttpRequest
                    var originalXHROpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
                        var proxiedUrl = proxyUrl(url);
                        return originalXHROpen.call(this, method, proxiedUrl, async !== false, user, password);
                    };
                    
                    // Override Image src
                    var originalImageDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
                    if (originalImageDescriptor && originalImageDescriptor.set) {
                        Object.defineProperty(HTMLImageElement.prototype, 'src', {
                            set: function(value) {
                                originalImageDescriptor.set.call(this, proxyUrl(value));
                            },
                            get: originalImageDescriptor.get
                        });
                    }
                    
                    // Override dynamic script loading
                    var originalScriptDescriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
                    if (originalScriptDescriptor && originalScriptDescriptor.set) {
                        Object.defineProperty(HTMLScriptElement.prototype, 'src', {
                            set: function(value) {
                                originalScriptDescriptor.set.call(this, proxyUrl(value));
                            },
                            get: originalScriptDescriptor.get
                        });
                    }
                    
                    // Override link href for stylesheets
                    var originalLinkDescriptor = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, 'href');
                    if (originalLinkDescriptor && originalLinkDescriptor.set) {
                        Object.defineProperty(HTMLLinkElement.prototype, 'href', {
                            set: function(value) {
                                originalLinkDescriptor.set.call(this, proxyUrl(value));
                            },
                            get: originalLinkDescriptor.get
                        });
                    }
                    
                    // Override window.location for some frame-busting scripts
                    // (This is tricky - we can't fully override location, but we can catch some patterns)
                    
                    console.log('[Proxy] Interception scripts loaded for:', ORIGINAL_ORIGIN);
                })();
                </script>`;

                // Inject base tag and scripts
                const baseTag = `<base href="${baseUrlForRelative}">`;
                if (html.includes('<head>')) {
                    html = html.replace('<head>', `<head>${injectedScripts}${baseTag}`);
                } else if (html.includes('<HEAD>')) {
                    html = html.replace('<HEAD>', `<HEAD>${injectedScripts}${baseTag}`);
                } else if (/<html[^>]*>/i.test(html)) {
                    html = html.replace(/<html[^>]*>/i, `$&<head>${injectedScripts}${baseTag}</head>`);
                } else {
                    html = `${injectedScripts}${baseTag}${html}`;
                }

                // Rewrite static URLs in HTML
                html = html.replace(
                    /(href|src|action)=["']([^"']+)["']/gi,
                    (match: string, attr: string, urlValue: string, offset: number, fullHtml: string) => {
                        const tagStart = fullHtml.lastIndexOf('<', offset);
                        const tagPrefix = tagStart >= 0 ? fullHtml.slice(tagStart, offset).toLowerCase() : '';
                        if (tagPrefix.startsWith('<base')) {
                            return match;
                        }
                        const proxiedUrl = proxyUrl(urlValue);
                        return `${attr}="${proxiedUrl}"`;
                    }
                );

                // Handle srcset
                html = html.replace(
                    /srcset=["']([^"']+)["']/gi,
                    (match, srcsetValue) => {
                        try {
                            const parts = srcsetValue.split(',').map((part: string) => {
                                const trimmed = part.trim();
                                const [imgUrl, descriptor] = trimmed.split(/\s+/);
                                if (imgUrl) {
                                    const proxiedUrl = proxyUrl(imgUrl);
                                    return descriptor ? `${proxiedUrl} ${descriptor}` : proxiedUrl;
                                }
                                return trimmed;
                            });
                            return `srcset="${parts.join(', ')}"`;
                        } catch {
                            return match;
                        }
                    }
                );

                // Handle inline styles with url()
                html = html.replace(
                    /style=["']([^"']*url\([^)]+\)[^"']*)["']/gi,
                    (match, styleValue) => {
                        try {
                            const rewrittenStyle = styleValue.replace(
                                /url\(["']?([^"')]+)["']?\)/gi,
                                (_: string, cssUrl: string) => `url("${proxyUrl(cssUrl)}")`
                            );
                            return `style="${rewrittenStyle}"`;
                        } catch {
                            return match;
                        }
                    }
                );

                // Handle CSS url() in style tags
                html = html.replace(
                    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
                    (match, openTag, cssContent, closeTag) => {
                        const rewrittenCss = cssContent.replace(
                            /url\(["']?([^"')]+)["']?\)/gi,
                            (_: string, cssUrl: string) => {
                                if (/^data:/i.test(cssUrl.trim())) return `url("${cssUrl}")`;
                                return `url("${proxyUrl(cssUrl)}")`;
                            }
                        );
                        return `${openTag}${rewrittenCss}${closeTag}`;
                    }
                );

                // Inject element selector script
                const selectionScript = `
                <script id="element-selector-script">
                    (function() {
                        const ORIGINAL_HREF = '${url.href.replace(/'/g, "\\'")}';
                        const APP_ORIGIN = '${appOrigin}';
                        let hoveredEl = null;
                        let selectedEl = null;
                        let highlightDiv = null;
                        let selectorMatchOverlays = [];
                        let selectorMatchEntries = [];
                        let isSelectionMode = false;
                        let selectionMode = 'select';
                        let FRAME_PATH = window.__FRAME_PATH__ || [];
                        let pageTypeDetected = false;
                        let pageType = null;

                        window.addEventListener('message', function(event) {
                            if (event.data?.type === 'set-frame-path' && Array.isArray(event.data.framePath)) {
                                FRAME_PATH = event.data.framePath;
                                window.__FRAME_PATH__ = FRAME_PATH;
                            }
                        });

                        function createHighlight() {
                            if (!highlightDiv) {
                                highlightDiv = document.createElement('div');
                                highlightDiv.id = 'element-selector-highlight';
                                highlightDiv.style.cssText = \`
                                    position: absolute;
                                    pointer-events: none;
                                    z-index: 999999;
                                    border: 2px solid #a855f7;
                                    background: rgba(168, 85, 247, 0.1);
                                    transition: all 0.1s ease;
                                    box-shadow: 0 0 0 1px rgba(168, 85, 247, 0.3);
                                \`;
                                document.body.appendChild(highlightDiv);
                            }
                            return highlightDiv;
                        }

                        function updateHighlight(element) {
                            if (!element) {
                                if (highlightDiv) highlightDiv.style.display = 'none';
                                return;
                            }
                            const rect = element.getBoundingClientRect();
                            const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
                            const scrollY = window.pageYOffset || document.documentElement.scrollTop;
                            const highlight = createHighlight();
                            highlight.style.display = 'block';
                            highlight.style.left = (rect.left + scrollX) + 'px';
                            highlight.style.top = (rect.top + scrollY) + 'px';
                            highlight.style.width = rect.width + 'px';
                            highlight.style.height = rect.height + 'px';
                        }

                        function clearSelectorHighlights() {
                            selectorMatchOverlays.forEach(function(overlay) {
                                try { overlay.remove(); } catch {}
                            });
                            selectorMatchOverlays = [];
                            selectorMatchEntries = [];
                        }

                        function updateSelectorHighlightPositions() {
                            selectorMatchEntries.forEach(function(entry) {
                                if (!entry || !entry.element || !entry.overlay) return;
                                const rect = entry.element.getBoundingClientRect();
                                const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
                                const scrollY = window.pageYOffset || document.documentElement.scrollTop;

                                if (rect.width <= 0 || rect.height <= 0) {
                                    entry.overlay.style.display = 'none';
                                    return;
                                }

                                entry.overlay.style.display = 'block';
                                entry.overlay.style.left = (rect.left + scrollX) + 'px';
                                entry.overlay.style.top = (rect.top + scrollY) + 'px';
                                entry.overlay.style.width = rect.width + 'px';
                                entry.overlay.style.height = rect.height + 'px';
                            });
                        }

                        function highlightSelectorMatches(selector) {
                            clearSelectorHighlights();
                            if (!selector || typeof selector !== 'string') return;

                            let elements = [];
                            try {
                                elements = Array.from(document.querySelectorAll(selector));
                            } catch {
                                return;
                            }

                            elements.slice(0, 200).forEach(function(element) {
                                const rect = element.getBoundingClientRect();
                                if (rect.width <= 0 || rect.height <= 0) return;
                                const overlay = document.createElement('div');
                                overlay.style.cssText = \`
                                    position: absolute;
                                    pointer-events: none;
                                    z-index: 999998;
                                    border: 2px dashed #22c55e;
                                    background: rgba(34, 197, 94, 0.12);
                                    box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.4);
                                \`;
                                const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
                                const scrollY = window.pageYOffset || document.documentElement.scrollTop;
                                overlay.style.left = (rect.left + scrollX) + 'px';
                                overlay.style.top = (rect.top + scrollY) + 'px';
                                overlay.style.width = rect.width + 'px';
                                overlay.style.height = rect.height + 'px';
                                document.body.appendChild(overlay);
                                selectorMatchOverlays.push(overlay);
                                selectorMatchEntries.push({ element: element, overlay: overlay });
                            });

                            updateSelectorHighlightPositions();
                        }

                        function getElementSelector(el) {
                            if (el.id) return '#' + el.id;
                            if (el.className && typeof el.className === 'string') {
                                const classes = el.className.trim().split(/\\s+/).filter(Boolean);
                                if (classes.length > 0) {
                                    const classSelector = '.' + classes.join('.');
                                    try {
                                        const matches = document.querySelectorAll(classSelector);
                                        if (matches.length === 1) return classSelector;
                                    } catch {}
                                }
                            }
                            const path = [];
                            let current = el;
                            while (current && current.nodeType === 1) {
                                let selector = current.tagName.toLowerCase();
                                if (current.id) {
                                    selector += '#' + current.id;
                                    path.unshift(selector);
                                    break;
                                }
                                if (current.className && typeof current.className === 'string') {
                                    const classes = current.className.trim().split(/\\s+/).filter(Boolean);
                                    if (classes.length > 0) selector += '.' + classes[0];
                                }
                                let sibling = current;
                                let nth = 1;
                                while (sibling.previousElementSibling) {
                                    sibling = sibling.previousElementSibling;
                                    if (sibling.tagName === current.tagName) nth++;
                                }
                                if (nth > 1) selector += ':nth-of-type(' + nth + ')';
                                path.unshift(selector);
                                current = current.parentElement;
                            }
                            return path.join(' > ');
                        }

                        function detectListPattern(el) {
                            const parent = el.parentElement;
                            if (!parent) return { isList: false };
                            const siblings = Array.from(parent.children).filter(e => e.tagName === el.tagName);
                            if (siblings.length >= 2) {
                                const containerSelector = getElementSelector(parent);
                                return {
                                    isList: true,
                                    listSelector: containerSelector + ' > ' + el.tagName.toLowerCase(),
                                    count: siblings.length
                                };
                            }
                            if (['UL', 'OL', 'DL'].includes(parent.tagName)) {
                                const parentSelector = getElementSelector(parent);
                                return {
                                    isList: true,
                                    listSelector: parentSelector + ' > ' + el.tagName.toLowerCase(),
                                    count: parent.children.length
                                };
                            }
                            return { isList: false };
                        }

                        const inspectorNodeMap = new Map();

                        function getInspectorBadges(el) {
                            const badges = [];
                            if (el.tagName === 'A' && el.getAttribute('href')) badges.push('link');
                            if (el.tagName === 'IFRAME') badges.push('iframe');
                            const parent = el.parentElement;
                            if (parent) {
                                const siblings = Array.from(parent.children).filter(function(item) { return item.tagName === el.tagName; });
                                if (siblings.length >= 2) badges.push('list-item');
                            }
                            if (el.tagName === 'A') {
                                const href = (el.getAttribute('href') || '').toLowerCase();
                                if (/\\.(pdf|docx?|xlsx?|pptx?|zip)(\\?|#|$)/.test(href)) badges.push('doc-link');
                            }
                            return badges;
                        }

                        function toInspectorNode(el, parentId) {
                            const selector = getElementSelector(el);
                            const nodeId = FRAME_PATH.join(' >>> ') + '::' + selector;
                            inspectorNodeMap.set(nodeId, el);
                            const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter(Boolean)[0] : '';
                            return {
                                nodeId: nodeId,
                                parentId: parentId,
                                tag: el.tagName.toLowerCase(),
                                text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80),
                                selector: selector,
                                hasChildren: el.children.length > 0,
                                badges: getInspectorBadges(el),
                                framePath: FRAME_PATH,
                                attrs: {
                                    id: el.id || undefined,
                                    className: cls || undefined,
                                },
                            };
                        }

                        function collectInspectorNodes(root, parentId, depth, maxDepth, sink) {
                            if (!root || depth > maxDepth) return;
                            const children = Array.from(root.children).slice(0, 120);
                            children.forEach(function(child) {
                                const node = toInspectorNode(child, parentId);
                                sink.push(node);
                                if (depth < maxDepth && child.children.length > 0) {
                                    collectInspectorNodes(child, node.nodeId, depth + 1, maxDepth, sink);
                                }
                            });
                        }

                        function sendInspectorInit() {
                            const nodes = [];
                            const root = document.body || document.documentElement;
                            if (root) {
                                const rootNode = toInspectorNode(root, null);
                                nodes.push(rootNode);
                                collectInspectorNodes(root, rootNode.nodeId, 1, 2, nodes);
                            }
                            window.parent.postMessage({ type: 'inspector:children', nodes: nodes }, '*');
                        }

                        function sendInspectorChildren(nodeId) {
                            const target = inspectorNodeMap.get(nodeId);
                            if (!target) return;
                            const nodes = [];
                            collectInspectorNodes(target, nodeId, 1, 1, nodes);
                            window.parent.postMessage({ type: 'inspector:children', nodes: nodes }, '*');
                        }

                        function getStableSelector(el) {
                            if (el.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(el.id)) return '#' + el.id;
                            const attrs = ['data-testid', 'data-qa', 'data-test', 'aria-label', 'name', 'role'];
                            for (const attr of attrs) {
                                const value = el.getAttribute(attr);
                                if (!value) continue;
                                const escaped = String(value).replace(/"/g, '\\"');
                                const selector = el.tagName.toLowerCase() + '[' + attr + '="' + escaped + '"]';
                                try {
                                    if (document.querySelectorAll(selector).length === 1) return selector;
                                } catch {}
                            }
                            if (el.className && typeof el.className === 'string') {
                                const classes = el.className.trim().split(/\\s+/).filter(function(cls) {
                                    if (!cls) return false;
                                    if (/^[a-f0-9]{6,}$/i.test(cls)) return false;
                                    if (/^(css-|jsx-)/.test(cls)) return false;
                                    return /^[a-zA-Z_-][\\w-]*$/.test(cls);
                                });
                                if (classes.length > 0) {
                                    const selector = el.tagName.toLowerCase() + '.' + classes.slice(0, 2).join('.');
                                    try {
                                        if (document.querySelectorAll(selector).length === 1) return selector;
                                    } catch {}
                                }
                            }
                            return el.tagName.toLowerCase();
                        }

                        function buildSelectorSuggestions(nodeId) {
                            const el = inspectorNodeMap.get(nodeId);
                            if (!el) return [];

                            const strictSelector = getElementSelector(el);
                            const stableSelector = getStableSelector(el);
                            const parentSelector = el.parentElement ? getStableSelector(el.parentElement) : '';
                            const scopedSelector = parentSelector ? (parentSelector + ' > ' + el.tagName.toLowerCase()) : stableSelector;
                            const rawSuggestions = [
                                { kind: 'stable', selector: stableSelector },
                                { kind: 'scoped', selector: scopedSelector },
                                { kind: 'strict', selector: strictSelector },
                            ];

                            return rawSuggestions.map(function(item) {
                                let matches = 0;
                                try {
                                    matches = document.querySelectorAll(item.selector).length;
                                } catch {
                                    matches = 0;
                                }
                                const includesNth = item.selector.includes(':nth-');
                                const score = item.kind === 'strict'
                                    ? (matches > 0 ? 0.55 : 0.05)
                                    : includesNth
                                        ? (matches === 1 ? 0.7 : 0.3)
                                        : (matches === 1 ? 0.95 : matches > 1 ? 0.6 : 0.1);
                                return {
                                    kind: item.kind,
                                    selector: item.selector,
                                    score: score,
                                    matches: matches,
                                };
                            });
                        }

                        function getIframeSelector(iframe) {
                            if (iframe.id) return 'iframe#' + iframe.id;
                            if (iframe.name) return 'iframe[name="' + iframe.name + '"]';
                            const iframes = Array.from(document.querySelectorAll('iframe'));
                            const idx = iframes.indexOf(iframe);
                            if (idx >= 0) return 'iframe:nth-of-type(' + (idx + 1) + ')';
                            return 'iframe';
                        }

                        function setupIframes() {
                            document.querySelectorAll('iframe').forEach(function(iframe) {
                                if (iframe.dataset.framePathBound === 'true') return;

                                const iframeSelector = getIframeSelector(iframe);
                                const framePath = FRAME_PATH.concat([iframeSelector]);
                                const sendFramePath = function() {
                                    try {
                                        iframe.contentWindow?.postMessage({
                                            type: 'set-frame-path',
                                            framePath: framePath,
                                        }, '*');
                                    } catch {}
                                };

                                iframe.addEventListener('load', function() {
                                    sendFramePath();
                                    if (isSelectionMode) {
                                        try {
                                            iframe.contentWindow?.postMessage({
                                                type: 'enable-selection',
                                                mode: selectionMode,
                                            }, '*');
                                        } catch {}
                                    }
                                });

                                sendFramePath();
                                iframe.dataset.framePathBound = 'true';
                            });
                        }

                        function getElementFromEvent(e) {
                            let target = e.target;
                            if (target.nodeType === 3) target = target.parentElement;
                            while (target && target.nodeType !== 1) target = target.parentElement;
                            return target;
                        }

                        setInterval(setupIframes, 600);
                        setTimeout(setupIframes, 100);
                        setTimeout(setupIframes, 400);

                        window.addEventListener('click', function(e) {
                            if (isSelectionMode) return;

                            let t = e.target;
                            if (t && t.nodeType === 3) t = t.parentElement;
                            if (!t || !t.closest) return;

                            const anchor = t.closest('a[href]');
                            if (!anchor) return;

                            const href = anchor.getAttribute('href') || '';
                            if (!href || href.startsWith('#') || /^(javascript:|mailto:|tel:|data:)/i.test(href)) return;

                            let absoluteHref = '';
                            try {
                                absoluteHref = new URL(href, ORIGINAL_HREF).href;
                            } catch {
                                return;
                            }

                            const runtimeOrigin = (window.location && window.location.origin) ? window.location.origin : APP_ORIGIN;
                            const proxiedPrefix = runtimeOrigin + '/api/proxy?url=';
                            let targetHref = absoluteHref;
                            try {
                                const parsed = new URL(absoluteHref);
                                const nestedTarget = parsed.searchParams.get('url');
                                if (parsed.pathname === '/api/proxy' && nestedTarget) {
                                    targetHref = decodeURIComponent(nestedTarget);
                                }
                            } catch {}

                            const nextHref = proxiedPrefix + encodeURIComponent(targetHref);

                            e.preventDefault();
                            e.stopPropagation();
                            if (typeof e.stopImmediatePropagation === 'function') {
                                e.stopImmediatePropagation();
                            }
                            window.location.href = nextHref;
                        }, true);

                        function handleMouseMove(e) {
                            if (!isSelectionMode) return;
                            const target = getElementFromEvent(e);
                            if (!target || target === highlightDiv || target === selectedEl) return;
                            if (target.tagName === 'IFRAME') return;
                            hoveredEl = target;
                            updateHighlight(target);
                        }

                        function handleClick(e) {
                            if (!isSelectionMode) return;
                            const target = getElementFromEvent(e);
                            if (!target || target === highlightDiv) return;
                            if (target.tagName === 'IFRAME') return;
                            
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();

                            let elementToSelect = target;
                            if (target.tagName === 'LABEL' && target.htmlFor) {
                                const associated = document.getElementById(target.htmlFor);
                                if (associated && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(associated.tagName)) {
                                    elementToSelect = associated;
                                }
                            }

                            selectedEl = elementToSelect;
                            updateHighlight(elementToSelect);

                            const selector = getElementSelector(elementToSelect);
                            const listInfo = detectListPattern(elementToSelect);
                            const localSelector = listInfo.isList ? listInfo.listSelector : selector;
                            let fullSelector = localSelector;
                            if (FRAME_PATH.length > 0) {
                                fullSelector = FRAME_PATH.join(' >>> ') + ' >>> ' + localSelector;
                            }

                            const elementInfo = {
                                selector: fullSelector,
                                localSelector: localSelector,
                                framePath: FRAME_PATH,
                                inIframe: FRAME_PATH.length > 0,
                                tagName: elementToSelect.tagName.toLowerCase(),
                                textContent: elementToSelect.textContent?.substring(0, 100) || '',
                                isList: listInfo.isList,
                                listItemCount: listInfo.count,
                                parentSelector: listInfo.isList ? getElementSelector(elementToSelect.parentElement) : undefined
                            };

                            try {
                                window.parent.postMessage({ type: 'element-select', elementInfo: elementInfo }, '*');
                            } catch (err) {
                                console.error('Cannot send message:', err);
                            }
                        }

                        function enableSelection(mode) {
                            isSelectionMode = true;
                            selectionMode = mode === 'remove' ? 'remove' : 'select';
                            document.body.style.cursor = 'crosshair';
                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('click', handleClick, true);
                            setupIframes();
                        }

                        function disableSelection() {
                            isSelectionMode = false;
                            selectionMode = 'select';
                            document.body.style.cursor = '';
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('click', handleClick, true);
                            if (highlightDiv) highlightDiv.style.display = 'none';
                            hoveredEl = null;
                            selectedEl = null;
                        }

                        window.addEventListener('message', function(event) {
                            if (event.data.type === 'enable-selection') {
                                enableSelection(event.data.mode);
                                document.querySelectorAll('iframe').forEach(function(iframe) {
                                    try {
                                        iframe.contentWindow?.postMessage({
                                            type: 'enable-selection',
                                            mode: event.data.mode,
                                        }, '*');
                                    } catch {}
                                });
                            }
                            else if (event.data.type === 'disable-selection') {
                                disableSelection();
                                document.querySelectorAll('iframe').forEach(function(iframe) {
                                    try { iframe.contentWindow?.postMessage({ type: 'disable-selection' }, '*'); } catch {}
                                });
                            }
                            else if (event.data.type === 'highlight-selector') {
                                highlightSelectorMatches(event.data.selector);
                                document.querySelectorAll('iframe').forEach(function(iframe) {
                                    try { iframe.contentWindow?.postMessage(event.data, '*'); } catch {}
                                });
                            }
                            else if (event.data.type === 'clear-highlight-selector') {
                                clearSelectorHighlights();
                                document.querySelectorAll('iframe').forEach(function(iframe) {
                                    try { iframe.contentWindow?.postMessage(event.data, '*'); } catch {}
                                });
                            }
                            else if (event.data.type === 'inspector:hover') {
                                if (!event.data.selector) {
                                    clearSelectorHighlights();
                                } else {
                                    highlightSelectorMatches(event.data.selector);
                                }
                                document.querySelectorAll('iframe').forEach(function(iframe) {
                                    try { iframe.contentWindow?.postMessage(event.data, '*'); } catch {}
                                });
                            }
                            else if (event.data.type === 'inspector:children' && event.source !== window) {
                                window.parent.postMessage(event.data, '*');
                            }
                            else if (event.data.type === 'selector:suggestions' && event.source !== window && Array.isArray(event.data.suggestions)) {
                                window.parent.postMessage(event.data, '*');
                            }
                            else if (event.data.type === 'inspector:select' && event.source !== window && event.data.elementInfo) {
                                window.parent.postMessage(event.data, '*');
                            }
                            else if (event.data.type === 'inspector:init') {
                                sendInspectorInit();
                                document.querySelectorAll('iframe').forEach(function(iframe) {
                                    try { iframe.contentWindow?.postMessage(event.data, '*'); } catch {}
                                });
                            }
                            else if (event.data.type === 'inspector:request-children') {
                                sendInspectorChildren(event.data.nodeId);
                                document.querySelectorAll('iframe').forEach(function(iframe) {
                                    try { iframe.contentWindow?.postMessage(event.data, '*'); } catch {}
                                });
                            }
                            else if (event.data.type === 'selector:suggestions') {
                                const suggestions = buildSelectorSuggestions(event.data.nodeId);
                                window.parent.postMessage({
                                    type: 'selector:suggestions',
                                    nodeId: event.data.nodeId,
                                    suggestions: suggestions,
                                }, '*');
                                document.querySelectorAll('iframe').forEach(function(iframe) {
                                    try { iframe.contentWindow?.postMessage(event.data, '*'); } catch {}
                                });
                            }
                            else if (event.data.type === 'inspector:select') {
                                const element = inspectorNodeMap.get(event.data.nodeId);
                                if (element) {
                                    const selector = getElementSelector(element);
                                    const listInfo = detectListPattern(element);
                                    const localSelector = listInfo.isList ? listInfo.listSelector : selector;
                                    let fullSelector = localSelector;
                                    if (FRAME_PATH.length > 0) {
                                        fullSelector = FRAME_PATH.join(' >>> ') + ' >>> ' + localSelector;
                                    }
                                    window.parent.postMessage({
                                        type: 'inspector:select',
                                        elementInfo: {
                                            selector: fullSelector,
                                            localSelector: localSelector,
                                            framePath: FRAME_PATH,
                                            inIframe: FRAME_PATH.length > 0,
                                            tagName: element.tagName.toLowerCase(),
                                            textContent: element.textContent?.substring(0, 100) || '',
                                            isList: listInfo.isList,
                                            listItemCount: listInfo.count,
                                            parentSelector: listInfo.isList ? getElementSelector(element.parentElement) : undefined,
                                        },
                                    }, '*');
                                }
                                document.querySelectorAll('iframe').forEach(function(iframe) {
                                    try { iframe.contentWindow?.postMessage(event.data, '*'); } catch {}
                                });
                            }
                            else if (event.data.type === 'remove-element') {
                                try {
                                    const selector = event.data.localSelector || event.data.selector;
                                    let el = document.querySelector(selector);
                                    
                                    // If not found, try to find by partial selector match (for dynamic selectors)
                                    if (!el && selector) {
                                        // Try simpler selector patterns
                                        const parts = selector.split(' > ');
                                        for (let i = parts.length - 1; i >= 0 && !el; i--) {
                                            try {
                                                const partialSelector = parts.slice(i).join(' > ');
                                                el = document.querySelector(partialSelector);
                                            } catch {}
                                        }
                                    }
                                    
                                    if (el) {
                                        // Check if this is part of a cookie/consent modal and find the root overlay
                                        const cookiePatterns = /cookie|consent|gdpr|privacy|cc-|cmp-|onetrust|cookiebot|trustarc|quantcast|cookie-notice|cookie-banner|cookie-popup|cookie-modal|cookie-overlay|cookie-dialog/i;
                                        let targetEl = el;
                                        let current = el;
                                        
                                        // Walk up to find the root overlay container
                                        while (current && current !== document.body) {
                                            const id = current.id || '';
                                            const cls = typeof current.className === 'string' ? current.className : '';
                                            const role = current.getAttribute('role') || '';
                                            
                                            if (cookiePatterns.test(id) || cookiePatterns.test(cls) || role === 'dialog') {
                                                targetEl = current;
                                            }
                                            
                                            // Also check for fixed/absolute overlays with high z-index
                                            const style = window.getComputedStyle(current);
                                            if ((style.position === 'fixed' || style.position === 'absolute') && 
                                                parseInt(style.zIndex) > 9999) {
                                                targetEl = current;
                                            }
                                            
                                            current = current.parentElement;
                                        }
                                        
                                        // Remove the target element
                                        targetEl.remove();
                                        
                                        // Also try to remove common overlay/backdrop siblings
                                        const overlaySelectors = [
                                            '.cookie-overlay', '.consent-overlay', '.gdpr-overlay',
                                            '.cc-overlay', '.cmp-overlay', '.modal-backdrop',
                                            '[class*="overlay"]', '[class*="backdrop"]',
                                            '[id*="cookie"][id*="overlay"]', '[id*="consent"][id*="overlay"]'
                                        ];
                                        overlaySelectors.forEach(function(sel) {
                                            try {
                                                document.querySelectorAll(sel).forEach(function(overlay) {
                                                    const style = window.getComputedStyle(overlay);
                                                    if (style.position === 'fixed' && parseInt(style.zIndex) > 1000) {
                                                        overlay.remove();
                                                    }
                                                });
                                            } catch {}
                                        });
                                        
                                        // Remove any remaining fixed overlays with very high z-index that might be backdrops
                                        document.querySelectorAll('div, aside, section').forEach(function(elem) {
                                            try {
                                                const style = window.getComputedStyle(elem);
                                                if (style.position === 'fixed' && parseInt(style.zIndex) > 10000) {
                                                    const rect = elem.getBoundingClientRect();
                                                    // If it covers most of the viewport, it's likely a backdrop
                                                    if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.8) {
                                                        elem.remove();
                                                    }
                                                }
                                            } catch {}
                                        });
                                        
                                        if (highlightDiv) highlightDiv.style.display = 'none';
                                        selectedEl = null;
                                        hoveredEl = null;
                                    }
                                    
                                    // Forward to all iframes
                                    document.querySelectorAll('iframe').forEach(function(iframe) {
                                        try {
                                            iframe.contentWindow?.postMessage(event.data, '*');
                                        } catch {}
                                    });
                                } catch (e) { console.error('Error removing element:', e); }
                            }
                            else if (event.data.type === 'element-select' && event.source !== window) {
                                window.parent.postMessage(event.data, '*');
                            }

                        });

                        // Detect page type
                        function detectPageType() {
                            if (pageTypeDetected) return pageType;
                            
                            const hasReact = window.React || 
                                document.querySelector('[data-reactroot]') ||
                                document.querySelector('[data-react-helmet]') ||
                                (typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined') ||
                                Array.from(document.querySelectorAll('script')).some(s => 
                                    (s.src && s.src.includes('react')) || 
                                    (s.textContent && s.textContent.includes('React'))
                                );
                            
                            const hasVue = window.Vue || document.querySelector('[data-v-]');
                            const hasAngular = window.angular || document.querySelector('[ng-app]');
                            const hasNextJS = typeof window.__NEXT_DATA__ !== 'undefined';
                            
                            const hasDynamicContent = document.querySelector('[data-reactroot]') || 
                                document.querySelector('[id^="__next"]') ||
                                document.querySelector('[id^="root"]');
                            
                            pageType = {
                                isReact: !!hasReact || !!hasNextJS,
                                isSPA: !!(hasReact || hasVue || hasAngular || hasNextJS || hasDynamicContent),
                                isSSR: !hasReact && !hasVue && !hasAngular && !hasNextJS && !hasDynamicContent,
                                framework: hasNextJS ? 'nextjs' : hasReact ? 'react' : hasVue ? 'vue' : hasAngular ? 'angular' : 'unknown',
                                requiresPlaywright: !!(hasReact || hasVue || hasAngular || hasNextJS || hasDynamicContent)
                            };
                            
                            pageTypeDetected = true;
                            window.parent.postMessage({ type: 'page-type-detected', pageType: pageType }, '*');
                            
                            // Notify that proxy loaded successfully
                            window.parent.postMessage({ type: 'proxy-loaded', url: '${targetUrl}' }, '*');
                            
                            return pageType;
                        }

                        if (document.readyState === 'loading') {
                            document.addEventListener('DOMContentLoaded', detectPageType);
                        } else {
                            setTimeout(detectPageType, 100);
                        }

                        window.addEventListener('scroll', updateSelectorHighlightPositions, true);
                        window.addEventListener('resize', updateSelectorHighlightPositions);

                        window.addEventListener('beforeunload', function() {
                            clearSelectorHighlights();
                            if (highlightDiv) highlightDiv.remove();
                        });
                    })();
                </script>
            `;

                if (html.includes('</body>')) {
                    html = html.replace('</body>', selectionScript + '</body>');
                } else if (html.includes('</head>')) {
                    html = html.replace('</head>', selectionScript + '</head>');
                } else {
                    html += selectionScript;
                }

                return new NextResponse(html, {
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        'X-Frame-Options': 'ALLOWALL',
                        'Content-Security-Policy': "frame-ancestors *; default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                    },
                });
            }

            // Rewrite CSS assets so relative url(...) references stay in proxy space.
            if (contentType.includes('text/css')) {
                const css = await response.text();
                const proxyBase = `${appOrigin}/api/proxy?url=`;
                const resolveCssUrl = (cssUrl: string) => {
                    const trimmed = cssUrl.trim();
                    if (!trimmed || /^(data:|blob:|javascript:|#)/i.test(trimmed)) {
                        return cssUrl;
                    }
                    try {
                        const absolute = new URL(trimmed, url.href).href;
                        return `${proxyBase}${encodeURIComponent(absolute)}`;
                    } catch {
                        return cssUrl;
                    }
                };
                const rewrittenCss = css
                    .replace(
                        /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
                        (_match: string, quote: string, assetUrl: string) => `url(${quote}${resolveCssUrl(assetUrl)}${quote})`
                    )
                    .replace(
                        /@import\s+(?:url\()?['"]([^'"]+)['"]\)?/gi,
                        (_match: string, importUrl: string) => `@import url("${resolveCssUrl(importUrl)}")`
                    );

                return new NextResponse(rewrittenCss, {
                    headers: {
                        'Content-Type': contentType.includes('charset') ? contentType : 'text/css; charset=utf-8',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET',
                        'Cache-Control': 'public, max-age=3600',
                    },
                });
            }

            // For non-HTML/non-CSS content
            try {
                const buffer = await response.arrayBuffer();
                return new NextResponse(buffer, {
                    headers: {
                        'Content-Type': contentType,
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET',
                        'Cache-Control': 'public, max-age=3600',
                    },
                });
            } catch {
                return new NextResponse('', {
                    status: response.status,
                    headers: { 'Content-Type': contentType },
                });
            }
        } catch (fetchError: unknown) {
            clearTimeout(timeoutId);

            const error = fetchError as { name?: string; message?: string };

            if (error.name === 'AbortError') {
                return htmlErrorResponse('Timeout při načítání stránky (přes 30 sekund)', 504);
            }

            return htmlErrorResponse(
                `Chyba při načítání stránky: ${error.message || 'Neznámá chyba'}`,
                500
            );
        }
    } catch (error: unknown) {
        const err = error as { message?: string };
        return htmlErrorResponse(
            `Chyba proxy serveru: ${err.message || 'Neznámá chyba'}`,
            500
        );
    }
}
