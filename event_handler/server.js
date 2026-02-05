const express = require('express');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { createJob } = require('./tools/create-job');
const { loadCrons } = require('./cron');
const { setWebhook, sendMessage, formatJobNotification, downloadFile } = require('./tools/telegram');
const { isWhisperEnabled, transcribeAudio } = require('./tools/openai');
const { chat } = require('./claude');
const { toolDefinitions, toolExecutors } = require('./claude/tools');
const { getHistory, updateHistory } = require('./claude/conversation');
const { githubApi, getJobStatus } = require('./tools/github');
const { getApiKey } = require('./claude');

const app = express();

app.use(helmet());
app.use(express.json());

const { API_KEY, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_BOT_TOKEN, GH_WEBHOOK_TOKEN, GH_OWNER, GH_REPO, TELEGRAM_CHAT_ID, TELEGRAM_VERIFICATION } = process.env;

// Bot token from env, can be overridden by /telegram/register
let telegramBotToken = TELEGRAM_BOT_TOKEN || null;

// Routes that have their own authentication
const PUBLIC_ROUTES = ['/telegram/webhook', '/github/webhook'];

// Global x-api-key auth (skip for routes with their own auth)
app.use((req, res, next) => {
  if (PUBLIC_ROUTES.includes(req.path)) {
    return next();
  }
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// GET /ping - health check endpoint
app.get('/ping', (req, res) => {
  res.json({ message: 'Pong!' });
});

// GET /jobs/status - get running job status
app.get('/jobs/status', async (req, res) => {
  try {
    const result = await getJobStatus(req.query.job_id);
    res.json(result);
  } catch (err) {
    console.error('Failed to get job status:', err);
    res.status(500).json({ error: 'Failed to get job status' });
  }
});

// POST /webhook - create a new job
app.post('/webhook', async (req, res) => {
  const { job } = req.body;
  if (!job) return res.status(400).json({ error: 'Missing job field' });

  try {
    const result = await createJob(job);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// POST /telegram/register - register a Telegram webhook
app.post('/telegram/register', async (req, res) => {
  const { bot_token, webhook_url } = req.body;
  if (!bot_token || !webhook_url) {
    return res.status(400).json({ error: 'Missing bot_token or webhook_url' });
  }

  try {
    const result = await setWebhook(bot_token, webhook_url, TELEGRAM_WEBHOOK_SECRET);
    telegramBotToken = bot_token;
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to register webhook' });
  }
});

// POST /telegram/webhook - receive Telegram updates
app.post('/telegram/webhook', async (req, res) => {
  // Validate secret token if configured
  if (TELEGRAM_WEBHOOK_SECRET) {
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (headerSecret !== TELEGRAM_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const update = req.body;
  const message = update.message || update.edited_message;

  if (message && message.chat && telegramBotToken) {
    const chatId = String(message.chat.id);

    let messageText = null;

    if (message.text) {
      messageText = message.text;
    }

    // Check for verification code - this works even before TELEGRAM_CHAT_ID is set
    if (TELEGRAM_VERIFICATION && messageText === TELEGRAM_VERIFICATION) {
      await sendMessage(telegramBotToken, chatId, `Your chat ID:\n<code>${chatId}</code>`);
      return res.status(200).json({ ok: true });
    }

    // Security: if no TELEGRAM_CHAT_ID configured, ignore all messages (except verification above)
    if (!TELEGRAM_CHAT_ID) {
      return res.status(200).json({ ok: true });
    }

    // Security: only accept messages from configured chat
    if (chatId !== TELEGRAM_CHAT_ID) {
      return res.status(200).json({ ok: true });
    }

    if (message.voice) {
      // Handle voice messages
      if (!isWhisperEnabled()) {
        await sendMessage(telegramBotToken, chatId, 'Voice messages are not supported. Please set OPENAI_API_KEY to enable transcription.');
        return res.status(200).json({ ok: true });
      }

      try {
        const { buffer, filename } = await downloadFile(telegramBotToken, message.voice.file_id);
        messageText = await transcribeAudio(buffer, filename);
      } catch (err) {
        console.error('Failed to transcribe voice:', err);
        await sendMessage(telegramBotToken, chatId, 'Sorry, I could not transcribe your voice message.');
        return res.status(200).json({ ok: true });
      }
    }

    if (messageText) {
      try {
        // Get conversation history and process with Claude
        const history = getHistory(chatId);
        const { response, history: newHistory } = await chat(
          messageText,
          history,
          toolDefinitions,
          toolExecutors
        );
        updateHistory(chatId, newHistory);

        // Send response (auto-splits if needed)
        await sendMessage(telegramBotToken, chatId, response);
      } catch (err) {
        console.error('Failed to process message with Claude:', err);
        await sendMessage(telegramBotToken, chatId, 'Sorry, I encountered an error processing your message.').catch(() => {});
      }
    }
  }

  // Always return 200 to acknowledge receipt
  res.status(200).json({ ok: true });
});

/**
 * Extract job ID from branch name (e.g., "job/abc123" -> "abc123")
 */
function extractJobId(branchName) {
  if (!branchName || !branchName.startsWith('job/')) return null;
  return branchName.slice(4);
}

/**
 * Fetch the last commit message from a PR
 * @param {number} prNumber - PR number
 * @returns {Promise<string|null>}
 */
async function getCommitMessage(prNumber) {
  try {
    const commits = await githubApi(
      `/repos/${GH_OWNER}/${GH_REPO}/pulls/${prNumber}/commits`
    );
    return commits[commits.length - 1]?.commit?.message || null;
  } catch (err) {
    console.error('Failed to fetch commit message:', err);
    return null;
  }
}

/**
 * Fetch job.md content from a branch
 * @param {string} branchRef - Branch ref
 * @returns {Promise<string|null>}
 */
async function getJobDescription(branchRef) {
  try {
    const file = await githubApi(
      `/repos/${GH_OWNER}/${GH_REPO}/contents/workspace/job.md?ref=${branchRef}`
    );
    return Buffer.from(file.content, 'base64').toString('utf-8');
  } catch (err) {
    console.error('Failed to fetch job.md:', err);
    return null;
  }
}

/**
 * Use Claude to summarize job logs
 * @param {string} logContent - Raw JSONL log content
 * @param {Object} context - Additional context
 * @param {string|null} context.jobDescription - Contents of job.md (the task)
 * @param {string|null} context.commitMessage - Final commit message
 * @returns {Promise<{success: boolean, summary: string}>}
 */
async function summarizeLogsWithClaude(logContent, context = {}) {
  try {
    const apiKey = getApiKey();
    const { jobDescription, commitMessage } = context;

    // Build context sections
    let contextSection = '';
    if (jobDescription) {
      contextSection += `\nOriginal Task (job.md):\n${jobDescription.slice(0, 2000)}\n`;
    }
    if (commitMessage) {
      contextSection += `\nCommit Message:\n${commitMessage}\n`;
    }

    // Load prompt template
    const promptPath = path.join(__dirname, '..', 'operating_system', 'JOB_SUMMARY.md');
    let promptTemplate = fs.readFileSync(promptPath, 'utf8');

    // Replace placeholders
    const prompt = promptTemplate
      .replace('{{CONTEXT}}', contextSection)
      .replace('{{LOG_CONTENT}}', logContent.slice(-50000)); // Last 50k chars to stay within limits

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: prompt
        }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    // Parse response
    const successMatch = text.match(/SUCCESS:\s*(true|false)/i);
    const summaryMatch = text.match(/SUMMARY:\s*(.+)/i);

    return {
      success: successMatch ? successMatch[1].toLowerCase() === 'true' : true,
      summary: summaryMatch ? summaryMatch[1].trim() : 'Job completed.'
    };
  } catch (err) {
    console.error('Failed to summarize with Claude:', err);
    return { success: true, summary: 'Job completed.' };
  }
}

/**
 * Analyze job log file to determine success/failure and extract summary
 * @param {string} branchRef - Branch ref to fetch logs from
 * @param {string} jobId - Job ID (UUID)
 * @param {Object} context - Additional context
 * @param {string|null} context.jobDescription - Contents of job.md
 * @param {string|null} context.commitMessage - Final commit message
 * @returns {Promise<{success: boolean, summary: string}>}
 */
async function analyzeJobLog(branchRef, jobId, context = {}) {
  try {
    // List files in workspace/logs/{jobId}/ directory on the PR branch
    const logsPath = `workspace/logs/${jobId}`;
    let logFiles;
    try {
      logFiles = await githubApi(
        `/repos/${GH_OWNER}/${GH_REPO}/contents/${logsPath}?ref=${branchRef}`
      );
    } catch (err) {
      // Logs directory might not exist
      return { success: true, summary: 'Job completed.' };
    }

    // Find the .jsonl file
    const logFile = logFiles.find(f => f.name.endsWith('.jsonl'));
    if (!logFile) {
      return { success: true, summary: 'Job completed.' };
    }

    // Fetch the log file content
    const fileData = await githubApi(
      `/repos/${GH_OWNER}/${GH_REPO}/contents/${logFile.path}?ref=${branchRef}`
    );
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');

    // Use Claude to analyze and summarize
    return await summarizeLogsWithClaude(content, context);
  } catch (err) {
    console.error('Failed to analyze job log:', err);
    return { success: true, summary: 'Job completed.' };
  }
}

// POST /github/webhook - receive GitHub PR notifications
app.post('/github/webhook', async (req, res) => {
  // Validate webhook token
  if (GH_WEBHOOK_TOKEN) {
    const headerToken = req.headers['x-webhook-token'];
    if (headerToken !== GH_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const event = req.headers['x-github-event'];
  const payload = req.body;

  // Only handle pull_request opened events
  if (event !== 'pull_request' || payload.action !== 'opened') {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const pr = payload.pull_request;
  if (!pr) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const branchName = pr.head?.ref;
  const jobId = extractJobId(branchName);

  // Only handle job branches
  if (!jobId) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'not a job branch' });
  }

  // Skip if no chat ID to notify
  if (!TELEGRAM_CHAT_ID || !telegramBotToken) {
    console.log(`Job ${jobId} completed but no chat ID to notify`);
    return res.status(200).json({ ok: true, skipped: true, reason: 'no chat to notify' });
  }

  try {
    // Fetch additional context in parallel
    const prNumber = pr.number;
    const [commitMessage, jobDescription] = await Promise.all([
      getCommitMessage(prNumber),
      getJobDescription(branchName)
    ]);

    // Analyze the job log with context
    const { success, summary } = await analyzeJobLog(branchName, jobId, {
      commitMessage,
      jobDescription
    });

    // Build and send notification
    const message = formatJobNotification({
      jobId,
      success,
      summary,
      prUrl: pr.html_url,
    });

    await sendMessage(telegramBotToken, TELEGRAM_CHAT_ID, message);
    console.log(`Notified chat ${TELEGRAM_CHAT_ID} about job ${jobId.slice(0, 8)}`);

    res.status(200).json({ ok: true, notified: true });
  } catch (err) {
    console.error('Failed to process GitHub webhook:', err);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Error handler - don't leak stack traces
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
  loadCrons();
});
