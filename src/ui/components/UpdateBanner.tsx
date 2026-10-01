/**
 * Tells the person a new version of the app has downloaded. It never reloads by
 * itself: a reload would throw away a half-filled form, so the person chooses when.
 */
export function UpdateBanner({ onReload, onDismiss }: { onReload: () => void; onDismiss: () => void }) {
  return (
    <div role="status" className="banner banner--info update-banner">
      <p className="update-banner__text">A new version of IngCalc is ready.</p>
      <div className="update-banner__actions">
        <button type="button" className="btn btn--primary" onClick={onReload}>Reload</button>
        <button type="button" className="btn btn--secondary" onClick={onDismiss}>Later</button>
      </div>
    </div>
  );
}
