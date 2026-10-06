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
| 64 B | 49,185 | 46,298 | 14,097 | 55,145 | 17,082 | 0.941 |
| 1024 B | 43,520 | 42,481 | 13,414 | 49,921 | 16,399 | 0.976 |
| 16384 B | 16,146 | 19,285 | 8,637 | 22,613 | 9,613 | 1.194 |
| 32768 B | 9,360 | 11,573 | 6,265 | 12,379 | 6,691 | 1.236 |

## Recorded runs

| Recorded UTC | Commit | Median ratio vs ws | Worst row | Gate | Evidence |
| --- | --- | --- | --- | --- | --- |
| 2026-10-06T04:16:38.301Z | `2bcc3fed5032` | 1.085 | 64 B | pass | [record](records/2026/37411204448-1-2bcc3fed5032.json) |
| 2026-10-05T11:59:18.466Z | `3934e535cc3f` | 1.080 | 64 B | pass | [record](records/2026/37304097047-1-3934e535cc3f.json) |
| 2026-10-04T11:10:21.344Z | `3934e535cc3f` | 0.975 | 64 B | fail | [record](records/2026/37196025220-1-3934e535cc3f.json) |
| 2026-10-03T23:43:28.765Z | `33e2ab6c5f98` | 1.081 | 64 B | pass | [record](records/2026/37161839106-1-33e2ab6c5f98.json) |
