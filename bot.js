const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events, PermissionsBitField, ChannelType } = require('discord.js');
const Filter = require('bad-words');
const badwords = require('badwords-list');
const settings = require('./settings');

const token = process.env.DISCORD_TOKEN;
let hasToken = true;
if (!token) {
  console.warn('DISCORD_TOKEN not set; bot will not connect. Dashboard and API will remain available.');
  hasToken = false;
}

const initialPresence = settings.getSettings().botPresence || 'online';
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: ['CHANNEL'],
  presence: {
    activities: [{ name: 'Moderation active' }],
    status: initialPresence
  }
});

let botClient = null;
let connected = false;
let lastError = null;
let lastAttempt = null;
let loginAttempts = 0;
let desiredPresence = initialPresence;

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

const dmChatsFile = path.join(__dirname, 'dm-chats.json');

function loadDmChats() {
  try {
    const data = fs.readFileSync(dmChatsFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

function saveDmChats(chats) {
  try {
    fs.writeFileSync(dmChatsFile, JSON.stringify(chats, null, 2));
  } catch (error) {
    console.error('Unable to save DM chats:', error);
  }
}

function buildDmRecord(message, direction, userTagOverride = null) {
  const attachments = message.attachments?.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    url: attachment.url,
    proxyURL: attachment.proxyURL,
    contentType: attachment.contentType,
    width: attachment.width,
    height: attachment.height,
    size: attachment.size
  })) || [];
  const stickers = message.stickers?.map((sticker) => ({
    id: sticker.id,
    name: sticker.name,
    formatType: sticker.format?.toString?.() || sticker.formatType
  })) || [];
  return {
    direction,
    content: message.content || '',
    timestamp: message.createdTimestamp || Date.now(),
    userTag: userTagOverride || message.author?.tag || null,
    attachments,
    stickers,
    mentions: message.mentions?.users?.map((user) => user.tag) || []
  };
}

function recordDmMessage(userId, messageRecord) {
  if (!userId || !messageRecord) return;
  const chats = loadDmChats();
  if (!chats[userId]) chats[userId] = [];
  chats[userId].push(messageRecord);
  saveDmChats(chats);
}

function getDmHistory(userId) {
  if (!userId) return [];
  const chats = loadDmChats();
  return chats[userId] || [];
}

async function getGuilds() {
  if (!client || !client.guilds) return [];
  return client.guilds.cache.map((guild) => ({
    id: guild.id,
    name: guild.name,
    memberCount: guild.memberCount || 0,
    iconUrl: guild.iconURL({ size: 64, extension: 'png' })
  }));
}

async function getGuildMembers(guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return [];
  try {
    await guild.members.fetch();
  } catch (error) {
    console.error('Failed to fetch guild members:', error);
  }
  return guild.members.cache.map((member) => ({
    id: member.id,
    username: member.user.username,
    displayName: member.displayName || member.user.username,
    discriminator: member.user.discriminator,
    isBot: member.user.bot,
    presence: member.presence?.status || 'offline'
  }));
}

async function sendDirectMessage(userId, content) {
  if (!userId || !content) throw new Error('Missing userId or content');
  const user = await client.users.fetch(userId);
  if (!user) throw new Error('User not found');
  const dm = await user.createDM();
  const message = await dm.send(content);
  const record = buildDmRecord(message, 'outgoing', user.tag);
  recordDmMessage(userId, record);
  return message;
}

async function getDmUsers() {
  const chats = loadDmChats();
  const userIds = Object.keys(chats);
  const users = [];
  for (const userId of userIds) {
    const cachedUser = client.users.cache.get(userId);
    const user = cachedUser || await client.users.fetch(userId).catch(() => null);
    users.push({
      id: userId,
      username: user?.username || null,
      userTag: user?.tag || chats[userId][chats[userId].length - 1]?.userTag || userId,
      presence: user?.presence?.status || 'offline',
      messageCount: chats[userId].length,
      lastMessage: chats[userId][chats[userId].length - 1]
    });
  }
  return users;
}

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

client.on(Events.MessageCreate, async (message) => {
  if (message.author?.bot) return;
  if (message.channel.type === ChannelType.DM) {
    const record = buildDmRecord(message, 'incoming');
    recordDmMessage(message.author.id, record);
    return;
  }
  await moderateMessage(message);
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (newMessage.partial) return;
  if (newMessage.channel.type === ChannelType.DM) return;
  moderateMessage(newMessage);
});

function waitForClientReady(timeoutMs = 15000) {
  if (client.isReady && client.isReady()) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(Events.ClientReady, onReady);
      reject(new Error('Discord client did not become ready in time'));
    }, timeoutMs);

    const onReady = () => {
      clearTimeout(timer);
      resolve();
    };

    client.once(Events.ClientReady, onReady);
  });
}

async function startBot() {
  if (!hasToken) {
    console.log('Skipping Discord bot startup because DISCORD_TOKEN is not configured.');
    return null;
  }

  if (client.isReady && client.isReady()) {
    botClient = client;
    connected = true;
    await applyPresence(desiredPresence);
    return client;
  }

  const maxAttempts = 5;
  let delayMs = 1000;
  while (loginAttempts < maxAttempts && !connected) {
    loginAttempts += 1;
    lastAttempt = new Date().toISOString();
    console.log(`Bot login attempt ${loginAttempts}/${maxAttempts}...`);
    try {
      await client.login(token);
      botClient = client;
      lastError = null;
      console.log('Bot login succeeded, waiting for ready...');
      await waitForClientReady();
      connected = true;
      console.log('Discord client is ready.');
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
    return null;
  }

  if (botClient && botClient.user) {
    await applyPresence(desiredPresence);
  }

  return client;
}

async function applyPresence(status) {
  const allowedStatuses = ['online', 'idle', 'dnd'];
  if (!allowedStatuses.includes(status)) {
    console.warn(`Invalid presence status: ${status}`);
    return;
  }
  desiredPresence = status;
  if (client.user && client.user.setPresence) {
    try {
      const result = client.user.setPresence({ activities: [{ name: 'Moderation active' }], status });
      if (result && typeof result.then === 'function') {
        await result;
      }
      console.log(`Bot presence set to ${status}.`);
    } catch (err) {
      console.error('Failed to set bot presence:', err);
    }
  } else {
    console.warn('Bot client is not ready to set presence yet. Desired presence saved for later.');
  }
}

async function setBotPresence(status) {
  desiredPresence = status;
  await applyPresence(status);
}

async function getDmUsers() {
  const chats = loadDmChats();
  const userIds = Object.keys(chats);
  const users = [];
  for (const userId of userIds) {
    const cachedUser = client.users.cache.get(userId);
    const user = cachedUser || await client.users.fetch(userId).catch(() => null);
    users.push({
      id: userId,
      username: user?.username || null,
      userTag: user?.tag || chats[userId][chats[userId].length - 1]?.userTag || userId,
      presence: user?.presence?.status || 'offline',
      messageCount: chats[userId].length,
      lastMessage: chats[userId][chats[userId].length - 1]
    });
  }
  return users;
}

function getStatus() {
  const presence = botClient?.user?.presence?.status || desiredPresence || 'offline';
  return {
    connected,
    user: botClient?.user ? `${botClient.user.tag}` : null,
    presence,
    lastError,
    lastAttempt,
    loginAttempts
  };
}

module.exports = { startBot, getStatus, setBotPresence, getGuilds, getGuildMembers, getDmHistory, sendDirectMessage, getDmUsers };
