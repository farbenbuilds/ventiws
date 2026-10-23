import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import process from "node:process";

/// The two libc families the published Linux packages split on.
export type HostLibc = "gnu" | "musl";

/// Only Linux probes; every other platform answers gnu, which no off-Linux target reads.
export function hostLibc(): HostLibc {
  if (process.platform !== "linux") return "gnu";
  const declared = reportLibc();

  if (declared !== undefined) return declared;

  return probeMusl() ? "musl" : "gnu";
}

/// A report that does not answer defers to the probes; Bun's report is glibc-only.
function reportLibc(): HostLibc | undefined {
  const facts = reportFacts();

  if (facts === undefined) return undefined;

  if (facts.glibcVersionRuntime !== undefined) return "gnu";

  if (isMuslSharedObject(facts.sharedObjects)) return "musl";

  return undefined;
}

type NativeReport = {
  readonly header?: { readonly glibcVersionRuntime?: string };
  readonly sharedObjects?: readonly string[];
};

type ReportFacts = {
  glibcVersionRuntime?: string;
  sharedObjects?: readonly string[];
};

/// `getReport` is typed as a bare `object`, so the report's documented shape is asserted;
/// a build that answers with a string reads no fields and defers to the probes.
function reportFacts(): ReportFacts | undefined {
  try {
    // SAFETY: getReport returns the documented report object, or a string with no fields.
    return reportFactsOf(process.report.getReport() as NativeReport);
  } catch {
    return undefined;
  }
}

function reportFactsOf(report: NativeReport): ReportFacts {
  const facts: ReportFacts = {};
  const glibc = report.header?.glibcVersionRuntime;

  if (glibc !== undefined) facts.glibcVersionRuntime = glibc;
  const objects = report.sharedObjects;

  if (Array.isArray(objects)) facts.sharedObjects = objects;

  return facts;
}

function isMuslSharedObject(sharedObjects: readonly string[] | undefined): boolean {
  if (sharedObjects === undefined) return false;

  return sharedObjects.some((entry) => entry.includes("libc.musl-") || entry.includes("ld-musl-"));
}

/// The loader is the one signal a Bun/musl report does not carry; after it a readable
/// `ldd` names itself, then the command does, and a host that answers neither is gnu.
function probeMusl(): boolean {
  if (hasMuslLoader()) return true;

  try {
    return readFileSync("/usr/bin/ldd", "utf8").includes("musl");
  } catch {
    return probeLddVersion();
  }
}

function hasMuslLoader(): boolean {
  try {
    return readdirSync("/lib").some((entry) => entry.startsWith("ld-musl-"));
  } catch {
    return false;
  }
}

function probeLddVersion(): boolean {
  try {
    const output = execFileSync("ldd", ["--version"], { encoding: "utf8" });

    return output.includes("musl");
  } catch {
    return false;
  }
}
