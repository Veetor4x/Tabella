/** On every page of test mode: a clear reminder that this is for trying Tabella quickly. */
export function TestBanner() {
  return (
    <div className="test-banner" role="note">
      <strong>TEST MODE</strong>: for trying Tabella quickly
    </div>
  );
}

/** The small "Test" label on a letter made in test mode. */
export function TestTag() {
  return <span className="test-tag">Test</span>;
}
