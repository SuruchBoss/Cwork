import { chunkText, estimateTokens } from './knowledge.service';

describe('chunkText', () => {
  it('keeps a short document as a single chunk', () => {
    const chunks = chunkText('ระเบียบการลา\n\nพนักงานมีสิทธิลาพักร้อน 10 วันต่อปี');
    expect(chunks).toHaveLength(1);
  });

  it('splits long documents on paragraph boundaries', () => {
    const paragraph = 'ก'.repeat(500);
    const chunks = chunkText([paragraph, paragraph, paragraph].join('\n\n'), 1200, 0);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1200)).toBe(true);
  });

  it('hard-splits a paragraph larger than the target rather than dropping it', () => {
    const giant = 'x'.repeat(3000);
    const chunks = chunkText(giant, 1000, 0);

    expect(chunks).toHaveLength(3);
    expect(chunks.join('')).toBe(giant);
  });

  it('carries an overlap between chunks so split sentences still retrieve', () => {
    const a = 'A'.repeat(700);
    const b = 'B'.repeat(700);
    const chunks = chunkText(`${a}\n\n${b}`, 1000, 100);

    expect(chunks).toHaveLength(2);
    expect(chunks[1].startsWith('A'.repeat(100))).toBe(true);
  });

  it('returns nothing for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });
});

describe('estimateTokens', () => {
  it('counts Thai characters more densely than latin ones', () => {
    const thai = estimateTokens('ก'.repeat(100));
    const latin = estimateTokens('a'.repeat(100));

    expect(thai).toBe(50);
    expect(latin).toBe(25);
  });
});
