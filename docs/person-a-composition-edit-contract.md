# Person A Handoff: Removed Composition Edit Endpoint

This document is historical. It described a removed composition-source editing endpoint and
does not describe current Tinker behavior.

Current generated videos use the Testreel published-video pipeline. Completed jobs expose a
primary `published-video` artifact at `testreel/final.mp4`; they do not use the removed
composition-source editing endpoint or the old Playwright generated-video contract.

For the current request and result contract, see
[`docs/person-a-handoff-contract.md`](./person-a-handoff-contract.md).
