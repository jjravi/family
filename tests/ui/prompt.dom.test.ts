// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_DSL } from '../../src/dsl/sample';
import { COPY_PROMPT_LABEL, createChatbotActions, PROMPT_HINTS } from '../../src/ui/prompt';

function stubClipboard(clipboard: Partial<Clipboard> | undefined): void {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
}

function mount(dsl = '') {
  const actions = createChatbotActions(() => dsl);
  document.body.replaceChildren(actions.element);
  const click = (label: string) => {
    const button = [...actions.element.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
    if (!button) throw new Error(`No button "${label}"`);
    button.click();
  };
  const status = () => actions.element.querySelector('.prompt-status')?.textContent ?? '';
  return { actions, click, status };
}

async function copiedPrompt(dsl: string): Promise<{ prompt: string; status: string }> {
  const writeText = vi.fn(async (_text: string) => {});
  stubClipboard({ writeText });
  const { click, status } = mount(dsl);
  click(COPY_PROMPT_LABEL);
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(status()).not.toBe(''));
  return { prompt: writeText.mock.calls[0]![0], status: status() };
}

afterEach(() => stubClipboard(undefined));

describe('Copy prompt', () => {
  it('copies the create prompt, which ends where the user types the request', async () => {
    const { prompt, status } = await copiedPrompt('');
    expect(prompt.startsWith('Turn my family description into the text format below')).toBe(true);
    expect(prompt.endsWith('My family:\n')).toBe(true);
    expect(status).toBe('Copied. Paste it into your chatbot.');
  });

  it('leaves the untouched sample out of the prompt', async () => {
    const { prompt } = await copiedPrompt(SAMPLE_DSL);
    expect(prompt.startsWith('Turn my family description')).toBe(true);
    expect(prompt).not.toContain('Rose Kim');
  });

  it('carries the user’s own tree', async () => {
    const { prompt, status } = await copiedPrompt('Ann + Bo -> Cy\nfocus: Cy');
    expect(prompt.startsWith('Update my family tree below')).toBe(true);
    expect(prompt).toContain('\n```\nAnn + Bo -> Cy\nfocus: Cy\n```\n');
    expect(prompt.endsWith('The change I want:\n')).toBe(true);
    expect(status).toBe('Copied with your tree. Paste it into your chatbot.');
  });

  it('shows the prompt to copy by hand when copying is blocked', async () => {
    stubClipboard({ writeText: vi.fn(async () => Promise.reject(new Error('denied'))) });
    const { actions, click, status } = mount('');
    click(COPY_PROMPT_LABEL);
    const fallback = actions.element.querySelector<HTMLTextAreaElement>('.prompt-fallback')!;
    await vi.waitFor(() => expect(fallback.hidden).toBe(false));
    expect(fallback.value.endsWith('My family:\n')).toBe(true);
    expect(status()).toMatch(/select it and copy/);
  });
});

describe('hint', () => {
  it('describes the round trip for the current mode and labels the editor', () => {
    const { actions } = mount('');
    expect(actions.element.querySelectorAll('button')).toHaveLength(1);
    const hint = actions.element.querySelector(`#${actions.hintId}`);
    expect(hint?.textContent).toBe(PROMPT_HINTS.create);
    actions.setMode('edit');
    expect(hint?.textContent).toBe(PROMPT_HINTS.edit);
  });
});
