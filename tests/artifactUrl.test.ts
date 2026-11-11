import { describe, expect, it } from 'vitest';
import { artifactUuid, parseArtifactList, parseArtifactRef } from '../src/core/artifactUrl';

const ID = 'SxyBbcL8qbzwA8FD63WrkK';
const UUID = '0b3c7e2a-1f4d-4a8e-9c2b-5d6e7f8a9b0c';

describe('parseArtifactRef', () => {
  it('parses claude.ai/artifact links', () => {
    expect(parseArtifactRef(`https://claude.ai/artifact/${ID}`)).toEqual({
      id: ID,
      kind: 'artifact',
      url: `https://claude.ai/artifact/${ID}`,
    });
    expect(parseArtifactRef(`claude.ai/artifact/${ID}?x=1#top`)?.id).toBe(ID);
  });

  it('parses claude.ai/code/artifact links and lowercases the uuid', () => {
    expect(parseArtifactRef(`https://claude.ai/code/artifact/${UUID.toUpperCase()}`)).toEqual({
      id: UUID,
      kind: 'code-artifact',
      url: `https://claude.ai/code/artifact/${UUID}`,
    });
  });

  it('parses a chat link with an open artifact into its claude.ai/artifact link', () => {
    const chat = 'https://claude.ai/chat/525fbb5c-c437-4680-bfdb-09332bdf678a';
    const ref = parseArtifactRef(`${chat}?artifact=${UUID.toUpperCase()}`);
    expect(ref).toEqual({
      id: '2PUa7qFdoBcApzhmHVvA4K',
      kind: 'artifact',
      url: 'https://claude.ai/artifact/2PUa7qFdoBcApzhmHVvA4K',
    });
    expect(artifactUuid(ref!)).toBe(UUID);
    expect(parseArtifactRef(`claude.ai/chat/abc?artifact=${UUID}`)?.id).toBe('2PUa7qFdoBcApzhmHVvA4K');
  });

  it('parses a cowork link with an open artifact like a chat link, ignoring the hash', () => {
    const uuid = 'c0ffee00-1234-4abc-8def-000000000001';
    const cowork = `https://claude.ai/cowork/cse_01ExampleCoworkSession00?artifact=${uuid}#example`;
    const ref = parseArtifactRef(cowork);
    expect(ref).toEqual({
      id: 'QqHHsBLXBfYKJD5NqJ8PeY',
      kind: 'artifact',
      url: 'https://claude.ai/artifact/QqHHsBLXBfYKJD5NqJ8PeY',
    });
    expect(ref).toEqual(parseArtifactRef(`https://claude.ai/chat/abc?artifact=${uuid}`));
    expect(artifactUuid(ref!)).toBe(uuid);
    expect(parseArtifactRef(`claude.ai/cowork/cse_x?artifact=${uuid.toUpperCase()}`)?.id).toBe(ref!.id);
  });

  it('rejects cowork links without a valid open artifact', () => {
    expect(parseArtifactRef('https://claude.ai/cowork/cse_01ExampleCoworkSession00')).toBeNull();
    expect(parseArtifactRef('https://claude.ai/cowork/cse_x?artifact=not-a-uuid')).toBeNull();
  });

  it('accepts ?artifact= on any claude.ai page, not just chat and cowork', () => {
    const expected = parseArtifactRef(`https://claude.ai/chat/abc?artifact=${UUID}`);
    expect(parseArtifactRef(`https://claude.ai/project/123?artifact=${UUID}`)).toEqual(expected);
    expect(parseArtifactRef(`https://claude.ai/?artifact=${UUID}`)).toEqual(expected);
    expect(parseArtifactRef(`claude.ai/some/new/page?x=1&artifact=${UUID}#y`)).toEqual(expected);
    expect(parseArtifactRef('https://claude.ai/project/123?artifact=not-a-uuid')).toBeNull();
  });

  it('round-trips uuids with leading zero bytes through chat links', () => {
    const small = '00000000-0000-4000-8000-000000000001';
    expect(artifactUuid(parseArtifactRef(`https://claude.ai/chat/x?artifact=${small}`)!)).toBe(small);
  });

  it('accepts bare ids and uuids', () => {
    expect(parseArtifactRef(ID)?.kind).toBe('artifact');
    expect(parseArtifactRef(UUID)?.kind).toBe('code-artifact');
  });

  it('rejects other hosts, other paths and plain words', () => {
    expect(parseArtifactRef(`https://evil.example/artifact/${ID}`)).toBeNull();
    expect(parseArtifactRef('https://claude.ai/chat/123')).toBeNull();
    expect(parseArtifactRef('https://claude.ai/chat/123?artifact=not-a-uuid')).toBeNull();
    expect(parseArtifactRef(`https://evil.example/chat/123?artifact=${UUID}`)).toBeNull();
    expect(parseArtifactRef('artifacts')).toBeNull();
    expect(parseArtifactRef('')).toBeNull();
  });
});

describe('parseArtifactList', () => {
  it('parses one per line, de-duplicates and reports invalid entries', () => {
    const r = parseArtifactList(`https://claude.ai/artifact/${ID}\n${ID}\nhttps://example.com/x\n\n${UUID}`);
    expect(r.refs.map((x) => x.id)).toEqual([ID, UUID]);
    expect(r.invalid).toEqual(['https://example.com/x']);
  });

  it('keeps one job when base58 and UUID links identify the same artifact', () => {
    const refs = parseArtifactList(
      `https://claude.ai/artifact/2PUa7qFdoBcApzhmHVvA4K\nhttps://claude.ai/code/artifact/${UUID}`,
    ).refs;
    expect(refs.map((ref) => ref.id)).toEqual(['2PUa7qFdoBcApzhmHVvA4K']);
  });

  it('counts a cowork link and the claude.ai/artifact link for the same artifact once', () => {
    const cowork =
      'https://claude.ai/cowork/cse_01ExampleCoworkSession00?artifact=c0ffee00-1234-4abc-8def-000000000001#x';
    const r = parseArtifactList(`${cowork}\nhttps://claude.ai/artifact/QqHHsBLXBfYKJD5NqJ8PeY`);
    expect(r.refs.map((ref) => ref.id)).toEqual(['QqHHsBLXBfYKJD5NqJ8PeY']);
    expect(r.invalid).toEqual([]);
  });

  it('reports cowork links without a valid artifact uuid as invalid', () => {
    const bare = 'https://claude.ai/cowork/cse_01ExampleCoworkSession00';
    const bad = 'https://claude.ai/cowork/cse_01ExampleCoworkSession00?artifact=not-a-uuid';
    const r = parseArtifactList(`${bare}\n${bad}`);
    expect(r.refs).toEqual([]);
    expect(r.invalid).toEqual([bare, bad]);
  });
});

describe('artifactUuid', () => {
  const ref = (id: string) => parseArtifactRef(`https://claude.ai/artifact/${id}`)!;

  it('decodes a claude.ai/artifact id (base58) to the API uuid', () => {
    expect(artifactUuid(ref('2PUa7qFdoBcApzhmHVvA4K'))).toBe('0b3c7e2a-1f4d-4a8e-9c2b-5d6e7f8a9b0c');
    expect(artifactUuid(ref('YcVfxkQavQvamAeSB3PSbx'))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('pads short ids with leading zeros', () => {
    expect(artifactUuid(ref('4bZ6BZRUqUqZep'))).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('passes a code/artifact uuid through', () => {
    expect(artifactUuid(parseArtifactRef(`https://claude.ai/code/artifact/${UUID}`)!)).toBe(UUID);
  });

  it('rejects ids that are not base58 or too large for a uuid', () => {
    expect(artifactUuid(ref('0OIl0OIl0OIl0OIl0OIl00'))).toBeNull();
    expect(artifactUuid(ref('zzzzzzzzzzzzzzzzzzzzzz'))).toBeNull();
    expect(artifactUuid(ref('Abc_def-ghijk'))).toBeNull();
  });
});
