# ventiws benchmark history

This branch is the durable, machine-readable history for `echo-throughput-v2`.
See [the contract](contracts/CONTRACT-v2-ef594e1020da8b0020af23222d06e8e375d733fe958c5861b728b887f0fbb78f.md) for the guarantee and reproduction procedure.
`index.json` retains the active series; the table below shows the latest
100 runs. Earlier series stay as `index-<benchmark-id>.json`
beside the records.

## Latest results

Median round trips per second; the last column is the gate ratio.

| payload | ws | ventiws | ventiws-engine | uWebSockets.js | socket.io | ventiws vs ws |
| --- | --- | --- | --- | --- | --- | --- |
| 64 B | 48,157 | 45,300 | 16,360 | 54,481 | 17,006 | 0.941 |
| 1024 B | 42,370 | 40,973 | 15,485 | 49,635 | 16,160 | 0.967 |
| 16384 B | 15,942 | 19,129 | 9,370 | 22,292 | 9,700 | 1.200 |
| 32768 B | 9,311 | 11,609 | 6,668 | 12,525 | 6,601 | 1.247 |

## Recorded runs

| Recorded UTC | Commit | Median ratio vs ws | Worst row | Gate | Evidence |
| --- | --- | --- | --- | --- | --- |
| 2026-10-12T12:30:39.599Z | `8a7dfd271b2e` | 1.083 | 64 B | pass | [record](records/2026/38247227011-1-8a7dfd271b2e.json) |
| 2026-10-11T11:21:03.608Z | `8a7dfd271b2e` | 0.982 | 64 B | fail | [record](records/2026/38133563082-1-8a7dfd271b2e.json) |
| 2026-10-06T11:37:13.384Z | `3f84ca5d2144` | 1.059 | 64 B | pass | [record](records/2026/37455799609-1-3f84ca5d2144.json) |
| 2026-10-06T07:48:31.257Z | `8aa0fa99f4b9` | 0.998 | 64 B | fail | [record](records/2026/37428759300-1-8aa0fa99f4b9.json) |
| 2026-10-06T04:16:38.301Z | `2bcc3fed5032` | 1.085 | 64 B | pass | [record](records/2026/37411204448-1-2bcc3fed5032.json) |
| 2026-10-05T11:59:18.466Z | `3934e535cc3f` | 1.080 | 64 B | pass | [record](records/2026/37304097047-1-3934e535cc3f.json) |
| 2026-10-04T11:10:21.344Z | `3934e535cc3f` | 0.975 | 64 B | fail | [record](records/2026/37196025220-1-3934e535cc3f.json) |
| 2026-10-03T23:43:28.765Z | `33e2ab6c5f98` | 1.081 | 64 B | pass | [record](records/2026/37161839106-1-33e2ab6c5f98.json) |
