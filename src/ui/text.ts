/** The message of an unknown thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True for empty or whitespace-only text. */
export function isBlank(text: string): boolean {
  return text.trim() === '';
}
