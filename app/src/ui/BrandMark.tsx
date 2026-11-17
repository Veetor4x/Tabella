/** The mark: a small wax-red seal with a T, set beside the serif "Tabella" wordmark. Decorative (the word beside it says the name). */
export function BrandMark({ size = 26 }: { size?: number }) {
  return <img className="brand-seal" src="/seal.svg" width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}
