# Contributing

Thanks for helping. A few rules keep the engine small, fast and predictable.

## Before you open a pull request

```sh
npm install
npm run check   # typecheck sources and tests, run the tests, build the library
```

CI runs the same command; a pull request must pass it.

## Code

- **TypeScript, strict.** No `any` without a comment saying why.
- **One class or module per file**, named after what it exports; keep files under ~300 lines.
- **Pure where possible.** Logic that needs no Pixi or DOM (maths, ECS, movement, codecs) lives apart from what draws,
  and gets unit tests under node (`src/**/*.test.ts`, `node:test` + `node:assert`).
- **Public API is `src/index.ts`.** Anything not exported there is internal. Adding to it is a feature; changing or
  removing something in it is a breaking change and goes in `CHANGELOG.md`.
- **Follow the performance rules** in [the architecture guide](docs/guide/architecture.md): whole world pixels, pooled
  textures, no long jobs inside a frame, guarded steps.
- **Comments say why**, not what. A number that came from measuring says what was measured.
- **Determinism:** never read the clock, `Math.random` or the frame rate inside `net/movement.ts` or a `fixed` system
  meant to match a server.

## Commits and changelog

Write commit messages in the imperative ("Add a gamepad source"). Add a line under `## Unreleased` in
`CHANGELOG.md` for anything a user of the package would notice.

## Releasing

Move `## Unreleased` under a new version heading, run `npm version <version> --no-git-tag-version`, commit, then tag
`v<version>` and push the tag: `.github/workflows/publish.yml` checks and publishes it to npm (Trusted Publishing, no
token). A tag already pushed is published again from Actions → Publish → Run workflow.

## Reporting bugs

Open an issue with the engine version, browser and device, what you expected, what happened, and the smallest code
that shows it.
