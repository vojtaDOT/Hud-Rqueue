import { NextRequest, NextResponse } from 'next/server';

// This endpoint uses Playwright to render pages that fail with the simple proxy
// Playwright needs to be installed: npm install playwright

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let chromium: any = null;

async function getPlaywright(): Promise<any> {
    if (!chromium) {
        try {
            // Dynamic import - Playwright may not be installed
            const playwright = await import(/* webpackIgnore: true */ 'playwright');
            chromium = playwright.chromium;
        } catch {
            return null;
        }
    }
    return chromium;
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const targetUrl = searchParams.get('url');
    const mode = searchParams.get('mode') || 'html'; // 'html' or 'screenshot'

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

    const playwright = await getPlaywright();
    
    if (!playwright) {
        // Playwright not available - return helpful error
        return new NextResponse(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Playwright Required</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
                        max-width: 500px;
                        text-align: center;
                        backdrop-filter: blur(10px);
                    }
                    h2 { color: #a855f7; margin-bottom: 1rem; }
                    p { color: rgba(255,255,255,0.8); line-height: 1.6; }
                    code {
                        background: rgba(0,0,0,0.3);
                        padding: 0.5rem 1rem;
                        border-radius: 6px;
                        display: block;
                        margin: 1rem 0;
                        font-size: 0.9rem;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>🎭 Playwright Not Installed</h2>
                    <p>This page requires JavaScript rendering. To enable Playwright fallback:</p>
                    <code>npm install playwright</code>
                    <p style="font-size: 0.85rem; margin-top: 1rem;">
                        Note: Playwright is optional and only needed for sites that block iframes.
                    </p>
                </div>
            </body>
            </html>
        `, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }

    let browser = null;
    
    try {
        // Launch browser
        browser = await playwright.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
            ],
        });

        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            locale: 'cs-CZ',
            timezoneId: 'Europe/Prague',
        });

        const page = await context.newPage();
        
        // Navigate to the page
        await page.goto(targetUrl, {
            waitUntil: 'networkidle',
            timeout: 30000,
        });

        // Wait for any lazy-loaded content
        await page.waitForTimeout(1000);

        if (mode === 'screenshot') {
            // Return screenshot
            const screenshot = await page.screenshot({
                type: 'png',
                fullPage: false,
            });
            
            await browser.close();
            
            return new NextResponse(screenshot, {
                headers: {
                    'Content-Type': 'image/png',
                    'Cache-Control': 'public, max-age=60',
                },
            });
        }

        // Get the rendered HTML
        let html = await page.content();
        
        await browser.close();
        
        // Modify HTML to work in iframe
        const proxyBase = '/api/proxy?url=';
        const renderBase = '/api/render?url=';
        
        // Inject our selection script and base tag
        const injectedContent = `
            <base href="${url.href}">
            <script id="playwright-rendered-init">
                (function() {
                    // Mark as Playwright-rendered
                    window.__PLAYWRIGHT_RENDERED__ = true;
                    
                    // Notify parent that page loaded
                    window.parent.postMessage({ 
                        type: 'playwright-loaded', 
                        url: '${targetUrl}' 
                    }, '*');
                })();
            </script>
            <script id="element-selector-script">
                (function() {
                    let hoveredEl = null;
                    let selectedEl = null;
                    let highlightDiv = null;
                    let isSelectionMode = false;

                    function createHighlight() {
                        if (!highlightDiv) {
                            highlightDiv = document.createElement('div');
                            highlightDiv.id = 'element-selector-highlight';
                            highlightDiv.style.cssText = \`
                                position: absolute;
                                pointer-events: none;
                                z-index: 999999;
                                border: 2px solid #22c55e;
                                background: rgba(34, 197, 94, 0.1);
                                transition: all 0.1s ease;
                                box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.3);
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
                                    if (document.querySelectorAll(classSelector).length === 1) return classSelector;
                                } catch {}
                            }
                        }
                        const path = [];
                        let current = el;
                        while (current && current.nodeType === 1) {
                            let selector = current.tagName.toLowerCase();
                            if (current.id) {
                                path.unshift(selector + '#' + current.id);
                                break;
                            }
                            if (current.className && typeof current.className === 'string') {
                                const classes = current.className.trim().split(/\\s+/).filter(Boolean);
                                if (classes.length > 0) selector += '.' + classes[0];
                            }
                            let sibling = current, nth = 1;
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
                            return {
                                isList: true,
                                listSelector: getElementSelector(parent) + ' > ' + el.tagName.toLowerCase(),
                                count: siblings.length
                            };
                        }
                        return { isList: false };
                    }

                    function handleMouseMove(e) {
                        if (!isSelectionMode) return;
                        let target = e.target;
                        if (target.nodeType === 3) target = target.parentElement;
                        if (!target || target === highlightDiv) return;
                        hoveredEl = target;
                        updateHighlight(target);
                    }

                    function handleClick(e) {
                        if (!isSelectionMode) return;
                        let target = e.target;
                        if (target.nodeType === 3) target = target.parentElement;
                        if (!target || target === highlightDiv) return;
                        
                        e.preventDefault();
                        e.stopPropagation();
                        
                        selectedEl = target;
                        updateHighlight(target);
                        
                        const selector = getElementSelector(target);
                        const listInfo = detectListPattern(target);
                        
                        window.parent.postMessage({
                            type: 'element-select',
                            elementInfo: {
                                selector: listInfo.isList ? listInfo.listSelector : selector,
                                tagName: target.tagName.toLowerCase(),
                                textContent: target.textContent?.substring(0, 100) || '',
                                isList: listInfo.isList,
                                listItemCount: listInfo.count
                            }
                        }, '*');
                    }

                    window.addEventListener('message', function(event) {
                        if (event.data.type === 'enable-selection') {
                            isSelectionMode = true;
                            document.body.style.cursor = 'crosshair';
                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('click', handleClick, true);
                        } else if (event.data.type === 'disable-selection') {
                            isSelectionMode = false;
                            document.body.style.cursor = '';
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('click', handleClick, true);
                            if (highlightDiv) highlightDiv.style.display = 'none';
                        }
                    });

                    // Send page type info
                    window.parent.postMessage({
                        type: 'page-type-detected',
                        pageType: {
                            isReact: false,
                            isSPA: true,
                            isSSR: false,
                            framework: 'playwright-rendered',
                            requiresPlaywright: true
                        }
                    }, '*');
                })();
            </script>
        `;

        // Inject at the start of head
        if (html.includes('<head>')) {
            html = html.replace('<head>', `<head>${injectedContent}`);
        } else if (html.includes('<HEAD>')) {
            html = html.replace('<HEAD>', `<HEAD>${injectedContent}`);
        } else {
            html = `<!DOCTYPE html><html><head>${injectedContent}</head>${html}</html>`;
        }

        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'X-Frame-Options': 'ALLOWALL',
                'Content-Security-Policy': "frame-ancestors *;",
                'Access-Control-Allow-Origin': '*',
                'X-Rendered-By': 'Playwright',
            },
        });

    } catch (error: unknown) {
        if (browser) {
            try {
                await browser.close();
            } catch {}
        }
        
        const err = error as { message?: string };
        
        return new NextResponse(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Rendering Error</title>
                <style>
                    body {
                        font-family: -apple-system, sans-serif;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        background: #1a1a2e;
                        color: white;
                    }
                    .error {
                        background: rgba(220, 38, 38, 0.2);
                        border: 1px solid rgba(220, 38, 38, 0.5);
                        padding: 2rem;
                        border-radius: 12px;
                        max-width: 500px;
                        text-align: center;
                    }
                    h2 { color: #ef4444; }
                </style>
            </head>
            <body>
                <div class="error">
                    <h2>Rendering Failed</h2>
                    <p>${err.message || 'Unknown error occurred'}</p>
                </div>
            </body>
            </html>
        `, {
            status: 500,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
}
