import { describe, expect, it } from 'vitest';
import { NAV, visibleSectionsFor } from '../navigation';
import { P } from '@/lib/permissions';

const everything = (): boolean => true;
const nothing = (): boolean => false;
const holding =
  (...held: string[]) =>
  (...wanted: string[]): boolean =>
    wanted.some((permission) => held.includes(permission));

const links = (sections: ReturnType<typeof visibleSectionsFor>): string[] =>
  sections.flatMap((section) => section.items.map((item) => item.to));

describe('sidebar navigation', () => {
  it('hides the assistant when the deployment has it switched off', () => {
    const on = links(visibleSectionsFor(everything, { assistantEnabled: true }));
    const off = links(visibleSectionsFor(everything, { assistantEnabled: false }));

    expect(on).toContain('/assistant');
    expect(off).not.toContain('/assistant');
  });

  it('hides it even for someone who holds assistant:use', () => {
    // Which is everybody: `assistant:use` is in the baseline employee role, so
    // permissions alone would show this entry on every standard install.
    const visible = links(visibleSectionsFor(holding(P.ASSISTANT_USE), { assistantEnabled: false }));

    expect(visible).not.toContain('/assistant');
  });

  it('changes nothing else when the assistant is off', () => {
    const on = links(visibleSectionsFor(everything, { assistantEnabled: true }));
    const off = links(visibleSectionsFor(everything, { assistantEnabled: false }));

    expect(off).toEqual(on.filter((to) => to !== '/assistant'));
  });

  it('still asks for the permission when the deployment has it on', () => {
    const visible = links(visibleSectionsFor(nothing, { assistantEnabled: true }));

    expect(visible).not.toContain('/assistant');
  });

  it('drops a section once every item in it is hidden', () => {
    const sections = visibleSectionsFor(nothing, { assistantEnabled: false });

    // Only the dashboard and the approvals inbox are open to everyone, and they
    // are both in the first section.
    expect(sections.map((section) => section.heading)).toEqual(['Overview']);
    expect(links(sections)).toEqual(['/', '/approvals']);
  });

  it('gates every entry on a permission except the ones meant for everyone', () => {
    const open = NAV.flatMap((section) => section.items)
      .filter((item) => !item.permissions)
      .map((item) => item.to);

    expect(open).toEqual(['/', '/approvals']);
  });
});
