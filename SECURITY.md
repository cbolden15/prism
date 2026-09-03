# Security policy

Prism 0.1.0 is a developer preview. Security fixes are considered for the
current 0.1.x line; no older line is maintained.

## Report a vulnerability privately

Use GitHub private vulnerability reporting for suspected vulnerabilities:

1. Open this repository's Security tab.
2. Open Advisories.
3. Select Report a vulnerability and submit the private report.

Do not open a public issue for an unpatched vulnerability. Include the affected
version, impact, reproduction steps, and any suggested mitigation. Exclude
credentials, tokens, personal data, private URLs, and unrelated system data.

The project does not publish a response-time or remediation-time commitment for
the developer preview. A maintainer will use the private advisory to coordinate
validation, a fix, and disclosure when appropriate.

## Current boundaries

Project-plugin approval and digest checks bind identity and reviewed bytes; they
do not establish plugin safety. Local subprocess plugins inherit the launching
user's ambient host authority. Review
`docs/developer-preview/data-and-trust.md` before running plugins or disclosing
repository content to a provider.
