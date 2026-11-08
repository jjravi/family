// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { format } from '../../src/dsl/format';
import { parse } from '../../src/dsl/parse';
import { SAMPLE_DSL } from '../../src/dsl/sample';
import { createEditor } from '../../src/ui/editor';

function mount() {
  const onEdit = vi.fn();
  const onReplace = vi.fn();
  const editor = createEditor({ onEdit, onReplace });
  document.body.replaceChildren(editor.element);
  return { editor, onEdit, onReplace, textarea: editor.textarea };
}

/** A paste as the browser delivers it: the paste event (with its clipboard text), the default insertion over the selection, then input. */
function paste(textarea: HTMLTextAreaElement, text: string): void {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => (type === 'text/plain' ? text : '') } });
  textarea.dispatchEvent(event);
  const { value, selectionStart, selectionEnd } = textarea;
  textarea.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
  textarea.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste', bubbles: true }));
}

function type(textarea: HTMLTextAreaElement, value: string): void {
  textarea.value = value;
  textarea.dispatchEvent(new InputEvent('input', { inputType: 'insertText', bubbles: true }));
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === label);
  if (!found) throw new Error(`No button "${label}"`);
  return found;
}

describe('editor paste handling', () => {
  it('strips a code fence around a pasted reply and renders at once', () => {
    const { onEdit, onReplace, textarea } = mount();
    paste(textarea, '```\nA + B -> C\nfocus: C\n```\n');
    expect(textarea.value).toBe('A + B -> C\nfocus: C');
    expect(onReplace).toHaveBeenCalledWith('A + B -> C\nfocus: C');
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('renders a paste into an empty editor at once', () => {
    const { onEdit, onReplace, textarea } = mount();
    paste(textarea, 'A + B -> C\nfocus: C\n');
    expect(textarea.value).toBe('A + B -> C\nfocus: C\n');
    expect(onReplace).toHaveBeenCalledWith('A + B -> C\nfocus: C\n');
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('pulls the tree out of a chatty reply pasted into an empty editor', () => {
    const { onReplace, textarea } = mount();
    paste(textarea, 'Here you go:\n\n```\nA + B -> C\nfocus: C\n```\n\nAnything else?');
    expect(textarea.value).toBe('A + B -> C\nfocus: C');
    expect(onReplace).toHaveBeenLastCalledWith('A + B -> C\nfocus: C');
  });

  it('replaces the user’s tree when a whole tree is pasted into it, and says so', () => {
    const { editor, onReplace, textarea } = mount();
    editor.load('A -> B\nfocus: B\n');
    textarea.setSelectionRange(3, 3);
    paste(textarea, '```\nX + Y -> Z\nfocus: Z\n```');
    expect(textarea.value).toBe('X + Y -> Z\nfocus: Z');
    expect(onReplace).toHaveBeenLastCalledWith('X + Y -> Z\nfocus: Z');
    expect(editor.element.querySelector('.editor-status')?.textContent).toMatch(/^Replaced your tree with the pasted one\./);
  });

  it('pastes a lone focus line at the caret instead of replacing the tree', () => {
    const { editor, onEdit, textarea } = mount();
    editor.load('A -> B\n');
    textarea.setSelectionRange(7, 7);
    paste(textarea, 'focus: B');
    expect(textarea.value).toBe('A -> B\nfocus: B');
    expect(onEdit).toHaveBeenCalledWith('A -> B\nfocus: B');
  });

  it('does not strip fences while typing', () => {
    const { onEdit, textarea } = mount();
    type(textarea, '```\nfocus: C\n```');
    expect(textarea.value).toBe('```\nfocus: C\n```');
    expect(onEdit).toHaveBeenCalledWith('```\nfocus: C\n```');
  });

  it('replaces the untouched sample instead of pasting into it', () => {
    const { editor, textarea } = mount();
    editor.load(SAMPLE_DSL);
    textarea.setSelectionRange(10, 10);
    paste(textarea, 'X + Y -> Z\nfocus: Z\n');
    expect(textarea.value).toBe('X + Y -> Z\nfocus: Z\n');
  });

  it('pastes at the caret once the tree is the user’s own', () => {
    const { editor, textarea } = mount();
    editor.load('A -> B\nfocus: B\n');
    textarea.setSelectionRange(6, 6);
    paste(textarea, ', C');
    expect(textarea.value).toBe('A -> B, C\nfocus: B\n');
  });
});

describe('editor diagnostics', () => {
  it('lists diagnostics, marks the gutter, and selects a line when clicked', () => {
    const { editor, textarea } = mount();
    editor.load('line one\nline two\nline three');
    editor.showDiagnostics([
      { line: 2, severity: 'error', message: 'Bad line.' },
      { line: 0, severity: 'warning', message: 'Whole tree.' },
    ]);
    const items = [...editor.element.querySelectorAll<HTMLButtonElement>('.diag')];
    expect(items.map((item) => item.textContent)).toEqual(['Line 2 error: Bad line.', 'Whole tree warning: Whole tree.']);
    expect(editor.element.querySelector('.diag-summary')?.textContent).toMatch(/^1 error, 1 warning\./);
    expect(editor.element.querySelector('.diagnostics')?.classList.contains('has-errors')).toBe(true);
    expect([...editor.element.querySelectorAll('.gutter-lines > div')].map((line) => line.className)).toEqual(['', 'has-error', '']);
    expect(button(editor.element, 'Tidy').disabled).toBe(true);

    items[0]!.click();
    expect(document.activeElement).toBe(textarea);
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([9, 17]);
    items[1]!.click();
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([28, 28]);
  });

  it('clears the list when the diagnostics go away', () => {
    const { editor } = mount();
    editor.load('A -> B\nfocus: B');
    editor.showDiagnostics([{ line: 1, severity: 'warning', message: 'Hmm.' }]);
    editor.showDiagnostics([]);
    expect(editor.element.querySelectorAll('.diag')).toHaveLength(0);
    expect(editor.element.querySelector('.diagnostics')?.className).toBe('diagnostics');
    expect(button(editor.element, 'Tidy').disabled).toBe(false);
  });
});

describe('editor commands', () => {
  it('Clear and Load example replace the text and render at once', () => {
    const { editor, onReplace, textarea } = mount();
    editor.load('A -> B\nfocus: B');
    button(editor.element, 'Clear').click();
    expect(textarea.value).toBe('');
    expect(onReplace).toHaveBeenLastCalledWith('');
    button(editor.element, 'Load example').click();
    expect(textarea.value).toBe(SAMPLE_DSL);
    expect(onReplace).toHaveBeenLastCalledWith(SAMPLE_DSL);
  });

  it('Tidy rewrites the tree in canonical form', () => {
    const { editor, onReplace, textarea } = mount();
    editor.load(SAMPLE_DSL);
    editor.showDiagnostics([]);
    button(editor.element, 'Tidy').click();
    const tidy = format(parse(SAMPLE_DSL).tree);
    expect(textarea.value).toBe(tidy);
    expect(onReplace).toHaveBeenCalledWith(tidy);
  });
});
