# Working on this repository

Two rules:

1. **Every commit is authored by a team member:** PAZZO123 or uwinezagloria. The allowed emails
   are in [.github/allowed-authors.txt](.github/allowed-authors.txt). Nobody else, AI tools
   included, is listed as an author or co-author. AI use is disclosed in
   [docs/AI_USE.md](docs/AI_USE.md) instead, as the hackathon rules require.
2. **Changes reach `main` through pull requests**, and either of us can merge them. Every merge
   to `main` redeploys the app.

## One-time setup in your clone

```bash
git clone https://github.com/PAZZO123/yieldgap-rwanda.git
cd yieldgap-rwanda
git config user.name "uwinezagloria"
git config user.email "gloria7wineza@gmail.com"
git config core.hooksPath .githooks
```

Use your own name and email in the two `user.*` lines. The last line turns on the hooks in
`.githooks/`, which refuse a commit before it is made if the author or a `Co-authored-by:` line
is not on the allowed list. Hooks need Python 3.

## Making a change

```bash
git switch main
git pull
git switch -c short-description-of-change
# ...edit, then:
git add -A
git commit -m "Say what changed"
git push -u origin short-description-of-change
```

Then open the pull request: GitHub shows a **Compare & pull request** button, or go to
`https://github.com/PAZZO123/yieldgap-rwanda/compare/main...short-description-of-change`.
Fill in the template. The **Checks** workflow then runs:

- **Commit authors:** every commit in the PR is by a team member, with no outside co-authors.
- **Code checks:** the Python scripts compile and the app's JavaScript parses.

When both are green, either of us clicks **Merge pull request**. Ideally the teammate who didn't
write it looks first. Afterwards, delete the branch and `git switch main && git pull`.

On this Windows PC, `git push` and `git pull` need the Windows certificate store:
`git -c http.sslBackend=schannel push`.

## Protecting `main` (GitHub settings, once, by the repo owner)

- **Settings → Collaborators → Add people → `uwinezagloria`** (Write access), so Gloria can
  push branches and merge.
- **Settings → Branches → Add branch ruleset** (or *branch protection rule*) for `main`:
  - Require a pull request before merging. Set required approvals to 0 so either of us can merge
    alone near the deadline, or 1 if every PR should be reviewed by the other person.
  - Require status checks to pass: **Commit authors** and **Code checks**.
  - Block force pushes.
- **Settings → Pages → Source: GitHub Actions** (already needed for the app).
