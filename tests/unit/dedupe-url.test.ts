import { describe, expect, it } from 'vitest';

import { normalizeUrlForDedupe } from '@/lib/dedupe-url';

describe('normalizeUrlForDedupe', () => {
    it('trims, lowercases, strips fragment and trailing slash', () => {
        expect(normalizeUrlForDedupe('  HTTPS://Example.com/path/#part  ')).toBe('https://example.com/path');
    });

    it('returns null for empty input', () => {
        expect(normalizeUrlForDedupe('   ')).toBeNull();
        expect(normalizeUrlForDedupe(null)).toBeNull();
    });

    it('keeps query string', () => {
        expect(normalizeUrlForDedupe('https://example.com/path/?a=1#x')).toBe('https://example.com/path?a=1');
    });

    it('removes tracking query params but keeps business params', () => {
        expect(normalizeUrlForDedupe('https://example.com/doc.pdf?utm_source=x&a=1&fbclid=123')).toBe('https://example.com/doc.pdf?a=1');
    });
});
