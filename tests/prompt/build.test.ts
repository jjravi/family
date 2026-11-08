import { describe, expect, it } from 'vitest';
import { parse } from '../../src/dsl/parse';
import { EXAMPLE_DSL } from '../../src/dsl/sample';
import { EXAMPLES, MAX_TRAIT_LENGTH, MAX_TRAITS, PROMPT_EXAMPLE, UNKNOWN } from '../../src/dsl/spec';
import { buildPrompt } from '../../src/prompt/build';

/** The contents of the first fenced block in `prompt`. */
function firstBlock(prompt: string): string {
  const match = /^(`{3,})\n([\s\S]*?)\n\1$/m.exec(prompt);
  if (!match) throw new Error('no fenced block');
  return match[2]!;
}

describe('buildPrompt snapshots (what the site copies: the user types the request in the chatbot)', () => {
  it('create mode', async () => {
    await expect(buildPrompt('create')).toMatchFileSnapshot('./__snapshots__/create.prompt.txt');
  });

  it('edit mode', async () => {
    await expect(buildPrompt('edit', EXAMPLE_DSL)).toMatchFileSnapshot('./__snapshots__/edit.prompt.txt');
  });
});

describe('buildPrompt', () => {
  const create = buildPrompt('create');
  const edit = buildPrompt('edit', EXAMPLE_DSL);

  it('is deterministic', () => {
    expect(buildPrompt('create')).toBe(create);
    expect(buildPrompt('edit', EXAMPLE_DSL)).toBe(edit);
  });

  it('speaks as the user, since it arrives in the chat as their message', () => {
    expect(create.startsWith('Turn my family description into the text format below')).toBe(true);
    expect(edit.startsWith('Update my family tree below')).toBe(true);
  });

  it('asks for the tree alone, in one code block', () => {
    expect(create).toContain('Reply with just the tree, in one code block.');
    expect(edit).toContain('keep every other line exactly as it is, and reply with the whole updated tree in one code block.');
  });

  it('shows the format by example: the spec example, or in edit mode the current tree', () => {
    expect(firstBlock(create)).toBe(PROMPT_EXAMPLE.trimEnd());
    expect(parse(firstBlock(create)).diagnostics).toEqual([]);
    expect(firstBlock(edit)).toBe(EXAMPLE_DSL.trim());
    expect(edit).not.toContain('Okafor');
  });

  it('notes what an example cannot show, quoting the parser’s own syntax', () => {
    const snippets = [UNKNOWN, EXAMPLES.childless, EXAMPLES.bornDied, EXAMPLES.born, EXAMPLES.died, EXAMPLES.approximate, 'Nia@1', EXAMPLES.sameName, EXAMPLES.focusTwo];
    for (const prompt of [create, edit]) {
      for (const snippet of snippets) expect(prompt).toContain(`\`${snippet}\``);
      expect(prompt).toContain(`Traits: up to ${MAX_TRAITS}, in quotes, ${MAX_TRAIT_LENGTH} characters max each.`);
      expect(prompt).toContain('eldest first');
      expect(prompt).toContain("Give a person's years and traits once, then repeat their name exactly.");
    }
  });

  it('gets a reply that follows its notes through the parser, shared names included', () => {
    // "Walter Hughes (born around 1920, died 1988) married Edith (1924-2010) in 1946; they had June (1948) and
    // Ray (1951). With his second wife Lena Moss (born 1930) he had another Ray in 1960. June had Pearl (1975);
    // we never knew her father. The elder Ray raised his son Tim (1980) alone. Center the chart on Pearl."
    const reply = (elder: string) =>
      `title: The Hughes Family\n\nEdith 1924-2010 + Walter Hughes c1920-1988 -> June 1948, ${elder} 1951\n` +
      `Walter Hughes + Lena Moss 1930 -> Ray@2 1960\nJune + ? -> Pearl 1975\n${elder} -> Tim 1980\n\nfocus: Pearl\n`;
    const followed = parse(reply('Ray@1'));
    expect(followed.diagnostics).toEqual([]);
    expect(followed.tree.persons.size).toBe(8);
    expect(parse(reply('Ray')).diagnostics.map((d) => d.severity)).toEqual(['error']);
  });

  it('keeps the guards against known chatbot failures', () => {
    for (const prompt of [create, edit]) {
      expect(prompt).toContain('invent nothing');
      expect(prompt).toContain('marriage years or places');
      expect(prompt).toContain("If I'm unclear or contradictory, ask me instead.");
    }
    expect(create).toContain('If I ask for changes later in this chat, reply with the whole updated tree.');
    expect(edit).toContain('Do the same for any later changes in this chat.');
  });

  it('ends on the line where the user types the request', () => {
    expect(create.endsWith('\n\nMy family:\n')).toBe(true);
    expect(edit.endsWith('\n\nThe change I want:\n')).toBe(true);
  });

  it('ignores the current DSL in create mode', () => {
    expect(buildPrompt('create', EXAMPLE_DSL)).toBe(create);
  });

  it('falls back to create when the current DSL is missing, blank, or an empty fence', () => {
    for (const current of [undefined, '', '  \n\t\n', '```\n```']) {
      expect(buildPrompt('edit', current)).toBe(create);
    }
  });

  it('removes a code fence around the current DSL', () => {
    const prompt = buildPrompt('edit', '```dsl\nA -> B\nfocus: B\n```\n');
    expect(firstBlock(prompt)).toBe('A -> B\nfocus: B');
    expect(prompt).not.toContain('```dsl');
  });

  it('fences the current DSL with more backticks than it contains', () => {
    const prompt = buildPrompt('edit', 'A -> B\n```\nfocus: B');
    expect(prompt).toContain('\n````\nA -> B\n```\nfocus: B\n````\n');
  });
});
