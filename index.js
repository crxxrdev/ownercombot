require('dotenv').config();
const express = require('express');
const path = require('path');
const settings = require('./settings');
const { startBot, getStatus } = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json({
    settings: settings.getSettings(),
    uptimeSeconds: Math.floor(process.uptime())
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
  const { botEnabled, filterEnabled, adminBypass } = req.body;
  if (typeof botEnabled === 'boolean') {
    settings.set('botEnabled', botEnabled);
  }
  if (typeof filterEnabled === 'boolean') {
    settings.set('filterEnabled', filterEnabled);
  }
  if (typeof adminBypass === 'boolean') {
    settings.set('adminBypass', adminBypass);
  }
  return res.json({ settings: settings.getSettings() });
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
  console.log('Bot status after startup:', status);
});
