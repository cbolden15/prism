# release-slug

This example implements the one project-plugin operation supported by the
0.1.0 CLI workflow. `slugify` converts a release title to a lower-case slug.

The plugin executes in a subprocess with ambient host authority. It is not a
sandbox. Read `index.mjs` before running the check or approval flow.
