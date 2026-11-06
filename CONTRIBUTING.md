# Contributing

Thank you for helping. plantline is meant to stay small and easy to read: the simplest code that does the job, with a
test that proves it.

## Set up

You need Node.js 22 or later, pnpm 11 and the .NET 10 SDK.

```bash
cd web
pnpm install
pnpm cad    # builds the drawing reader (cad/) into public/cad
pnpm dev    # http://localhost:5173
```

## Before a pull request

In `web/`:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e    # end to end, on a desktop and a phone (after pnpm cad)
```

In `cad/`, when the reader changed:

```bash
dotnet test --project Plantline.Cad.Tests
```

CI runs all of them on every pull request.

## How we work

- **A user story first.** Say which story in [docs/user-stories.md](docs/user-stories.md) a change serves, or add one with
  its acceptance criteria.
- **Tests with the code.** Logic gets a unit test; a user flow gets an end-to-end test; the new test goes in
  [docs/test-cases.md](docs/test-cases.md).
- **Small and plain.** No new dependency without a clear need; prefer a few lines of our own. Comments explain why, not
  what.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(layout): …`, `fix(diagram): …`)
  and are signed off (`git commit -s`, the [Developer Certificate of Origin](https://developercertificate.org/)).

## Translations

Every message is in `web/src/i18n/locales/<code>.json`, with the same keys as `en.json`; a test fails when a language
misses a key or a `{{placeholder}}`.

- **Improve a translation:** edit its file. Use the terms engineers use in that language.
- **Add a message:** add it to all 14 files.
- **Add a language:** add `<code>.json` and its entry in `web/src/i18n/languages.ts` (its own name, and `rtl` if it is
  written right to left). Layout uses logical CSS properties, so right-to-left languages need no other change.

## Plant types and recognition rules

Plant types, their palettes and their recognition rules are in `web/src/plants.ts`. If your drawings name things
differently, a rule's pattern can include it, for example `table|tisch|mesa`.

## Sample drawings

The samples in `web/public/samples` are made up and written by `cad/Plantline.Cad.Samples`:

```bash
dotnet run --project cad/Plantline.Cad.Samples -- web/public/samples
```

**Never commit a real plant's drawing** unless its owner allows it to be public.

## Security

Report anything a hostile file could do privately: see [SECURITY.md](SECURITY.md).
