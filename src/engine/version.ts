/** Compares dotted numeric versions ("1.4.2" vs "1.4.0"), ignoring any pre-release suffix. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .split(/[-+]/)[0]
      ?.split(".")
      .map((n) => Number(n) || 0) ?? [];
  const [pa, pb] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}
