import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Changing this clears the error — navigating away must not stay broken. */
  resetKey: string;
  onReset: () => void;
  children: ReactNode;
}

interface State {
  failed: boolean;
  resetKey: string;
}

/**
 * The one class component in the codebase: React offers no hook equivalent.
 *
 * Without this, a single malformed stored row takes the whole app down with a
 * blank screen — and Log, which is the landing tab, is entirely derived sums
 * over stored rows. Kitchen is the only screen that can delete a bad row, so
 * the failure would also remove the route to its own fix.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State;

  constructor(props: Props) {
    super(props);
    this.state = { failed: false, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey === state.resetKey) return null;
    return { failed: false, resetKey: props.resetKey };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The only record of what actually broke. Matches the wrapped-write
    // convention: the user gets a readable message, the console gets the truth.
    console.error('A screen failed to render', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="screen">
        <p role="alert" className="banner banner--warn">
          Something on this screen could not be shown. This usually means one saved
          row is malformed — the rest of your data is fine.
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={this.props.onReset}>
            Back to the Log
          </button>
        </div>
      </div>
    );
  }
}
