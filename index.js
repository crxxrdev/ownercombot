const express = require('express');
const path = require('path');
const settings = require('./settings');
const { startBot } = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json({
    settings: settings.getSettings(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.post('/api/settings', (req, res) => {
  const { botEnabled, filterEnabled } = req.body;
  if (typeof botEnabled === 'boolean') {
    settings.set('botEnabled', botEnabled);
  }
  if (typeof filterEnabled === 'boolean') {
    settings.set('filterEnabled', filterEnabled);
  }
  return res.json({ settings: settings.getSettings() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = parseInt(process.env.PORT, 10) || 3000;
app.listen(port, async () => {
  console.log(`Dashboard available at http://localhost:${port}`);
  await startBot();
});
