const botState = document.getElementById('bot-state');
const presenceState = document.getElementById('presence-state');
const filterState = document.getElementById('filter-state');
const uptime = document.getElementById('uptime');
const botToggle = document.getElementById('bot-toggle');
const filterToggle = document.getElementById('filter-toggle');
const adminToggle = document.getElementById('admin-toggle');
const presenceSelect = document.getElementById('presence-select');
const saveButton = document.getElementById('save-button');
const messageEl = document.getElementById('message');

async function fetchStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    botState.textContent = data.settings.botEnabled ? 'Enabled' : 'Disabled';
    presenceState.textContent = data.settings.botPresence ? capitalizePresence(data.settings.botPresence) : 'Unknown';
    filterState.textContent = data.settings.filterEnabled ? 'Enabled' : 'Disabled';
    uptime.textContent = `${data.uptimeSeconds} seconds`;
    botToggle.checked = data.settings.botEnabled;
    filterToggle.checked = data.settings.filterEnabled;
    if (adminToggle) adminToggle.checked = data.settings.adminBypass;
    if (presenceSelect && data.settings.botPresence) {
      presenceSelect.value = data.settings.botPresence;
    }
  } catch (error) {
    botState.textContent = 'Offline';
    filterState.textContent = 'Offline';
    uptime.textContent = 'N/A';
    messageEl.textContent = 'Unable to load status. Is the server running?';
  }
}

function capitalizePresence(status) {
  if (status === 'dnd') return 'Do Not Disturb';
  return status.charAt(0).toUpperCase() + status.slice(1);
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
        filterEnabled: filterToggle.checked,
        adminBypass: adminToggle ? adminToggle.checked : false,
        botPresence: presenceSelect ? presenceSelect.value : 'online'
      })
    });
    const data = await response.json();
    botState.textContent = data.settings.botEnabled ? 'Enabled' : 'Disabled';
    presenceState.textContent = data.settings.botPresence ? capitalizePresence(data.settings.botPresence) : 'Unknown';
    filterState.textContent = data.settings.filterEnabled ? 'Enabled' : 'Disabled';
    if (adminToggle) adminToggle.checked = data.settings.adminBypass;
    if (presenceSelect && data.settings.botPresence) {
      presenceSelect.value = data.settings.botPresence;
    }
    messageEl.textContent = 'Settings saved.';
  } catch (error) {
    messageEl.textContent = 'Failed to save settings.';
  } finally {
    saveButton.disabled = false;
  }
}

saveButton.addEventListener('click', saveSettings);
window.addEventListener('DOMContentLoaded', fetchStatus);
