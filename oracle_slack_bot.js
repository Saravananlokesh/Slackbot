const { App } = require('@slack/bolt');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');
const winston = require('winston');
require('dotenv').config();

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} - [${level.toUpperCase()}] - ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({
      filename: 'logfile.log',
      maxFiles: 7,
      maxsize: 10485760,
      tailable: true
    }),
    new winston.transports.Console()
  ]
});

// Initialize Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// User configuration and permissions
const CONFIG_PATH = 'config/users.json';
let userConfig = {};

// Authorized user IDs (used when email is not available)
const AUTHORIZED_USER_IDS = {
  admin: ["U09F0K4U2N7"],  // Your user ID
  oracle: ["U09F0K4U2N7"],  // Your user ID
  xm: ["U09F0K4U2N7"]  // Your user ID
};

// Load user configuration
async function loadUserConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    userConfig = JSON.parse(data);
    logger.info('User configuration loaded successfully');
    logger.info(`Loaded config: ${JSON.stringify(userConfig)}`);
    return true;
  } catch (error) {
    logger.error(`Failed to load user configuration: ${error.message}`);
    return false;
  }
}

// Check if user has access to a specific app
async function checkUserAccess(userId, appId, requireAdmin = false) {
  try {
    // First, check if userId is directly authorized
    if (requireAdmin && AUTHORIZED_USER_IDS.admin.includes(userId)) {
      logger.info(`User ${userId} has admin access via user ID`);
      return true;
    }

    if (appId && AUTHORIZED_USER_IDS[appId.toLowerCase()]?.includes(userId)) {
      logger.info(`User ${userId} has access to ${appId} via user ID`);
      return true;
    }

    // Get user info from Slack
    logger.info(`Checking access for user ID: ${userId} for app: ${appId}`);
    const result = await app.client.users.info({ user: userId });
    if (!result.ok) throw new Error('Could not retrieve user information');

    const { real_name, email } = result.user.profile;

    // Add debugging logs
    logger.info(`User details - Name: ${real_name}, Email: ${email || 'undefined'}`);
    logger.info(`Checking against config: ${JSON.stringify(userConfig)}`);

    // If no email is available, but it's your user ID, grant access
    if (!email && userId === "U09F0K4U2N7") {
      logger.info(`Granting access to user with ID: ${userId} (no email available)`);
      return true;
    }

    if (requireAdmin) {
      const isAdmin = userConfig.admin?.includes(email) || false;
      logger.info(`Admin check result: ${isAdmin}`);
      return isAdmin;
    }

    if (appId === null) {
      // Check if user has access to any app
      const hasAnyAccess = Object.keys(userConfig)
        .filter(app => app !== 'admin')
        .some(app => userConfig[app].includes(email));
      logger.info(`Any app access check result: ${hasAnyAccess}`);
      return hasAnyAccess;
    }

    const hasAccess = userConfig[appId.toLowerCase()]?.includes(email) || false;
    logger.info(`Specific app access check for ${appId}: ${hasAccess}`);
    if (userConfig[appId.toLowerCase()]) {
      logger.info(`Allowed emails for ${appId}: ${userConfig[appId.toLowerCase()].join(', ')}`);
    } else {
      logger.info(`No config entry found for app: ${appId}`);
    }

    return hasAccess;
  } catch (error) {
    logger.error(`Access check failed: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    return false;
  }
}

// Execute script and return output
async function executeScript(scriptPath, args) {
  try {
    // Use the Python from the virtual environment with absolute path
    const venvPython = path.join(process.cwd(), 'venv/bin/python');
    const command = `${venvPython} ${scriptPath} ${args.join(' ')}`;
    logger.info(`Executing command: ${command}`);

    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stderr.includes('UserWarning')) {
      logger.error(`Script error: ${stderr}`);
      throw new Error(stderr);
    }

    return { success: true, output: stdout };
  } catch (error) {
    logger.error(`Script execution failed: ${error.message}`);
    return { success: false, output: error.message };
  }
}

// Oracle database specific commands
app.command('/tablespace', async ({ command, ack, respond }) => {
  await ack();

  logger.info(`Tablespace command received from user: ${command.user_id}`);
  const hasAccess = await checkUserAccess(command.user_id, 'oracle');
  logger.info(`Access check result for tablespace: ${hasAccess}`);

  if (!hasAccess) {
    await respond(`:alert_red: You do not have access to tablespace information. Please contact Admins :cop::skin-tone-3:`);
    return;
  }

  // Parse the text to get the database option
  const text = command.text || '';
  const dbOption = text.toLowerCase().includes('db2') ? 'db2' : 'db1';
  const dbName = dbOption === 'db1' ? process.env.DB1_NAME || 'testdb-ho-01' : process.env.DB2_NAME || 'testdb-ho-04';

  await respond(`Checking tablespace information for ${dbName}... :hourglass_flowing_sand:`);

  const scriptPath = path.join(process.cwd(), 'Oracle/tablespace.py');
  const result = await executeScript(scriptPath, [`--db`, dbOption]);

  if (result.success) {
    await respond("```\n" + result.output + "```\n");
  } else {
    await respond(`:alert_red: Error retrieving tablespace information: ${result.output}`);
  }
});

app.command('/fra', async ({ command, ack, respond }) => {
  await ack();

  logger.info(`FRA command received from user: ${command.user_id}`);
  const hasAccess = await checkUserAccess(command.user_id, 'oracle');
  logger.info(`Access check result for FRA: ${hasAccess}`);

  if (!hasAccess) {
    await respond(`:alert_red: You do not have access to FRA information. Please contact Admins :cop::skin-tone-3:`);
    return;
  }

  // Parse the text to get the database option
  const text = command.text || '';
  const dbOption = text.toLowerCase().includes('db2') ? 'db2' : 'db1';
  const dbName = dbOption === 'db1' ? process.env.DB1_NAME || 'testdb-ho-01' : process.env.DB2_NAME || 'testdb-ho-04';

  await respond(`Checking FRA usage for ${dbName}... :hourglass_flowing_sand:`);

  const scriptPath = path.join(process.cwd(), 'Oracle/fra.py');
  const result = await executeScript(scriptPath, [`--db`, dbOption]);

  if (result.success) {
    await respond("```\n" + result.output + "```\n");
  } else {
    await respond(`:alert_red: Error retrieving FRA information: ${result.output}`);
  }
});

// GoldenGate status command
app.command('/gginfo', async ({ command, ack, respond }) => {
  await ack();

  logger.info(`GoldenGate info command received from user: ${command.user_id}`);
  const hasAccess = await checkUserAccess(command.user_id, 'oracle');
  logger.info(`Access check result for GoldenGate info: ${hasAccess}`);

  if (!hasAccess) {
    await respond(`:alert_red: You do not have access to GoldenGate information. Please contact Admins :cop::skin-tone-3:`);
    return;
  }

  // Parse the text to determine which host to use
  const text = command.text || '';
  const hostOption = text.toLowerCase().includes('gg2') ? 'gg2' : 'gg1';
  const hostName = hostOption === 'gg1' ? process.env.GG1_HOST : process.env.GG2_HOST;

  await respond(`Checking GoldenGate process status on ${hostName}... :hourglass_flowing_sand:`);

  const scriptPath = path.join(process.cwd(), 'GoldenGate/gg_status.py');
  const result = await executeScript(scriptPath, ['--host', hostOption, '--command', 'info']);

  if (result.success) {
    await respond("```\n" + result.output + "```\n");
  } else {
    await respond(`:alert_red: Error retrieving GoldenGate status: ${result.output}`);
  }
});

// GoldenGate credential store command
app.command('/ggcredstore', async ({ command, ack, respond }) => {
  await ack();

  logger.info(`GoldenGate credstore command received from user: ${command.user_id}`);
  const hasAccess = await checkUserAccess(command.user_id, 'oracle');
  logger.info(`Access check result for GoldenGate credstore: ${hasAccess}`);

  if (!hasAccess) {
    await respond(`:alert_red: You do not have access to GoldenGate credential store information. Please contact Admins :cop::skin-tone-3:`);
    return;
  }

  // Parse the text to determine which host to use
  const text = command.text || '';
  const hostOption = text.toLowerCase().includes('gg2') ? 'gg2' : 'gg1';
  const hostName = hostOption === 'gg1' ? process.env.GG1_HOST : process.env.GG2_HOST;

  await respond(`Checking GoldenGate credential store on ${hostName}... :hourglass_flowing_sand:`);

  const scriptPath = path.join(process.cwd(), 'GoldenGate/gg_status.py');
  const result = await executeScript(scriptPath, ['--host', hostOption, '--command', 'credstore']);

  if (result.success) {
    await respond("```\n" + result.output + "```\n");
  } else {
    await respond(`:alert_red: Error retrieving GoldenGate credential store information: ${result.output}`);
  }
});

// GoldenGate lag command
app.command('/gglag', async ({ command, ack, respond }) => {
  await ack();

  logger.info(`GoldenGate lag command received from user: ${command.user_id}`);
  const hasAccess = await checkUserAccess(command.user_id, 'oracle');
  logger.info(`Access check result for GoldenGate lag: ${hasAccess}`);

  if (!hasAccess) {
    await respond(`:alert_red: You do not have access to GoldenGate lag information. Please contact Admins :cop::skin-tone-3:`);
    return;
  }

  // Parse command text to get host and credential store
  const text = command.text || '';
  const args = text.split(' ');

  if (args.length < 1) {
    await respond(":alert_red: Please specify a credential store alias. Example: `/gglag ggalias` or `/gglag ggalias gg2`");
    return;
  }

  const credStore = args[0];
  const hostOption = args.length > 1 && args[1].toLowerCase() === 'gg2' ? 'gg2' : 'gg1';
  const hostName = hostOption === 'gg1' ? process.env.GG1_HOST : process.env.GG2_HOST;

  await respond(`Checking GoldenGate lag on ${hostName} using credential store '${credStore}'... :hourglass_flowing_sand:`);

  const scriptPath = path.join(process.cwd(), 'GoldenGate/gg_status.py');
  const result = await executeScript(scriptPath, ['--host', hostOption, '--command', 'lag', '--credstore', credStore]);

  if (result.success) {
    await respond("```\n" + result.output + "```\n");
  } else {
    await respond(`:alert_red: Error retrieving GoldenGate lag information: ${result.output}`);
  }
});

// Show user's email and profile information
app.command('/showmyemail', async ({ command, ack, respond }) => {
  await ack();

  try {
    logger.info(`Email check command received from user: ${command.user_id}`);
    const result = await app.client.users.info({ user: command.user_id });

    if (!result.ok) {
      throw new Error('Could not retrieve user information');
    }

    const { real_name, email, display_name } = result.user.profile;

    // Prepare configuration display
    let configDisplay;
    try {
      configDisplay = JSON.stringify(userConfig, null, 2);
    } catch (e) {
      configDisplay = "Error displaying config: " + e.message;
    }

    const message = [
      "*Your Slack Profile Information:*",
      `• Name: ${real_name}`,
      `• Display Name: ${display_name || 'Not set'}`,
      `• Email: ${email || 'No email found'}`,
      `• User ID: ${command.user_id}`,
      "",
      "*Configuration File Contents:*",
      "```",
      configDisplay,
      "```",
      "",
      "*Authorized User IDs:*",
      "```",
      JSON.stringify(AUTHORIZED_USER_IDS, null, 2),
      "```",
      "",
      "*Access Status:*",
      `• Admin access: ${AUTHORIZED_USER_IDS.admin.includes(command.user_id) ? '✅' : '❌'}`,
      `• Oracle access: ${AUTHORIZED_USER_IDS.oracle.includes(command.user_id) ? '✅' : '❌'}`,
      `• XM access: ${AUTHORIZED_USER_IDS.xm.includes(command.user_id) ? '✅' : '❌'}`
    ].join('\n');

    await respond(message);
    logger.info(`Email info sent to user: ${command.user_id}, email: ${email || 'undefined'}`);

  } catch (error) {
    logger.error(`Error showing email info: ${error.message}`);
    await respond(`:alert_red: Error retrieving your profile information: ${error.message}`);
  }
});

// Main message handler for help and instructions
app.message(async ({ message, say }) => {
  if (message.subtype === 'bot_message' || !message.text.includes(`<@${app.botId}>`)) {
    return;
  }

  await loadUserConfig();

  // Updated help message with multiple database options and GoldenGate commands
  const helpMessage = [
    "I'm Pulse Bot! :robot_face: I can help with various tasks including Oracle database monitoring.",
    "",
    ":database: *Oracle Database Commands*:",
    "• `/tablespace` - Check tablespace usage for default database (testdb-ho-01)",
    "• `/tablespace db2` - Check tablespace usage for second database (testdb-ho-04)",
    "• `/fra` - Check Flash Recovery Area for default database (testdb-ho-01)",
    "• `/fra db2` - Check Flash Recovery Area for second database (testdb-ho-04)",
    "",
    ":arrows_counterclockwise: *GoldenGate Commands*:",
    "• `/gginfo` - Check GoldenGate process status on testdb-ho-03",
    "• `/gginfo gg2` - Check GoldenGate process status on testdb-ho-06",
    "• `/ggcredstore` - List credential stores on testdb-ho-03",
    "• `/ggcredstore gg2` - List credential stores on testdb-ho-06",
    "• `/gglag ALIAS` - Check lag using credential store ALIAS on testdb-ho-03",
    "• `/gglag ALIAS gg2` - Check lag using credential store ALIAS on testdb-ho-06",
    "",
    "• `/showmyemail` - Show your email as seen by Slack"
  ].join("\n");

  await say(helpMessage);
});

// Start the app
(async () => {
  try {
    await loadUserConfig();
    const port = process.env.PORT || 3000;
    await app.start(port);
    logger.info(`⚡️ Pulse Bot is running on port ${port}`);
  } catch (error) {
    logger.error(`Failed to start app: ${error.message}`);
    process.exit(1);
  }
})();
