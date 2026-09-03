# Supervisor command channel

Version: 1

Wire boundary between the container broker and the plugin container
supervisor (lifecycle commands and receipts). Schema source of record:
`pnh/harness/plugin-container-supervisor.mjs` command surface and
`pnh/harness/plugin-container-supervisor.d.mts`. Field-layout documentation
lives here in a future revision; this stub exists to carry the version
declaration the registry pin enforces. Changes to accepted wire vocabulary,
encoding, authentication, or semantics require a `Version:` bump and matching
registry pin. Security-relevant implementation-source byte changes that
preserve those wire semantics require an owner-ratified binding amendment and
schema repin at the existing version; every listed schema source remains
hash-bound.
