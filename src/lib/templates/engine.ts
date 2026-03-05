import jsone from 'json-e';

/**
 * Built-in functions injected into every json-e template context.
 */
const BUILTINS: Record<string, unknown> = {
    uuid: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
    trim: (s: string) => (typeof s === 'string' ? s.trim() : ''),
    fallback: (value: unknown, defaultValue: unknown) =>
        value != null && value !== '' ? value : defaultValue,
};

/**
 * Render a json-e template with context + built-in functions.
 *
 * @param template  json-e template object (with $eval, $merge, $if, etc.)
 * @param context   runtime values to substitute into the template
 * @returns         rendered plain JSON, cast to T
 */
export function renderTemplate<T = unknown>(
    template: Record<string, unknown>,
    context: Record<string, unknown>,
): T {
    const fullContext = { ...BUILTINS, ...context };
    return jsone(template, fullContext) as T;
}
