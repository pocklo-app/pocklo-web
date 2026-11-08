# Pocklo Web · 小兜

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 1.5.0.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

The development build uses the Django API at `http://localhost:8000`. Configure the backend and run `python manage.py migrate` before starting it. Production builds use the API origin in `src/environments/environment.prod.ts`.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `-prod` flag for a production build.

## GitHub Pages Deployment

The repo now includes a GitHub Pages workflow at `.github/workflows/deploy-pages.yml`.

Run this locally if you want to verify the Pages artifact:

```bash
npm run build:pages
```

That command will:

- Build the Angular app into `dist/disk-frontend`
- Copy `index.html` to `404.html` so SPA routes like `/res/xxxx` still work on GitHub Pages
- Create `.nojekyll` in the publish directory

Before the first GitHub deployment, make sure the repository is configured with:

- `Settings -> Pages -> Source`: `GitHub Actions`
- `Settings -> Pages -> Custom domain`: `pocklo.jyonn.space`

Set the `pocklo` CNAME in `jyonn.space` to `pocklo-app.github.io`. During the transition, keep the legacy site serving the same SPA at `d.6-79.cn` with the Pages variable `POCKLO_MOVE_UNTIL` set to the day after the last transition day, in YYYY-MM-DD (China time). Set the existing QiTianBu OAuth application callback to `https://pocklo.jyonn.space/oauth/qtb/callback` once the new site has working HTTPS.

If you want the workflow to auto-enable Pages for a brand new repository, create a secret named `PAGES_DEPLOY_TOKEN` and give that token permission to manage Pages for this repository. Without that secret, the first enablement still needs to be done once in GitHub Settings.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via [Protractor](http://www.protractortest.org/).

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).
