# fiber-dev-kit

Development tooling for running, inspecting, and testing CKB Fiber Network nodes.

The workspace contains four npm packages:

- [`@fiber-dev-kit/cli`](./cli): starts local Fiber nodes quickly from npm.
- [`@fiber-dev-kit/core`](./core): typed Fiber RPC client, diagnostics, alerts, and route confidence helpers.
- [`@fiber-dev-kit/test-client`](./test-client): programmable test helpers for payment and channel flows.
- [`@fiber-dev-kit/inspector`](./inspector): local dashboard for Fiber node health, channels, alerts, and payment traces.

## Release candidate publish order

Publish `core` first because `test-client` and `inspector` depend on it.

```bash
npm run build --workspaces --if-present
npm test --workspaces --if-present

npm publish --workspace @fiber-dev-kit/core --tag rc
npm publish --workspace @fiber-dev-kit/test-client --tag rc
npm publish --workspace @fiber-dev-kit/inspector --tag rc
```

Use the explicit `--tag rc` flag so prereleases do not become the default `latest` install. Install with:

```bash
npm install @fiber-dev-kit/core
npm install @fiber-dev-kit/test-client
npm install -g @fiber-dev-kit/inspector
```

## CLI

The CLI package currently publishes separately as `@fiber-dev-kit/cli`:

```bash
cd cli
npm publish --access public
```

Command docs:

- [`cli/docs/commands.md`](./cli/docs/commands.md)

## License

MIT
