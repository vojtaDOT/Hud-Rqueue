import { describe, expect, it } from 'vitest';

import {
    buildRenderUrl,
    clampRenderDepth,
    relaxIframeAttributes,
    stripIframeSandboxAttributes,
    stripSecurityMetaTags,
} from '@/lib/preview-html-utils';

describe('preview-html-utils', () => {
    it('strips CSP and X-Frame-Options meta tags', () => {
        const html = '<meta http-equiv="Content-Security-Policy" content="x"><meta http-equiv="X-Frame-Options" content="DENY"><div>ok</div>';
        expect(stripSecurityMetaTags(html)).toBe('<div>ok</div>');
    });

    it('builds render url with depth', () => {
        const url = buildRenderUrl('http://localhost:3000', 'https://example.com', 2);
        expect(url).toBe('http://localhost:3000/api/render?url=https%3A%2F%2Fexample.com&depth=2');
    });

    it('clamps invalid and out-of-range depth', () => {
        expect(clampRenderDepth(-1, 3)).toBe(0);
        expect(clampRenderDepth(10, 3)).toBe(3);
        expect(clampRenderDepth(1.9, 3)).toBe(1);
    });

    it('removes sandbox and iframe csp attributes', () => {
        const attrs = ' id=\"x\" sandbox=\"allow-forms\" csp=\"script-src none\" data-x=\"1\"';
        expect(relaxIframeAttributes(attrs)).toBe(' id=\"x\" data-x=\"1\"');
    });

    it('strips sandbox attributes from iframe tags in html', () => {
        const html = '<iframe id=\"f1\" sandbox=\"allow-forms\" src=\"/inner\"></iframe><iframe id=\"f2\" csp=\"script-src none\"></iframe>';
        expect(stripIframeSandboxAttributes(html)).toBe('<iframe id=\"f1\" src=\"/inner\"></iframe><iframe id=\"f2\"></iframe>');
    });
});
