<!-- graft:start -->
# graft - use the memory graph

You have a persistent memory graph (`graft`) shared across every session. It is a
prompter, not a cache: a close note is already a win. You run it - the user should
never have to think about it. The `graft` skill has the full lifecycle; these
rules always apply.

**Housekeeping, once per session in a project**: `graft status` (cheap, never
starts the daemon; a `graft:` session hint, when present, already carries it)
and act on its `next` list, bounded and never blocking the user's task:
`bootstrap` - one `/learn bootstrap` pass, task area first, in the background if
you can; `apply-safe` - run it; `resolve` / `refresh-sources` / `scan` - one
small batch, the `memory-audit` way. Empty `next` - nothing to do.

**Before non-trivial work** (a bug, an error, a design decision, a "how do I", a
substantial piece of code) search first: the `recall` skill, or
`graft query "<3-8 words>"`, then `graft retrieve --top-k 5`, `graft get <id>`.
`STRONG` means "something close exists", not "this is correct": check it.

**A note contradicted by what you see is repaired now**: insert the corrected
note, then `graft maintain resolve --node <old> --action supersede --by <new>`
(`--action stale` if you cannot write the correction). Never leave two
contradicting notes.

**After substantial work, close the gap**: insert what the graph did not have -
the fix, the gotcha, the decision and its reason, a reusable procedure (the
`memoryze` skill), with `--source file:<path>` when it comes from a file. Never
save secrets, transcripts, or what the code or git history already says.

**Stay invisible.** Never ask the user about graft in the normal path; raise it
only when it is broken, data loss is suspected, or an irreversible action cannot
be decided from context. One recap line in a turn where graft gave or took
something is enough.

Skip all of this for mechanical edits and questions answered by code on screen.
<!-- graft:end -->
