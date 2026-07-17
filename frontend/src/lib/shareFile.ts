/**
 * Share a generated file (PDF) to WhatsApp. On mobile browsers that support
 * the Web Share API with file attachments (Chrome/Safari on Android/iOS over
 * HTTPS), this opens the native share sheet with the file attached — the user
 * taps WhatsApp and picks a contact there. Desktop / unsupported browsers fall
 * back to a wa.me link (text only, no attachment — WhatsApp Web can't accept
 * a locally-generated file from a link), pre-filled with the client's number
 * when known.
 */
export async function shareFileToWhatsApp(
  blob: Blob,
  filename: string,
  opts: { title: string; text: string; phone?: string | null },
) {
  const file = new File([blob], filename, { type: 'application/pdf' });

  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };

  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    await nav.share({ files: [file], title: opts.title, text: opts.text });
    return;
  }

  // Fallback: open WhatsApp with a pre-filled text message (no attachment).
  const digits = (opts.phone ?? '').replace(/\D/g, '');
  const phone = digits ? (digits.length === 10 ? `91${digits}` : digits) : '';
  const text = encodeURIComponent(`${opts.text}\n\n(PDF downloaded separately — attach it to this chat.)`);
  window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
}
