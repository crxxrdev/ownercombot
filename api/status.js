const settings = require('../settings');

module.exports = (req, res) => {
  res.status(200).json({
    settings: settings.getSettings(),
    uptimeSeconds: 0,
    note: 'Vercel serverless functions have no persistent uptime.'
  });
};
