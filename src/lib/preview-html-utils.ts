export function stripSecurityMetaTags(html: string): string {
    return html
        .replace(/<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, '')
        .replace(/<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi, '');
}

export function relaxIframeAttributes(attributes: string): string {
    return attributes
        .replace(/\s+sandbox(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
        .replace(/\s+csp(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '');
}

export function stripIframeSandboxAttributes(html: string): string {
    return html.replace(/<iframe([^>]*)>/gi, (_match: string, attrs: string) => `<iframe${relaxIframeAttributes(attrs)}>` );
}

export function buildRenderUrl(appOrigin: string, absoluteUrl: string, depth: number): string {
    return `${appOrigin}/api/render?url=${encodeURIComponent(absoluteUrl)}&depth=${depth}`;
}

export function clampRenderDepth(depth: number, maxDepth: number): number {
    if (!Number.isFinite(depth) || depth < 0) {
        return 0;
    }
    if (depth > maxDepth) {
        return maxDepth;
    }
    return Math.floor(depth);
}
