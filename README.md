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
| 64 B | 36,204 | 29,824 | 8,181 | 41,691 | 9,003 | 0.824 |
| 1024 B | 31,526 | 26,925 | 8,005 | 36,928 | 8,724 | 0.854 |
| 16384 B | 12,067 | 13,232 | 5,741 | 16,432 | 6,070 | 1.097 |
| 32768 B | 7,213 | 8,624 | 4,505 | 8,735 | 4,465 | 1.196 |

## Recorded runs

| Recorded UTC | Commit | Median ratio vs ws | Worst row | Gate | Evidence |
| --- | --- | --- | --- | --- | --- |
| 2026-10-04T11:10:21.344Z | `3934e535cc3f` | 0.975 | 64 B | fail | [record](records/2026/37196025220-1-3934e535cc3f.json) |
| 2026-10-03T23:43:28.765Z | `33e2ab6c5f98` | 1.081 | 64 B | pass | [record](records/2026/37161839106-1-33e2ab6c5f98.json) |
