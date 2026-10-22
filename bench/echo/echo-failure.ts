import type { EchoClient } from "./echo-types.ts";

export type Failure = {
  readonly promise: Promise<never>;
  readonly reject: (error: Error) => void;
};

// `Promise.race` needs a pending promise that any wired error source can settle.
export const failureOf = (): Failure => {
  let reject: (error: Error) => void = () => undefined;

  const promise = new Promise<never>((_resolve, fail) => {
    reject = fail;
  });

  return { promise, reject };
};

// A client error during connect rejects this promise; a server or connection
// error reaches the same run through the shared failure channel.
export const waitForOpen = (client: EchoClient): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    client.onError(reject);
    client.onOpen(resolve);
  });
