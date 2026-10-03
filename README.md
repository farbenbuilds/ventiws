# ventiws benchmark history

This branch is the durable, machine-readable history for `echo-throughput-v2`.
See [the contract](contracts/CONTRACT-v2.md) for the guarantee and reproduction procedure.
`index.json` retains the active series; the table below shows the latest
100 runs. Earlier series stay as `index-<benchmark-id>.json`
beside the records.

## Latest results

Median round trips per second; the last column is the gate ratio.

| payload | ws | ventiws | ventiws-engine | uWebSockets.js | socket.io | ventiws vs ws |
| --- | --- | --- | --- | --- | --- | --- |
| 64 B | 55,072 | 53,030 | 17,299 | 61,520 | 22,418 | 0.963 |
| 1024 B | 50,699 | 49,999 | 16,803 | 57,402 | 21,406 | 0.986 |
| 16384 B | 23,760 | 27,960 | 12,195 | 31,593 | 13,525 | 1.177 |
| 32768 B | 14,283 | 18,039 | 9,351 | 18,368 | 9,452 | 1.263 |

## Recorded runs

| Recorded UTC | Commit | Median ratio vs ws | Worst row | Gate | Evidence |
| --- | --- | --- | --- | --- | --- |
| 2026-10-03T23:43:28.765Z | `33e2ab6c5f98` | 1.081 | 64 B | pass | [record](records/2026/37161839106-1-33e2ab6c5f98.json) |
