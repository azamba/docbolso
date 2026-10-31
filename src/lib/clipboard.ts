import * as Clipboard from 'expo-clipboard';

/** How long a copied value stays in the clipboard. */
const CLEAR_AFTER_MS = 60_000;

let copied: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Copies a private value: hidden from clipboard previews and keyboards
 * (Android 13+), kept off Universal Clipboard (iOS), and wiped after a minute.
 */
export async function copyPrivate(value: string) {
  await Clipboard.setStringAsync(value, {
    android: { isSensitive: true },
    ios: { localOnly: true, expiresAt: new Date(Date.now() + CLEAR_AFTER_MS) },
  });
  copied = value;
  if (timer) clearTimeout(timer);
  timer = setTimeout(clearCopied, CLEAR_AFTER_MS);
}

/** Empties the clipboard if it still holds what this app copied (the user may have copied something else since). */
export async function clearCopied() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (copied === null) return;
  const value = copied;
  copied = null;
  try {
    if ((await Clipboard.getStringAsync()) === value) await Clipboard.setStringAsync('');
  } catch {
    // reading the clipboard can fail in the background; nothing else to do
  }
}
