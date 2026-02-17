# RallypointOne Dashboard

[![Deploy to GitHub Pages](https://github.com/RallypointOne/Dashboard/actions/workflows/deploy.yml/badge.svg)](https://github.com/RallypointOne/Dashboard/actions/workflows/deploy.yml)

A static dashboard that displays the status of all public repositories in the [RallypointOne](https://github.com/RallypointOne) GitHub organization.

**Live site:** [https://rallypointone.github.io/Dashboard/](https://rallypointone.github.io/Dashboard/)

## Features

- Dynamically fetches all public repos from the RallypointOne org via the GitHub API
- Shows per-repo: CI status, docs build status, latest release, issue counts (open/closed), docs site and coverage links
- Three views: **Table** (default), **Cards**, and **Compact**
- Filter by language and release status; sort by name, last pushed, or CI status
- Dark mode support via `prefers-color-scheme`
- Auto-refreshes every 5 minutes with session caching

## GitHub API Rate Limits

The dashboard uses unauthenticated GitHub API requests, which are limited to **60 requests per hour** per IP. A full dashboard load uses ~60 requests (1 for repos + ~20 each for workflows, releases, and issue counts).

If you hit the rate limit, wait for it to reset or reduce the number of repos by applying filters.

## Deployment

The site is deployed automatically to GitHub Pages via a GitHub Actions workflow on every push to `main`. No build step is required — the site is pure static HTML, CSS, and JavaScript.

## Development

Open `index.html` in a browser to run the site locally. No dependencies or build tools needed.
