import { format } from '../dsl/format';
import { parse } from '../dsl/parse';
import { SAMPLE_DSL } from '../dsl/sample';
import { PROMPT_EXAMPLE } from '../dsl/spec';
import { hasErrors, type Diagnostic, type Severity } from '../model/types';
import { h, icon, uid } from './dom';
import { hasFocusLine, isPristineSample, isWholeTree, lineCount, lineRange, treeFromReply, unfence } from './editor-text';
import { ICONS } from './icons';
import { errorMessage, isBlank } from './text';

const STATUS_MS = 5000;

export interface EditorCallbacks {
  /** The user typed: render after the debounce. */
  onEdit(dsl: string): void;
  /** A command replaced the whole text (Clear, Load example, Tidy, fenced paste): render now. */
  onReplace(dsl: string): void;
}

export interface EditorOptions {
  /** Controls shown under the title (the chatbot round trip). */
  actions?: HTMLElement;
  /** Id of the text that describes the editor. */
  describedBy?: string;
}

export interface Editor {
  readonly element: HTMLElement;
  readonly textarea: HTMLTextAreaElement;
  readonly value: string;
  /** Shows text loaded from a link: no undo entry, no callbacks. */
  load(dsl: string): void;
  /** Lists diagnostics under the editor (an empty list clears it) and marks their lines in the gutter. */
  showDiagnostics(diagnostics: readonly Diagnostic[]): void;
  /** Focuses the editor and selects line `line` (1-based); 0 or past the end puts the caret at the end. */
  selectLine(line: number): void;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function summarize(errors: number, warnings: number): string {
  if (errors > 0) {
    const also = warnings > 0 ? `, ${plural(warnings, 'warning')}` : '';
    return `${plural(errors, 'error')}${also}. The poster updates once ${errors === 1 ? 'it is' : 'they are'} fixed.`;
  }
  if (warnings > 0) return `${plural(warnings, 'warning')}. The poster still updates.`;
  return '';
}

/**
 * The tree card (spec "UI", left pane): the chatbot round trip (`actions`), a
 * textarea with a line gutter, live diagnostics, and Tidy / Clear / Load example.
 */
export function createEditor(callbacks: EditorCallbacks, options: EditorOptions = {}): Editor {
  const titleId = uid('editor-title');
  const textarea = h('textarea', {
    class: 'code-input',
    wrap: 'off',
    spellcheck: 'false',
    autocapitalize: 'off',
    autocomplete: 'off',
    autocorrect: 'off',
    placeholder: `Paste the chatbot’s reply here, or write the tree yourself:\n\n${PROMPT_EXAMPLE.trimEnd()}`,
    'aria-labelledby': titleId,
    'aria-describedby': options.describedBy,
  });
  const gutterLines = h('div', { class: 'gutter-lines' });
  const summary = h('p', { class: 'diag-summary', role: 'status' });
  const list = h('ul', { class: 'diag-list' });
  const diagnosticsBox = h('div', { class: 'diagnostics' }, summary, list);
  const tidyButton = h(
    'button',
    { type: 'button', class: 'btn small ghost', title: 'Rewrite the tree in a consistent form (comments are removed)' },
    icon(ICONS.wand),
    'Tidy',
  );
  const clearButton = h('button', { type: 'button', class: 'btn small ghost' }, icon(ICONS.trash), 'Clear');
  const exampleButton = h('button', { type: 'button', class: 'btn small ghost' }, icon(ICONS.sample), 'Load example');
  const status = h('p', { class: 'editor-status', role: 'status' });

  const element = h(
    'section',
    { class: 'card editor', 'aria-labelledby': titleId },
    h('h2', { class: 'card-title', id: titleId }, 'Your family tree'),
    options.actions,
    h('div', { class: 'code' }, h('div', { class: 'gutter', 'aria-hidden': 'true' }, gutterLines), textarea),
    diagnosticsBox,
    h('div', { class: 'card-foot' }, tidyButton, clearButton, exampleButton, status),
  );

  const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  let marks = new Map<number, Severity>();
  let gutterKey = '';
  let replacing = false;
  let statusTimer: ReturnType<typeof setTimeout> | undefined;

  function renderGutter(): void {
    const count = lineCount(textarea.value);
    const key = `${count}|${[...marks].join(',')}`;
    if (key === gutterKey) return;
    gutterKey = key;
    const fragment = document.createDocumentFragment();
    for (let line = 1; line <= count; line++) {
      const mark = marks.get(line);
      fragment.append(h('div', { class: mark ? `has-${mark}` : null }, String(line)));
    }
    gutterLines.replaceChildren(fragment);
  }

  function syncScroll(): void {
    gutterLines.style.transform = `translateY(${-textarea.scrollTop}px)`;
  }

  function say(text: string): void {
    status.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (status.textContent = ''), STATUS_MS);
  }

  /** Replaces all text, through the browser's undo stack where that works without popping a phone keyboard. */
  function replaceText(text: string): void {
    replacing = true;
    try {
      let done = false;
      if (!coarsePointer && typeof document.execCommand === 'function') {
        textarea.focus();
        textarea.select();
        done = document.execCommand(text === '' ? 'delete' : 'insertText', false, text) && textarea.value === text;
      }
      if (!done) textarea.value = text;
    } finally {
      replacing = false;
    }
    textarea.setSelectionRange(0, 0);
    textarea.scrollTop = 0;
    textarea.scrollLeft = 0;
    renderGutter();
    syncScroll();
    callbacks.onReplace(textarea.value);
  }

  /** Set by a paste that takes over all text, so the input it causes can pull the tree out of a chatbot reply. */
  let pasteOverAll: { replacedOwnTree: boolean } | null = null;

  textarea.addEventListener('paste', (event) => {
    const pasted = event.clipboardData?.getData('text/plain') ?? '';
    const current = textarea.value;
    const ownTree = !isBlank(current) && !isPristineSample(current);
    if (ownTree && !(isWholeTree(pasted) && hasFocusLine(current))) return;
    pasteOverAll = { replacedOwnTree: ownTree };
    textarea.select();
  });
  textarea.addEventListener('input', (event) => {
    if (replacing) return;
    const { inputType } = event as InputEvent;
    const pasted = inputType === 'insertFromPaste' || inputType === 'insertFromDrop';
    const overAll = pasted ? pasteOverAll : null;
    pasteOverAll = null;
    if (overAll) {
      const tree = treeFromReply(textarea.value);
      if (tree !== textarea.value) replaceText(tree);
      else {
        renderGutter();
        callbacks.onReplace(textarea.value);
      }
      if (overAll.replacedOwnTree) say(coarsePointer ? 'Replaced your tree with the pasted one.' : 'Replaced your tree with the pasted one. Undo with Ctrl+Z or ⌘Z.');
      return;
    }
    const content = pasted ? unfence(textarea.value) : null;
    if (content !== null) {
      replaceText(content);
      return;
    }
    renderGutter();
    callbacks.onEdit(textarea.value);
  });
  textarea.addEventListener('scroll', syncScroll);

  clearButton.addEventListener('click', () => replaceText(''));
  exampleButton.addEventListener('click', () => replaceText(SAMPLE_DSL));
  tidyButton.addEventListener('click', () => {
    try {
      const parsed = parse(textarea.value);
      if (hasErrors(parsed.diagnostics)) {
        say('Fix the errors first, then tidy.');
        return;
      }
      const tidy = format(parsed.tree);
      if (tidy === textarea.value) {
        say('Already tidy.');
        return;
      }
      replaceText(tidy);
      say(coarsePointer ? 'Tidied.' : 'Tidied. Undo with Ctrl+Z or ⌘Z.');
    } catch (error) {
      say(`Could not tidy: ${errorMessage(error)}`);
    }
  });

  function selectLine(line: number): void {
    const end = textarea.value.length;
    const range = lineRange(textarea.value, line) ?? { start: end, end };
    textarea.focus();
    textarea.setSelectionRange(range.start, range.end);
    const styles = getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const top = range.start === end ? textarea.scrollHeight : (Number.parseFloat(styles.paddingTop) || 0) + (line - 1) * lineHeight;
    if (top < textarea.scrollTop || top + lineHeight > textarea.scrollTop + textarea.clientHeight) {
      textarea.scrollTop = Math.max(0, top - textarea.clientHeight / 3);
    }
    textarea.scrollLeft = 0;
    syncScroll();
  }

  function item(diagnostic: Diagnostic): HTMLLIElement {
    const where = diagnostic.line > 0 ? `Line ${diagnostic.line}` : 'Whole tree';
    const button = h(
      'button',
      { type: 'button', class: `diag ${diagnostic.severity}` },
      h('span', { class: 'diag-line' }, where),
      h('span', { class: 'visually-hidden' }, diagnostic.severity === 'error' ? ' error: ' : ' warning: '),
      h('span', { class: 'diag-message' }, diagnostic.message),
    );
    button.addEventListener('click', () => selectLine(diagnostic.line));
    return h('li', {}, button);
  }

  function showDiagnostics(diagnostics: readonly Diagnostic[]): void {
    const errors = diagnostics.filter((d) => d.severity === 'error').length;
    const warnings = diagnostics.length - errors;
    diagnosticsBox.classList.toggle('has-errors', errors > 0);
    diagnosticsBox.classList.toggle('has-warnings', errors === 0 && warnings > 0);
    summary.textContent = summarize(errors, warnings);
    list.replaceChildren(...diagnostics.map(item));
    tidyButton.disabled = errors > 0 || isBlank(textarea.value);
    marks = new Map();
    for (const { line, severity } of diagnostics) {
      if (line > 0 && marks.get(line) !== 'error') marks.set(line, severity);
    }
    renderGutter();
  }

  renderGutter();
  return {
    element,
    textarea,
    get value() {
      return textarea.value;
    },
    load(dsl) {
      textarea.value = dsl;
      textarea.scrollTop = 0;
      renderGutter();
      syncScroll();
    },
    showDiagnostics,
    selectLine,
  };
}
