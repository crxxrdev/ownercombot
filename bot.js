const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events, PermissionsBitField } = require('discord.js');
const Filter = require('bad-words');
const badwords = require('badwords-list');
const settings = require('./settings');

const token = process.env.DISCORD_TOKEN;
let hasToken = true;
if (!token) {
  console.warn('DISCORD_TOKEN not set; bot will not connect. Dashboard and API will remain available.');
  hasToken = false;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let botClient = null;
let connected = false;
let lastError = null;
let lastAttempt = null;
let loginAttempts = 0;
let desiredPresence = settings.getSettings().botPresence || 'online';

const filter = new Filter();
filter.addWords(...badwords.array);

function loadCustomWords() {
  const filePath = path.join(__dirname, 'blocked-words.txt');
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

const customWords = loadCustomWords();
if (customWords.length > 0) {
  filter.addWords(...customWords);
}

const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.mp4', '.mov', '.webm'];

const inviteRegex = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg)\/[A-Za-z0-9-]+/i;

function containsInvite(text) {
  if (!text) return false;
  return inviteRegex.test(text);
}

async function scanImageUrl(imageUrl) {
  const apiUrl = process.env.IMAGE_MODERATION_API_URL;
  const apiKey = process.env.IMAGE_MODERATION_API_KEY;
  if (!apiUrl || !apiKey) return false;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ imageUrl })
    });
    const data = await response.json();
    return Boolean(data.blocked || data.flagged || data.isUnsafe || data.isAdult || data.isViolent);
  } catch (error) {
    console.error('Image moderation check failed:', error);
    return false;
  }
}

function hasBlockedContent(text) {
  if (!text) return false;
  if (filter.isProfane(text)) return true;
  if (containsInvite(text)) return true;
  return imageExtensions.some(ext => text.toLowerCase().includes(ext));
}

async function hasImageOrAttachment(message) {
  if (message.attachments?.size > 0) {
    for (const attachment of message.attachments.values()) {
      if (imageExtensions.some(ext => attachment.url.toLowerCase().includes(ext))) {
        return true;
      }
      if (await scanImageUrl(attachment.url)) {
        return true;
      }
    }
  }
  if (message.embeds?.some(embed => ['image', 'gifv', 'video'].includes(embed.type))) {
    return true;
  }
  if (message.content) {
    const text = message.content.toLowerCase();
    if (containsInvite(message.content)) return true;
    return imageExtensions.some(ext => text.includes(ext));
  }
  return false;
}

function shouldDeleteMessage(message) {
  if (!message || message.author?.bot) return false;
  const { botEnabled, filterEnabled } = settings.getSettings();
  if (!botEnabled || !filterEnabled) return false;

  const text = message.content || '';
  return hasBlockedContent(text) || message.attachments?.size > 0 || (message.embeds?.some(embed => ['image', 'gifv', 'video'].includes(embed.type)));
}

async function moderateMessage(message) {
  // Allow server administrators to bypass moderation if configured
  const { adminBypass } = settings.getSettings();
  if (adminBypass && message.member?.permissions?.has && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return;
  }

  if (shouldDeleteMessage(message)) {
    try {
      await message.delete();
      const channelName = message.channel?.name || 'DM';
      console.log(`Deleted message from ${message.author.tag} in ${channelName}`);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  }
}

client.once(Events.ClientReady, () => {
  botClient = client;
  connected = true;
  lastError = null;
  console.log(`Logged in as ${client.user.tag}. Moderation is active.`);
  applyPresence(desiredPresence);
});

client.on('shardDisconnect', (event, shardId) => {
  connected = false;
  console.warn('Bot shard disconnected', { shardId, event });
});

client.on('error', (err) => {
  connected = false;
  console.error('Discord client error:', err);
});

client.on(Events.MessageCreate, moderateMessage);
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (newMessage.partial) return;
  moderateMessage(newMessage);
});

async function startBot() {
  if (!hasToken) {
    console.log('Skipping Discord bot startup because DISCORD_TOKEN is not configured.');
    return null;
  }

  if (client.isReady()) {
    botClient = client;
    connected = true;
    applyPresence(desiredPresence);
    return client;
  }

  // Attempt login with retries and exponential backoff
  const maxAttempts = 5;
  let delayMs = 1000;
  while (loginAttempts < maxAttempts && !connected) {
    loginAttempts += 1;
    lastAttempt = new Date().toISOString();
    console.log(`Bot login attempt ${loginAttempts}/${maxAttempts}...`);
    try {
      await client.login(token);
      botClient = client;
      connected = true;
      lastError = null;
      console.log('Bot logged in successfully.');
      break;
    } catch (err) {
      lastError = (err && err.message) ? err.message : String(err);
      connected = false;
      console.error(`Bot login failed (attempt ${loginAttempts}):`, lastError);
      if (loginAttempts >= maxAttempts) break;
      await new Promise(r => setTimeout(r, delayMs));
      delayMs *= 2;
    }
  }

  if (!connected) {
    console.error('Bot failed to connect after retries. Check DISCORD_TOKEN and network access.');
  }
  if (connected && botClient && botClient.user) {
    applyPresence(desiredPresence);
  }

  return connected ? client : null;
}

function applyPresence(status) {
  const allowedStatuses = ['online', 'idle', 'dnd'];
  if (!allowedStatuses.includes(status)) {
    return;
  }
  desiredPresence = status;
  if (client.user && client.user.setPresence) {
    client.user.setPresence({ activities: [{ name: 'Moderation active' }], status });
    console.log(`Bot presence set to ${status}.`);
  }
}

function setBotPresence(status) {
  desiredPresence = status;
  applyPresence(status);
}

function getStatus() {
  return {
    connected,
    user: botClient?.user ? `${botClient.user.tag}` : null,
    lastError,
    lastAttempt,
    loginAttempts
  };
}

module.exports = { startBot, getStatus, setBotPresence };
