require('dotenv').config();
const express = require('express');
const path = require('path');
const settings = require('./settings');
const { startBot, getStatus, setBotPresence, getGuilds, getGuildMembers, getDmUsers, getDmHistory, sendDirectMessage } = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json({
    settings: settings.getSettings(),
    uptimeSeconds: Math.floor(process.uptime()),
    bot: getStatus()
  });
});

app.get('/health', (req, res) => {
  res.json({
    settings: settings.getSettings(),
    uptimeSeconds: Math.floor(process.uptime()),
    bot: getStatus()
  });
});

app.post('/api/settings', (req, res) => {
  const { botEnabled, filterEnabled, adminBypass, botPresence } = req.body;
  if (typeof botEnabled === 'boolean') {
    settings.set('botEnabled', botEnabled);
  }
  if (typeof filterEnabled === 'boolean') {
    settings.set('filterEnabled', filterEnabled);
  }
  if (typeof adminBypass === 'boolean') {
    settings.set('adminBypass', adminBypass);
  }
  if (typeof botPresence === 'string') {
    settings.set('botPresence', botPresence);
    setBotPresence(botPresence);
  }
  return res.json({ settings: settings.getSettings() });
});

app.get('/api/guilds', async (req, res) => {
  try {
    const status = getStatus();
    if (!status.connected) return res.status(503).json({ error: 'Bot is not connected to Discord', status });
    const guilds = await getGuilds();
    return res.json({ guilds });
  } catch (error) {
    console.error('Failed to load guilds:', error);
    return res.status(500).json({ error: 'Unable to load guilds' });
  }
});

app.get('/api/guilds/:guildId/members', async (req, res) => {
  try {
    const status = getStatus();
    if (!status.connected) return res.status(503).json({ error: 'Bot is not connected to Discord', status });
    const members = await getGuildMembers(req.params.guildId);
    return res.json({ members });
  } catch (error) {
    console.error('Failed to load guild members:', error);
    return res.status(500).json({ error: 'Unable to load guild members' });
  }
});

app.get('/api/dm-users', async (req, res) => {
  try {
    const status = getStatus();
    if (!status.connected) return res.status(503).json({ error: 'Bot is not connected to Discord', status });
    const users = await getDmUsers();
    return res.json({ users });
  } catch (error) {
    console.error('Failed to load DM users:', error);
    return res.status(500).json({ error: 'Unable to load DM users' });
  }
});

app.get('/api/dm-users/:userId/history', async (req, res) => {
  try {
    const status = getStatus();
    if (!status.connected) return res.status(503).json({ error: 'Bot is not connected to Discord', status });
    const history = await getDmHistory(req.params.userId);
    return res.json({ history });
  } catch (error) {
    console.error('Failed to load DM history:', error);
    return res.status(500).json({ error: 'Unable to load DM history' });
  }
});

app.post('/api/dm-users/:userId/send', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }
    const status = getStatus();
    if (!status.connected) return res.status(503).json({ error: 'Bot is not connected to Discord', status });
    const message = await sendDirectMessage(req.params.userId, content.trim());
    return res.json({ message: { id: message.id, content: message.content, createdTimestamp: message.createdTimestamp } });
  } catch (error) {
    console.error('Failed to send DM:', error);
    return res.status(500).json({ error: 'Unable to send DM' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = parseInt(process.env.PORT, 10) || 3000;
app.listen(port, async () => {
  console.log(`Dashboard available at http://localhost:${port}`);

  const token = process.env.DISCORD_TOKEN;
  if (token) {
    const masked = token.length > 8 ? `${token.slice(0,4)}...${token.slice(-4)}` : '***';
    console.log(`DISCORD_TOKEN present (masked): ${masked}`);
  } else {
    console.warn('DISCORD_TOKEN is not set. The bot will not connect until you set this environment variable.');
  }

  const bot = await startBot();
  const status = getStatus();
  const { botPresence } = settings.getSettings();
  if (botPresence) {
    setBotPresence(botPresence);
  }
  console.log('Bot status after startup:', status);
});
