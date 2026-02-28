Audit recent auto-merged jobs and print the results to stdout so you get them via the GitHub notification email instead of having to open a browser:

1. `git log --since="24 hours ago" --grep="^job/" --format="%h %s"` → capture the list
2. For each commit, append the files changed (`git show --name-only <hash>`)
3. Finish with `echo "=== SUMMARY: <N> automated commits in last 24h ==="`
4. Exit 0

The whole report appears in the Actions log; GitHub will email you that stdout, no repo browsing required.