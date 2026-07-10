# fiber-dev-kit

Development tooling for running Fiber quickly.

The CLI package lives in [`cli/`](./cli):

```bash
cd cli
npm publish --access public
```

Published package name:

- `@fiber-dev-kit/cli`

Command docs:

- [`cli/docs/commands.md`](./cli/docs/commands.md) documents every `fiber` command, its usage, and what it does.

Workspace templates:

- [`core/`](./core) for `@fiber-dev-kit/core`
- [`test-client/`](./test-client) for `@fiber-dev-kit/test-client`

Those packages are templates only; their implementation is intentionally left
for their package owners.
