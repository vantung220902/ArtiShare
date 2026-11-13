import { describe, expect, it } from 'vitest';
import { addArtifactText, insertPaste, removeArtifact, sameArtifact } from '../src/core/artifactRows';
import { artifactUuid, parseArtifactRef } from '../src/core/artifactUrl';

const ONE = 'https://claude.ai/artifact/ExampleArtifactOne01';
const TWO = 'https://claude.ai/artifact/ExampleArtifactTwo02';
const THREE = 'https://claude.ai/artifact/ExampleArtifactThree3';
const COWORK =
  'https://claude.ai/cowork/cse_01ExampleCoworkSession00?artifact=c0ffee00-1234-4abc-8def-000000000001#example';
const COWORK_AS_ARTIFACT = 'https://claude.ai/artifact/QqHHsBLXBfYKJD5NqJ8PeY';

const ref = (url: string) => parseArtifactRef(url)!;
const urls = (rows: { url: string }[]) => rows.map((r) => r.url);

describe('addArtifactText', () => {
  it('adds every link in pasted lines after the rows, normalized, in order', () => {
    const added = addArtifactText([], `${ONE}\n${COWORK}\n${TWO}`);
    expect(urls(added.rows)).toEqual([ONE, COWORK_AS_ARTIFACT, TWO]);
    expect(added.repeated).toEqual([]);
    expect(added.leftover).toBe('');
  });

  it('adds after the existing rows without reordering them', () => {
    const added = addArtifactText([ref(TWO)], `${THREE}\n${ONE}`);
    expect(urls(added.rows)).toEqual([TWO, THREE, ONE]);
  });

  it('keeps what is not a link, a line at a time, and still adds the links', () => {
    const added = addArtifactText([], `not a link\n${ONE}`);
    expect(urls(added.rows)).toEqual([ONE]);
    expect(added.leftover).toBe('not a link');

    const mixed = addArtifactText([], `see ${TWO} here\nfoo, bar\n\n`);
    expect(urls(mixed.rows)).toEqual([TWO]);
    expect(mixed.leftover).toBe('see here\nfoo bar');
  });

  it('does not add an artifact twice, and reports the existing row it named again', () => {
    const rows = [ref(ONE), ref(COWORK_AS_ARTIFACT)];
    // The cowork link and its /artifact/ link are the same artifact.
    const added = addArtifactText(rows, `${ONE}\n${COWORK}\n${ONE}`);
    expect(added.rows).toEqual(rows);
    expect(added.repeated).toEqual(rows);
    expect(added.leftover).toBe('');
  });

  it('does not report a link named twice in the same paste as already in the list', () => {
    const added = addArtifactText([], `${ONE}\n${ONE}`);
    expect(urls(added.rows)).toEqual([ONE]);
    expect(added.repeated).toEqual([]);
  });

  it('treats a code artifact and its UUID as the same artifact', () => {
    const code = ref('https://claude.ai/code/artifact/0b3c7e2a-1f4d-4a8e-9c2b-5d6e7f8a9b0c');
    expect(artifactUuid(code)).toBe(code.id);
    expect(addArtifactText([code], code.id.toUpperCase()).rows).toEqual([code]);
  });

  it('leaves the rows alone for empty text', () => {
    const rows = [ref(ONE)];
    expect(addArtifactText(rows, '  \n ')).toEqual({ rows, repeated: [], leftover: '' });
  });
});

describe('insertPaste', () => {
  it('puts a pasted link on its own line, apart from what is left in the box', () => {
    expect(insertPaste('not a link', 10, 10, ONE)).toBe(`not a link\n${ONE}`);
    expect(insertPaste('abc', 0, 0, TWO)).toBe(`${TWO}\nabc`);
    expect(insertPaste('before after', 6, 7, `${ONE}\n${TWO}`)).toBe(`before\n${ONE}\n${TWO}\nafter`);
  });

  it('replaces the selection, and adds no empty lines', () => {
    expect(insertPaste('not a link', 0, 10, ONE)).toBe(ONE);
    expect(insertPaste('', 0, 0, ONE)).toBe(ONE);
  });

  it('splices in a paste that is not a link where the caret is', () => {
    expect(insertPaste('https://claude.ai/artifact/', 27, 27, 'Example')).toBe(
      'https://claude.ai/artifact/Example',
    );
  });

  it('then adds the pasted link, or names its row again, and keeps the rest in the box', () => {
    const added = addArtifactText([ref(ONE)], insertPaste('not a link', 10, 10, ONE));
    expect(added.rows).toEqual([ref(ONE)]);
    expect(added.repeated).toEqual(added.rows);
    expect(added.leftover).toBe('not a link');

    const glued = addArtifactText([], insertPaste('abc', 3, 3, TWO));
    expect(urls(glued.rows)).toEqual([TWO]);
    expect(glued.leftover).toBe('abc');
  });
});

describe('removeArtifact', () => {
  it('removes the artifact however it was linked, keeping the order of the rest', () => {
    const rows = [ref(ONE), ref(COWORK_AS_ARTIFACT), ref(TWO)];
    expect(urls(removeArtifact(rows, ref(COWORK)))).toEqual([ONE, TWO]);
    expect(removeArtifact(rows, ref(THREE))).toEqual(rows);
  });
});

describe('sameArtifact', () => {
  it('compares artifacts, not links', () => {
    expect(sameArtifact(ref(COWORK), ref(COWORK_AS_ARTIFACT))).toBe(true);
    expect(sameArtifact(ref(ONE), ref(TWO))).toBe(false);
  });
});
