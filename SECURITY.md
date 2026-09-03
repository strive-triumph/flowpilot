# Security policy

## Scope

FlowPilot is a local-first MVP. It stores workflow input and output in a JSON file on the configured data directory and defaults to `127.0.0.1`. The current release has no user accounts or multi-tenant isolation.

## Safe deployment

- Keep `FLOWPILOT_HOST=127.0.0.1` for personal use.
- If a network listener is needed, place it behind an authenticated reverse proxy and TLS.
- Do not put API keys, private notes, or generated `data/` files into git issues or pull requests.
- Review the data directory before sharing a backup; it contains the full input and generated output.

## Reporting

Please open a private security report through the repository's GitHub Security tab when available. Include the affected version, operating system, deployment mode, reproduction steps, and impact. Redact private workflow content and credentials.
