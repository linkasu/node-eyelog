# SDK installation

Requires Node >=20 (CI: Node 22.22.2) and `curl` with HTTPS support on PATH
(Windows includes curl.exe). Runtime exports and Tobii behavior are unchanged.
The version and package licensing remain those of the current main branch.

## Pinned public artifact

- EyeLog 1.1.3.0, `https://github.com/linkasu/EyeLog/releases/download/1.1.3.0/Release.zip`
- Asset ID 467473707; 389225 bytes
- SHA256 `7d97bf05faf5688f7cabe79acdfbd78696ca989e86efb9a9e90bf301e2595d2d`
- Independently downloaded and hashed on 2026-10-30; matches GitHub's reported digest.

This pins observed public bytes, **not** a manufacturer signature or an immutable
release. A mismatch fails installation; do not update the pin automatically.
1.1.1.0 was not substituted: main already uses 1.1.3.0 for invariant-culture raw
gaze output. No downloaded executable or DLL is run by installation/tests.

## Boundaries and failure recovery

The CommonJS installer dynamically imports the default export of the exact
`@xhmikosr/decompress@11.1.4`. Download uses public HTTPS only, HTTPS redirects
only, up to five redirects, a 15-second connection/60-second total timeout and
a 1 MiB compressed size limit. Standard curl proxy environment variables work;
curl config files are disabled, and stderr is not logged (may contain proxy
credentials). No authenticated gh download or insecure fallback is used.

Size and SHA256 are checked before parsing. Entries are parsed without an output
directory, then validated before any file is written: a flat allowlist of five
required binaries plus optional EyeLog.pdb, nonempty regular files only, no links,
duplicates, directories, traversal, drive paths or alternate streams. ZIP has no
hardlink type; hardlinks are additionally rejected at the entry boundary. The
8 MiB extracted-size check occurs **after** parsing: the digest pin is the trust
boundary, not a general-purpose streaming ZIP-bomb defense.

Each install uses a unique same-filesystem staging directory and an exclusive
`.sdk-install-lock` directory. Concurrent or stale-lock installs fail closed.
Root symlink ancestors and symlink/junction/non-directory output are rejected.
This assumes the package directory is not writable by an adversarial concurrent
process; it does not defend against a privileged process replacing paths mid-run.

Only validated output is promoted. Initial promotion is one rename; replacing
existing `bin` is **two-step**, not whole-directory atomic: move old output to a
staging backup, then promote new output. Readers may briefly observe missing
`bin`. Run installation with the consumer stopped. Windows sharing/antivirus
locks can prevent rename; errors fail installation and trigger rollback when
the old output was moved. If rollback also fails, the error names the retained
`previous` backup. Stop and restore it manually after resolving the OS lock;
do not delete that recovery directory blindly. No automatic retry/recovery.

Cleanup errors fail the command even if new output is already installed. A hard
process termination/power loss cannot run cleanup and may leave a lock, staging
or backup. Inspect these and ensure no installer is running before manual
recovery/removal. Never automatically reclaim a possibly live install's lock.

## Verification and consumer integration

```
npm ci --ignore-scripts
npm run build
npm test
npm run test:provision
node download.js
npm audit
npm audit --omit=dev
```

Offline tests use tiny generated ZIPs; provisioning fetches only the pinned
public artifact. Windows CI also checks actual open-file sharing violations.
Physical Tobii and Windows execution of the SDK are **not tested** by these
installation checks.

Related: linkasu/linka.looks-electron#139 and #140. This change does not modify
or integrate the app. Its owner should pin `github:linkasu/node-eyelog#<exact
reviewed 40-character head SHA>` in the existing dependency declaration, regenerate
the lock using the app's npm 10 resolver, inspect the resolved SHA and dependency
graph, and run the app's Windows installation/build/hardware acceptance checks.
Account for all baseline changes since its old de549691 pin, particularly the
existing **GPL-3.0-or-later** licensing/third-party notices and newer raw-gaze SDK
and parsing behavior. This PR does not change or waive those terms. No package,
tag or release publication is needed or performed.
