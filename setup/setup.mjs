#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';
import { readFileSync, existsSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import inquirer from 'inquirer';

import {
  checkPrerequisites,
  runGhAuth,
} from './lib/prerequisites.mjs';
import {
  promptForPAT,
  promptForProvider,
  promptForModel,
  promptForApiKey,
  promptForOptionalKey,
  promptForCustomProvider,
  promptForBraveKey,
  confirm,
  pressEnter,
  maskSecret,
} from './lib/prompts.mjs';
import { PROVIDERS } from './lib/providers.mjs';
import {
  validatePAT,
  checkPATScopes,
  setSecrets,
  setVariables,
  generateWebhookSecret,
  getPATCreationURL,
} from './lib/github.mjs';
import {
  writeEnvFile,
  updateEnvVariable,
  writeModelsJson,
  encodeSecretsBase64,
  encodeLlmSecretsBase64,
} from './lib/auth.mjs';

const logo = `
 _____ _          ____                  ____        _
|_   _| |__   ___|  _ \\ ___  _ __   ___| __ )  ___ | |_
  | | | '_ \\ / _ \\ |_) / _ \\| '_ \\ / _ \\  _ \\ / _ \\| __|
  | | | | | |  __/  __/ (_) | |_) |  __/ |_) | (_) | |_
  |_| |_| |_|\\___|_|   \\___/| .__/ \\___|____/ \\___/ \\__|
                            |_|
`;

function printHeader() {
  console.log(chalk.cyan(logo));
  console.log(chalk.bold('Interactive Setup Wizard\n'));
}

function printStep(step, total, title) {
  console.log(chalk.bold.blue(`\n[${step}/${total}] ${title}\n`));
}

function printSuccess(message) {
  console.log(chalk.green('  \u2713 ') + message);
}

function printWarning(message) {
  console.log(chalk.yellow('  \u26a0 ') + message);
}

function printError(message) {
  console.log(chalk.red('  \u2717 ') + message);
}

function printInfo(message) {
  console.log(chalk.dim('  \u2192 ') + message);
}

/**
 * Parse .env file and return object, or null if no .env exists
 */
function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return null;
  }
  const content = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim();
    }
  }
  return env;
}

async function main() {
  printHeader();

  const TOTAL_STEPS = 7;
  let currentStep = 0;

  // Load existing .env for re-run detection
  const env = loadEnvFile();
  const isRerun = env !== null;

  if (isRerun) {
    console.log(chalk.dim('  Existing .env detected \u2014 previously configured values can be skipped.\n'));
  }

  // Collected values
  let pat = null;
  let agentProvider = null;
  let agentModel = null;
  const collectedKeys = {};
  let braveKey = null;
  let openaiBaseUrl = null;
  let webhookSecret = null;
  let owner = null;
  let repo = null;

  // Track what changed for selective .env updates and GitHub secrets
  let credentialsChanged = false;
  const changedVars = {};

  // Step 1: Prerequisites Check
  printStep(++currentStep, TOTAL_STEPS, 'Checking prerequisites');

  const spinner = ora('Checking system requirements...').start();
  const prereqs = await checkPrerequisites();
  spinner.stop();

  // Node.js
  if (prereqs.node.ok) {
    printSuccess(`Node.js ${prereqs.node.version}`);
  } else if (prereqs.node.installed) {
    printError(`Node.js ${prereqs.node.version} (need >= 18)`);
    console.log(chalk.red('\n  Please upgrade Node.js to version 18 or higher.'));
    process.exit(1);
  } else {
    printError('Node.js not found');
    console.log(chalk.red('\n  Please install Node.js 18+: https://nodejs.org'));
    process.exit(1);
  }

  // Package manager
  if (prereqs.packageManager.installed) {
    printSuccess(`Package manager: ${prereqs.packageManager.name}`);
  } else {
    printError('No package manager found (need pnpm or npm)');
    process.exit(1);
  }

  // Git
  if (!prereqs.git.installed) {
    printError('Git not found');
    process.exit(1);
  }
  printSuccess('Git installed');

  // gh CLI (needed before repo setup for auth)
  if (prereqs.gh.installed) {
    if (prereqs.gh.authenticated) {
      printSuccess('GitHub CLI authenticated');
    } else {
      printWarning('GitHub CLI installed but not authenticated');
      const shouldAuth = await confirm('Run gh auth login now?');
      if (shouldAuth) {
        try {
          runGhAuth();
          printSuccess('GitHub CLI authenticated');
        } catch {
          printError('Failed to authenticate gh CLI');
          process.exit(1);
        }
      } else {
        printError('GitHub CLI authentication required');
        process.exit(1);
      }
    }
  } else {
    printError('GitHub CLI (gh) not found');
    printInfo('Install with: brew install gh');
    const shouldInstall = await confirm('Try to install gh with homebrew?');
    if (shouldInstall) {
      const installSpinner = ora('Installing gh CLI...').start();
      try {
        execSync('brew install gh', { stdio: 'inherit' });
        installSpinner.succeed('gh CLI installed');
        runGhAuth();
      } catch {
        installSpinner.fail('Failed to install gh CLI');
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }

  // Initialize git repo if needed
  if (!prereqs.git.initialized) {
    const initSpinner = ora('Initializing git repo...').start();
    execSync('git init', { stdio: 'ignore' });
    initSpinner.succeed('Git repo initialized');
  }

  if (prereqs.git.remoteInfo) {
    owner = prereqs.git.remoteInfo.owner;
    repo = prereqs.git.remoteInfo.repo;
    printSuccess(`Repository: ${owner}/${repo}`);
  } else {
    printWarning('No GitHub remote detected. We\'ll set one up.');

    // Stage and commit
    execSync('git add .', { stdio: 'ignore' });
    try {
      execSync('git diff --cached --quiet', { stdio: 'ignore' });
      printSuccess('Nothing new to commit');
    } catch {
      const commitSpinner = ora('Creating initial commit...').start();
      execSync('git commit -m "initial commit"', { stdio: 'ignore' });
      commitSpinner.succeed('Created initial commit');
    }

    // Ask for project name and create the repo on GitHub
    const dirName = path.basename(process.cwd());
    const { projectName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Name your project:',
        default: dirName,
        validate: (input) => input ? true : 'Name is required',
      },
    ]);

    console.log(chalk.bold('\n  Create a GitHub repo:\n'));
    console.log(chalk.cyan('    1. Create a new private repository'));
    console.log(chalk.cyan('    2. Do NOT initialize with a README'));
    console.log(chalk.cyan('    3. Copy the HTTPS URL\n'));

    const openGitHub = await confirm('Open GitHub repo creation page in browser?');
    if (openGitHub) {
      await open(`https://github.com/new?name=${encodeURIComponent(projectName)}&visibility=private`);
      printInfo('Opened in browser (name and private pre-filled).');
    }

    // Ask for the remote URL and add it
    let remoteAdded = false;
    while (!remoteAdded) {
      const { remoteUrl } = await inquirer.prompt([
        {
          type: 'input',
          name: 'remoteUrl',
          message: 'Paste the HTTPS repository URL:',
          validate: (input) => {
            if (!input) return 'URL is required';
            if (!input.startsWith('https://github.com/')) return 'Must be an HTTPS GitHub URL (https://github.com/...)';
            return true;
          },
        },
      ]);

      try {
        const url = remoteUrl.replace(/\/$/, '').replace(/\.git$/, '') + '.git';
        execSync(`git remote add origin ${url}`, { stdio: 'ignore' });
        remoteAdded = true;
      } catch {
        // Remote might already exist, update it
        try {
          const url = remoteUrl.replace(/\/$/, '').replace(/\.git$/, '') + '.git';
          execSync(`git remote set-url origin ${url}`, { stdio: 'ignore' });
          remoteAdded = true;
        } catch {
          printError('Failed to set remote. Try again.');
        }
      }
    }

    // Get owner/repo from the remote we just added
    const { getGitRemoteInfo } = await import('./lib/prerequisites.mjs');
    const remoteInfo = getGitRemoteInfo();
    if (remoteInfo) {
      owner = remoteInfo.owner;
      repo = remoteInfo.repo;
      printSuccess(`Repository: ${owner}/${repo}`);
    } else {
      printError('Could not detect repository from remote.');
      process.exit(1);
    }
  }

  // Track owner/repo changes for re-runs
  if (isRerun) {
    if (owner !== env.GH_OWNER) changedVars['GH_OWNER'] = owner;
    if (repo !== env.GH_REPO) changedVars['GH_REPO'] = repo;
  }

  // Track whether we need to push after getting the PAT
  let needsPush = false;
  try {
    execSync('git rev-parse --verify origin/main', { stdio: 'ignore' });
  } catch {
    needsPush = true;
  }

  // ngrok check (informational only)
  if (prereqs.ngrok.installed) {
    printSuccess('ngrok installed');
  } else {
    printWarning('ngrok not installed (needed to expose local server)');
    printInfo('Install with: brew install ngrok/ngrok/ngrok');
  }

  // Step 2: GitHub PAT
  printStep(++currentStep, TOTAL_STEPS, 'GitHub Personal Access Token');

  // Skip if PAT already configured
  if (isRerun && env?.GH_TOKEN) {
    printSuccess(`GitHub PAT configured (${maskSecret(env.GH_TOKEN)})`);
    if (!await confirm('Reconfigure?', false)) {
      pat = env.GH_TOKEN;
    }
  }

  if (!pat) {
    console.log(chalk.dim(`  Create a fine-grained PAT scoped to ${chalk.bold(`${owner}/${repo}`)} only:\n`));
    console.log(chalk.dim('    \u2022 Repository access: Only select repositories \u2192 ') + chalk.bold(`${owner}/${repo}`));
    console.log(chalk.dim('    \u2022 Actions: Read and write'));
    console.log(chalk.dim('    \u2022 Administration: Read and write (required for self-hosted runners)'));
    console.log(chalk.dim('    \u2022 Contents: Read and write'));
    console.log(chalk.dim('    \u2022 Metadata: Read-only (required, auto-selected)'));
    console.log(chalk.dim('    \u2022 Pull requests: Read and write'));
    console.log(chalk.dim('    \u2022 Workflows: Read and write\n'));

    const openPATPage = await confirm('Open GitHub PAT creation page in browser?');
    if (openPATPage) {
      await open(getPATCreationURL());
      printInfo('Opened in browser. Scope it to ' + chalk.bold(`${owner}/${repo}`) + ' only.');
    }

    let patValid = false;
    while (!patValid) {
      pat = await promptForPAT();

      const validateSpinner = ora('Validating PAT...').start();
      const validation = await validatePAT(pat);

      if (!validation.valid) {
        validateSpinner.fail(`Invalid PAT: ${validation.error}`);
        continue;
      }

      const scopes = await checkPATScopes(pat);
      if (!scopes.hasRepo || !scopes.hasWorkflow) {
        validateSpinner.fail('PAT missing required scopes');
        printInfo(`Found scopes: ${scopes.scopes.join(', ') || 'none'}`);
        continue;
      }

      if (scopes.isFineGrained) {
        validateSpinner.succeed(`Fine-grained PAT valid for user: ${validation.user}`);
      } else {
        validateSpinner.succeed(`PAT valid for user: ${validation.user}`);
      }
      patValid = true;
    }

    credentialsChanged = true;
    if (isRerun) {
      changedVars['GH_TOKEN'] = pat;
    }
  }

  // Push to GitHub now that we have the PAT
  if (needsPush) {
    const remote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();

    let pushed = false;
    while (!pushed) {
      const authedUrl = remote.replace('https://github.com/', `https://x-access-token:${pat}@github.com/`);
      execSync(`git remote set-url origin ${authedUrl}`, { stdio: 'ignore' });

      const pushSpinner = ora('Pushing to GitHub...').start();
      try {
        execSync('git branch -M main', { stdio: 'ignore' });
        execSync('git push -u origin main 2>&1', { encoding: 'utf-8' });
        pushSpinner.succeed('Pushed to GitHub');
        pushed = true;
      } catch (err) {
        pushSpinner.fail('Failed to push');
        const output = (err.stdout || '') + (err.stderr || '');
        if (output) printError(output.trim());
        execSync(`git remote set-url origin ${remote}`, { stdio: 'ignore' });
        printInfo('Your PAT may not have write access to this repository.');
        pat = await promptForPAT();
        continue;
      }

      // Reset remote URL back to clean HTTPS (no token embedded)
      execSync(`git remote set-url origin ${remote}`, { stdio: 'ignore' });
    }
  }

  // Step 3: API Keys
  printStep(++currentStep, TOTAL_STEPS, 'API Keys');

  // Step 3a: Agent LLM — skip if provider + key already configured
  if (isRerun && env?.LLM_PROVIDER && env?.LLM_MODEL) {
    let existingEnvKey = null;
    let existingKey = null;

    if (env.LLM_PROVIDER === 'custom') {
      existingEnvKey = 'CUSTOM_API_KEY';
      existingKey = env.CUSTOM_API_KEY;
    } else if (PROVIDERS[env.LLM_PROVIDER]) {
      existingEnvKey = PROVIDERS[env.LLM_PROVIDER].envKey;
      existingKey = env[existingEnvKey];
    }

    // For custom providers the API key is optional, so check existingEnvKey instead
    if (existingKey || (env.LLM_PROVIDER === 'custom' && existingEnvKey)) {
      const providerLabel = env.LLM_PROVIDER === 'custom'
        ? 'Local (OpenAI Compatible API)'
        : (PROVIDERS[env.LLM_PROVIDER]?.label || env.LLM_PROVIDER);
      let llmDisplay = existingKey
        ? `LLM: ${providerLabel} / ${env.LLM_MODEL} (${maskSecret(existingKey)})`
        : `LLM: ${providerLabel} / ${env.LLM_MODEL}`;
      if ((env.LLM_PROVIDER === 'openai' || env.LLM_PROVIDER === 'custom') && env.OPENAI_BASE_URL) {
        llmDisplay += ` @ ${env.OPENAI_BASE_URL}`;
      }
      printSuccess(llmDisplay);
      if (!await confirm('Reconfigure?', false)) {
        agentProvider = env.LLM_PROVIDER;
        agentModel = env.LLM_MODEL;
        collectedKeys[existingEnvKey] = existingKey || '';
      }
    }
  }

  if (!agentProvider) {
    console.log(chalk.dim('  Choose the LLM provider for your agent.\n'));

    agentProvider = await promptForProvider();

    if (agentProvider === 'custom') {
      printInfo('If the model runs on this machine, use http://host.docker.internal:<port>/v1');
      printInfo('instead of localhost (localhost won\'t work from inside Docker)');
      printInfo('Ollama example: http://host.docker.internal:11434/v1\n');
      const custom = await promptForCustomProvider();
      agentModel = custom.model;
      openaiBaseUrl = custom.baseUrl;
      writeModelsJson('custom', {
        baseUrl: custom.baseUrl,
        apiKey: 'CUSTOM_API_KEY',
        api: 'openai-completions',
        models: [custom.model],
      });
      collectedKeys['CUSTOM_API_KEY'] = custom.apiKey || '';
      printSuccess(`Custom provider configured: ${custom.model} @ ${custom.baseUrl}`);
      if (custom.apiKey) {
        printSuccess(`API key added (${maskSecret(custom.apiKey)})`);
      }
    } else {
      const providerConfig = PROVIDERS[agentProvider];
      agentModel = await promptForModel(agentProvider);
      const agentApiKey = await promptForApiKey(agentProvider);
      collectedKeys[providerConfig.envKey] = agentApiKey;

      // Non-builtin providers need models.json (e.g., OpenAI)
      if (!providerConfig.builtin) {
        writeModelsJson(agentProvider, {
          baseUrl: providerConfig.baseUrl,
          apiKey: providerConfig.envKey,
          api: providerConfig.api,
          models: providerConfig.models.map((m) => m.id),
        });
        printSuccess(`Generated .pi/agent/models.json for ${providerConfig.name}`);
      }

      printSuccess(`${providerConfig.name} key added (${maskSecret(agentApiKey)})`);
    }

    credentialsChanged = true;
    if (isRerun) {
      const providerEnvKey = agentProvider !== 'custom'
        ? PROVIDERS[agentProvider].envKey
        : 'CUSTOM_API_KEY';
      changedVars['LLM_PROVIDER'] = agentProvider;
      changedVars['LLM_MODEL'] = agentModel;
      changedVars[providerEnvKey] = collectedKeys[providerEnvKey];
      if (openaiBaseUrl) {
        changedVars['OPENAI_BASE_URL'] = openaiBaseUrl;
      }
    }
  }

  // Re-run: reconfigure existing OPENAI_BASE_URL if provider was kept (not freshly configured)
  if ((agentProvider === 'openai' || agentProvider === 'custom') && isRerun && env?.OPENAI_BASE_URL && !openaiBaseUrl) {
    printSuccess(`Custom LLM URL: ${env.OPENAI_BASE_URL}`);
    if (await confirm('Reconfigure?', false)) {
      printInfo('If the model runs on this machine, use http://host.docker.internal:<port>/v1');
      printInfo('instead of localhost (localhost won\'t work from inside Docker)');
      printInfo('Ollama example: http://host.docker.internal:11434/v1\n');
      const { baseUrl } = await inquirer.prompt([
        {
          type: 'input',
          name: 'baseUrl',
          message: 'API base URL:',
          validate: (input) => {
            if (!input) return 'URL is required';
            if (!input.startsWith('http://') && !input.startsWith('https://')) {
              return 'URL must start with http:// or https://';
            }
            return true;
          },
        },
      ]);
      openaiBaseUrl = baseUrl;
      changedVars['OPENAI_BASE_URL'] = openaiBaseUrl;
      printSuccess(`Custom base URL: ${openaiBaseUrl}`);
    } else {
      openaiBaseUrl = env.OPENAI_BASE_URL;
    }
  }

  // Step 3b: Voice Messages (OpenAI optional)
  if (collectedKeys['OPENAI_API_KEY']) {
    printSuccess('Your OpenAI key can also power voice messages.');
  } else if (isRerun && env?.OPENAI_API_KEY) {
    // OpenAI key exists from a previous setup (for voice), offer to keep
    printSuccess(`OpenAI key for voice configured (${maskSecret(env.OPENAI_API_KEY)})`);
    if (await confirm('Reconfigure?', false)) {
      const result = await promptForOptionalKey('openai', 'voice messages');
      if (result) {
        collectedKeys['OPENAI_API_KEY'] = result;
        credentialsChanged = true;
        changedVars['OPENAI_API_KEY'] = result;
        printSuccess(`OpenAI key updated (${maskSecret(result)})`);
      }
    } else {
      collectedKeys['OPENAI_API_KEY'] = env.OPENAI_API_KEY;
    }
  } else {
    const result = await promptForOptionalKey('openai', 'voice messages');
    if (result) {
      collectedKeys['OPENAI_API_KEY'] = result;
      if (isRerun) {
        credentialsChanged = true;
        changedVars['OPENAI_API_KEY'] = result;
      }
      printSuccess(`OpenAI key added (${maskSecret(result)})`);
    }
  }

  // Step 3c: Brave Search (optional, default: true since it's free)
  // Brave key lives in LLM_SECRETS on GitHub, not in .env — always ask
  braveKey = await promptForBraveKey();
  if (braveKey) {
    if (isRerun) credentialsChanged = true;
    printSuccess(`Brave Search key added (${maskSecret(braveKey)})`);
  }

  // Step 4: Set GitHub Secrets
  printStep(++currentStep, TOTAL_STEPS, 'Set GitHub Secrets');

  if (!owner || !repo) {
    printWarning('Could not detect repository. Please enter manually.');
    const answers = await inquirer.prompt([
      { type: 'input', name: 'owner', message: 'GitHub owner/org:' },
      { type: 'input', name: 'repo', message: 'Repository name:' },
    ]);
    owner = answers.owner;
    repo = answers.repo;
  }

  // Skip GitHub secrets if nothing changed on re-run
  let llmSecretsBase64 = null;
  if (isRerun && !credentialsChanged && env?.GH_WEBHOOK_SECRET) {
    printSuccess('GitHub secrets unchanged');
    webhookSecret = env.GH_WEBHOOK_SECRET;
  } else {
    webhookSecret = generateWebhookSecret();
    const secretsBase64 = encodeSecretsBase64(pat, collectedKeys);
    const llmKeys = {};
    if (braveKey) llmKeys.BRAVE_API_KEY = braveKey;
    llmSecretsBase64 = encodeLlmSecretsBase64(llmKeys);

    const secrets = {
      SECRETS: secretsBase64,
      GH_WEBHOOK_SECRET: webhookSecret,
    };

    if (llmSecretsBase64) {
      secrets.LLM_SECRETS = llmSecretsBase64;
    }

    let allSecretsSet = false;
    while (!allSecretsSet) {
      const secretSpinner = ora('Setting GitHub secrets...').start();
      const secretResults = await setSecrets(owner, repo, secrets);
      secretSpinner.stop();

      allSecretsSet = true;
      for (const [name, result] of Object.entries(secretResults)) {
        if (result.success) {
          printSuccess(`Set ${name}`);
        } else {
          printError(`Failed to set ${name}: ${result.error}`);
          allSecretsSet = false;
        }
      }

      if (!allSecretsSet) {
        await pressEnter('Fix the issue, then press enter to retry');
      }
    }

    // Set default GitHub repository variables
    const defaultVars = {
      AUTO_MERGE: 'true',
      ALLOWED_PATHS: '/logs',
      LLM_PROVIDER: agentProvider,
      LLM_MODEL: agentModel,
    };
    if (openaiBaseUrl) {
      defaultVars.OPENAI_BASE_URL = openaiBaseUrl;
    }
    if (agentProvider === 'custom') {
      defaultVars.RUNS_ON = 'self-hosted';
    }

    let allVarsSet = false;
    while (!allVarsSet) {
      const varsSpinner = ora('Setting GitHub repository variables...').start();
      const varResults = await setVariables(owner, repo, defaultVars);
      varsSpinner.stop();

      allVarsSet = true;
      for (const [name, result] of Object.entries(varResults)) {
        if (result.success) {
          printSuccess(`Set ${name} = ${defaultVars[name]}`);
        } else {
          printError(`Failed to set ${name}: ${result.error}`);
          allVarsSet = false;
        }
      }

      if (!allVarsSet) {
        await pressEnter('Fix the issue, then press enter to retry');
      }
    }

    if (isRerun) {
      changedVars['GH_WEBHOOK_SECRET'] = webhookSecret;
    }
  }

  // Chat Interfaces (informational)
  console.log(chalk.dim('\n  Your agent includes a web chat interface at your APP_URL.'));
  console.log(chalk.dim('  You can also connect additional chat interfaces:\n'));
  console.log(chalk.dim('    \u2022 Telegram:  ') + chalk.cyan('npm run setup-telegram'));
  console.log('');

  // Step 5: APP_URL (must be set before Docker starts — Traefik needs APP_HOSTNAME)
  printStep(++currentStep, TOTAL_STEPS, 'App URL');

  let appUrl = null;

  // Skip if APP_URL already configured
  if (isRerun && env?.APP_URL) {
    printSuccess(`APP_URL: ${env.APP_URL}`);
    if (!await confirm('Reconfigure?', false)) {
      appUrl = env.APP_URL;
    }
  }

  if (!appUrl) {
    console.log(chalk.dim('  Your app needs a public URL for GitHub webhooks and Traefik routing.\n'));
    console.log(chalk.dim('  Examples:'));
    console.log(chalk.dim('    \u2022 ngrok: ') + chalk.cyan('https://abc123.ngrok.io'));
    console.log(chalk.dim('    \u2022 VPS:   ') + chalk.cyan('https://mybot.example.com'));
    console.log(chalk.dim('    \u2022 PaaS:  ') + chalk.cyan('https://mybot.vercel.app\n'));

    while (!appUrl) {
      const { url: urlInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'url',
          message: 'Enter your APP_URL (https://...):',
          validate: (input) => {
            if (!input) return 'URL is required';
            if (!input.startsWith('https://')) return 'URL must start with https://';
            return true;
          },
        },
      ]);
      appUrl = urlInput.replace(/\/$/, '');
    }

    if (isRerun) {
      const appHostname = new URL(appUrl).hostname;
      changedVars['APP_URL'] = appUrl;
      changedVars['APP_HOSTNAME'] = appHostname;
    }

    // Set APP_URL variable on GitHub
    let appUrlSet = false;
    while (!appUrlSet) {
      const urlSpinner = ora('Setting APP_URL variable...').start();
      const urlResult = await setVariables(owner, repo, { APP_URL: appUrl });
      if (urlResult.APP_URL.success) {
        urlSpinner.succeed('APP_URL variable set');
        appUrlSet = true;
      } else {
        urlSpinner.fail(`Failed: ${urlResult.APP_URL.error}`);
        await pressEnter('Fix the issue, then press enter to retry');
      }
    }
  }

  const appHostname = new URL(appUrl).hostname;

  // Write .env — fresh install uses writeEnvFile(), re-runs update only changed values
  if (!isRerun) {
    const providerConfig = agentProvider !== 'custom' ? PROVIDERS[agentProvider] : null;
    const providerEnvKey = providerConfig ? providerConfig.envKey : 'CUSTOM_API_KEY';
    const envPath = writeEnvFile({
      githubToken: pat,
      githubOwner: owner,
      githubRepo: repo,
      telegramBotToken: null,
      telegramWebhookSecret: null,
      ghWebhookSecret: webhookSecret,
      llmProvider: agentProvider,
      llmModel: agentModel,
      providerEnvKey,
      providerApiKey: collectedKeys[providerEnvKey] || '',
      openaiApiKey: collectedKeys['OPENAI_API_KEY'] || '',
      openaiBaseUrl: openaiBaseUrl || '',
      telegramChatId: null,
      telegramVerification: null,
      appUrl,
      appHostname,
    });
    printSuccess(`Created ${envPath}`);
  } else if (Object.keys(changedVars).length > 0) {
    for (const [key, value] of Object.entries(changedVars)) {
      updateEnvVariable(key, value);
    }
    printSuccess(`Updated .env (${Object.keys(changedVars).join(', ')})`);
  } else {
    printSuccess('.env unchanged');
  }

  // Step 6: Build & Start Server
  printStep(++currentStep, TOTAL_STEPS, 'Build & Start Server');

  // Check if server is already running
  let serverAlreadyRunning = false;
  try {
    await fetch('http://localhost:80/api/ping', {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    serverAlreadyRunning = true;
  } catch {
    // Server not reachable
  }

  if (serverAlreadyRunning) {
    printSuccess('Server is already running');
    if (!await confirm('Rebuild and restart anyway?', false)) {
      // Skip build & start
    } else {
      console.log(chalk.dim('\n  Rebuilding Next.js...\n'));
      try {
        execSync('npm run build', { stdio: 'inherit' });
        printSuccess('Build complete');
      } catch {
        printError('Build failed \u2014 run npm run build manually');
      }
    }
  } else {
    // Build
    console.log(chalk.dim('  Building Next.js...\n'));
    try {
      execSync('npm run build', { stdio: 'inherit' });
      printSuccess('Build complete');
    } catch {
      printError('Build failed \u2014 run npm run build manually');
    }

    console.log(chalk.bold('\n  Start Docker in a new terminal window:\n'));
    console.log(chalk.cyan('     docker compose up -d\n'));

    let serverReachable = false;
    while (!serverReachable) {
      await pressEnter('Press enter once Docker is running');
      const serverSpinner = ora('Checking server...').start();
      try {
        await fetch('http://localhost:80/api/ping', {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        // Any HTTP response means the server is running (even 401)
        serverSpinner.succeed('Server is running');
        serverReachable = true;
      } catch {
        serverSpinner.fail('Could not reach server on localhost:80');
      }
    }
  }

  // Step 7: Summary
  printStep(++currentStep, TOTAL_STEPS, 'Setup Complete!');

  console.log(chalk.bold.green('\n  Configuration Summary:\n'));

  const providerLabel = agentProvider === 'custom' ? 'Local (OpenAI Compatible API)' : PROVIDERS[agentProvider].label;
  console.log(`  ${chalk.dim('Repository:')}      ${owner}/${repo}`);
  console.log(`  ${chalk.dim('App URL:')}         ${appUrl}`);
  console.log(`  ${chalk.dim('Agent LLM:')}       ${providerLabel} (${agentModel})`);
  console.log(`  ${chalk.dim('GitHub PAT:')}      ${maskSecret(pat)}`);
  for (const [envVar, value] of Object.entries(collectedKeys)) {
    console.log(`  ${chalk.dim(`${envVar}:`)}  ${maskSecret(value)}`);
  }
  if (braveKey) console.log(`  ${chalk.dim('Brave Search:')}    ${maskSecret(braveKey)}`);

  if (!isRerun || credentialsChanged) {
    console.log(chalk.bold('\n  GitHub Secrets Set:\n'));
    console.log('  \u2022 SECRETS');
    if (llmSecretsBase64) console.log('  \u2022 LLM_SECRETS');
    console.log('  \u2022 GH_WEBHOOK_SECRET');

    console.log(chalk.bold('\n  GitHub Variables Set:\n'));
    console.log('  \u2022 APP_URL');
    console.log('  \u2022 AUTO_MERGE = true');
    console.log('  \u2022 ALLOWED_PATHS = /logs');
    console.log(`  \u2022 LLM_PROVIDER = ${agentProvider}`);
    console.log(`  \u2022 LLM_MODEL = ${agentModel}`);
    if (openaiBaseUrl) console.log(`  \u2022 OPENAI_BASE_URL = ${openaiBaseUrl}`);
    if (agentProvider === 'custom') console.log('  \u2022 RUNS_ON = self-hosted');
  }

  console.log(chalk.bold.green('\n  You\'re all set!\n'));

  console.log(chalk.dim('  Chat with your agent at ') + chalk.cyan(appUrl));
  console.log(chalk.dim('  To connect Telegram: ') + chalk.cyan('npm run setup-telegram'));

  console.log('\n');
}

main().catch((error) => {
  console.error(chalk.red('\nSetup failed:'), error.message);
  process.exit(1);
});
