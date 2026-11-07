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

  it('accepts bare ids and uuids', () => {
    expect(parseArtifactRef(ID)?.kind).toBe('artifact');
    expect(parseArtifactRef(UUID)?.kind).toBe('code-artifact');
  });

  it('rejects other hosts, other paths and plain words', () => {
    expect(parseArtifactRef(`https://evil.example/artifact/${ID}`)).toBeNull();
    expect(parseArtifactRef('https://claude.ai/chat/123')).toBeNull();
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
