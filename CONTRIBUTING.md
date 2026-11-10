# Contributing to Ferret

Thanks for helping. Bugs and ideas are welcome as [GitHub issues](https://github.com/ferret-project/ferret/issues) or on
[Discord](https://discord.gg/XSkKyP2pdg). For a bigger change, open an issue first so we can agree on the approach before
you put the work in.

## Code

How to run Ferret locally, and where things live, is in the README's [Develop](README.md#develop) section. Before you
open a pull request:

```bash
pnpm typecheck
pnpm test
```

Keep pull requests to one change, and add or update tests for anything that changes the API.

## Translations

**Ferret is written in English, and this repository keeps English only.** Other languages live in
[ferret-translations](https://github.com/ferret-project/ferret-translations) and are made on
[Weblate](https://hosted.weblate.org/projects/ferret/), by the people who use them. Each language has its own
maintainers there. Ferret's maintainers keep up English and don't review languages they can't read. Pull requests that
add translations here won't be merged; please bring them to ferret-translations instead.

When you add text to the app, write it in English and wrap it so it can be translated:

```tsx
import { t, ph, plural } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

<h2><Trans>Shopping list</Trans></h2>
<input placeholder={t`e.g. Garage`} />
{plural(count, { one: "# thing", other: "# things" })}
```

- Whole sentences, not pieces glued together: translators need the full sentence to put the words in their order.
- Name placeholders: `` t`Moved to ${ph({ room: place.name })}` `` reads as `Moved to {room}` for translators.
- Counts go through `plural()` (or `<Plural>`), never `n === 1 ? "thing" : "things"`.
- Labels defined outside a component use `msg` and are shown with `t(label)`.

`pnpm test` fails on text that isn't wrapped. Ferret's CI sends the new English text to ferret-translations by itself,
and anything not translated yet shows in English.
