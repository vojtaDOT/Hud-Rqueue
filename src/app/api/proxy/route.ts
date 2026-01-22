import { NextRequest, NextResponse } from 'next/server';

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
            </style>
        </head>
        <body>
            <div class="error-container">
                <div class="error-title">Chyba načítání stránky</div>
                <div class="error-message">${message}</div>
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
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        try {
            // Fetch the content with timeout - use modern browser headers
            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'DNT': '1',
                    'Pragma': 'no-cache',
                    'Referer': url.origin,
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
                
                // Only show HTML error page for HTML content
                // For other resources (CSS, JS, images), return empty response
                if (isHtml) {
                    return htmlErrorResponse(
                        `Nepodařilo se načíst stránku: ${response.statusText} (${response.status})`,
                        response.status
                    );
                } else {
                    // For non-HTML resources, return empty response with proper status
                    return new NextResponse('', {
                        status: response.status,
                        headers: {
                            'Content-Type': contentType || 'application/octet-stream',
                        },
                    });
                }
            }
        
        // If it's HTML, we need to rewrite URLs
        if (isHtml) {
            let html = await response.text();
            
            // Strip Content-Security-Policy meta tags that might block our injected scripts
            html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, '');
            
            // Strip X-Frame-Options meta tags
            html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi, '');
            
            // Strip existing base tags to avoid conflicts
            html = html.replace(/<base[^>]*>/gi, '');
            
            // Use the full original URL (including path) as base for relative URLs
            // This ensures relative URLs like ./style.css resolve correctly
            const baseUrlForRelative = url.href; // Full URL including path
            const proxyBase = `/api/proxy?url=`;
            
            // Prevent infinite loops - don't rewrite URLs that are already proxied
            const isAlreadyProxied = (urlValue: string) => {
                // Check if URL already contains proxy path (both encoded and decoded)
                return urlValue.includes('/api/proxy?url=') || 
                       urlValue.includes('/api/proxy?url%3D') ||
                       urlValue.startsWith('/api/proxy') ||
                       decodeURIComponent(urlValue).includes('/api/proxy?url=');
            };
            
            // Helper function to proxy a single URL
            const proxyUrl = (urlValue: string): string => {
                if (!urlValue || urlValue.trim() === '') return urlValue;
                
                const trimmedUrl = urlValue.trim();
                
                // Skip data URLs, javascript:, mailto:, tel:, anchors, blob URLs
                if (/^(data:|javascript:|mailto:|tel:|#|blob:)/i.test(trimmedUrl)) {
                    return urlValue;
                }
                
                // Skip if already proxied
                if (isAlreadyProxied(trimmedUrl)) {
                    return urlValue;
                }
                
                try {
                    let absoluteUrl: string;
                    
                    // Handle protocol-relative URLs (//example.com/path)
                    if (trimmedUrl.startsWith('//')) {
                        absoluteUrl = url.protocol + trimmedUrl;
                    }
                    // Handle absolute URLs
                    else if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
                        absoluteUrl = trimmedUrl;
                    }
                    // Relative URL - make it absolute first using the full base URL
                    else {
                        absoluteUrl = new URL(trimmedUrl, baseUrlForRelative).href;
                    }
                    
                    return `${proxyBase}${encodeURIComponent(absoluteUrl)}`;
                } catch (e) {
                    // URL parsing failed - try simple concatenation as fallback
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
            
            // Frame-buster prevention script - must be injected FIRST before any other scripts run
            const frameBusterPrevention = `<script id="frame-buster-init">
                (function(){
                    // Prevent frame-busting scripts from breaking out of iframe
                    try {
                        var _top = window.self;
                        Object.defineProperty(window, 'top', { get: function() { return _top; }, configurable: false });
                    } catch(e) {}
                    try {
                        var _parent = window.self;
                        Object.defineProperty(window, 'parent', { get: function() { return _parent; }, configurable: false });
                    } catch(e) {}
                    // Block location.replace and location.href changes that try to break out
                    var originalLocation = window.location;
                    // Override common frame-breaking patterns
                    window.addEventListener('beforeunload', function(e) {
                        // Allow navigation within the iframe
                    });
                })();
            </script>`;
            
            // Inject <base> tag for better relative URL handling (fallback for any URLs we miss)
            const baseTag = `<base href="${baseUrlForRelative}">`;
            if (html.includes('<head>')) {
                html = html.replace('<head>', `<head>${frameBusterPrevention}${baseTag}`);
            } else if (html.includes('<HEAD>')) {
                html = html.replace('<HEAD>', `<HEAD>${frameBusterPrevention}${baseTag}`);
            } else if (html.includes('<html>') || html.includes('<HTML>')) {
                // No head tag - inject at start of html
                html = html.replace(/<html[^>]*>/i, `$&<head>${frameBusterPrevention}${baseTag}</head>`);
            }
            
            // Rewrite href, src, action attributes
            html = html.replace(
                /(href|src|action)=["']([^"']+)["']/gi,
                (match, attr, urlValue) => {
                    const proxiedUrl = proxyUrl(urlValue);
                    return `${attr}="${proxiedUrl}"`;
                }
            );
            
            // Handle srcset attributes for responsive images
            html = html.replace(
                /srcset=["']([^"']+)["']/gi,
                (match, srcsetValue) => {
                    try {
                        // srcset format: "url1 1x, url2 2x" or "url1 100w, url2 200w"
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
                    } catch (e) {
                        console.warn(`Failed to rewrite srcset: ${srcsetValue}`, e);
                        return match;
                    }
                }
            );
            
            // Handle inline style attributes with url() references
            html = html.replace(
                /style=["']([^"']*url\([^)]+\)[^"']*)["']/gi,
                (match, styleValue) => {
                    try {
                        const rewrittenStyle = styleValue.replace(
                            /url\(["']?([^"')]+)["']?\)/gi,
                            (_: string, cssUrl: string) => `url("${proxyUrl(cssUrl)}")`
                        );
                        return `style="${rewrittenStyle}"`;
                    } catch (e) {
                        console.warn(`Failed to rewrite inline style: ${styleValue}`, e);
                        return match;
                    }
                }
            );

            // Handle CSS url() references in <style> tags
            html = html.replace(
                /url\(["']?([^"')]+)["']?\)/gi,
                (match, urlValue) => {
                    // Skip data URLs
                    if (/^data:/i.test(urlValue.trim())) {
                        return match;
                    }
                    return `url("${proxyUrl(urlValue)}")`;
                }
            );

            // Inject selection script
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

                            const siblings = Array.from(parent.children).filter(
                                e => e.tagName === el.tagName
                            );

                            if (siblings.length >= 2) {
                                let container = parent;
                                const containerChildren = Array.from(container.children);
                                const similarChildren = containerChildren.filter(
                                    e => e.tagName === el.tagName
                                );
                                if (similarChildren.length >= 2) {
                                    const containerSelector = getElementSelector(container);
                                    return {
                                        isList: true,
                                        listSelector: containerSelector + ' > ' + el.tagName.toLowerCase(),
                                        count: similarChildren.length
                                    };
                                }
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

                        // Get the actual element (not text node) from event target
                        function getElementFromEvent(e) {
                            let target = e.target;
                            
                            // If target is a text node, get its parent element
                            if (target.nodeType === 3) { // TEXT_NODE
                                target = target.parentElement;
                            }
                            
                            // Ensure we have an element
                            while (target && target.nodeType !== 1) { // ELEMENT_NODE
                                target = target.parentElement;
                            }
                            
                            return target;
                        }

                        function handleMouseMove(e) {
                            if (!isSelectionMode) return;

                            const target = getElementFromEvent(e);
                            if (!target || target === highlightDiv || target === selectedEl) return;

                            // Skip highlighting iframe elements
                            if (target.tagName === 'IFRAME') {
                                // Try to get element from iframe content for hover
                                try {
                                    const iframe = target;
                                    const iframeWindow = iframe.contentWindow;
                                    
                                    if (iframeWindow) {
                                        const iframeRect = iframe.getBoundingClientRect();
                                        const mouseX = e.clientX - iframeRect.left;
                                        const mouseY = e.clientY - iframeRect.top;
                                        
                                        // Request hover element from iframe
                                        iframeWindow.postMessage({
                                            type: 'get-element-at-point',
                                            x: mouseX,
                                            y: mouseY
                                        }, '*');
                                    }
                                } catch (err) {
                                    // CORS or other error - ignore
                                }
                                return;
                            }

                            hoveredEl = target;
                            updateHighlight(target);

                            const rect = target.getBoundingClientRect();
                            const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
                            const scrollY = window.pageYOffset || document.documentElement.scrollTop;

                            window.parent.postMessage({
                                type: 'element-hover',
                                selector: getElementSelector(target),
                                bounds: {
                                    left: rect.left + scrollX,
                                    top: rect.top + scrollY,
                                    width: rect.width,
                                    height: rect.height
                                }
                            }, '*');
                        }

                        function handleClick(e) {
                            if (!isSelectionMode) return;
                            
                            const target = getElementFromEvent(e);
                            if (!target || target === highlightDiv) return;

                            // Ignore iframe elements - try to get element from iframe content instead
                            if (target.tagName === 'IFRAME') {
                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();
                                
                                // Try to communicate with iframe content
                                try {
                                    const iframe = target;
                                    const iframeWindow = iframe.contentWindow;
                                    
                                    if (iframeWindow) {
                                        // Calculate click position relative to iframe
                                        const iframeRect = iframe.getBoundingClientRect();
                                        const clickX = e.clientX - iframeRect.left;
                                        const clickY = e.clientY - iframeRect.top;
                                        
                                        // Store iframe reference for response handling
                                        const iframeId = 'iframe_' + Date.now() + '_' + Math.random();
                                        window._pendingIframeSelections = window._pendingIframeSelections || {};
                                        window._pendingIframeSelections[iframeId] = {
                                            iframe: iframe,
                                            timestamp: Date.now()
                                        };
                                        
                                        // Request element from iframe at click position
                                        iframeWindow.postMessage({
                                            type: 'get-element-at-point',
                                            x: clickX,
                                            y: clickY,
                                            iframeId: iframeId
                                        }, '*');
                                        
                                        // Set timeout - if iframe doesn't respond, ignore the click
                                        setTimeout(() => {
                                            if (window._pendingIframeSelections && window._pendingIframeSelections[iframeId]) {
                                                delete window._pendingIframeSelections[iframeId];
                                            }
                                        }, 1000);
                                        
                                        // Don't select iframe itself
                                        return;
                                    }
                                } catch (err) {
                                    // CORS or other error - ignore iframe
                                    console.log('Cannot access iframe content:', err);
                                    return;
                                }
                            }
                            
                            // Normal element selection (not iframe)
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();

                            // If clicking on a label, try to find the associated input/select/textarea
                            let elementToSelect = target;
                            if (target.tagName === 'LABEL' && target.htmlFor) {
                                const associatedElement = document.getElementById(target.htmlFor);
                                if (associatedElement && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(associatedElement.tagName)) {
                                    elementToSelect = associatedElement;
                                }
                            } else if (target.tagName === 'LABEL' && !target.htmlFor) {
                                // Label without 'for' attribute - find first input/select/textarea inside
                                const inputInside = target.querySelector('input, select, textarea, button');
                                if (inputInside) {
                                    elementToSelect = inputInside;
                                }
                            } else {
                                // Prefer interactive elements over their containers
                                // If we clicked on a container (DIV, SPAN, etc.) that contains an interactive element,
                                // and the interactive element is small/close to click point, select it instead
                                const interactiveElements = ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A', 'TEXTAREA'];
                                if (!interactiveElements.includes(target.tagName)) {
                                    // Check if there's an interactive element at or near the click point
                                    const clickX = e.clientX;
                                    const clickY = e.clientY;
                                    const elementsAtPoint = document.elementsFromPoint(clickX, clickY);
                                    
                                    // Find the first interactive element in the stack
                                    for (let i = 0; i < elementsAtPoint.length; i++) {
                                        const el = elementsAtPoint[i];
                                        if (el === target) break; // Stop at the clicked element
                                        // Skip iframes in the stack
                                        if (el.tagName === 'IFRAME') continue;
                                        if (interactiveElements.includes(el.tagName) && target.contains(el)) {
                                            elementToSelect = el;
                                            break;
                                        }
                                    }
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

                            // Send to top-level parent (not just immediate parent)
                            // This ensures messages from nested iframes reach the main frame
                            try {
                                // Try to send to top window first
                                if (window.top && window.top !== window) {
                                    window.top.postMessage({
                                        type: 'element-select',
                                        elementInfo: elementInfo
                                    }, '*');
                                } else {
                                    // Fallback: send to immediate parent
                                    window.parent.postMessage({
                                        type: 'element-select',
                                        elementInfo: elementInfo
                                    }, '*');
                                }
                            } catch (err) {
                                // If top is not accessible, try parent
                                try {
                                    window.parent.postMessage({
                                        type: 'element-select',
                                        elementInfo: elementInfo
                                    }, '*');
                                } catch (parentErr) {
                                    console.error('Cannot send message to parent:', parentErr);
                                }
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
                            if (event.data.type === 'enable-selection') {
                                enableSelection();
                                // Forward to all iframes in this document
                                try {
                                    const iframes = document.querySelectorAll('iframe');
                                    iframes.forEach(function(iframe) {
                                        try {
                                            if (iframe.contentWindow) {
                                                iframe.contentWindow.postMessage({
                                                    type: 'enable-selection'
                                                }, '*');
                                            }
                                        } catch (err) {
                                            // Cannot access iframe
                                        }
                                    });
                                } catch (err) {
                                    // Ignore
                                }
                            } else if (event.data.type === 'disable-selection') {
                                disableSelection();
                                // Forward to all iframes in this document
                                try {
                                    const iframes = document.querySelectorAll('iframe');
                                    iframes.forEach(function(iframe) {
                                        try {
                                            if (iframe.contentWindow) {
                                                iframe.contentWindow.postMessage({
                                                    type: 'disable-selection'
                                                }, '*');
                                            }
                                        } catch (err) {
                                            // Cannot access iframe
                                        }
                                    });
                                } catch (err) {
                                    // Ignore
                                }
                            } else if (event.data.type === 'get-element-at-point') {
                                // Request from parent frame to get element at point (for iframe handling)
                                if (!isSelectionMode) return;
                                
                                const x = event.data.x;
                                const y = event.data.y;
                                const iframeId = event.data.iframeId;
                                
                                // Get element at point - use viewport coordinates
                                const elementAtPoint = document.elementFromPoint(x, y);
                                if (elementAtPoint) {
                                    const target = getElementFromEvent({ target: elementAtPoint });
                                    if (target && target !== highlightDiv) {
                                        // If element is another iframe, recursively get element from that iframe
                                        if (target.tagName === 'IFRAME') {
                                            try {
                                                const nestedIframe = target;
                                                const nestedIframeWindow = nestedIframe.contentWindow;
                                                if (nestedIframeWindow) {
                                                    // Calculate position relative to nested iframe
                                                    const nestedIframeRect = nestedIframe.getBoundingClientRect();
                                                    const nestedX = x - nestedIframeRect.left;
                                                    const nestedY = y - nestedIframeRect.top;
                                                    
                                                    // Recursively request element from nested iframe
                                                    nestedIframeWindow.postMessage({
                                                        type: 'get-element-at-point',
                                                        x: nestedX,
                                                        y: nestedY,
                                                        iframeId: iframeId
                                                    }, '*');
                                                    return;
                                                }
                                            } catch (err) {
                                                // Cannot access nested iframe - fall through to select iframe itself
                                                console.log('Cannot access nested iframe:', err);
                                            }
                                        }
                                        
                                        // Normal element selection
                                        const selector = getElementSelector(target);
                                        const listInfo = detectListPattern(target);
                                        
                                        const elementInfo = {
                                            selector: listInfo.isList ? listInfo.listSelector : selector,
                                            tagName: target.tagName.toLowerCase(),
                                            textContent: target.textContent?.substring(0, 100) || '',
                                            isList: listInfo.isList,
                                            listItemCount: listInfo.count,
                                            parentSelector: listInfo.isList ? getElementSelector(target.parentElement) : undefined
                                        };
                                        
                                        // Send back to original requester (parent frame)
                                        if (event.source && typeof event.source.postMessage === 'function') {
                                            try {
                                                event.source.postMessage({
                                                    type: 'element-select-from-iframe',
                                                    elementInfo: elementInfo,
                                                    iframeId: iframeId
                                                }, '*');
                                            } catch (err) {
                                                // If cannot send to source, try parent
                                                window.parent.postMessage({
                                                    type: 'element-select',
                                                    elementInfo: elementInfo
                                                }, '*');
                                            }
                                        } else {
                                            // Fallback: send to parent
                                            window.parent.postMessage({
                                                type: 'element-select',
                                                elementInfo: elementInfo
                                            }, '*');
                                        }
                                    }
                                }
                            } else if (event.data.type === 'element-select-from-iframe') {
                                // Element selected from nested iframe - forward to top parent
                                const elementInfo = event.data.elementInfo;
                                const iframeId = event.data.iframeId;
                                
                                // Clear pending selection if exists
                                if (window._pendingIframeSelections && iframeId && window._pendingIframeSelections[iframeId]) {
                                    delete window._pendingIframeSelections[iframeId];
                                }
                                
                                // Forward to top parent (not just immediate parent)
                                try {
                                    // Try to send to top window first
                                    if (window.top && window.top !== window) {
                                        window.top.postMessage({
                                            type: 'element-select',
                                            elementInfo: elementInfo
                                        }, '*');
                                    } else {
                                        // Fallback: send to immediate parent
                                        window.parent.postMessage({
                                            type: 'element-select',
                                            elementInfo: elementInfo
                                        }, '*');
                                    }
                                } catch (err) {
                                    // If top is not accessible, try parent
                                    try {
                                        window.parent.postMessage({
                                            type: 'element-select',
                                            elementInfo: elementInfo
                                        }, '*');
                                    } catch (parentErr) {
                                        console.error('Cannot send message to parent:', parentErr);
                                    }
                                }
                            }
                        });

                        // Detect page type on load
                        function detectPageType() {
                            if (pageTypeDetected) return pageType;
                            
                            // Check for React
                            const hasReact = window.React || 
                                            document.querySelector('[data-reactroot]') ||
                                            document.querySelector('[data-react-helmet]') ||
                                            (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== undefined) ||
                                            Array.from(document.querySelectorAll('script')).some(s => 
                                                (s.src && s.src.includes('react')) || 
                                                (s.textContent && s.textContent.includes('React'))
                                            );
                            
                            // Check for other SPA frameworks
                            const hasVue = window.Vue || document.querySelector('[data-v-]');
                            const hasAngular = window.angular || document.querySelector('[ng-app]');
                            const hasNextJS = window.__NEXT_DATA__ !== undefined;
                            
                            // Check if content is dynamically loaded (SPA indicator)
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
                            
                            // Send page type to parent
                            window.parent.postMessage({
                                type: 'page-type-detected',
                                pageType: pageType
                            }, '*');
                            
                            return pageType;
                        }

                        // Detect on DOM ready
                        if (document.readyState === 'loading') {
                            document.addEventListener('DOMContentLoaded', detectPageType);
                        } else {
                            // DOM already loaded, detect immediately
                            setTimeout(detectPageType, 100);
                        }

                        window.addEventListener('beforeunload', function() {
                            if (highlightDiv) highlightDiv.remove();
                        });
                    })();
                </script>
            `;

            // Inject script before closing body tag, or at end of head if no body
            if (html.includes('</body>')) {
                html = html.replace('</body>', selectionScript + '</body>');
            } else if (html.includes('</head>')) {
                html = html.replace('</head>', selectionScript + '</head>');
            } else {
                html += selectionScript;
            }

            // Return proxied HTML with security headers stripped to allow iframe embedding
            return new NextResponse(html, {
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    // Don't set X-Frame-Options - we want to allow iframe embedding
                    // Add CORS headers
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

            // For non-HTML content (CSS, JS, images, etc.), proxy as-is
            // But handle errors gracefully - don't show error page for missing resources
            try {
                const buffer = await response.arrayBuffer();
                return new NextResponse(buffer, {
                    headers: {
                        'Content-Type': contentType,
                        // Add CORS headers for resources loaded in iframe
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET',
                    },
                });
            } catch (bufferError) {
                console.error(`Error reading response buffer for ${targetUrl}:`, bufferError);
                // For non-HTML, return empty response instead of error page
                return new NextResponse('', {
                    status: response.status,
                    headers: {
                        'Content-Type': contentType,
                    },
                });
            }
        } catch (fetchError: any) {
            clearTimeout(timeoutId);
            
            if (fetchError.name === 'AbortError') {
                console.error(`Proxy timeout for ${targetUrl}`);
                return htmlErrorResponse('Timeout při načítání stránky (přes 30 sekund)', 504);
            }
            
            console.error(`Proxy fetch error for ${targetUrl}:`, fetchError);
            return htmlErrorResponse(
                `Chyba při načítání stránky: ${fetchError.message || 'Neznámá chyba'}`,
                500
            );
        }
    } catch (error: any) {
        console.error('Proxy error:', error);
        return htmlErrorResponse(
            `Chyba proxy serveru: ${error.message || 'Neznámá chyba'}`,
            500
        );
    }
}

