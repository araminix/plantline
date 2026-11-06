# Security

plantline opens files that may come from anyone: drawings (DWG, DXF) and diagram files. A file that makes the app
crash, hang, show something false, run code or leak data is a security problem.

## Reporting

Please report it privately through
[GitHub's private vulnerability reporting](https://github.com/araminix/plantline/security/advisories/new), not in a
public issue. Include the file (or how to make it) and what happens. You will get an answer within a week.

## Supported versions

The latest release and the `main` branch, which is what https://araminix.github.io/plantline/ runs.

## How the app protects you

- Drawings are read in a worker of their own, ended after each file, with a size limit (100 MB), a time limit
  (2 minutes), a nesting limit (8 block levels) and an item limit (500,000).
- Diagram files are validated field by field and size-limited; anything unexpected is refused.
- Nothing is uploaded: there is no server. Map tiles are the only outside requests.
- A Content Security Policy blocks scripts and connections from anywhere but the site.
- CSV exports cannot run as spreadsheet formulas.
- Dependencies are few and pinned; new releases are installed only after 7 days; GitHub Actions are pinned to commits.

The details are in [docs/architecture.md](docs/architecture.md#security-model).
