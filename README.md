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
| 64 B | 54,760 | 52,055 | 19,604 | 61,197 | 21,583 | 0.951 |
| 1024 B | 49,883 | 47,419 | 19,466 | 57,314 | 21,475 | 0.951 |
| 16384 B | 23,324 | 27,226 | 13,323 | 31,539 | 13,168 | 1.167 |
| 32768 B | 14,413 | 17,265 | 9,671 | 16,237 | 9,168 | 1.198 |

## Recorded runs

| Recorded UTC | Commit | Median ratio vs ws | Worst row | Gate | Evidence |
| --- | --- | --- | --- | --- | --- |
| 2026-10-06T11:37:13.384Z | `3f84ca5d2144` | 1.059 | 64 B | pass | [record](records/2026/37455799609-1-3f84ca5d2144.json) |
| 2026-10-06T07:48:31.257Z | `8aa0fa99f4b9` | 0.998 | 64 B | fail | [record](records/2026/37428759300-1-8aa0fa99f4b9.json) |
| 2026-10-06T04:16:38.301Z | `2bcc3fed5032` | 1.085 | 64 B | pass | [record](records/2026/37411204448-1-2bcc3fed5032.json) |
| 2026-10-05T11:59:18.466Z | `3934e535cc3f` | 1.080 | 64 B | pass | [record](records/2026/37304097047-1-3934e535cc3f.json) |
| 2026-10-04T11:10:21.344Z | `3934e535cc3f` | 0.975 | 64 B | fail | [record](records/2026/37196025220-1-3934e535cc3f.json) |
| 2026-10-03T23:43:28.765Z | `33e2ab6c5f98` | 1.081 | 64 B | pass | [record](records/2026/37161839106-1-33e2ab6c5f98.json) |
