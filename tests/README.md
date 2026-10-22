# Tests

The suite is deliberately small: 56 files and 509 tests, down from 160 files and
855 tests. It is organized by the evidence it produces, not by one file per
scenario. A behavior belongs to exactly one layer. If a case is already covered
by the conformance or Autobahn oracle, do not add a second unit test for it;
extend the owning table instead.

The shape is mostly integration and conformance evidence, with unit tests only
where a pure function or the native ABI is the behavior. That follows the common
critique of one-test-per-function suites: confidence comes from tests that
resemble how the library is used, not from a large count of narrow tests. See
[Martin Fowler on test shapes](https://martinfowler.com/articles/2021-test-shapes.html)
and [Kent C. Dodds on the testing trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications).

| Layer                    | Directory                           | What it proves                                                                                                            |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Compatibility oracle     | `tests/conformance/`                | ventiws and the pinned `ws` produce the same observable transcript for the same scenario.                                 |
| External protocol oracle | `tests/autobahn/`                   | RFC 6455 groups 1-7 and 9-13 pass through the Autobahn suite.                                                             |
| Facade edges             | `tests/compat/`                     | Argument handling, event ordering, close/permessage-deflate edges, and option normalization that the oracle does not pin. |
| Native boundary          | `tests/binding/`                    | Codec framing, handle/status mapping, lifetimes, capacity limits, addon loading, and the codec/engine artifact split.     |
| Tooling contract         | `tests/tooling/`                    | Versioning, changelog, release, publish, benchmark, lint, fork, and package-shape contracts.                              |
| Pure helpers             | `tests/protocol/`, `tests/logging/` | Small functions with no native or socket state.                                                                           |

## Rules

- Prefer one table-driven file per behavior over a directory of near-identical
  files. A new row in `test.each` is cheaper to review than a new file.
- Keep files at or below 150 lines. Split when the file has a second reason to
  change, not when it has one more case.
- Never weaken or skip an assertion to make room for a smaller suite.
- The following evidence is non-negotiable: close fires exactly once, close
  codes and reasons, masking, fragmentation, UTF-8 validation, `maxPayload` and
  frame limits, backpressure and `bufferedAmount`, upgrade/handshake behavior,
  `permessage-deflate` negotiation, native payload lifetime, stale handles,
  release/version/publish contracts, and the codec/engine artifact split.
- A test that only restates another layer's assertion should be deleted, with
  the owning layer named in the pull request.

## Running

```sh
pnpm test                         # all Vitest suites after building both addons
pnpm exec vitest run tests/compat # one layer
pnpm test:compat                  # the ws conformance layer
pnpm test:autobahn                # the external RFC 6455 gate
```
