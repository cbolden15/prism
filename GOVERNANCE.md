# Governance

Prism currently uses a single-maintainer model. Caleb Bolden (`@cbolden15`) is
the project lead and release maintainer. Contributors shape the project through
issues, design discussion, pull requests, and review evidence.

## How decisions are made

Small fixes are decided in their pull requests. A change to public APIs,
package scope, compatibility, retained data, plugin authority, or release
evidence needs a written issue, design note, or decision record before merge.
The maintainer is responsible for the final decision and should record the
reason when reasonable contributors disagree.

Decisions favor, in order:

1. user safety and truthful boundary descriptions;
2. reproducible behavior and evidence;
3. a small, coherent public API;
4. contributor and maintainer cost.

The project may revisit a decision when new evidence changes its assumptions.
Historical records stay in the repository so later contributors can understand
the change.

## Contributions and review

Anyone may open an issue or pull request. Merge authority stays with the
maintainer. Review considers behavior, tests, documentation, compatibility,
security boundaries, and package impact. A contributor should disclose copied
code, generated material, new dependencies, and any verification that could
not be completed.

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for the local workflow and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for participation rules. Security
reports use the private route in [SECURITY.md](SECURITY.md).

## Releases

The release maintainer chooses the version, confirms the tested source commit,
reviews candidate packages and legal files, and starts publication only after
the release gates pass. The exact candidate artifacts, checksums, provenance,
and release notes are part of the release decision.

The current 0.1.x line is a developer preview. Breaking changes should be
called out in [CHANGELOG.md](CHANGELOG.md) and the release notes. A formal
deprecation policy will be adopted before the project makes stable
compatibility commitments.

## Changing this model

If regular maintainer capacity grows, this file should be amended to name the
new roles, their decision scope, how they are selected or removed, and how an
appeal or recusal works. Governance changes use the same public review process
as other project-wide decisions.
