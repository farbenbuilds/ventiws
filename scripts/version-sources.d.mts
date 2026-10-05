// Type surface for the version sources the release step rewrites. The implementation is
// plain JavaScript; only the exports are described.

export type VersionSource = {
  readonly path: string;
  readonly pattern: RegExp;
};

export declare const SOURCES: readonly VersionSource[];
