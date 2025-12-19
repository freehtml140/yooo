import { Client, GatewayIntentBits, Partials, Events, TextChannel, ActivityType } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WARNED_CHANNELS_FILE = path.join(__dirname, 'warned_channels.json');

// Track channels where warning has been sent
let warnedChannels = new Set<string>();

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
    console.error('[Discord Bot] Failed to load warned channels:', (e as Error).message);
  }
};

// Save warned channels to file
const saveWarnedChannels = () => {
  try {
    fs.writeFileSync(WARNED_CHANNELS_FILE, JSON.stringify(Array.from(warnedChannels), null, 2));
  } catch (e) {
    console.error('[Discord Bot] Failed to save warned channels:', (e as Error).message);
  }
};

// Load on startup
loadWarnedChannels();

const getWarningMessage = (userId: string) => `<@${userId}> **Please read carefully**
*IF YOU RECIEVE A DM FROM YOUR "MIDDLEMAN" DURING THIS TICKET ITS A IMPOSTER, DO NOT ANSWER! UNLESS ITS A PRIVATE SERVER LINK! REPORT ANY SUSPICOUS STUFF TO @.lorked*

DO NOT REPLY STAY IN TICKET UNLESS ITS A PRIVATE SERVER LINK!`;

client.once(Events.ClientReady, c => {
  console.log(`[Discord Bot] Ready! Logged in as ${c.user?.tag}`);
  console.log(`[Discord Bot] Monitoring ${c.guilds.cache.size} server(s)`);
  
  c.guilds.cache.forEach(guild => {
    const ticketChannels = guild.channels.cache.filter(ch => ch.name && ch.name.toLowerCase().includes('ticket'));
    console.log(`[Discord Bot] Server: ${guild.name} - Found ${ticketChannels.size} ticket channel(s)`);
    ticketChannels.forEach(ch => {
      console.log(`  - #${ch.name} (ID: ${ch.id})`);
    });
  });
  
  client.user?.setActivity('for tickets', { type: ActivityType.Watching });
});

client.on(Events.Error, error => {
  console.error('[Discord Bot Error]', error);
});

client.on(Events.Warn, warning => {
  console.warn('[Discord Bot Warning]', warning);
});

client.on(Events.Disconnect, () => {
  console.log('[Discord Bot] Disconnected from Discord');
});

client.on(Events.InvalidationCreate, () => {
  console.log('[Discord Bot] Session invalidated, will reconnect...');
});

client.on(Events.MessageCreate, async message => {
  try {
    // Skip DMs
    if (!message.guild) {
      return;
    }

    // Ignore messages from this bot itself to prevent loops
    if (message.author.id === client.user?.id) {
      return;
    }

    const channel = message.channel;
    const isTicketChannel = channel instanceof TextChannel && channel.name.toLowerCase().includes('ticket');

    // Log all messages in ticket channels for debugging
    if (isTicketChannel) {
      console.log(`[Discord Bot] Message in #${(channel as TextChannel).name} from ${message.author.tag}: "${message.content.substring(0, 50)}..."`);
    }

    // Helper function to get ticket creator user ID
    const getTicketCreatorId = async (ticketChannel: TextChannel): Promise<string | null> => {
      // Try to get owner ID
      if (ticketChannel.ownerId) {
        return ticketChannel.ownerId;
      }

      // Fetch channel to refresh data
      const fetchedChannel = await ticketChannel.guild.channels.fetch(ticketChannel.id) as TextChannel;
      if (fetchedChannel?.ownerId) {
        return fetchedChannel.ownerId;
      }

      // Try to extract from channel topic/subject
      if (ticketChannel.topic && ticketChannel.topic.includes('<@')) {
        const match = ticketChannel.topic.match(/<@!?(\d+)>/);
        if (match) return match[1];
      }

      // Try to find from first message
      try {
        const firstMessage = await ticketChannel.messages.fetch({ limit: 100, cache: false });
        const creatorMsg = firstMessage.reverse().find(m => !m.author.bot);
        if (creatorMsg) return creatorMsg.author.id;
      } catch (e) {
        console.log("[Discord Bot] Could not fetch messages to find creator");
      }

      return null;
    };

    // Trigger 1: Ticket Bot creates a ticket (sends a message)
    if (message.author.id === TICKET_BOT_ID && isTicketChannel) {
      const textChannel = channel as TextChannel;
      // Only send warning once per channel
      if (!warnedChannels.has(textChannel.id)) {
        try {
          const owner = await getTicketCreatorId(textChannel);
          console.log(`[Discord Bot] Ticket bot message detected. Channel owner: ${owner}`);
          if (owner) {
            const warningMessage = getWarningMessage(owner);
            await message.channel.send({
              content: warningMessage,
              allowedMentions: { parse: ['users'] }
            });
            warnedChannels.add(textChannel.id);
            saveWarnedChannels();
            console.log(`[Discord Bot] ✅ Sent ticket warning in #${textChannel.name} to ${owner}`);
          } else {
            console.log(`[Discord Bot] ⚠️  Could not find ticket creator in #${textChannel.name}`);
          }
        } catch (e) {
          console.error("[Discord Bot] Failed to send ticket creation warning:", (e as Error).message);
        }
      }
      return;
    }

    // Trigger 2: VIP Trader types in ticket
    if (isTicketChannel) {
      const textChannel = channel as TextChannel;
      // Only send warning once per channel
      if (!warnedChannels.has(textChannel.id)) {
        const member = message.member;
        if (!member) {
          console.log(`[Discord Bot] Could not get member info for ${message.author.tag}`);
          return;
        }

        const hasVipRole = member.roles.cache.has(VIP_TRADER_ROLE_ID);
        if (hasVipRole) {
          console.log(`[Discord Bot] VIP Trader detected: ${member.user.tag}`);
          try {
            const owner = await getTicketCreatorId(textChannel);
            if (owner) {
              const warningMessage = getWarningMessage(owner);
              await message.reply({
                content: warningMessage,
                allowedMentions: { parse: ['users'], repliedUser: false }
              });
              warnedChannels.add(textChannel.id);
              saveWarnedChannels();
              console.log(`[Discord Bot] ✅ Replied to VIP trader ${member.user.tag}, pinged creator ${owner}`);
            } else {
              console.log(`[Discord Bot] ⚠️  Could not find ticket creator to ping`);
            }
          } catch (e) {
            console.error("[Discord Bot] Failed to reply to VIP trader:", (e as Error).message);
          }
        }
      }
    }
  } catch (e) {
    console.error("[Discord Bot] Unexpected error in message handler:", (e as Error).message);
  }
});

let loginAttempts = 0;
const MAX_LOGIN_ATTEMPTS = 5;

export function setupBot() {
  if (!process.env.DISCORD_TOKEN) {
    console.log("[Discord Bot] Skipping bot login: DISCORD_TOKEN not found in environment variables.");
    return;
  }

  const attemptLogin = async () => {
    try {
      if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        console.error("[Discord Bot] Max login attempts reached. Giving up.");
        return;
      }

      loginAttempts++;
      console.log(`[Discord Bot] Login attempt ${loginAttempts}/${MAX_LOGIN_ATTEMPTS}...`);
      await client.login(process.env.DISCORD_TOKEN);
      loginAttempts = 0; // Reset on successful login
    } catch (err) {
      console.error(`[Discord Bot] Login failed (attempt ${loginAttempts}/${MAX_LOGIN_ATTEMPTS}):`, err);
      
      if (loginAttempts < MAX_LOGIN_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, loginAttempts - 1), 60000); // Exponential backoff, max 60s
        console.log(`[Discord Bot] Retrying in ${delay}ms...`);
        setTimeout(attemptLogin, delay);
      }
    }
  };

  attemptLogin();
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Discord Bot] Graceful shutdown initiated...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Discord Bot] Graceful shutdown initiated...');
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
