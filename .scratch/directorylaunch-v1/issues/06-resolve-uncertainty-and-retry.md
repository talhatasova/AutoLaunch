# 06: Resolve uncertainty and retry

**What to build:** An ambiguous post-click outcome is shown as unconfirmed; a clear pre-send failure can be explicitly retried.

**Blocked by:** 05: See an automatic submission progress

**Status:** ready-for-agent

- [ ] Unconfirmed submissions are never retried automatically.
- [ ] Only an eligible failed request can be retried by its owner.
- [ ] A second active request for the same product and directory is rejected.
