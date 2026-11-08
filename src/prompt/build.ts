import { stripCodeFence } from '../dsl/parse';
import { DIRECTIVES, EXAMPLES, MAX_TRAIT_LENGTH, MAX_TRAITS, PROMPT_EXAMPLE, SUFFIX, UNKNOWN } from '../dsl/spec';

/** `create` turns a description into a new tree; `edit` applies a change request to the current DSL. */
export type PromptMode = 'create' | 'edit';

const code = (text: string): string => `\`${text}\``;

/** A Markdown fence longer than any backtick run inside `text`, so the text cannot close it early. */
function fenced(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}\n${text}\n${fence}`;
}

/** Once a second person shares a name, a bare reference to it is ambiguous, so both carry a number. */
const SHARED_NAME_FIRST = `${EXAMPLES.sameName.split(SUFFIX)[0]}${SUFFIX}1`;

/** What a capable model cannot read off the example or the user's own tree; the parser forgives quotes, indentation, and bullets. */
const FORMAT_NOTES = [
  `One line per couple or single parent with their children, eldest first; ${code(UNKNOWN)} is an unknown partner, and a couple without children is just ${code(EXAMPLES.childless)}.`,
  `Years: ${code(EXAMPLES.bornDied)}, ${code(EXAMPLES.born)} (born), ${code(EXAMPLES.died)} (died), ${code(EXAMPLES.approximate)} (about). Traits: up to ${MAX_TRAITS}, in quotes, ${MAX_TRAIT_LENGTH} characters max each.`,
  `Give a person's years and traits once, then repeat their name exactly. Two people who share a name are ${code(SHARED_NAME_FIRST)} and ${code(EXAMPLES.sameName)}, every time.`,
  `${code(`${DIRECTIVES.focus}:`)} names the person, or the couple (${code(EXAMPLES.focusTwo)}), the chart centers on.`,
  "Use only facts I give: invent nothing, and leave out what the format can't hold, like marriage years or places. If I'm unclear or contradictory, ask me instead.",
];

const CREATE_TASK = 'Turn my family description into the text format below, for a family-tree poster. Reply with just the tree, in one code block.';
const EDIT_TASK =
  'Update my family tree below, written in the text format of a family-tree poster site. Make only the change I ask for, keep every other line exactly as it is, and reply with the whole updated tree in one code block.';

const bullets = (lines: readonly string[]): string => lines.map((line) => `- ${line}`).join('\n');

/**
 * The prompt the user pastes into their own chatbot (spec "Prompt builder"),
 * written in the user's voice because it arrives as their message: the task,
 * then the format shown by example (the spec's PROMPT_EXAMPLE, or in `edit`
 * mode the current tree itself), then short notes built from the parser's own
 * constants (dsl/spec.ts, so prompt and parser cannot disagree), then a closing
 * line after which the user types their request in the chatbot. Deterministic
 * (snapshot-tested).
 *
 * `edit` with a blank `currentDsl` (after removing a surrounding code fence)
 * builds the `create` prompt; `currentDsl` is ignored in `create` mode.
 */
export function buildPrompt(mode: PromptMode, currentDsl?: string): string {
  const current = mode === 'edit' ? stripCodeFence(currentDsl ?? '').trim() : '';
  const edit = current !== '';
  const sections = edit
    ? [EDIT_TASK, fenced(current), bullets([...FORMAT_NOTES, 'Do the same for any later changes in this chat.']), 'The change I want:']
    : [
        CREATE_TASK,
        fenced(PROMPT_EXAMPLE.trimEnd()),
        bullets([...FORMAT_NOTES, 'If I ask for changes later in this chat, reply with the whole updated tree.']),
        'My family:',
      ];
  return `${sections.join('\n\n')}\n`;
}
