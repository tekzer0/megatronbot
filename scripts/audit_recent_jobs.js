#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', shell: '/bin/bash' }).trim();
}

// 1. Get commits from the last 24 hours whose message starts with "job/"
const commitsRaw = run(`git log --since="24 hours ago" --grep="^job/" --format="%h %s %an"`);
if (!commitsRaw) {
  process.stdout.write('No job commits in the last 24 hours.\n');
  process.exit(0);
}

const commits = commitsRaw.split('\n').map(line => {
  const [hash, ...rest] = line.split(' ');
  const messageAndAuthor = rest.join(' ');
  const lastSpace = messageAndAuthor.lastIndexOf(' ');
  return {
    hash,
    message: messageAndAuthor.slice(0, lastSpace),
    author: messageAndAuthor.slice(lastSpace + 1)
  };
});

// Build markdown report
let md = '# Recent Auto-Merged Job Commits\n\n';
md += `Generated on: ${new Date().toISOString()}\n\n`;

for (const c of commits) {
  md += `## ${c.hash} – ${c.message}\n`;
  md += `**Author:** ${c.author}\n\n`;
  const files = run(`git show --name-only ${c.hash}`).split('\n').filter(Boolean);
  md += '**Files changed:**\n';
  for (const file of files) {
    md += `- \`${file}\`\n`;
  }
  md += '\n';
}

const outFile = path.resolve(process.cwd(), 'docs/audit_recent_jobs.md');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, md, 'utf8');

// 4. One-line summary to stdout
process.stdout.write(`Audit complete: ${commits.length} job commit(s) written to ${outFile}\n`);
