import { describe, expect, it } from 'vitest';
import { parseArtifactRef } from '../src/core/artifactUrl';
import { ShareError } from '../src/core/runner';
import { createFakeShareClient } from '../src/claude/fakeShareClient';

const ref = (id: string) => parseArtifactRef(`https://claude.ai/artifact/${id}`)!;
const SHARED = ref('SharedExampleArtifact01');
const PLAIN = ref('PlainExampleArtifact01');
const FORBIDDEN = ref('ForbiddenSharedArtifact1');
const CROWDED = ref('ExampleCrowdedArtifact1');
const MISSING = ref('MissingExampleArtifact1');

const byEmail = async (client: ReturnType<typeof createFakeShareClient>, a = SHARED) =>
  new Map((await client.listSharees(a)).map((s) => [s.email, s]));

describe('the fake claude.ai', () => {
  it('starts a Shared artifact with three people invited, and a plain one with only the owner', async () => {
    const client = createFakeShareClient();
    const people = await client.listSharees(SHARED);

    expect(people.map(({ id: _id, ...rest }) => rest)).toEqual([
      { email: 'owner@example.com', access: 'owner', status: 'active' },
      { email: 'viewer@example.com', access: 'view', status: 'active' },
      { email: 'commenter@example.com', access: 'comment', status: 'pending' },
      { email: 'locked@example.com', access: 'view', status: 'active' },
    ]);
    // Invitations have ids to change them by; the owner has none.
    expect(people[0]!.id).toBeUndefined();
    expect(new Set(people.slice(1).map((p) => p.id)).size).toBe(3);
    expect(await client.listSharees(PLAIN)).toHaveLength(1);
  });

  it('changes a person’s permission, and the next listing shows it for that person only', async () => {
    const client = createFakeShareClient();
    const before = await byEmail(client);
    await client.changeAccess(SHARED, before.get('viewer@example.com')!.id!, 'edit');

    const after = await byEmail(client);
    expect(after.get('viewer@example.com')!.access).toBe('edit');
    expect(after.get('commenter@example.com')).toEqual(before.get('commenter@example.com'));
    expect(after.get('viewer@example.com')!.id).toBe(before.get('viewer@example.com')!.id);
  });

  it('removes a person, and the next listing no longer has them', async () => {
    const client = createFakeShareClient();
    const before = await byEmail(client);
    await client.removeInvite(SHARED, before.get('commenter@example.com')!.id!);

    const after = await byEmail(client);
    expect(after.has('commenter@example.com')).toBe(false);
    expect(after.size).toBe(before.size - 1);
  });

  it('keeps one artifact’s changes away from another that shares the same seed', async () => {
    const client = createFakeShareClient();
    const other = ref('SharedOtherArtifact02');
    await client.removeInvite(SHARED, (await byEmail(client)).get('viewer@example.com')!.id!);

    expect((await byEmail(client, other)).has('viewer@example.com')).toBe(true);
  });

  it('refuses to change or remove a locked… person, who joined the organization', async () => {
    const client = createFakeShareClient();
    const id = (await byEmail(client)).get('locked@example.com')!.id!;

    for (const act of [
      () => client.changeAccess(SHARED, id, 'edit'),
      () => client.removeInvite(SHARED, id),
    ]) {
      const err = await act().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ShareError);
      expect((err as ShareError).message).toBe(
        'This person joined your organization, so their access is managed in claude.ai.',
      );
    }

    expect((await byEmail(client)).get('locked@example.com')!.access).toBe('view');
  });

  it('refuses every change and removal on a Forbidden artifact', async () => {
    const client = createFakeShareClient();
    const [, ...rest] = await client.listSharees(FORBIDDEN);
    expect(rest).toHaveLength(3);

    for (const act of [
      () => client.changeAccess(FORBIDDEN, rest[0]!.id!, 'edit'),
      () => client.removeInvite(FORBIDDEN, rest[0]!.id!),
    ]) {
      await expect(act()).rejects.toMatchObject({
        code: 'forbidden',
        message: 'Only the owner can change access',
      });
    }

    expect((await client.listSharees(FORBIDDEN)).length).toBe(4);
  });

  it('can’t find the invitation of one that was already removed', async () => {
    const client = createFakeShareClient();
    const id = (await byEmail(client)).get('viewer@example.com')!.id!;
    await client.removeInvite(SHARED, id);

    await expect(client.removeInvite(SHARED, id)).rejects.toMatchObject({ code: 'not-found' });
    await expect(client.changeAccess(SHARED, id, 'edit')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('starts a Crowded artifact with 45 people: odd numbers pending Can view, even accepted Can comment', async () => {
    const client = createFakeShareClient();
    const [owner, ...people] = await client.listSharees(CROWDED);

    expect(owner).toEqual({ email: 'owner@example.com', access: 'owner', status: 'active' });
    expect(people).toHaveLength(45);
    expect(people.map((p) => p.email)).toEqual(
      Array.from({ length: 45 }, (_, i) => `crowd${String(i + 1).padStart(2, '0')}@example.com`),
    );
    people.forEach((p, i) => {
      const odd = (i + 1) % 2 === 1;
      expect(p).toMatchObject({
        access: odd ? 'view' : 'comment',
        status: odd ? 'pending' : 'active',
      });
    });
    expect(new Set(people.map((p) => p.id)).size).toBe(45);
  });

  it('lets a Crowded artifact’s people be changed and removed like any others', async () => {
    const client = createFakeShareClient();
    const first = (await client.listSharees(CROWDED))[1]!;
    await client.changeAccess(CROWDED, first.id!, 'edit');
    await client.removeInvite(CROWDED, (await client.listSharees(CROWDED))[2]!.id!);

    const after = await client.listSharees(CROWDED);
    expect(after).toHaveLength(45);
    expect(after[1]!.access).toBe('edit');
    expect(after.some((p) => p.email === 'crowd02@example.com')).toBe(false);
  });

  it('leaves Shared and plain artifacts as they were', async () => {
    const client = createFakeShareClient();

    expect((await client.listSharees(SHARED)).map((p) => p.email)).toEqual([
      'owner@example.com',
      'viewer@example.com',
      'commenter@example.com',
      'locked@example.com',
    ]);
    expect((await client.listSharees(PLAIN)).map((p) => p.email)).toEqual(['owner@example.com']);
  });

  it('can’t list the people of a Missing artifact', async () => {
    const client = createFakeShareClient();

    await expect(client.listSharees(MISSING)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('still invites people, who then show up with an id and can be removed', async () => {
    const client = createFakeShareClient();
    await client.invite(PLAIN, 'new@example.com', 'comment');
    const added = (await byEmail(client, PLAIN)).get('new@example.com')!;

    expect(added).toMatchObject({ access: 'comment', status: 'pending' });
    await client.removeInvite(PLAIN, added.id!);
    expect((await byEmail(client, PLAIN)).has('new@example.com')).toBe(false);
  });
});
