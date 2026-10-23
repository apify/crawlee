import { CrawlingRequest } from '@crawlee/basic';
import { MutationJournal } from '@crawlee/utils/internal';

describe('MutationJournal', () => {
    test('reverts nested writes, deletions and array pushes in reverse order', () => {
        const target = { count: 0, nested: { keep: 1, drop: 2 }, list: ['a'] };
        const journal = new MutationJournal();
        const proxy = journal.track(target);

        proxy.count++;
        proxy.nested.keep = 10;
        delete (proxy.nested as Partial<typeof target.nested>).drop;
        proxy.list.push('b', 'c');
        (proxy as Record<string, unknown>).added = true;

        journal.revert();

        expect(target).toEqual({ count: 0, nested: { keep: 1, drop: 2 }, list: ['a'] });
    });

    test('undoes array writes positionally, so concurrent pushes leave no holes', () => {
        const state = { visited: [] as string[] };
        const a = new MutationJournal();
        const b = new MutationJournal();

        a.track(state).visited.push('a');
        b.track(state).visited.push('b');
        a.revert();

        expect(state.visited).toEqual(['b']);
    });

    test('restores elements dropped by truncation, shift and splice', () => {
        const target = { list: ['a', 'b', 'c', 'd'] };
        const journal = new MutationJournal();
        const proxy = journal.track(target);

        proxy.list.shift();
        proxy.list.splice(1, 1);
        proxy.list.length = 1;

        expect(target.list).toEqual(['b']);
        journal.revert();

        expect(target.list).toEqual(['a', 'b', 'c', 'd']);
    });

    test('hands out Map and Set untracked: they keep working and their changes stay', () => {
        const target = { ids: new Set<string>(), byId: new Map<string, number>() };
        const journal = new MutationJournal();
        const proxy = journal.track(target);

        proxy.ids.add('a');
        proxy.byId.set('a', 1);
        journal.revert();

        expect([...target.ids]).toEqual(['a']);
        expect([...target.byId]).toEqual([['a', 1]]);
    });

    test('undoOnto reconstructs the pre-attempt shape on a copy without touching the original', () => {
        const target = { count: 0, nested: { keep: 1, drop: 2 }, list: ['a'], replaced: { x: 1 } };
        const journal = new MutationJournal();
        const proxy = journal.track(target);

        proxy.count++;
        delete (proxy.nested as Partial<typeof target.nested>).drop;
        proxy.list.push('b');
        proxy.replaced = { y: 2 } as unknown as typeof target.replaced;
        (proxy.replaced as Record<string, unknown>).z = 3;

        const copy = journal.undoOnto(JSON.parse(JSON.stringify(target)));

        expect(copy).toEqual({ count: 0, nested: { keep: 1, drop: 2 }, list: ['a'], replaced: { x: 1 } });
        expect(target).toEqual({ count: 1, nested: { keep: 1 }, list: ['a', 'b'], replaced: { y: 2, z: 3 } });
    });

    test('leaves a property that was written by someone else and reports the conflict', () => {
        const target = { mine: 0, theirs: 0 };
        const journal = new MutationJournal();
        const proxy = journal.track(target);

        proxy.mine = 1;
        proxy.theirs = 1;
        target.theirs = 2;

        const conflicts: PropertyKey[] = [];
        journal.revert({ onConflict: (key) => conflicts.push(key) });

        expect(target).toEqual({ mine: 0, theirs: 2 });
        expect(conflicts).toEqual(['theirs']);
    });

    test('stops recording once closed while writes still go through', () => {
        const target = { value: 0 };
        const journal = new MutationJournal();
        const proxy = journal.track(target);

        proxy.value = 1;
        journal.close();
        proxy.value = 2;
        journal.revert();

        expect(target.value).toBe(2);
    });

    test('covers request accessors backed by private members, userData replacement and the internal bag', () => {
        const request = new CrawlingRequest<Record<string, unknown>>({
            url: 'https://example.com',
            userData: { a: 1 },
        });
        const journal = new MutationJournal();
        const proxy = journal.track(request);

        proxy.noRetry = true;
        proxy.label = 'later';
        proxy.skipNavigation = true;
        proxy.userData.a = 2;
        proxy.userData = { replaced: true };
        proxy.userData.b = 3;

        expect(request.skipNavigation).toBe(true);
        journal.revert();

        expect(request.noRetry).toBe(false);
        expect(request.label).toBeUndefined();
        expect(request.skipNavigation).toBe(false);
        expect(request.userData).toEqual({ a: 1 });
        expect(JSON.parse(JSON.stringify(request)).userData).toMatchObject({ a: 1 });
    });
});
