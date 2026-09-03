# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.15.1 create --template minimal --types ts --add prettier eslint playwright tailwindcss="plugins:none" --install npm crimpy-frontend
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Releasing

Releases are cut from `dev`, with `main` acting as the promoted branch. Pushing
`main` publishes `krakoer/crimpy-frontend:edge`, which preproduction runs;
pushing a `vX.Y.Z` tag publishes `:vX.Y.Z` and `:latest`, which production runs.

```sh
# Fast-forward main to dev, which publishes :edge, then validate dev.crimpy.app
just preprod-release

# Bump package.json, tag the validated commit, push
just prod-release patch    # or minor, major, or an explicit 1.4.0
```

The stack selects the api, the migrate job and this frontend from one shared
`VERSION`, and the two repos are tagged on their own numbers, so `VERSION=vX.Y.Z`
only resolves when crimpy-backend carries the same tag. When it does not, leave
`VERSION` unset and let the stack take `:latest`, which a tag build publishes in
both repos. Krakoer/crimpy#56 tracks splitting that variable per image.

`prod-release` refuses to run until `main` and `dev` match, so a version can
only be tagged once preproduction has actually run it. The version comes from
the highest existing `vX.Y.Z` tag; `package.json` is written to match rather
than being the source of truth, since nothing at runtime reads it.

Both scripts show what they are about to push and ask for confirmation; pass
`-y` to skip the prompt.
