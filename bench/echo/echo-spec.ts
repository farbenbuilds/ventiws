import type { EchoConfig } from "./echo-types.ts";
import { isImplementationId } from "./echo-types.ts";
import type { JsonObject, JsonValue } from "../support/json-value.ts";
import { isJsonObject, isPositiveInteger, isText } from "../support/json-value.ts";

const readText = (record: JsonObject, key: string): string => {
  const value = record[key];

  if (!isText(value)) throw new Error(`bench spec field "${key}" is missing`);

  return value;
};

const readCount = (record: JsonObject, key: string): number => {
  const value = record[key];

  if (!isPositiveInteger(value)) {
    throw new Error(`bench spec field "${key}" is not a positive integer`);
  }

  return value;
};

// The spec arrives over the environment, which is a trust boundary like any other
// input: it is decoded and narrowed before it reaches the measurement.
export const decodeEchoConfig = (raw: string): EchoConfig => {
  const parsed: JsonValue = JSON.parse(raw);

  if (!isJsonObject(parsed)) throw new Error("bench spec is not an object");
  const id = readText(parsed, "implementation");

  if (!isImplementationId(id)) throw new Error(`unknown implementation "${id}"`);

  return {
    implementation: id,
    payloadBytes: readCount(parsed, "payloadBytes"),
    messages: readCount(parsed, "messages"),
    timeoutMs: readCount(parsed, "timeoutMs"),
  };
};
