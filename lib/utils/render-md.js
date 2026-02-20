import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from '../paths.js';

const INCLUDE_PATTERN = /\{\{([^}]+\.md)\}\}/g;
const VARIABLE_PATTERN = /\{\{(datetime)\}\}/gi;

/**
 * Resolve built-in variables like {{datetime}}.
 * @param {string} content - Content with possible variable placeholders
 * @returns {string} Content with variables resolved
 */
function resolveVariables(content) {
  return content.replace(VARIABLE_PATTERN, (match, variable) => {
    switch (variable.toLowerCase()) {
      case 'datetime':
        return new Date().toISOString();
      default:
        return match;
    }
  });
}

/**
 * Render a markdown file, resolving {{filepath}} includes recursively
 * and {{datetime}} built-in variables.
 * Referenced file paths resolve relative to the project root.
 * @param {string} filePath - Absolute path to the markdown file
 * @param {string[]} [chain=[]] - Already-resolved file paths (for circular detection)
 * @returns {string} Rendered markdown content
 */
function render_md(filePath, chain = []) {
  const resolved = path.resolve(filePath);

  if (chain.includes(resolved)) {
    const cycle = [...chain, resolved].map((p) => path.relative(PROJECT_ROOT, p)).join(' -> ');
    console.log(`[render_md] Circular include detected: ${cycle}`);
    return '';
  }

  if (!fs.existsSync(resolved)) {
    return '';
  }

  const content = fs.readFileSync(resolved, 'utf8');
  const currentChain = [...chain, resolved];

  const withIncludes = content.replace(INCLUDE_PATTERN, (match, includePath) => {
    const includeResolved = path.resolve(PROJECT_ROOT, includePath.trim());
    if (!fs.existsSync(includeResolved)) {
      return match;
    }
    return render_md(includeResolved, currentChain);
  });

  return resolveVariables(withIncludes);
}

export { render_md };
