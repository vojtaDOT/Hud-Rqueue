import type { ElementSelector, PageType } from '@/lib/crawler-types';

export const PREVIEW_BRIDGE_EVENT_TYPES = [
    'bridge-ready',
    'element-select',
    'page-type-detected',
    'proxy-loaded',
    'playwright-loaded',
    'playwright-error',
    'proxy-error',
    'inspector:children',
    'selector:suggestions',
    'inspector:select',
] as const;

export type PreviewBridgeEventType = (typeof PREVIEW_BRIDGE_EVENT_TYPES)[number];

interface BridgeBaseMessage {
    type: PreviewBridgeEventType;
}

export interface BridgeReadyMessage extends BridgeBaseMessage {
    type: 'bridge-ready';
    mode?: 'proxy' | 'playwright';
}

export interface BridgeElementSelectMessage extends BridgeBaseMessage {
    type: 'element-select';
    elementInfo: ElementSelector;
}

export interface BridgeInspectorSelectMessage extends BridgeBaseMessage {
    type: 'inspector:select';
    elementInfo: ElementSelector;
}

export interface BridgePageTypeMessage extends BridgeBaseMessage {
    type: 'page-type-detected';
    pageType: PageType;
}

export type PreviewBridgeMessage =
    | BridgeReadyMessage
    | BridgeElementSelectMessage
    | BridgeInspectorSelectMessage
    | BridgePageTypeMessage
    | (BridgeBaseMessage & Record<string, unknown>);

const EVENT_TYPE_SET = new Set<string>(PREVIEW_BRIDGE_EVENT_TYPES);

export function isPreviewBridgeEventType(value: unknown): value is PreviewBridgeEventType {
    return typeof value === 'string' && EVENT_TYPE_SET.has(value);
}

export function isPreviewBridgeMessage(payload: unknown): payload is PreviewBridgeMessage {
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    const maybeType = (payload as { type?: unknown }).type;
    return isPreviewBridgeEventType(maybeType);
}

export function toPreviewBridgeMessage(payload: unknown): PreviewBridgeMessage | null {
    if (!isPreviewBridgeMessage(payload)) {
        return null;
    }
    return payload;
}
