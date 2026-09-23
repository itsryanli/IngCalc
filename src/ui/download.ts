// WebKit/iOS can cancel a download if its object URL is revoked too soon
// after the click; give it time to actually start before releasing it.
const REVOKE_DELAY_MS = 30_000;

/**
 * Hands the browser a file to save. The link is removed at once and the
 * object URL released after `REVOKE_DELAY_MS`, so repeated exports do not
 * accumulate blobs indefinitely without risking a download that never starts.
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
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
