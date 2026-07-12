import { compareText } from "./paths.js";

export interface FeatureRootFact {
  readonly root: string;
}

export function sortFeatureRoots<T extends FeatureRootFact>(
  features: readonly T[],
): readonly T[] {
  return [...features].sort(
    (left, right) =>
      right.root.length - left.root.length || compareText(left.root, right.root),
  );
}

export function findFeatureOwner<T extends FeatureRootFact>(
  file: string,
  sortedFeatures: readonly T[],
): T | undefined {
  return sortedFeatures.find((feature) => file.startsWith(`${feature.root}/`));
}
