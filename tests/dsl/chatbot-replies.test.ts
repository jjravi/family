import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse, stripCodeFence } from '../../src/dsl/parse';

/**
 * Stand-ins for real chatbot replies to the create prompt (spec "Acceptance
 * for v1"): three replies for the three-generation couple family in
 * description.txt, with the artifacts chatbots add (fences with and without a
 * language tag, curly quotes, en-dash years, arrows, bullets, numbering, a stray
 * blank line, trailing spaces). scripts/acceptance.mjs pastes the same files
 * into the built site.
 */
const dir = new URL('../fixtures/chatbot/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, dir), 'utf8');
const REPLIES = ['reply-chatgpt.txt', 'reply-claude.txt', 'reply-gemini.txt'];

describe('chatbot replies to the create prompt', () => {
  it.each(REPLIES)('%s parses with no diagnostics into the described family', (file) => {
    const { tree, diagnostics } = parse(stripCodeFence(read(file)));
    expect(diagnostics).toEqual([]);
    expect(tree.title).toBe('The Bennett & Okafor Family');
    expect(tree.persons.size).toBe(13);
    expect(tree.unions).toHaveLength(5);
    expect(tree.focus.map((id) => tree.persons.get(id)!.name.split(' ')[0])).toEqual(['Sophie', 'Daniel']);
    const harold = tree.persons.get('Harold Bennett')!;
    expect([harold.birth, harold.death]).toEqual([1925, 2003]);
    expect(tree.persons.get('Giuseppe Rossi')!.traits).toEqual(['hardworking', 'funny']);
    expect(tree.persons.get('Ada')!.birth).toBe(2015);
  });
});
