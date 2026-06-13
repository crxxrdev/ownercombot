const fs = require('fs');
const path = require('path');

const settingsFile = path.join(__dirname, 'settings.json');
const defaultSettings = {
  botEnabled: true,
  filterEnabled: true,
  adminBypass: true
};
// Added: adminBypass allows admins to be exempt from moderation when true

function loadSettings() {
  try {
    const fileContent = fs.readFileSync(settingsFile, 'utf8');
    return Object.assign({}, defaultSettings, JSON.parse(fileContent));
  } catch (error) {
    return Object.assign({}, defaultSettings);
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Unable to save settings:', error);
  }
}

function getSettings() {
  return loadSettings();
}

function set(key, value) {
  const current = loadSettings();
  if (Object.prototype.hasOwnProperty.call(defaultSettings, key)) {
    current[key] = value;
    saveSettings(current);
  }
  return current;
}

module.exports = { getSettings, set };
