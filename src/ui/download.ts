/**
 * Hands the browser a file to save. The link is removed at once and the
 * object URL released on the next tick, after the click has been dispatched,
 * so repeated exports do not accumulate blobs.
 */
export function downloadText(filename: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
