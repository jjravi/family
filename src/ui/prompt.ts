import { buildPrompt, type PromptMode } from '../prompt/build';
import { copyText } from './clipboard';
import { h, icon, uid } from './dom';
import { isPristineSample } from './editor-text';
import { ICONS } from './icons';
import { errorMessage, isBlank } from './text';

export const COPY_PROMPT_LABEL = 'Copy prompt';

/** One line under the button; it changes only with the mode, so the round trip always reads the same way. */
export const PROMPT_HINTS: Readonly<Record<PromptMode, string>> = {
  create: 'Paste the prompt into ChatGPT, Claude, or Gemini, describe your family after it, then paste the reply here.',
  edit: 'The prompt includes your tree. Paste it into a chatbot, say what to change, then paste the reply here.',
};

/**
 * `edit` once the editor holds the user's own tree; `create` while it is empty
 * or still the untouched sample (a first visit shows the sample, and its
 * visitors want a tree of their own, not an edit of the example).
 */
export function promptMode(dsl: string): PromptMode {
  return isBlank(dsl) || isPristineSample(dsl) ? 'create' : 'edit';
}

export interface ChatbotActions {
  readonly element: HTMLElement;
  /** Id of the hint, which also describes the editor. */
  readonly hintId: string;
  /** Updates the hint for the editor's current text. */
  setMode(mode: PromptMode): void;
}

/**
 * The chatbot handoff (spec "Prompt builder"), in the tree card: copy a prompt
 * that teaches the format (and carries the current tree once it is the user's
 * own). The user types the request in the chatbot, after the pasted prompt, and
 * pastes the reply into the editor, which replaces the tree with it.
 */
export function createChatbotActions(currentDsl: () => string): ChatbotActions {
  const hintId = uid('chatbot-hint');
  const copyButton = h(
    'button',
    { type: 'button', class: 'btn primary', title: 'Copy a prompt that teaches ChatGPT, Claude, or Gemini the tree format' },
    icon(ICONS.copy),
    COPY_PROMPT_LABEL,
  );
  const hint = h('p', { class: 'card-hint', id: hintId }, PROMPT_HINTS.create);
  const status = h('p', { class: 'prompt-status', role: 'status' });
  const fallback = h('textarea', { class: 'prompt-fallback', readonly: true, rows: 6, 'aria-label': 'The prompt, to copy by hand' });
  fallback.hidden = true;

  const element = h('div', { class: 'chatbot' }, h('div', { class: 'card-actions' }, copyButton), hint, status, fallback);

  function say(text: string, tone: 'ok' | 'error'): void {
    status.textContent = text;
    status.dataset.tone = tone;
  }

  copyButton.addEventListener('click', async () => {
    const dsl = currentDsl();
    const mode = promptMode(dsl);
    let prompt: string;
    try {
      prompt = buildPrompt(mode, dsl);
    } catch (error) {
      say(`Could not build the prompt: ${errorMessage(error)}`, 'error');
      return;
    }
    fallback.hidden = true;
    if (await copyText(prompt)) {
      say(mode === 'edit' ? 'Copied with your tree. Paste it into your chatbot.' : 'Copied. Paste it into your chatbot.', 'ok');
      return;
    }
    fallback.value = prompt;
    fallback.hidden = false;
    fallback.focus();
    fallback.select();
    say('Copying is blocked here, so the prompt is below: select it and copy.', 'error');
  });

  return {
    element,
    hintId,
    setMode(mode) {
      hint.textContent = PROMPT_HINTS[mode];
    },
  };
}
