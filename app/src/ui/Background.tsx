/** The slowly drifting warm gradient and a few soft floating shapes. Pure CSS: only transform is animated. */
export function Background() {
  return (
    <div className="bg" aria-hidden="true">
      <div className="bg-wash" />
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <div className="blob b4" />
      <div className="ring r1" />
      <div className="ring r2" />
    </div>
  );
}
