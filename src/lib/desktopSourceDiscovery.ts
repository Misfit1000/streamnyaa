export type SourceDiscovery<T> = { items: T[]; complete: boolean };

/** A later empty/failed lane cannot overwrite successful earlier lanes. */
export class SourceAccumulator<T> {
  private values: T[] = [];
  private interrupted = false;
  constructor(private readonly merge: (items: T[]) => T[]) {}
  add(items: T[]) { this.values = this.merge([...this.values, ...items]); return this.values; }
  interrupt() { this.interrupted = true; }
  result(): SourceDiscovery<T> { return { items: [...this.values], complete: !this.interrupted }; }
}
