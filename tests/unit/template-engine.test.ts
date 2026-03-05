import { describe, expect, it } from 'vitest';

import { renderTemplate } from '@/lib/templates/engine';

describe('renderTemplate', () => {
    it('evaluates $eval placeholders', () => {
        const result = renderTemplate<{ name: string }>({ name: { $eval: 'name' } }, { name: 'hello' });
        expect(result).toEqual({ name: 'hello' });
    });

    it('evaluates $if conditionals', () => {
        const template = {
            value: { $if: 'flag', then: 'yes', else: 'no' },
        };
        expect(renderTemplate(template, { flag: true })).toEqual({ value: 'yes' });
        expect(renderTemplate(template, { flag: false })).toEqual({ value: 'no' });
    });

    it('evaluates $merge operator', () => {
        const template = {
            $merge: [
                { $eval: 'base' },
                { extra: 'field' },
            ],
        };
        const result = renderTemplate(template, { base: { a: 1, b: 2 } });
        expect(result).toEqual({ a: 1, b: 2, extra: 'field' });
    });

    it('provides uuid() builtin', () => {
        const result = renderTemplate<{ id: string }>({ id: { $eval: 'uuid()' } }, {});
        expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    });

    it('provides now() builtin', () => {
        const result = renderTemplate<{ ts: string }>({ ts: { $eval: 'now()' } }, {});
        expect(new Date(result.ts).getTime()).toBeGreaterThan(0);
    });

    it('provides trim() builtin', () => {
        const result = renderTemplate<{ s: string }>(
            { s: { $eval: 'trim(value)' } },
            { value: '  hello  ' },
        );
        expect(result.s).toBe('hello');
    });

    it('provides fallback() builtin', () => {
        const template = { v: { $eval: 'fallback(val, "default")' } };
        expect(renderTemplate(template, { val: 'actual' })).toEqual({ v: 'actual' });
        expect(renderTemplate(template, { val: null })).toEqual({ v: 'default' });
        expect(renderTemplate(template, { val: '' })).toEqual({ v: 'default' });
    });

    it('passes through static values', () => {
        const result = renderTemplate({ status: 'pending', count: 42 }, {});
        expect(result).toEqual({ status: 'pending', count: 42 });
    });

    it('handles nested objects', () => {
        const template = {
            outer: {
                inner: { $eval: 'x' },
                static: true,
            },
        };
        const result = renderTemplate(template, { x: 'dynamic' });
        expect(result).toEqual({ outer: { inner: 'dynamic', static: true } });
    });
});
