# Logging

- **Format:** structured JSON logs in every service.
- **Request id:** generated at the web or API edge, propagated as `x-request-id` to the API, and stored on submissions and jobs.
- **Worker logs** carry `submission_id`, directory slug, and job id.
- **Levels:** `error` for a failed submission or crash, `warn` for recoverable surprises (challenge, retry, paused channel), `info` for state transitions, `debug` off in production.
- **Keep out of logs:** secrets, tokens, passwords, full third-party pages, and founder PII beyond ids.
- **Founder-visible failures** are also written as `submission_events` with a human-readable message.

## When a user reports a problem

1. Find the submission and its `submission_events`.
2. Take its request id or job id to the Railway logs of the API, then the worker service (`railway:use-railway`, or the Railway MCP `get-logs`).
3. A claimed job with no outcome is a crash: leave it for inspection.
