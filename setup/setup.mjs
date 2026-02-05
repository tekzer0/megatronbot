#!/usr/bin/env node

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
  promptForAnthropicKey,
  promptForOpenAIKey,
  promptForGroqKey,
  promptForTelegramToken,
  generateTelegramWebhookSecret,
  confirm,
  maskSecret,
} from './lib/prompts.mjs';
import {
  validatePAT,
  checkPATScopes,
  setSecrets,
  generateWebhookToken,
  getPATCreationURL,
} from './lib/github.mjs';
import {
  validateAnthropicKey,
  writeEnvFile,
  encodeAuthJsonBase64,
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
  console.log(chalk.green('  ✓ ') + message);
}

function printWarning(message) {
  console.log(chalk.yellow('  ⚠ ') + message);
}

function printError(message) {
  console.log(chalk.red('  ✗ ') + message);
}

function printInfo(message) {
  console.log(chalk.dim('  → ') + message);
}

async function main() {
  printHeader();

  const TOTAL_STEPS = 7;
  let currentStep = 0;

  // Collected values
  let pat = null;
  let anthropicKey = null;
  let openaiKey = null;
  let groqKey = null;
  let telegramToken = null;
  let telegramWebhookSecret = null;
  let webhookToken = null;
  let owner = null;
  let repo = null;

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 1: Prerequisites Check
  // ─────────────────────────────────────────────────────────────────────────────
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
  if (prereqs.git.installed) {
    printSuccess('Git installed');
    if (prereqs.git.remoteInfo) {
      owner = prereqs.git.remoteInfo.owner;
      repo = prereqs.git.remoteInfo.repo;
      printSuccess(`Repository: ${owner}/${repo}`);
    } else {
      printWarning('Could not detect GitHub repository from git remote');
    }
  } else {
    printError('Git not found');
    process.exit(1);
  }

  // gh CLI
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
        const { execSync } = await import('child_process');
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

  // ngrok check (informational only)
  if (prereqs.ngrok.installed) {
    printSuccess('ngrok installed');
  } else {
    printWarning('ngrok not installed (needed to expose local server)');
    printInfo('Install with: brew install ngrok/ngrok/ngrok');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 2: GitHub PAT
  // ─────────────────────────────────────────────────────────────────────────────
  printStep(++currentStep, TOTAL_STEPS, 'GitHub Personal Access Token');

  console.log(chalk.dim('  Create a fine-grained PAT with these repository permissions:\n'));
  console.log(chalk.dim('    • Actions: Read-only'));
  console.log(chalk.dim('    • Contents: Read and write'));
  console.log(chalk.dim('    • Metadata: Read-only (required, auto-selected)'));
  console.log(chalk.dim('    • Pull requests: Read and write\n'));

  const openPATPage = await confirm('Open GitHub PAT creation page in browser?');
  if (openPATPage) {
    await open(getPATCreationURL());
    printInfo('Opened in browser. Select the permissions listed above.');
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 3: API Keys
  // ─────────────────────────────────────────────────────────────────────────────
  printStep(++currentStep, TOTAL_STEPS, 'API Keys');

  console.log(chalk.dim('  Anthropic API key is required. Others are optional.\n'));

  // Anthropic (required)
  let anthropicValid = false;
  while (!anthropicValid) {
    anthropicKey = await promptForAnthropicKey();

    const validateSpinner = ora('Validating Anthropic API key...').start();
    const validation = await validateAnthropicKey(anthropicKey);

    if (validation.valid) {
      validateSpinner.succeed('Anthropic API key valid');
      anthropicValid = true;
    } else {
      validateSpinner.fail(`Invalid key: ${validation.error}`);
    }
  }

  // OpenAI (optional)
  openaiKey = await promptForOpenAIKey();
  if (openaiKey) {
    printSuccess(`OpenAI key added (${maskSecret(openaiKey)})`);
  }

  // Groq (optional)
  groqKey = await promptForGroqKey();
  if (groqKey) {
    printSuccess(`Groq key added (${maskSecret(groqKey)})`);
  }

  const keys = {
    anthropic: anthropicKey,
    openai: openaiKey,
    groq: groqKey,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 4: Set GitHub Secrets
  // ─────────────────────────────────────────────────────────────────────────────
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

  webhookToken = generateWebhookToken();
  const piAuth = encodeAuthJsonBase64(keys);

  const secrets = {
    GH_TOKEN: pat,
    PI_AUTH: piAuth,
    GH_WEBHOOK_TOKEN: webhookToken,
  };

  const secretSpinner = ora('Setting GitHub secrets...').start();
  const secretResults = await setSecrets(owner, repo, secrets);

  secretSpinner.stop();
  let allSecretsSet = true;
  for (const [name, result] of Object.entries(secretResults)) {
    if (result.success) {
      printSuccess(`Set ${name}`);
    } else {
      printError(`Failed to set ${name}: ${result.error}`);
      allSecretsSet = false;
    }
  }

  if (!allSecretsSet) {
    printWarning('Some secrets failed - you may need to set them manually');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 5: Telegram Setup
  // ─────────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Write .env file for event_handler
  // ─────────────────────────────────────────────────────────────────────────────
  const apiKey = generateWebhookToken().slice(0, 32); // Random API key for webhook endpoint
  const telegramVerification = telegramToken ? generateVerificationCode() : null;
  const envPath = writeEnvFile({
    apiKey,
    githubToken: pat,
    githubOwner: owner,
    githubRepo: repo,
    telegramBotToken: telegramToken,
    telegramWebhookSecret,
    ghWebhookToken: webhookToken,
    anthropicApiKey: anthropicKey,
    openaiApiKey: openaiKey,
    telegramChatId: null,
    telegramVerification,
  });
  printSuccess(`Created ${envPath}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 6: Start Server & ngrok
  // ─────────────────────────────────────────────────────────────────────────────
  printStep(++currentStep, TOTAL_STEPS, 'Start Server & ngrok');

  console.log(chalk.bold('  Now we need to start the server and expose it via ngrok.\n'));
  console.log(chalk.yellow('  Open TWO new terminal windows and run:\n'));
  console.log(chalk.bold('  Terminal 1:'));
  console.log(chalk.cyan('     cd event_handler && npm install && npm start\n'));
  console.log(chalk.bold('  Terminal 2:'));
  console.log(chalk.cyan('     ngrok http 3000\n'));

  console.log(chalk.dim('  ngrok will show a "Forwarding" URL like: https://abc123.ngrok.io\n'));
  console.log(chalk.yellow('  Note: ') + chalk.dim('ngrok URLs change each time you restart it (unless you have a paid plan).'));
  console.log(chalk.dim('  When your URL changes, run: ') + chalk.cyan('npm run setup-telegram') + chalk.dim(' to reconfigure.\n'));

  let ngrokUrl = null;
  while (!ngrokUrl) {
    const { url } = await inquirer.prompt([
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
    const testUrl = url.replace(/\/$/, '');

    // Verify the server is reachable through ngrok
    const healthSpinner = ora('Verifying server is reachable...').start();
    try {
      const response = await fetch(`${testUrl}/ping`, {
        method: 'GET',
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(10000)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.message === 'Pong!') {
          healthSpinner.succeed('Server is reachable and authenticated');
          ngrokUrl = testUrl;
        } else {
          healthSpinner.fail('Unexpected response from server');
          const retry = await confirm('Try again?');
          if (!retry) {
            ngrokUrl = testUrl;
          }
        }
      } else if (response.status === 401) {
        healthSpinner.fail('Server responded but API key mismatch');
        printWarning('Restart the event handler to load the new .env file');
        const retry = await confirm('Try again after restarting?');
        if (!retry) {
          ngrokUrl = testUrl;
        }
      } else {
        healthSpinner.fail(`Server returned status ${response.status}`);
        printWarning('Make sure the event handler server is running (cd event_handler && npm start)');
        const retry = await confirm('Try again?');
        if (!retry) {
          ngrokUrl = testUrl;
        }
      }
    } catch (error) {
      healthSpinner.fail(`Could not reach server: ${error.message}`);
      printWarning('Make sure both the server AND ngrok are running');
      printInfo('Terminal 1: cd event_handler && npm install && npm start');
      printInfo('Terminal 2: ngrok http 3000');
      const retry = await confirm('Try again?');
      if (!retry) {
        ngrokUrl = testUrl; // Continue anyway
      }
    }
  }

  // Set GH_WEBHOOK_URL secret
  const urlSpinner = ora('Setting GH_WEBHOOK_URL secret...').start();
  const urlResult = await setSecrets(owner, repo, { GH_WEBHOOK_URL: ngrokUrl });
  if (urlResult.GH_WEBHOOK_URL.success) {
    urlSpinner.succeed('GH_WEBHOOK_URL secret set');
  } else {
    urlSpinner.fail(`Failed: ${urlResult.GH_WEBHOOK_URL.error}`);
  }

  // Register Telegram webhook if configured
  if (telegramToken) {
    const webhookUrl = `${ngrokUrl}/telegram/webhook`;
    const tgSpinner = ora('Registering Telegram webhook...').start();
    const tgResult = await setTelegramWebhook(telegramToken, webhookUrl, telegramWebhookSecret);
    if (tgResult.ok) {
      tgSpinner.succeed(`Telegram webhook registered: ${webhookUrl}`);
    } else {
      tgSpinner.fail(`Failed: ${tgResult.description}`);
    }

    // Chat ID verification
    const chatId = await runVerificationFlow(telegramVerification);

    if (chatId) {
      updateEnvVariable('TELEGRAM_CHAT_ID', chatId);
      printSuccess(`Chat ID saved: ${chatId}`);

      const verified = await verifyRestart(ngrokUrl, apiKey);
      if (verified) {
        printSuccess('Telegram bot is configured and working!');
      } else {
        printWarning('Could not verify bot. Check your configuration.');
      }
    } else {
      printWarning('Skipped verification. Bot will accept messages from anyone.');
      printInfo('Run npm run setup-telegram later to configure.');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 7: Summary
  // ─────────────────────────────────────────────────────────────────────────────
  printStep(++currentStep, TOTAL_STEPS, 'Setup Complete!');

  console.log(chalk.bold.green('\n  Configuration Summary:\n'));

  console.log(`  ${chalk.dim('Repository:')}      ${owner}/${repo}`);
  console.log(`  ${chalk.dim('Webhook URL:')}     ${ngrokUrl}`);
  console.log(`  ${chalk.dim('GitHub PAT:')}      ${maskSecret(pat)}`);
  console.log(`  ${chalk.dim('Anthropic Key:')}   ${maskSecret(anthropicKey)}`);
  if (openaiKey) console.log(`  ${chalk.dim('OpenAI Key:')}      ${maskSecret(openaiKey)}`);
  if (groqKey) console.log(`  ${chalk.dim('Groq Key:')}        ${maskSecret(groqKey)}`);
  if (telegramToken) console.log(`  ${chalk.dim('Telegram Bot:')}    Webhook registered`);

  console.log(chalk.bold('\n  GitHub Secrets Set:\n'));
  console.log('  • GH_TOKEN');
  console.log('  • PI_AUTH');
  console.log('  • GH_WEBHOOK_TOKEN');
  console.log('  • GH_WEBHOOK_URL');

  console.log(chalk.bold.green('\n  You\'re all set!\n'));

  if (telegramToken) {
    console.log(chalk.cyan('  Message your Telegram bot to create your first job!'));
  } else {
    console.log(chalk.dim('  Use the /webhook endpoint to create jobs.'));
  }

  console.log('\n');
}

main().catch((error) => {
  console.error(chalk.red('\nSetup failed:'), error.message);
  process.exit(1);
});
