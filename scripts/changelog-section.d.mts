// Type surface for the changelog generator the bump and release scripts import.
export type SubjectGroup = readonly [heading: string, subjects: readonly string[]];

export declare function groupSubjects(subjects: readonly string[]): readonly SubjectGroup[];
export declare function changelogSection(
  root: string,
  version: string,
  marker: string,
): string | null;

export declare const git: (root: string, args: readonly string[]) => string | null;
