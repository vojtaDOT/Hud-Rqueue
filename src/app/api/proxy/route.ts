import { NextRequest, NextResponse } from 'next/server';

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

// Helper function to return HTML error page
function htmlErrorResponse(message: string, status: number = 500) {
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
                <div class="error-message">${message}</div>
                <button class="retry-btn" onclick="window.parent.postMessage({type:'proxy-error',message:'${message.replace(/'/g, "\\'")}'},'*')">
                    Zkusit s Playwright
                </button>
            </div>
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
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'DNT': '1',
                    'Pragma': 'no-cache',
                    'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                },
                signal: controller.signal,
                redirect: 'follow',
            });

            clearTimeout(timeoutId);

            const contentType = response.headers.get('content-type') || '';
            const isHtml = contentType.includes('text/html');
            
            if (!response.ok) {
                console.error(`Proxy fetch failed: ${response.status} ${response.statusText} for ${targetUrl}`);
                
                if (isHtml) {
                    return htmlErrorResponse(
                        `Nepodařilo se načíst stránku: ${response.statusText} (${response.status})`,
                        response.status
                    );
                } else {
                    return new NextResponse('', {
                        status: response.status,
                        headers: {
                            'Content-Type': contentType || 'application/octet-stream',
                        },
                    });
                }
            }
        
        if (isHtml) {
            let html = await response.text();
            
            // Strip Content-Security-Policy meta tags
            html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, '');
            
            // Strip X-Frame-Options meta tags
            html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi, '');
            
            // Strip existing base tags to avoid conflicts
            html = html.replace(/<base[^>]*>/gi, '');
            
            const baseUrlForRelative = url.href;
            const proxyBase = `/api/proxy?url=`;
            
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
                    // === FRAME BUSTER PREVENTION ===
                    try {
                        var _self = window.self;
                        Object.defineProperty(window, 'top', { get: function() { return _self; }, configurable: false });
                        Object.defineProperty(window, 'parent', { get: function() { return _self; }, configurable: false });
                    } catch(e) {}
                    
                    // === FETCH/XHR INTERCEPTION ===
                    var PROXY_BASE = '/api/proxy?url=';
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
                (match, attr, urlValue) => {
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
                        let hoveredEl = null;
                        let selectedEl = null;
                        let highlightDiv = null;
                        let isSelectionMode = false;
                        let pageTypeDetected = false;
                        let pageType = null;

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

                        function getElementFromEvent(e) {
                            let target = e.target;
                            if (target.nodeType === 3) target = target.parentElement;
                            while (target && target.nodeType !== 1) target = target.parentElement;
                            return target;
                        }

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

                            const elementInfo = {
                                selector: listInfo.isList ? listInfo.listSelector : selector,
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

                        function enableSelection() {
                            isSelectionMode = true;
                            document.body.style.cursor = 'crosshair';
                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('click', handleClick, true);
                        }

                        function disableSelection() {
                            isSelectionMode = false;
                            document.body.style.cursor = '';
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('click', handleClick, true);
                            if (highlightDiv) highlightDiv.style.display = 'none';
                            hoveredEl = null;
                            selectedEl = null;
                        }

                        window.addEventListener('message', function(event) {
                            if (event.data.type === 'enable-selection') enableSelection();
                            else if (event.data.type === 'disable-selection') disableSelection();
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

                        window.addEventListener('beforeunload', function() {
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

            // For non-HTML content
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
