const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const Filter = require('bad-words');
const badwords = require('badwords-list');
const settings = require('./settings');

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Missing DISCORD_TOKEN in .env or environment.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

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
  console.log(`Logged in as ${client.user.tag}. Moderation is active.`);
});

client.on(Events.MessageCreate, moderateMessage);
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (newMessage.partial) return;
  moderateMessage(newMessage);
});

async function startBot() {
  if (client.isReady()) {
    return client;
  }
  await client.login(token);
  return client;
}

module.exports = { startBot };
