#!/usr/bin/env node

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { checkPrerequisites } from './lib/prerequisites.mjs';
import { setVariables } from './lib/github.mjs';
import { setTelegramWebhook, validateBotToken, generateVerificationCode } from './lib/telegram.mjs';
import { confirm, generateTelegramWebhookSecret } from './lib/prompts.mjs';
import { updateEnvVariable } from './lib/auth.mjs';
import { runVerificationFlow } from './lib/telegram-verify.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

function printSuccess(message) {
  console.log(chalk.green('  ✓ ') + message);
}

function printWarning(message) {
  console.log(chalk.yellow('  ⚠ ') + message);
}

function printInfo(message) {
  console.log(chalk.dim('  → ') + message);
}

/**
 * Parse .env file and return object
 */
function loadEnvFile() {
  const envPath = join(ROOT_DIR, 'event_handler', '.env');
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
  console.log(chalk.bold.cyan('\n  Telegram Webhook Setup\n'));
  console.log(chalk.dim('  Use this to reconfigure Telegram after restarting ngrok.\n'));

  // Check prerequisites
  const prereqs = await checkPrerequisites();

  if (!prereqs.git.remoteInfo) {
    console.log(chalk.red('Could not detect GitHub repository from git remote.'));
    process.exit(1);
  }

  const { owner, repo } = prereqs.git.remoteInfo;
  printInfo(`Repository: ${owner}/${repo}`);

  // Load existing config
  const env = loadEnvFile();

  // Get ngrok URL first (verify server is up)
  console.log(chalk.yellow('\n  Make sure both terminals are running:\n'));
  console.log(chalk.dim('  Terminal 1: ') + chalk.cyan('cd event_handler && npm start'));
  console.log(chalk.dim('  Terminal 2: ') + chalk.cyan('ngrok http 3000\n'));

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
    const apiKey = env?.API_KEY;
    try {
      const response = await fetch(`${testUrl}/ping`, {
        method: 'GET',
        headers: apiKey ? { 'x-api-key': apiKey } : {},
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
        printWarning('Check that API_KEY in .env matches the running server');
        const retry = await confirm('Try again?');
        if (!retry) {
          ngrokUrl = testUrl;
        }
      } else {
        healthSpinner.fail(`Server returned status ${response.status}`);
        printWarning('Make sure the event handler server is running');
        const retry = await confirm('Try again?');
        if (!retry) {
          ngrokUrl = testUrl;
        }
      }
    } catch (error) {
      healthSpinner.fail(`Could not reach server: ${error.message}`);
      printWarning('Make sure both the server AND ngrok are running');
      const retry = await confirm('Try again?');
      if (!retry) {
        ngrokUrl = testUrl;
      }
    }
  }

  // Set GH_WEBHOOK_URL variable
  const urlSpinner = ora('Updating GH_WEBHOOK_URL variable...').start();
  const urlResult = await setVariables(owner, repo, { GH_WEBHOOK_URL: ngrokUrl });
  if (urlResult.GH_WEBHOOK_URL.success) {
    urlSpinner.succeed('GH_WEBHOOK_URL variable updated');
  } else {
    urlSpinner.fail(`Failed: ${urlResult.GH_WEBHOOK_URL.error}`);
  }

  // Get Telegram token - try .env first
  let token = env?.TELEGRAM_BOT_TOKEN;
  if (token) {
    printInfo('Using Telegram token from .env');
    const validateSpinner = ora('Validating bot token...').start();
    const validation = await validateBotToken(token);
    if (validation.valid) {
      validateSpinner.succeed(`Bot: @${validation.botInfo.username}`);
    } else {
      validateSpinner.fail(`Invalid token in .env: ${validation.error}`);
      token = null;
    }
  }

  if (!token) {
    const { inputToken } = await inquirer.prompt([
      {
        type: 'password',
        name: 'inputToken',
        message: 'Telegram bot token:',
        mask: '*',
        validate: (input) => {
          if (!input) return 'Token is required';
          if (!/^\d+:[A-Za-z0-9_-]+$/.test(input)) {
            return 'Invalid format. Should be like 123456789:ABC-DEF...';
          }
          return true;
        },
      },
    ]);
    token = inputToken;

    const validateSpinner = ora('Validating bot token...').start();
    const validation = await validateBotToken(token);
    if (!validation.valid) {
      validateSpinner.fail(`Invalid token: ${validation.error}`);
      process.exit(1);
    }
    validateSpinner.succeed(`Bot: @${validation.botInfo.username}`);
  }

  // Handle webhook secret
  let webhookSecret = env?.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    printInfo('Using existing webhook secret');
  } else {
    webhookSecret = await generateTelegramWebhookSecret();
    updateEnvVariable('TELEGRAM_WEBHOOK_SECRET', webhookSecret);
    printSuccess('Generated webhook secret');
  }

  // Register Telegram webhook
  const webhookUrl = `${ngrokUrl}/telegram/webhook`;
  const tgSpinner = ora('Registering Telegram webhook...').start();
  const tgResult = await setTelegramWebhook(token, webhookUrl, webhookSecret);
  if (tgResult.ok) {
    tgSpinner.succeed('Telegram webhook registered');
  } else {
    tgSpinner.fail(`Failed: ${tgResult.description}`);
  }

  // Handle chat ID verification (required — bot ignores all messages without it)
  let telegramChatId = env?.TELEGRAM_CHAT_ID;

  if (telegramChatId) {
    printInfo(`Using existing chat ID: ${telegramChatId}`);
  } else {
    // Generate new code and update .env
    const verificationCode = generateVerificationCode();
    updateEnvVariable('TELEGRAM_VERIFICATION', verificationCode);

    console.log(chalk.yellow('\n  Waiting for server to restart with new verification code...\n'));
    await new Promise(resolve => setTimeout(resolve, 3000));

    const chatId = await runVerificationFlow(verificationCode);

    if (chatId) {
      updateEnvVariable('TELEGRAM_CHAT_ID', chatId);
      printSuccess(`Chat ID saved: ${chatId}`);
    } else {
      printWarning('Chat ID is required — the bot will not respond without it.');
      printInfo('Run npm run setup-telegram again to complete setup.');
    }
  }

  console.log(chalk.green('\n  Done!\n'));
  console.log(chalk.dim(`  Webhook URL: ${webhookUrl}\n`));
}

main().catch((error) => {
  console.error(chalk.red('\nFailed:'), error.message);
  process.exit(1);
});
