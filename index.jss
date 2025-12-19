const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  TextChannel,
  ActivityType
} = require('discord.js');

// ENV VARIABLES (Railway)
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const TICKET_BOT_ID = '1325579039888511056';
const VIP_TRADER_ROLE_ID = '1447166911174676593';

if (!DISCORD_TOKEN) {
  console.error('❌ ERROR: DISCORD_TOKEN is not set!');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel],
});

const getWarningMessage = (userId) => `
<@${userId}> **Please read carefully**

**IF YOU RECEIVE A DM FROM YOUR "MIDDLEMAN" DURING THIS TICKET IT IS AN IMPOSTER.**
DO NOT ANSWER unless it is a **PRIVATE SERVER LINK**.

Report suspicious activity to **@.lorked**

⚠️ **DO NOT REPLY — STAY IN THIS TICKET**
`;

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot ready! Logged in as ${c.user.tag}`);
  client.user.setActivity('for tickets', { type: ActivityType.Watching });
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    const channel = message.channel;
    if (!(channel instanceof TextChannel)) return;
    if (!channel.name.includes('ticket')) return;

    // Trigger 1: Ticket bot creates ticket
    if (message.author.id === TICKET_BOT_ID) {
      if (!channel.ownerId) return;

      await channel.send({
        content: getWarningMessage(channel.ownerId),
        allowedMentions: { parse: ['users'] }
      });

      console.log(`✅ Warning sent in #${channel.name}`);
      return;
    }

    // Trigger 2: VIP Trader types
    const member = message.member;
    if (!member) return;

    if (member.roles.cache.has(VIP_TRADER_ROLE_ID)) {
      if (!channel.ownerId) return;

      await message.reply({
        content: getWarningMessage(channel.ownerId),
        allowedMentions: { parse: ['users'], repliedUser: false }
      });

      console.log(`✅ VIP trader warning in #${channel.name}`);
    }
  } catch (err) {
    console.error('❌ Message handler error:', err);
  }
});

// Login with retry protection
let loginAttempts = 0;
const MAX_LOGIN_ATTEMPTS = 5;

async function startBot() {
  try {
    loginAttempts++;
    console.log(`🔄 Login attempt ${loginAttempts}/${MAX_LOGIN_ATTEMPTS}`);
    await client.login(DISCORD_TOKEN);
  } catch (err) {
    console.error('❌ Login failed:', err.message);

    if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      console.error('❌ Max login attempts reached. Exiting.');
      process.exit(1);
    }

    const delay = Math.min(1000 * 2 ** loginAttempts, 60000);
    setTimeout(startBot, delay);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('👋 Shutting down...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('👋 Shutting down...');
  client.destroy();
  process.exit(0);
});

startBot();
client.login(process.env.DISCORD_TOKEN);
