import { copyText } from './clipboard';
import { h, icon } from './dom';
import { ICONS } from './icons';

const RESET_MS = 2500;

/**
 * Copy link (spec "Share and export"): copies the current URL, which is always
 * a valid share link, beside a note that the link carries the whole tree.
 * `beforeCopy` lets a waiting edit reach the URL first.
 */
export function createShareControl(beforeCopy: () => Promise<void>): HTMLElement {
  const label = h('span', {}, 'Copy link');
  const button = h('button', { type: 'button', class: 'btn primary share-button' }, icon(ICONS.link), label);
  const live = h('span', { class: 'visually-hidden', role: 'status' });
  const note = h('p', { class: 'share-note' }, 'The link contains your whole tree, names and years included.');
  let timer: ReturnType<typeof setTimeout> | undefined;

  button.addEventListener('click', async () => {
    await beforeCopy();
    const copied = await copyText(location.href);
    label.textContent = copied ? 'Copied' : 'Copy failed';
    live.textContent = copied ? 'Link copied.' : 'Could not copy the link. Copy it from the address bar instead.';
    button.classList.toggle('is-done', copied);
    clearTimeout(timer);
    timer = setTimeout(() => {
      label.textContent = 'Copy link';
      live.textContent = '';
      button.classList.remove('is-done');
    }, RESET_MS);
  });

  return h('div', { class: 'share' }, note, button, live);
}
