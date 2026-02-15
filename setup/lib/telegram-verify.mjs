import chalk from 'chalk';
import inquirer from 'inquirer';

/**
 * Run the chat ID verification flow
 * @param {string} verificationCode - The code user should send to bot
 * @param {object} [options] - Options
 * @param {boolean} [options.allowSkip=false] - Allow pressing Enter to skip
 * @returns {Promise<string|null>} - The chat ID or null if skipped
 */
export async function runVerificationFlow(verificationCode, { allowSkip = false } = {}) {
  console.log(chalk.bold.yellow('\n  Chat ID Verification\n'));
  console.log(chalk.dim('  To lock the bot to your chat, send the verification code.\n'));
  console.log(chalk.cyan('  Send this message to your bot: ') + chalk.bold(verificationCode));
  console.log(chalk.dim('\n  The bot will reply with your chat ID. Paste it below.\n'));

  const message = allowSkip
    ? 'Paste your chat ID from the bot (or press Enter to skip):'
    : 'Paste your chat ID from the bot:';

  const { chatId } = await inquirer.prompt([{
    type: 'input',
    name: 'chatId',
    message,
    validate: (input) => {
      if (!input) return allowSkip ? true : 'Chat ID is required';
      if (!/^-?\d+$/.test(input.trim())) {
        return 'Chat ID should be a number (can be negative for groups)';
      }
      return true;
    }
  }]);

  return chatId.trim() || null;
}

/**
 * Wait for server to pick up .env changes and verify it's running
 * @param {string} ngrokUrl - The ngrok URL
 * @returns {Promise<boolean>} - True if verified successfully
 */
export async function verifyRestart(ngrokUrl) {
  console.log(chalk.dim('\n  Waiting for server to pick up changes...\n'));
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Verify server is up (any HTTP response means it's running)
  try {
    await fetch(`${ngrokUrl}/api/ping`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });
  } catch (err) {
    console.log(chalk.red(`  ✗ Server not reachable: ${err.message}\n`));
    return false;
  }

  console.log(chalk.green('  ✓ Server is running\n'));
  return true;
}
