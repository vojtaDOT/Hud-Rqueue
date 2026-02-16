import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeJsString(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
}

function renderPlaywrightErrorHtml(title: string, message: string, extra = ''): string {
    const escapedTitle = escapeHtml(title);
    const escapedMessage = escapeHtml(message);
    const escapedMessageForPostMessage = escapeJsString(message);

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${escapedTitle}</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    color: white;
                }
                .container {
                    background: rgba(255,255,255,0.1);
                    padding: 2rem;
                    border-radius: 12px;
                    max-width: 560px;
                    text-align: center;
                }
                h2 { color: #ef4444; margin-bottom: 1rem; }
                p { color: #e5e7eb; }
                code {
                    background: rgba(0,0,0,0.3);
                    padding: 0.5rem 1rem;
                    border-radius: 6px;
                    display: block;
                    margin: 0.75rem 0;
                    white-space: pre-wrap;
                    word-break: break-word;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>${escapedTitle}</h2>
                <p>${escapedMessage}</p>
                ${extra}
            </div>
            <script>
                window.parent.postMessage({
                    type: 'playwright-error',
                    message: '${escapedMessageForPostMessage}'
                }, '*');
            </script>
        </body>
        </html>
    `;
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
        return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    // Validate URL
    let url: URL;
    try {
        url = new URL(targetUrl);
    } catch {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
        return NextResponse.json({ error: 'Only HTTP/HTTPS URLs are allowed' }, { status: 400 });
    }

    // Dynamic import at runtime - avoids build-time analysis
    let chromium;
    try {
        const playwright = await import('playwright');
        chromium = playwright.chromium;
    } catch {
        const html = renderPlaywrightErrorHtml(
            'Playwright není dostupný',
            'Modul playwright není nainstalovaný nebo se nepodařilo načíst.',
            '<code>npm install playwright</code><code>npx playwright install chromium</code>',
        );
        return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    let browser = null;

    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });

        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        });

        const page = await context.newPage();

        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1000);

        let html = await page.content();
        await browser.close();

        // Rewrite iframe src to proxy through our endpoint (fixes cross-origin)
        const proxyBaseUrl = request.nextUrl.origin + '/api/render?url=';

        // Rewrite iframe src attributes to go through our proxy
        html = html.replace(
            /<iframe([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi,
            (match: string, before: string, src: string, after: string) => {
                // Skip if already proxied or is about:blank/javascript:
                if (src.startsWith('/api/') || src.startsWith('about:') || src.startsWith('javascript:') || src.startsWith('data:')) {
                    return match;
                }
                // Resolve relative URLs
                let absoluteSrc = src;
                try {
                    absoluteSrc = new URL(src, url.href).href;
                } catch {
                    return match;
                }
                const proxiedSrc = proxyBaseUrl + encodeURIComponent(absoluteSrc);
                return '<iframe' + before + ' src="' + proxiedSrc + '"' + after + ' data-original-src="' + absoluteSrc + '">';
            }
        );

        // Inject selection script with iframe support
        const injectedScript = `
            <base href="${url.href}">
            <script id="playwright-init">
                window.__PLAYWRIGHT_RENDERED__ = true;
                window.__FRAME_PATH__ = window.__FRAME_PATH__ || [];
                window.__ORIGINAL_URL__ = '${targetUrl}';
                // Only send loaded message from top frame
                if (window.__FRAME_PATH__.length === 0) {
                    window.parent.postMessage({ type: 'playwright-loaded', url: '${targetUrl}' }, '*');
                }
            </script>
            <script id="element-selector">
                (function() {
                    // FRAME_PATH can be updated via postMessage from parent
                    let FRAME_PATH = window.__FRAME_PATH__ || [];
                    let highlightDiv = null;
                    let selectorMatchOverlays = [];
                    let selectorMatchEntries = [];
                    let isSelectionMode = false;
                    let selectionMode = 'select';
                    
                    // Watch for frame path updates
                    window.addEventListener('message', function(e) {
                        if (e.data.type === 'set-frame-path' && Array.isArray(e.data.framePath)) {
                            FRAME_PATH = e.data.framePath;
                            window.__FRAME_PATH__ = FRAME_PATH;
                        }
                    });

                    function createHighlight() {
                        if (!highlightDiv) {
                            highlightDiv = document.createElement('div');
                            highlightDiv.id = 'selector-highlight';
                            highlightDiv.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #22c55e;background:rgba(34,197,94,0.15);transition:all 0.05s ease-out;box-shadow:0 0 0 4px rgba(34,197,94,0.3);';
                            document.body.appendChild(highlightDiv);
                        }
                        return highlightDiv;
                    }

                    function updateHighlight(el) {
                        if (!el) { if (highlightDiv) highlightDiv.style.display = 'none'; return; }
                        const rect = el.getBoundingClientRect();
                        const highlight = createHighlight();
                        highlight.style.display = 'block';
                        highlight.style.left = rect.left + 'px';
                        highlight.style.top = rect.top + 'px';
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
                            if (rect.width <= 0 || rect.height <= 0) {
                                entry.overlay.style.display = 'none';
                                return;
                            }
                            entry.overlay.style.display = 'block';
                            entry.overlay.style.left = rect.left + 'px';
                            entry.overlay.style.top = rect.top + 'px';
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
                            overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px dashed #22c55e;background:rgba(34,197,94,0.12);box-shadow:0 0 0 1px rgba(34,197,94,0.4);';
                            overlay.style.left = rect.left + 'px';
                            overlay.style.top = rect.top + 'px';
                            overlay.style.width = rect.width + 'px';
                            overlay.style.height = rect.height + 'px';
                            document.body.appendChild(overlay);
                            selectorMatchOverlays.push(overlay);
                            selectorMatchEntries.push({ element: element, overlay: overlay });
                        });

                        updateSelectorHighlightPositions();
                    }

                    function getSelector(el) {
                        if (el.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(el.id)) return '#' + el.id;
                        if (el.className && typeof el.className === 'string') {
                            const cls = el.className.trim().split(/\\s+/).filter(c => c && /^[a-zA-Z_-]/.test(c) && !c.includes(':'));
                            if (cls.length) {
                                const sel = '.' + cls.slice(0, 2).join('.');
                                try { if (document.querySelectorAll(sel).length === 1) return sel; } catch {}
                            }
                        }
                        const path = [];
                        let cur = el;
                        let depth = 0;
                        while (cur && cur.nodeType === 1 && depth < 5) {
                            let sel = cur.tagName.toLowerCase();
                            if (cur.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(cur.id)) { path.unshift(sel + '#' + cur.id); break; }
                            if (cur.className && typeof cur.className === 'string') {
                                const cls = cur.className.trim().split(/\\s+/).filter(c => c && /^[a-zA-Z_-]/.test(c) && !c.includes(':'))[0];
                                if (cls) sel += '.' + cls;
                            }
                            let sib = cur, nth = 1;
                            while (sib.previousElementSibling) { sib = sib.previousElementSibling; if (sib.tagName === cur.tagName) nth++; }
                            if (nth > 1) sel += ':nth-of-type(' + nth + ')';
                            path.unshift(sel);
                            cur = cur.parentElement;
                            depth++;
                        }
                        return path.join(' > ');
                    }

                    function getIframeSelector(iframe) {
                        if (iframe.id) return 'iframe#' + iframe.id;
                        if (iframe.name) return 'iframe[name="' + iframe.name + '"]';
                        const iframes = Array.from(document.querySelectorAll('iframe'));
                        const idx = iframes.indexOf(iframe);
                        if (idx >= 0) return 'iframe:nth-of-type(' + (idx + 1) + ')';
                        return 'iframe';
                    }

                    function detectList(el) {
                        const parent = el.parentElement;
                        if (!parent) return { isList: false };
                        const sibs = Array.from(parent.children).filter(e => e.tagName === el.tagName);
                        if (sibs.length >= 2) return { isList: true, listSelector: getSelector(parent) + ' > ' + el.tagName.toLowerCase(), count: sibs.length };
                        return { isList: false };
                    }

                    // Check if element is part of a cookie consent dialog or modal overlay
                    function isInteractiveOverlay(el) {
                        if (!el) return false;
                        let current = el;
                        const overlayPatterns = [
                            // Cookie consent dialogs
                            /cookie/i, /consent/i, /gdpr/i, /privacy/i,
                            // Common modal/popup patterns
                            /modal/i, /popup/i, /overlay/i, /dialog/i,
                            // Specific cookie services
                            /cookiebot/i, /onetrust/i, /trustarc/i, /quantcast/i,
                            /cc-window/i, /cc-banner/i, /cookie-notice/i
                        ];
                        while (current && current !== document.body) {
                            const id = current.id || '';
                            const cls = current.className || '';
                            const clsStr = typeof cls === 'string' ? cls : '';
                            for (const pattern of overlayPatterns) {
                                if (pattern.test(id) || pattern.test(clsStr)) {
                                    return true;
                                }
                            }
                            // Check for high z-index fixed/absolute positioned elements
                            const style = window.getComputedStyle(current);
                            const zIndex = parseInt(style.zIndex) || 0;
                            const position = style.position;
                            if ((position === 'fixed' || position === 'absolute') && zIndex > 9999) {
                                // Check if it looks like an overlay (covers significant screen area)
                                const rect = current.getBoundingClientRect();
                                if (rect.width > window.innerWidth * 0.3 && rect.height > window.innerHeight * 0.2) {
                                    return true;
                                }
                            }
                            current = current.parentElement;
                        }
                        return false;
                    }

                    // Setup iframe communication for proxied iframes
                    function setupIframes() {
                        const iframes = document.querySelectorAll('iframe');
                        iframes.forEach(function(iframe) {
                            if (iframe.dataset.framePathSent) return;
                            
                            const iframeSel = getIframeSelector(iframe);
                            const newFramePath = FRAME_PATH.concat([iframeSel]);
                            
                            // For proxied iframes, send frame path via postMessage
                            iframe.addEventListener('load', function() {
                                try {
                                    iframe.contentWindow?.postMessage({ 
                                        type: 'set-frame-path', 
                                        framePath: newFramePath 
                                    }, '*');
                                    if (isSelectionMode) {
                                        iframe.contentWindow?.postMessage({
                                            type: 'enable-selection',
                                            mode: selectionMode,
                                        }, '*');
                                    }
                                } catch {}
                            });
                            
                            // Send immediately if already loaded
                            try {
                                if (iframe.contentDocument?.readyState === 'complete') {
                                    iframe.contentWindow?.postMessage({ 
                                        type: 'set-frame-path', 
                                        framePath: newFramePath 
                                    }, '*');
                                    if (isSelectionMode) {
                                        iframe.contentWindow?.postMessage({
                                            type: 'enable-selection',
                                            mode: selectionMode,
                                        }, '*');
                                    }
                                }
                            } catch {}
                            
                            // Also try to inject directly for same-origin
                            try {
                                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                                if (iframeDoc && iframeDoc.body && !iframeDoc.getElementById('selector-highlight-injected')) {
                                    const marker = iframeDoc.createElement('div');
                                    marker.id = 'selector-highlight-injected';
                                    marker.style.display = 'none';
                                    iframeDoc.body.appendChild(marker);
                                    
                                    // Set frame path before running script
                                    iframeDoc.defaultView.__FRAME_PATH__ = newFramePath;
                                    
                                    const script = iframeDoc.createElement('script');
                                    script.textContent = 'window.__FRAME_PATH__ = ' + JSON.stringify(newFramePath) + ';' + document.getElementById('element-selector').textContent;
                                    iframeDoc.head?.appendChild(script);
                                }
                            } catch (e) { /* cross-origin - use postMessage */ }
                            
                            iframe.dataset.framePathSent = 'true';
                        });
                    }

                    // Re-check periodically for dynamically loaded iframes
                    setInterval(setupIframes, 500);
                    setTimeout(setupIframes, 100);
                    setTimeout(setupIframes, 500);
                    setTimeout(setupIframes, 1000);

                    document.addEventListener('click', function(e) {
                        if (isSelectionMode) return;
                        let t = e.target;
                        if (t && t.nodeType === 3) t = t.parentElement;
                        if (!t) return;

                        const anchor = t.closest ? t.closest('a[href]') : null;
                        if (!anchor) return;

                        const href = anchor.getAttribute('href') || '';
                        if (!href || href.startsWith('#') || /^(javascript:|mailto:|tel:|data:)/i.test(href)) return;

                        let absoluteHref = '';
                        try {
                            const base = window.__ORIGINAL_URL__ || window.location.href;
                            absoluteHref = new URL(href, base).href;
                        } catch {
                            return;
                        }

                        e.preventDefault();
                        e.stopPropagation();
                        window.location.href = '${request.nextUrl.origin}/api/render?url=' + encodeURIComponent(absoluteHref);
                    }, true);

                    document.addEventListener('mousemove', function(e) {
                        if (!isSelectionMode) return;
                        let t = e.target; if (t.nodeType === 3) t = t.parentElement;
                        if (!t || t === highlightDiv || t.id === 'selector-highlight') return;
                        // Don't highlight cookie dialogs/modals - let user interact naturally
                        if (selectionMode === 'select' && isInteractiveOverlay(t)) {
                            updateHighlight(null);
                            return;
                        }
                        updateHighlight(t);
                    });

                    document.addEventListener('click', function(e) {
                        if (!isSelectionMode) return;
                        let t = e.target; if (t.nodeType === 3) t = t.parentElement;
                        if (!t || t === highlightDiv || t.id === 'selector-highlight') return;
                        // Allow clicks on cookie dialogs/modals to pass through
                        if (selectionMode === 'select' && isInteractiveOverlay(t)) {
                            return; // Don't intercept - let the click happen normally
                        }
                        e.preventDefault(); e.stopPropagation();
                        
                        const sel = getSelector(t);
                        const list = detectList(t);
                        const finalSelector = list.isList ? list.listSelector : sel;
                        
                        // Build full selector with iframe path
                        let fullSelector = finalSelector;
                        if (FRAME_PATH.length > 0) {
                            fullSelector = FRAME_PATH.join(' >>> ') + ' >>> ' + finalSelector;
                        }
                        
                        // Send to top window
                        let win = window;
                        const msg = {
                            type: 'element-select',
                            elementInfo: { 
                                selector: fullSelector,
                                localSelector: finalSelector,
                                framePath: FRAME_PATH,
                                tagName: t.tagName.toLowerCase(), 
                                textContent: (t.textContent || '').substring(0, 100).trim(),
                                isList: list.isList, 
                                listItemCount: list.count,
                                inIframe: FRAME_PATH.length > 0
                            }
                        };
                        
                        // Bubble up through all parent frames
                        while (win !== win.parent) {
                            try { win = win.parent; } catch { break; }
                        }
                        win.postMessage(msg, '*');
                    }, true);

                    window.addEventListener('scroll', updateSelectorHighlightPositions, true);
                    window.addEventListener('resize', updateSelectorHighlightPositions);

                    window.addEventListener('message', function(e) {
                        if (e.data.type === 'enable-selection') { 
                            isSelectionMode = true; 
                            selectionMode = e.data.mode === 'remove' ? 'remove' : 'select';
                            document.body.style.cursor = 'crosshair';
                            // Forward to iframes
                            document.querySelectorAll('iframe').forEach(function(iframe) {
                                try {
                                    iframe.contentWindow?.postMessage({
                                        type: 'enable-selection',
                                        mode: selectionMode,
                                    }, '*');
                                } catch {}
                            });
                        }
                        else if (e.data.type === 'disable-selection') { 
                            isSelectionMode = false; 
                            selectionMode = 'select';
                            document.body.style.cursor = ''; 
                            if (highlightDiv) highlightDiv.style.display = 'none';
                            // Forward to iframes
                            document.querySelectorAll('iframe').forEach(function(iframe) {
                                try { iframe.contentWindow?.postMessage({ type: 'disable-selection' }, '*'); } catch {}
                            });
                        }
                        else if (e.data.type === 'highlight-selector') {
                            highlightSelectorMatches(e.data.selector);
                            document.querySelectorAll('iframe').forEach(function(iframe) {
                                try { iframe.contentWindow?.postMessage(e.data, '*'); } catch {}
                            });
                        }
                        else if (e.data.type === 'clear-highlight-selector') {
                            clearSelectorHighlights();
                            document.querySelectorAll('iframe').forEach(function(iframe) {
                                try { iframe.contentWindow?.postMessage(e.data, '*'); } catch {}
                            });
                        }
                        else if (e.data.type === 'remove-element') {
                            try {
                                const selector = e.data.localSelector || e.data.selector;
                                let el = null;
                                try {
                                    el = document.querySelector(selector);
                                } catch {}

                                if (!el && selector) {
                                    const parts = selector.split(' > ');
                                    for (let i = parts.length - 1; i >= 0 && !el; i--) {
                                        try {
                                            const partialSelector = parts.slice(i).join(' > ');
                                            el = document.querySelector(partialSelector);
                                        } catch {}
                                    }
                                }

                                if (el) {
                                    const cookiePatterns = /cookie|consent|gdpr|privacy|cc-|cmp-|onetrust|cookiebot|trustarc|quantcast|cookie-notice|cookie-banner|cookie-popup|cookie-modal|cookie-overlay|cookie-dialog/i;
                                    let targetEl = el;
                                    let current = el;
                                    while (current && current !== document.body) {
                                        const id = current.id || '';
                                        const cls = typeof current.className === 'string' ? current.className : '';
                                        const role = current.getAttribute('role') || '';
                                        if (cookiePatterns.test(id) || cookiePatterns.test(cls) || role === 'dialog') {
                                            targetEl = current;
                                        }
                                        const style = window.getComputedStyle(current);
                                        if ((style.position === 'fixed' || style.position === 'absolute') && parseInt(style.zIndex) > 9999) {
                                            targetEl = current;
                                        }
                                        current = current.parentElement;
                                    }
                                    targetEl.remove();

                                    ['.cookie-overlay', '.consent-overlay', '.gdpr-overlay', '.cc-overlay', '.cmp-overlay', '.modal-backdrop', '[class*="overlay"]', '[class*="backdrop"]']
                                        .forEach(function(sel) {
                                            try {
                                                document.querySelectorAll(sel).forEach(function(overlay) {
                                                    const style = window.getComputedStyle(overlay);
                                                    if (style.position === 'fixed' && parseInt(style.zIndex) > 1000) {
                                                        overlay.remove();
                                                    }
                                                });
                                            } catch {}
                                        });

                                    if (highlightDiv) highlightDiv.style.display = 'none';
                                }
                                // Forward to iframes
                                document.querySelectorAll('iframe').forEach(function(iframe) {
                                    try { iframe.contentWindow?.postMessage(e.data, '*'); } catch {}
                                });
                            } catch (err) { console.error('Error removing element:', err); }
                        }
                        // Forward element-select from nested iframes to parent
                        else if (e.data.type === 'element-select' && e.source !== window) {
                            window.parent.postMessage(e.data, '*');
                        }
                    });

                    if (FRAME_PATH.length === 0) {
                        window.parent.postMessage({ type: 'page-type-detected', pageType: { isReact: false, isSPA: true, framework: 'playwright', requiresPlaywright: true } }, '*');
                    }
                })();
            </script>
        `;

        if (html.includes('<head>')) {
            html = html.replace('<head>', '<head>' + injectedScript);
        } else if (html.includes('<HEAD>')) {
            html = html.replace('<HEAD>', '<HEAD>' + injectedScript);
        } else {
            html = '<!DOCTYPE html><html><head>' + injectedScript + '</head>' + html + '</html>';
        }

        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'X-Frame-Options': 'ALLOWALL',
                'Content-Security-Policy': 'frame-ancestors *;',
                'Access-Control-Allow-Origin': '*',
                'X-Rendered-By': 'Playwright',
            },
        });

    } catch (error: unknown) {
        if (browser) { try { await browser.close(); } catch { } }
        const err = error as { message?: string };
        const rawMessage = err.message || 'Unknown error';
        const browserMissing = /executable doesn't exist|browserType\.launch|please run.*playwright install/i.test(rawMessage);
        const html = renderPlaywrightErrorHtml(
            browserMissing ? 'Playwright browser není nainstalovaný' : 'Playwright rendering selhal',
            rawMessage,
            browserMissing ? '<code>npx playwright install chromium</code>' : '',
        );

        return new NextResponse(html, { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
}
