const botState = document.getElementById('bot-state');
const filterState = document.getElementById('filter-state');
const uptime = document.getElementById('uptime');
const botToggle = document.getElementById('bot-toggle');
const filterToggle = document.getElementById('filter-toggle');
const saveButton = document.getElementById('save-button');
const messageEl = document.getElementById('message');

async function fetchStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    botState.textContent = data.settings.botEnabled ? 'Enabled' : 'Disabled';
    filterState.textContent = data.settings.filterEnabled ? 'Enabled' : 'Disabled';
    uptime.textContent = `${data.uptimeSeconds} seconds`;
    botToggle.checked = data.settings.botEnabled;
    filterToggle.checked = data.settings.filterEnabled;
  } catch (error) {
    botState.textContent = 'Offline';
    filterState.textContent = 'Offline';
    uptime.textContent = 'N/A';
    messageEl.textContent = 'Unable to load status. Is the server running?';
  }
}

async function saveSettings() {
  saveButton.disabled = true;
  messageEl.textContent = 'Saving settings...';

  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botEnabled: botToggle.checked,
        filterEnabled: filterToggle.checked
      })
    });
    const data = await response.json();
    botState.textContent = data.settings.botEnabled ? 'Enabled' : 'Disabled';
    filterState.textContent = data.settings.filterEnabled ? 'Enabled' : 'Disabled';
    messageEl.textContent = 'Settings saved.';
  } catch (error) {
    messageEl.textContent = 'Failed to save settings.';
  } finally {
    saveButton.disabled = false;
  }
}

saveButton.addEventListener('click', saveSettings);
window.addEventListener('DOMContentLoaded', fetchStatus);
