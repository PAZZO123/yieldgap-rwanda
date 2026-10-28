"""Check that commits are authored only by the two team members.

Allowed emails are listed in .github/allowed-authors.txt. A commit fails if its author email,
or any Co-authored-by trailer, is not on that list.

Usage:
  python tools/check_commits.py --author             current author (pre-commit hook)
  python tools/check_commits.py --message FILE       co-author trailers in a message (commit-msg hook)
  python tools/check_commits.py --range BASE..HEAD   every commit in a range (CI)
"""
import argparse
import fnmatch
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALLOWED_FILE = ROOT / ".github" / "allowed-authors.txt"
TRAILER = re.compile(r"^co-authored-by:.*<([^>]+)>", re.IGNORECASE | re.MULTILINE)
HELP = (
    "Only the team's identities may author commits in this repository (see .github/allowed-authors.txt).\n"
    "Set yours in this clone, e.g.:\n"
    '  git config user.name "PAZZO123"\n'
    '  git config user.email "smbabazipatrick@gmail.com"'
)


def allowed_patterns():
    lines = ALLOWED_FILE.read_text(encoding="utf-8").splitlines()
    return [ln.strip().lower() for ln in lines if ln.strip() and not ln.lstrip().startswith("#")]


def is_allowed(email, patterns):
    email = email.strip().lower()
    return any(fnmatch.fnmatchcase(email, p) for p in patterns)


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def problems_in_message(message, patterns):
    return [f"co-author {email} is not a team member" for email in TRAILER.findall(message)
            if not is_allowed(email, patterns)]


def check_author(patterns):
    ident = git("var", "GIT_AUTHOR_IDENT")
    email = ident[ident.find("<") + 1: ident.find(">")]
    return [] if is_allowed(email, patterns) else [f"author {email or '(none)'} is not a team member"]


def check_range(rev_range, patterns):
    problems = []
    log = git("log", "--format=%H%x1f%an%x1f%ae%x1f%B%x1e", rev_range)
    for entry in filter(str.strip, log.split("\x1e")):
        sha, name, email, body = entry.strip("\n").split("\x1f", 3)
        found = [] if is_allowed(email, patterns) else [f"author {name} <{email}> is not a team member"]
        found += problems_in_message(body, patterns)
        problems += [f"{sha[:7]}: {p}" for p in found]
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--author", action="store_true")
    group.add_argument("--message", metavar="FILE")
    group.add_argument("--range", metavar="BASE..HEAD")
    args = parser.parse_args()

    patterns = allowed_patterns()
    if args.author:
        problems = check_author(patterns)
    elif args.message:
        problems = problems_in_message(Path(args.message).read_text(encoding="utf-8", errors="replace"), patterns)
    else:
        problems = check_range(args.range, patterns)

    if problems:
        print("Commit authorship check failed:", *(f"  - {p}" for p in problems), "", HELP, sep="\n", file=sys.stderr)
        return 1
    if args.range:
        print(f"All commits in {args.range} are authored by team members.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
