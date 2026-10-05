import { beforeEach, describe, expect, it } from 'vitest';
import {
  chooseOpener,
  clear,
  decideTab,
  isTabbable,
  isTop,
  push,
  remove,
  size,
} from '../dialogStack';

describe('dialogStack', () => {
  beforeEach(() => clear());

  it('treats an empty stack as having no top', () => {
    expect(isTop('a')).toBe(false);
  });

  it('tracks the most recently pushed id as top', () => {
    push('a');
    push('b');
    expect(isTop('b')).toBe(true);
    expect(isTop('a')).toBe(false);
  });

  it('promotes the previous entry when the top is removed', () => {
    push('a');
    push('b');
    remove('b');
    expect(isTop('a')).toBe(true);
  });

  it('removing a non-top entry keeps the top and order', () => {
    push('a');
    push('b');
    push('c');
    remove('b');
    expect(isTop('c')).toBe(true);
    remove('c');
    expect(isTop('a')).toBe(true);
    expect(size()).toBe(1);
  });

  it('ignores a double remove and unknown ids', () => {
    push('a');
    remove('a');
    remove('a');
    remove('zzz');
    expect(size()).toBe(0);
  });

  it('does not duplicate an id pushed twice (StrictMode re-run)', () => {
    push('a');
    push('b');
    push('a');
    expect(size()).toBe(2);
    expect(isTop('a')).toBe(true);
  });
});

describe('isTabbable', () => {
  it('rejects disabled, hidden and negative tabindex candidates', () => {
    expect(isTabbable({ disabled: false, hidden: false, tabIndex: 0 })).toBe(true);
    expect(isTabbable({ disabled: true, hidden: false, tabIndex: 0 })).toBe(false);
    expect(isTabbable({ disabled: false, hidden: true, tabIndex: 0 })).toBe(false);
    expect(isTabbable({ disabled: false, hidden: false, tabIndex: -1 })).toBe(false);
  });
});

describe('decideTab', () => {
  const none: boolean[] = [];

  it('leaves Tab native except at the edges of a tabbable active element', () => {
    expect(decideTab(3, 1, none, false)).toEqual({ kind: 'native' });
    expect(decideTab(3, 1, none, true)).toEqual({ kind: 'native' });
    expect(decideTab(3, 2, none, false)).toEqual({ kind: 'focus', index: 0 });
    expect(decideTab(3, 0, none, true)).toEqual({ kind: 'focus', index: 2 });
    expect(decideTab(3, 0, none, false)).toEqual({ kind: 'native' });
  });

  it('picks by document position when the active element is not tabbable', () => {
    // Active sits between tabbable 1 and 2 (roving tabindex=-1 item).
    const after = [false, false, true, true];
    expect(decideTab(4, -1, after, false)).toEqual({ kind: 'focus', index: 2 });
    expect(decideTab(4, -1, after, true)).toEqual({ kind: 'focus', index: 1 });
  });

  it('wraps when the non-tabbable active element is past the last or before the first', () => {
    expect(decideTab(3, -1, [false, false, false], false)).toEqual({ kind: 'focus', index: 0 });
    expect(decideTab(3, -1, [true, true, true], true)).toEqual({ kind: 'focus', index: 2 });
  });

  it('enters from body (everything after) at the first or last tabbable', () => {
    expect(decideTab(3, -1, [true, true, true], false)).toEqual({ kind: 'focus', index: 0 });
    expect(decideTab(3, -1, [false, false, false], true)).toEqual({ kind: 'focus', index: 2 });
  });

  it('falls back to the container when nothing is tabbable', () => {
    expect(decideTab(0, -1, none, false)).toEqual({ kind: 'container' });
  });
});

describe('chooseOpener', () => {
  interface FakeNode {
    parent?: FakeNode;
    contains: (o: FakeNode) => boolean;
  }
  const node = (parent?: FakeNode): FakeNode => {
    const n: FakeNode = {
      parent,
      contains: (o) => {
        for (let cur: FakeNode | undefined = o; cur; cur = cur.parent) if (cur === n) return true;
        return false;
      },
    };
    return n;
  };

  it('prefers the active element when there is no recent press', () => {
    const a = node();
    expect(chooseOpener(a, null)).toBe(a);
  });

  it('falls back to the recent press when focus is on body', () => {
    const r = node();
    expect(chooseOpener(null, r)).toBe(r);
    expect(chooseOpener(null, null)).toBeNull();
  });

  it('prefers the pressed control when the active element is an ancestor of it', () => {
    const container = node();
    const button = node(container);
    expect(chooseOpener(container, button)).toBe(button);
  });

  it('keeps the active element when the recent press is elsewhere', () => {
    const a = node();
    const r = node();
    expect(chooseOpener(a, r)).toBe(a);
    expect(chooseOpener(a, a)).toBe(a);
  });
});
