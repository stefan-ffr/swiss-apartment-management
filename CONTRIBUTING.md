# Contributing

Thank you for considering a contribution. This is an early-stage
project and the API surface is unstable until 0.1.0. Until then,
please open an issue before submitting larger PRs so we can align on
the direction.

## Development

```bash
git clone https://github.com/stefan-ffr/swiss-apartment-management.git
cd swiss-apartment-management
pnpm install
pnpm typecheck
pnpm build
```

## Code style

- TypeScript strict mode, no `any` without comment.
- `prettier` defaults (config tbd).
- Conventional Commits are encouraged (`feat:`, `fix:`, `chore:`).

## Adding a module

1. Copy `packages/modules/wohnungen/` as a template.
2. Replace name in `package.json`, `src/index.ts`, README.
3. Drop SQL files into `migrations/`.
4. Add the module key to `tenant.config.example.json#modules`.
5. Open a PR with the rationale and the contract you intend to
   honour.

## Reporting security issues

Please do **not** open public issues for security findings. Email
the maintainer (see `package.json#author`) with details.
