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
| 64 B | 49,824 | 45,785 | 16,902 | 55,741 | 17,817 | 0.919 |
| 1024 B | 43,672 | 41,977 | 15,853 | 50,497 | 17,060 | 0.961 |
| 16384 B | 16,271 | 18,484 | 9,733 | 22,574 | 10,102 | 1.136 |
| 32768 B | 9,401 | 12,029 | 6,858 | 13,585 | 6,853 | 1.280 |

## Recorded runs

| Recorded UTC | Commit | Median ratio vs ws | Worst row | Gate | Evidence |
| --- | --- | --- | --- | --- | --- |
| 2026-10-17T08:59:23.624Z | `8a7dfd271b2e` | 1.049 | 64 B | pass | [record](records/2026/39018120229-1-8a7dfd271b2e.json) |
| 2026-10-16T09:29:04.734Z | `8a7dfd271b2e` | 1.012 | 64 B | fail | [record](records/2026/38878094064-1-8a7dfd271b2e.json) |
| 2026-10-15T09:39:40.555Z | `8a7dfd271b2e` | 0.975 | 64 B | fail | [record](records/2026/38711268083-1-8a7dfd271b2e.json) |
| 2026-10-14T10:02:56.350Z | `8a7dfd271b2e` | 1.006 | 64 B | fail | [record](records/2026/38543452233-1-8a7dfd271b2e.json) |
| 2026-10-13T12:22:02.152Z | `8a7dfd271b2e` | 0.994 | 64 B | fail | [record](records/2026/38393479987-1-8a7dfd271b2e.json) |
| 2026-10-12T12:30:39.599Z | `8a7dfd271b2e` | 1.083 | 64 B | pass | [record](records/2026/38247227011-1-8a7dfd271b2e.json) |
| 2026-10-11T11:21:03.608Z | `8a7dfd271b2e` | 0.982 | 64 B | fail | [record](records/2026/38133563082-1-8a7dfd271b2e.json) |
| 2026-10-06T11:37:13.384Z | `3f84ca5d2144` | 1.059 | 64 B | pass | [record](records/2026/37455799609-1-3f84ca5d2144.json) |
| 2026-10-06T07:48:31.257Z | `8aa0fa99f4b9` | 0.998 | 64 B | fail | [record](records/2026/37428759300-1-8aa0fa99f4b9.json) |
| 2026-10-06T04:16:38.301Z | `2bcc3fed5032` | 1.085 | 64 B | pass | [record](records/2026/37411204448-1-2bcc3fed5032.json) |
| 2026-10-05T11:59:18.466Z | `3934e535cc3f` | 1.080 | 64 B | pass | [record](records/2026/37304097047-1-3934e535cc3f.json) |
| 2026-10-04T11:10:21.344Z | `3934e535cc3f` | 0.975 | 64 B | fail | [record](records/2026/37196025220-1-3934e535cc3f.json) |
| 2026-10-03T23:43:28.765Z | `33e2ab6c5f98` | 1.081 | 64 B | pass | [record](records/2026/37161839106-1-33e2ab6c5f98.json) |
