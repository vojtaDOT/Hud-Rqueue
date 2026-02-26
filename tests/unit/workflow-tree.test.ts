import { describe, expect, it } from 'vitest';

import {
    appendChildScope,
    createDocumentUrlStep,
    createScopeModule,
    ensureScopeAndRepeater,
    moveItem,
    removeScopeFromTree,
    updateScopeInTree,
} from '@/lib/workflow-tree';

describe('workflow-tree helpers', () => {
    it('moves array items safely', () => {
        expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
        expect(moveItem([1, 2, 3], -1, 2)).toEqual([1, 2, 3]);
    });

    it('ensures scope and repeater exists', () => {
        const phase = { before: [], chain: [] as ReturnType<typeof createScopeModule>[] };
        const result = ensureScopeAndRepeater(phase, null, null);
        expect(result.scopeId).toBeTruthy();
        expect(result.repeaterId).toBeTruthy();
        expect(result.phase.chain.length).toBe(1);
        expect(result.phase.chain[0].repeater?.id).toBe(result.repeaterId);
    });

    it('updates nested scope', () => {
        const parent = createScopeModule();
        const child = createScopeModule();
        const [withChild] = appendChildScope([parent], parent.id, child);
        const [updated] = updateScopeInTree(withChild, child.id, (scope) => ({ ...scope, css_selector: '.updated' }));
        expect(updated[0].children[0].css_selector).toBe('.updated');
    });

    it('removes target scope from tree', () => {
        const parent = createScopeModule();
        const child = createScopeModule();
        const [withChild] = appendChildScope([parent], parent.id, child);
        const [result, changed] = removeScopeFromTree(withChild, child.id);

        expect(changed).toBe(true);
        expect(result[0].children).toEqual([]);
    });

    it('can generate new step ids', () => {
        const step = createDocumentUrlStep();
        expect(step.id).toContain('step-');
    });
});
