import inquirer from 'inquirer';

/**
 * Mask a secret, showing only last 4 characters
 */
export function maskSecret(secret) {
  if (!secret || secret.length < 8) return '****';
  return '****' + secret.slice(-4);
}

/**
 * Prompt for GitHub PAT
 */
export async function promptForPAT() {
  const { pat } = await inquirer.prompt([
    {
      type: 'password',
      name: 'pat',
      message: 'Paste your GitHub Personal Access Token:',
      mask: '*',
      validate: (input) => {
        if (!input) return 'PAT is required';
        if (!input.startsWith('ghp_') && !input.startsWith('github_pat_')) {
          return 'Invalid PAT format. Should start with ghp_ or github_pat_';
        }
        return true;
      },
    },
  ]);
  return pat;
}

/**
 * Prompt for Anthropic API key
 */
export async function promptForAnthropicKey() {
  const { key } = await inquirer.prompt([
    {
      type: 'password',
      name: 'key',
      message: 'Enter your Anthropic API key:',
      mask: '*',
      validate: (input) => {
        if (!input) return 'Anthropic API key is required';
        if (!input.startsWith('sk-ant-')) {
          return 'Invalid format. Should start with sk-ant-';
        }
        return true;
      },
    },
  ]);
  return key;
}

/**
 * Prompt for optional OpenAI API key
 */
export async function promptForOpenAIKey() {
  const { addKey } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addKey',
      message: 'Add OpenAI API key? (optional)',
      default: false,
    },
  ]);

  if (!addKey) return null;

  const { key } = await inquirer.prompt([
    {
      type: 'password',
      name: 'key',
      message: 'Enter your OpenAI API key:',
      mask: '*',
      validate: (input) => {
        if (!input) return 'Key is required if adding';
        if (!input.startsWith('sk-')) {
          return 'Invalid format. Should start with sk-';
        }
        return true;
      },
    },
  ]);
  return key;
}

/**
 * Prompt for optional Groq API key
 */
export async function promptForGroqKey() {
  const { addKey } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addKey',
      message: 'Add Groq API key? (optional)',
      default: false,
    },
  ]);

  if (!addKey) return null;

  const { key } = await inquirer.prompt([
    {
      type: 'password',
      name: 'key',
      message: 'Enter your Groq API key:',
      mask: '*',
      validate: (input) => {
        if (!input) return 'Key is required if adding';
        return true;
      },
    },
  ]);
  return key;
}

/**
 * Prompt for Telegram bot token
 */
export async function promptForTelegramToken() {
  const { addTelegram } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addTelegram',
      message: 'Set up Telegram bot?',
      default: true,
    },
  ]);

  if (!addTelegram) return null;

  const { token } = await inquirer.prompt([
    {
      type: 'password',
      name: 'token',
      message: 'Enter your Telegram bot token from @BotFather:',
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
  return token;
}

/**
 * Generate a Telegram webhook secret
 */
export async function generateTelegramWebhookSecret() {
  const { randomBytes } = await import('crypto');
  return randomBytes(32).toString('hex');
}

/**
 * Prompt for deployment method
 */
export async function promptForDeployMethod() {
  const { method } = await inquirer.prompt([
    {
      type: 'list',
      name: 'method',
      message: 'How would you like to deploy the event handler?',
      choices: [
        { name: 'Deploy to Vercel via CLI (recommended)', value: 'vercel' },
        { name: 'Open Vercel Deploy Button in browser', value: 'button' },
        { name: 'Skip - I\'ll deploy manually later', value: 'skip' },
      ],
    },
  ]);
  return method;
}

/**
 * Prompt for confirmation
 */
export async function confirm(message, defaultValue = true) {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue,
    },
  ]);
  return confirmed;
}

/**
 * Prompt for text input
 */
export async function promptText(message, defaultValue = '') {
  const { value } = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message,
      default: defaultValue,
    },
  ]);
  return value;
}
