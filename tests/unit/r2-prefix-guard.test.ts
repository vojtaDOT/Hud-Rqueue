import { describe, expect, it } from 'vitest';

import { assertAllowedDocumentsPrefix } from '@/lib/r2';

describe('assertAllowedDocumentsPrefix', () => {
    it('allows only documents/<uuid>/ prefixes', () => {
        expect(() => assertAllowedDocumentsPrefix('documents/abc-123/')).not.toThrow();
        expect(() => assertAllowedDocumentsPrefix('documents/abc-123')).toThrow();
        expect(() => assertAllowedDocumentsPrefix('contracts/abc-123/')).toThrow();
    });
});
