/** Pearl light with three very soft iridescent streaks drifting slowly. A matching night layer fades in over it. */
export function Background() {
  return (
    <div className="bg" aria-hidden="true">
      <div className="streak s1" />
      <div className="streak s2" />
      <div className="streak s3" />
      <div className="bg-night">
        <div className="streak n1" />
        <div className="streak n2" />
      </div>
    </div>
  );
}
