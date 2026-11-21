# Repository workflow

- Make each change on a short-lived branch and open a pull request into `main`.
- Build release installers and APKs through GitHub Actions. After the release PR merges, tag the merged commit `vX.Y.Z` to trigger the Build workflow.
- For a stable release, verify the Windows installer, both macOS builds, and the signed Android APK in the draft before publishing it.
