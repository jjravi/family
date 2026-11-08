function legacyCopy(text: string): boolean {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  active?.focus();
  return copied;
}

/** Copies text to the clipboard; resolves false when no method worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Blocked or unavailable (insecure context, lost user activation): try the legacy path.
  }
  return legacyCopy(text);
}
