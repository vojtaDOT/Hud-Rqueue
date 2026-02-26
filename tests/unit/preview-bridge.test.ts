import { describe, expect, it } from 'vitest';

import {
    isPreviewBridgeEventType,
    isPreviewBridgeMessage,
    toPreviewBridgeMessage,
} from '@/lib/preview-bridge';

describe('preview-bridge guards', () => {
    it('validates event types', () => {
        expect(isPreviewBridgeEventType('element-select')).toBe(true);
        expect(isPreviewBridgeEventType('unknown-event')).toBe(false);
    });

    it('validates bridge messages', () => {
        expect(isPreviewBridgeMessage({ type: 'bridge-ready', mode: 'proxy' })).toBe(true);
        expect(isPreviewBridgeMessage({ foo: 'bar' })).toBe(false);
    });

    it('parses bridge payload safely', () => {
        expect(toPreviewBridgeMessage({ type: 'proxy-error', message: 'bad' })).toEqual({
            type: 'proxy-error',
            message: 'bad',
        });
        expect(toPreviewBridgeMessage({ type: 'not-allowed' })).toBeNull();
    });
});
