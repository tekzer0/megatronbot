#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';
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
  promptForTelegramToken,
  generateTelegramWebhookSecret,
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
  writeModelsJson,
  encodeSecretsBase64,
  encodeLlmSecretsBase64,
  updateEnvVariable,
} from './lib/auth.mjs';
import { setTelegramWebhook, validateBotToken, generateVerificationCode } from './lib/telegram.mjs';
import { runVerificationFlow, verifyRestart } from './lib/telegram-verify.mjs';

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

async function main() {
  printHeader();

  const TOTAL_STEPS = 8;
  let currentStep = 0;

  // Collected values
  let pat = null;
  let agentProvider = null;
  let agentModel = null;
  const collectedKeys = {};
  let braveKey = null;
  let telegramToken = null;
  let telegramWebhookSecret = null;
  let webhookSecret = null;
  let owner = null;
  let repo = null;

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

  console.log(chalk.dim(`  Create a fine-grained PAT scoped to ${chalk.bold(`${owner}/${repo}`)} only:\n`));
  console.log(chalk.dim('    \u2022 Repository access: Only select repositories \u2192 ') + chalk.bold(`${owner}/${repo}`));
  console.log(chalk.dim('    \u2022 Actions: Read and write'));
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

  // Step 3a: Agent LLM
  console.log(chalk.dim('  Choose the LLM provider for your agent.\n'));

  agentProvider = await promptForProvider();

  if (agentProvider === 'custom') {
    const custom = await promptForCustomProvider();
    agentModel = custom.model;
    writeModelsJson('custom', {
      baseUrl: custom.baseUrl,
      apiKey: 'CUSTOM_API_KEY',
      api: 'openai-completions',
      models: [custom.model],
    });
    collectedKeys['CUSTOM_API_KEY'] = custom.apiKey;
    printSuccess(`Custom provider configured: ${custom.model}`);
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

  // Step 3b: Voice Messages (OpenAI optional)
  if (collectedKeys['OPENAI_API_KEY']) {
    printSuccess('Your OpenAI key can also power voice messages.');
  } else {
    const result = await promptForOptionalKey('openai', 'voice messages');
    if (result) {
      collectedKeys['OPENAI_API_KEY'] = result;
      printSuccess(`OpenAI key added (${maskSecret(result)})`);
    }
  }

  // Step 3c: Brave Search (optional, default: true since it's free)
  braveKey = await promptForBraveKey();
  if (braveKey) {
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

  webhookSecret = generateWebhookSecret();
  const secretsBase64 = encodeSecretsBase64(pat, collectedKeys);
  const llmKeys = {};
  if (braveKey) llmKeys.BRAVE_API_KEY = braveKey;
  const llmSecretsBase64 = encodeLlmSecretsBase64(llmKeys);

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

  // Step 5: Telegram Setup
  printStep(++currentStep, TOTAL_STEPS, 'Telegram Setup');

  telegramToken = await promptForTelegramToken();

  if (telegramToken) {
    const validateSpinner = ora('Validating bot token...').start();
    const validation = await validateBotToken(telegramToken);

    if (!validation.valid) {
      validateSpinner.fail(`Invalid token: ${validation.error}`);
      telegramToken = null;
    } else {
      validateSpinner.succeed(`Bot: @${validation.botInfo.username}`);
      telegramWebhookSecret = await generateTelegramWebhookSecret();
    }
  } else {
    printInfo('Skipped Telegram setup');
  }

  // Write .env file (now at project root, not event_handler/)
  const telegramVerification = telegramToken ? generateVerificationCode() : null;
  const providerConfig = agentProvider !== 'custom' ? PROVIDERS[agentProvider] : null;
  const providerEnvKey = providerConfig ? providerConfig.envKey : 'CUSTOM_API_KEY';
  const envPath = writeEnvFile({
    githubToken: pat,
    githubOwner: owner,
    githubRepo: repo,
    telegramBotToken: telegramToken,
    telegramWebhookSecret,
    ghWebhookSecret: webhookSecret,
    llmProvider: agentProvider,
    llmModel: agentModel,
    providerEnvKey,
    providerApiKey: collectedKeys[providerEnvKey] || '',
    openaiApiKey: collectedKeys['OPENAI_API_KEY'] || '',
    telegramChatId: null,
    telegramVerification,
  });
  printSuccess(`Created ${envPath}`);

  // Step 6: Start Server
  printStep(++currentStep, TOTAL_STEPS, 'Start Server');

  console.log(chalk.bold('  Start the dev server in a new terminal window:\n'));
  console.log(chalk.cyan('     npm run dev\n'));

  let serverReachable = false;
  while (!serverReachable) {
    await pressEnter('Press enter once the server is running');
    const serverSpinner = ora('Checking server...').start();
    try {
      const response = await fetch('http://localhost:3000/api/ping', {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      // Any HTTP response means the server is running (even 401)
      serverSpinner.succeed('Server is running');
      serverReachable = true;
    } catch {
      serverSpinner.fail('Could not reach server on localhost:3000');
    }
  }

  // Step 7: ngrok
  printStep(++currentStep, TOTAL_STEPS, 'Expose Server with ngrok');

  console.log(chalk.bold('  Start ngrok in another terminal window:\n'));
  console.log(chalk.cyan('     ngrok http 3000\n'));
  console.log(chalk.dim('  ngrok will show a "Forwarding" URL like: https://abc123.ngrok.io\n'));
  console.log(chalk.yellow('  Note: ') + chalk.dim('ngrok URLs change each time you restart it (unless you have a paid plan).'));
  console.log(chalk.dim('  When your URL changes, run: ') + chalk.cyan('npm run setup-telegram') + chalk.dim(' to reconfigure.\n'));

  let ngrokUrl = null;
  while (!ngrokUrl) {
    const { url: ngrokInput } = await inquirer.prompt([
      {
        type: 'input',
        name: 'url',
        message: 'Paste your ngrok URL (https://...ngrok...):',
        validate: (input) => {
          if (!input) return 'URL is required';
          if (!input.startsWith('https://')) return 'URL must start with https://';
          if (!input.includes('ngrok')) return 'URL should be an ngrok URL';
          return true;
        },
      },
    ]);
    const candidate = ngrokInput.replace(/\/$/, '');

    const ngrokSpinner = ora('Verifying server is reachable through ngrok...').start();
    try {
      const response = await fetch(`${candidate}/api/ping`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      // Any HTTP response means the server is reachable (even 401)
      ngrokSpinner.succeed('Server is reachable through ngrok');
      ngrokUrl = candidate;
    } catch {
      ngrokSpinner.fail('Could not reach server through ngrok');
    }
  }

  // Set GH_WEBHOOK_URL variable
  let webhookUrlSet = false;
  while (!webhookUrlSet) {
    const urlSpinner = ora('Setting GH_WEBHOOK_URL variable...').start();
    const urlResult = await setVariables(owner, repo, { GH_WEBHOOK_URL: ngrokUrl });
    if (urlResult.GH_WEBHOOK_URL.success) {
      urlSpinner.succeed('GH_WEBHOOK_URL variable set');
      webhookUrlSet = true;
    } else {
      urlSpinner.fail(`Failed: ${urlResult.GH_WEBHOOK_URL.error}`);
      await pressEnter('Fix the issue, then press enter to retry');
    }
  }

  // Register Telegram webhook if configured
  if (telegramToken) {
    const webhookUrl = `${ngrokUrl}/api/telegram/webhook`;
    let tgWebhookSet = false;
    while (!tgWebhookSet) {
      const tgSpinner = ora('Registering Telegram webhook...').start();
      const tgResult = await setTelegramWebhook(telegramToken, webhookUrl, telegramWebhookSecret);
      if (tgResult.ok) {
        tgSpinner.succeed(`Telegram webhook registered: ${webhookUrl}`);
        tgWebhookSet = true;
      } else {
        tgSpinner.fail(`Failed: ${tgResult.description}`);
        await pressEnter('Fix the issue, then press enter to retry');
      }
    }

    // Chat ID verification
    let chatVerified = false;
    while (!chatVerified) {
      const chatId = await runVerificationFlow(telegramVerification);

      if (chatId) {
        updateEnvVariable('TELEGRAM_CHAT_ID', chatId);
        printSuccess(`Chat ID saved: ${chatId}`);

        const verified = await verifyRestart(ngrokUrl);
        if (verified) {
          printSuccess('Telegram bot is configured and working!');
        } else {
          printWarning('Could not verify bot. Check your configuration.');
        }
        chatVerified = true;
      } else {
        printWarning('Chat ID is required \u2014 the bot will not respond without it.');
        await pressEnter('Fix the issue, then press enter to retry');
      }
    }
  }

  // Step 7: Summary
  printStep(++currentStep, TOTAL_STEPS, 'Setup Complete!');

  console.log(chalk.bold.green('\n  Configuration Summary:\n'));

  const providerLabel = agentProvider === 'custom' ? 'Custom / Local' : PROVIDERS[agentProvider].label;
  console.log(`  ${chalk.dim('Repository:')}      ${owner}/${repo}`);
  console.log(`  ${chalk.dim('Webhook URL:')}     ${ngrokUrl}`);
  console.log(`  ${chalk.dim('Agent LLM:')}       ${providerLabel} (${agentModel})`);
  console.log(`  ${chalk.dim('GitHub PAT:')}      ${maskSecret(pat)}`);
  for (const [envVar, value] of Object.entries(collectedKeys)) {
    console.log(`  ${chalk.dim(`${envVar}:`)}  ${maskSecret(value)}`);
  }
  if (braveKey) console.log(`  ${chalk.dim('Brave Search:')}    ${maskSecret(braveKey)}`);
  if (telegramToken) console.log(`  ${chalk.dim('Telegram Bot:')}    Webhook registered`);

  console.log(chalk.bold('\n  GitHub Secrets Set:\n'));
  console.log('  \u2022 SECRETS');
  if (llmSecretsBase64) console.log('  \u2022 LLM_SECRETS');
  console.log('  \u2022 GH_WEBHOOK_SECRET');

  console.log(chalk.bold('\n  GitHub Variables Set:\n'));
  console.log('  \u2022 GH_WEBHOOK_URL');
  console.log('  \u2022 AUTO_MERGE = true');
  console.log('  \u2022 ALLOWED_PATHS = /logs');
  console.log(`  \u2022 LLM_PROVIDER = ${agentProvider}`);
  console.log(`  \u2022 LLM_MODEL = ${agentModel}`);

  console.log(chalk.bold.green('\n  You\'re all set!\n'));

  if (telegramToken) {
    console.log(chalk.cyan('  Message your Telegram bot to create your first job!'));
  } else {
    console.log(chalk.dim('  Use the /api/create-job endpoint to create jobs.'));
  }

  console.log('\n');
}

main().catch((error) => {
  console.error(chalk.red('\nSetup failed:'), error.message);
  process.exit(1);
});
