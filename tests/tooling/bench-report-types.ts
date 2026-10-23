type MeasuredLeg = {
  readonly samples: readonly number[];
  readonly medianSeconds: number;
  readonly medianRoundTripsPerSecond: number;
  readonly medianWireBytesPerSecond: number;
  readonly spread: number;
  readonly reason: string | null;
};

type BenchProvenance = {
  readonly schemaVersion: string;
  readonly nodeVersion: string;
  readonly nodeAbi: string;
  readonly pnpmVersion: string;
  readonly zigVersion: string;
  readonly lockfileSha256: string;
  readonly ventiwsVersion: string;
  readonly wsVersion: string;
  readonly uwebSocketsVersion: string;
  readonly socketIoVersion: string;
  readonly socketIoClientVersion: string;
  readonly cpuModel: string;
  readonly cpuCount: number;
  readonly totalMemoryBytes: number;
};

type BenchParameters = {
  readonly payloadSizes: readonly number[];
  readonly messages: number;
  readonly repeats: number;
  readonly warmupRepeatsDiscarded: number;
  readonly implementations: readonly string[];
  readonly gateBaseline: string;
  readonly gateCandidate: string;
  readonly gateMinimumRatio: number;
  readonly wireBytesBasis: string;
};

type BenchConfiguration = {
  readonly payloadBytes: number;
  readonly legs: Readonly<Record<string, MeasuredLeg>>;
};

export type ReportFixture = {
  readonly provenance: BenchProvenance;
  readonly parameters: BenchParameters;
  readonly configurations: readonly BenchConfiguration[];
  readonly gate: { readonly failed: boolean };
};
