// Type surface for the contract reader the publisher and its tests share. The
// implementation is plain JavaScript; only the exported functions are described.
export declare const BENCHMARK_ID: string;
export declare const RECORD_SCHEMA_VERSION: number;
export declare const REPORT_SCHEMA_VERSION: string;

export declare function parseContract(source: string): Map<string, string>;
export declare function contractDigest(source: string): string;

export type BenchmarkContract = {
  readonly implementations: readonly string[];
  readonly gateBaseline: string;
  readonly gateCandidate: string;
  readonly gateMinimumRatio: number;
  readonly payloadSizes: readonly number[];
  readonly messages: number;
  readonly repeats: number;
  readonly warmups: number;
  readonly wireBytesBasis: string;
};

export declare function readContract(entries: Map<string, string>): BenchmarkContract;

/// The report fields publication compares against the contract, before validation.
export type ReportClaims = {
  readonly provenance?: { readonly schemaVersion?: string };
  readonly parameters?: Readonly<Record<string, string | number | readonly string[] | null>>;
};

export declare function assertReportMatchesContract(
  report: ReportClaims,
  contract: BenchmarkContract,
): void;
