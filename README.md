# RallypointOne Dashboard

[![Deploy to GitHub Pages](https://github.com/RallypointOne/Dashboard/actions/workflows/deploy.yml/badge.svg)](https://github.com/RallypointOne/Dashboard/actions/workflows/deploy.yml)

A static dashboard for monitoring all public repositories in the [RallypointOne](https://github.com/RallypointOne) GitHub organization.

**Live site:** [https://rallypointone.github.io/Dashboard/](https://rallypointone.github.io/Dashboard/)

## Features

- CI and Docs workflow status with mini bar-chart timelines (last 15 runs)
- Latest release info (GitHub Releases + Julia General registry)
- Pending Julia package registration detection
- Open/closed issue counts
- Links to docs sites and Codecov coverage
- Three views: **Table** (default), **Cards**, and **Compact**
- Filter by release status; sort by name, last pushed, or CI status
- Repos grouped into **Julia Packages** and **Other** sections
- Dark mode via `prefers-color-scheme`

## How It Works

A build script (`scripts/build-data.js`) fetches data from the GitHub API using a `GITHUB_TOKEN` and writes everything to `data.json`. The front end is vanilla HTML/CSS/JS that reads `data.json` — no frameworks or build tools.

A GitHub Actions workflow runs the build and deploys to GitHub Pages on every push to `main` and hourly on a cron schedule.

## Excluding Repositories

To exclude a repository from the dashboard, add the **`no-dashboard`** topic to it on GitHub (repo page > gear icon next to "About" > Topics). Repos with this topic are filtered out during the data build step.

## Development

To run locally, generate `data.json` then open `index.html`:

```sh
GITHUB_TOKEN=ghp_... node scripts/build-data.js
open index.html
```
