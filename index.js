const { Client, GatewayIntentBits, Partials, Events, TextChannel, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');

if (!process.env.DISCORD_TOKEN) {
  console.warn("DISCORD_TOKEN not set, bot will not start.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
  failIfNotExists: false,
});

const TICKET_BOT_ID = '1325579039888511056';
const VIP_TRADER_ROLE_ID = '1447166911174676593';
const WARNED_CHANNELS_FILE = path.join(__dirname, 'warned_channels.json');

// Track channels where warning has been sent
let warnedChannels = new Set();

// Load warned channels from file
const loadWarnedChannels = () => {
  try {
    if (fs.existsSync(WARNED_CHANNELS_FILE)) {
      const data = fs.readFileSync(WARNED_CHANNELS_FILE, 'utf-8');
      const channels = JSON.parse(data);
      warnedChannels = new Set(channels);
      console.log(`[Discord Bot] Loaded ${warnedChannels.size} previously warned channels`);
    }
  } catch (e) {
    console.error('[Discord Bot] Failed to load warned channels:', e.message);
  }
};

// Save warned channels to file
const saveWarnedChannels = () => {
  try {
    fs.writeFileSync(WARNED_CHANNELS_FILE, JSON.stringify(Array.from(warnedChannels), null, 2));
  } catch (e) {
    console.error('[Discord Bot] Failed to save warned channels:', e.message);
  }
};

// Load on startup
loadWarnedChannels();

const getWarningMessage = (userId) => `<@${userId}> **Please read carefully**
*IF YOU RECEIVE A DM FROM YOUR "MIDDLEMAN" DURING THIS TICKET ITS A IMPOSTER, DO NOT ANSWER! UNLESS ITS A PRIVATE SERVER LINK! REPORT ANY SUSPICIOUS STUFF TO @koodaf*

DO NOT REPLY STAY IN TICKET UNLESS ITS A PRIVATE SERVER LINK!`;

client.once(Events.ClientReady, c => {
  console.log(`[Discord Bot] Ready! Logged in as ${c.user.tag}`);
  client.user.setActivity('for tickets', { type: ActivityType.Watching });
});

client.on(Events.Error, error => console.error('[Discord Bot Error]', error));
client.on(Events.Warn, warning => console.warn('[Discord Bot Warning]', warning));
client.on(Events.Disconnect, () => console.log('[Discord Bot] Disconnected from Discord'));

client.on(Events.MessageCreate, async message => {
  try {
    if (!message.guild || message.author.id === client.user.id) return;

    const channel = message.channel;
    const isTicketChannel = channel instanceof TextChannel && channel.name.toLowerCase().includes('ticket');

    if (!isTicketChannel) return;

    const getTicketCreatorId = async (ticketChannel) => {
      if (ticketChannel.ownerId) return ticketChannel.ownerId;

      try {
        const fetchedChannel = await ticketChannel.guild.channels.fetch(ticketChannel.id);
        if (fetchedChannel?.ownerId) return fetchedChannel.ownerId;
      } catch {}

      if (ticketChannel.topic && ticketChannel.topic.includes('<@')) {
        const match = ticketChannel.topic.match(/<@!?(\d+)>/);
        if (match) return match[1];
      }

      try {
        const messages = await ticketChannel.messages.fetch({ limit: 100, cache: false });
        const firstMessage = messages.reverse().find(m => !m.author.bot);
        if (firstMessage) return firstMessage.author.id;
      } catch {}

      return null;
    };

    if (message.author.id === TICKET_BOT_ID && !warnedChannels.has(channel.id)) {
      const owner = await getTicketCreatorId(channel);
      if (owner) {
        await message.channel.send({
          content: getWarningMessage(owner),
          allowedMentions: { parse: ['users'] }
        });
        warnedChannels.add(channel.id);
        saveWarnedChannels();
        console.log(`[Discord Bot] Sent warning in #${channel.name}`);
      }
      return;
    }

    const member = message.member;
    if (!member) return;

    if (member.roles.cache.has(VIP_TRADER_ROLE_ID) && !warnedChannels.has(channel.id)) {
      const owner = await getTicketCreatorId(channel);
      if (owner) {
        await message.reply({
          content: getWarningMessage(owner),
          allowedMentions: { parse: ['users'], repliedUser: false }
        });
        warnedChannels.add(channel.id);
        saveWarnedChannels();
        console.log(`[Discord Bot] Replied to VIP trader ${member.user.tag}`);
      }
    }

  } catch (e) {
    console.error('[Discord Bot] Message handler error:', e.message);
  }
});

let loginAttempts = 0;
const MAX_LOGIN_ATTEMPTS = 5;

const attemptLogin = async () => {
  try {
    if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      console.error("[Discord Bot] Max login attempts reached.");
      return;
    }

    loginAttempts++;
    console.log(`[Discord Bot] Login attempt ${loginAttempts}/${MAX_LOGIN_ATTEMPTS}...`);
    await client.login(process.env.DISCORD_TOKEN);
    loginAttempts = 0;
  } catch (err) {
    console.error(`[Discord Bot] Login failed:`, err.message);
    if (loginAttempts < MAX_LOGIN_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, loginAttempts - 1), 60000);
      console.log(`[Discord Bot] Retrying in ${delay}ms...`);
      setTimeout(attemptLogin, delay);
    }
  }
};

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Discord Bot] Graceful shutdown...');
  client.destroy();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('[Discord Bot] Graceful shutdown...');
  client.destroy();
  process.exit(0);
});

// Start the bot
attemptLogin();

client.login(process.env.DISCORD_TOKEN)
