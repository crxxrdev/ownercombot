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
const serverList = document.getElementById('server-list');
const memberList = document.getElementById('member-list');
const dmUsersList = document.getElementById('dm-users-list');
const dmHistoryList = document.getElementById('dm-history-list');
const dmUserTitle = document.getElementById('dm-user-title');
const dmMessageInput = document.getElementById('dm-message-input');
const sendDmButton = document.getElementById('send-dm-button');
const dmTabHistory = document.getElementById('dm-tab-history');
const dmTabLive = document.getElementById('dm-tab-live');
const dmLiveIndicator = document.getElementById('dm-live-indicator');

let selectedGuildId = null;
let selectedUserId = null;
let selectedUserName = null;
let dmViewMode = 'history';
let liveInterval = null;
const LIVE_REFRESH_MS = 3000;
let botConnected = false;

async function fetchStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    botState.textContent = data.settings.botEnabled ? 'Enabled' : 'Disabled';
    botConnected = Boolean(data.bot?.connected);
    presenceState.textContent = data.bot?.presence ? capitalizePresence(data.bot.presence) : (data.settings.botPresence ? capitalizePresence(data.settings.botPresence) : 'Unknown');
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

async function fetchGuilds() {
  if (!botConnected) {
    serverList.textContent = 'Bot is offline or not connected to Discord.';
    return;
  }
  try {
    const response = await fetch('/api/guilds');
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      serverList.textContent = err.error || 'Unable to load servers.';
      return;
    }
    const { guilds } = await response.json();
    renderGuilds(guilds);
  } catch (error) {
    console.error('Failed to fetch guilds', error);
    serverList.textContent = 'Unable to load servers.';
  }
}

async function fetchGuildMembers(guildId) {
  if (!botConnected) {
    memberList.textContent = 'Bot is offline or not connected to Discord.';
    return;
  }
  try {
    memberList.textContent = 'Loading members...';
    const response = await fetch(`/api/guilds/${guildId}/members`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      memberList.textContent = err.error || 'Unable to load members.';
      return;
    }
    const { members } = await response.json();
    renderMembers(members);
  } catch (error) {
    console.error('Failed to fetch members', error);
    memberList.textContent = 'Unable to load members.';
  }
}

async function fetchDmUsers() {
  if (!botConnected) {
    dmUsersList.textContent = 'Bot is offline or not connected to Discord.';
    return;
  }
  try {
    const response = await fetch('/api/dm-users');
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      dmUsersList.textContent = err.error || 'Unable to load DM contacts.';
      return;
    }
    const { users } = await response.json();
    renderDmUsers(users);
  } catch (error) {
    console.error('Failed to fetch DM users', error);
    dmUsersList.textContent = 'Unable to load DM contacts.';
  }
}

async function fetchDmHistory(userId) {
  if (!botConnected) {
    dmHistoryList.textContent = 'Bot is offline or not connected to Discord.';
    return;
  }
  try {
    dmHistoryList.textContent = 'Loading chat...';
    const response = await fetch(`/api/dm-users/${userId}/history`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      dmHistoryList.textContent = err.error || 'Unable to load chat history.';
      return;
    }
    const { history } = await response.json();
    renderDmHistory(history);
  } catch (error) {
    console.error('Failed to fetch DM history', error);
    dmHistoryList.textContent = 'Unable to load chat history.';
  }
}

function capitalizePresence(status) {
  if (status === 'dnd') return 'Do Not Disturb';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function renderGuilds(guilds) {
  if (!guilds || guilds.length === 0) {
    serverList.textContent = 'Bot is not in any servers.';
    return;
  }
  serverList.innerHTML = '';
  guilds.forEach((guild) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <strong>${guild.name}</strong>
      <span>${guild.memberCount || 0} members</span>
    `;
    item.addEventListener('click', () => {
      selectedGuildId = guild.id;
      fetchGuildMembers(guild.id);
    });
    serverList.appendChild(item);
  });
}

function renderMembers(members) {
  if (!members || members.length === 0) {
    memberList.textContent = 'No members found for this server.';
    return;
  }
  memberList.innerHTML = '';
  members.forEach((member) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="member-line">
        <span>${member.displayName} (${member.username}#${member.discriminator})</span>
        <span class="presence-pill ${member.presence || 'offline'}">${capitalizePresence(member.presence || 'offline')}</span>
      </div>
      <small>ID: ${member.id}</small>
    `;
    item.addEventListener('click', () => {
      selectUser(member.id, `${member.displayName} (${member.username}#${member.discriminator})`);
    });
    memberList.appendChild(item);
  });
}

function selectUser(userId, displayName) {
  selectedUserId = userId;
  selectedUserName = displayName;
  dmUserTitle.textContent = `Chat with ${displayName}`;
  sendDmButton.disabled = false;
  if (dmViewMode === 'live') {
    startLivePreview();
  } else {
    stopLivePreview();
    fetchDmHistory(userId);
  }
}

function startLivePreview() {
  stopLivePreview();
  if (!selectedUserId) return;
  fetchDmHistory(selectedUserId);
  liveInterval = setInterval(() => {
    fetchDmHistory(selectedUserId);
  }, LIVE_REFRESH_MS);
}

function stopLivePreview() {
  if (liveInterval) {
    clearInterval(liveInterval);
    liveInterval = null;
  }
}

function setDmViewMode(mode) {
  dmViewMode = mode;
  dmTabHistory.classList.toggle('active', mode === 'history');
  dmTabLive.classList.toggle('active', mode === 'live');
  dmLiveIndicator.textContent = mode === 'live' ? 'Live' : 'Paused';
  dmLiveIndicator.classList.toggle('live', mode === 'live');

  if (!selectedUserId) return;
  if (mode === 'live') {
    startLivePreview();
  } else {
    stopLivePreview();
    fetchDmHistory(selectedUserId);
  }
}

function renderDmUsers(users) {
  if (!users || users.length === 0) {
    dmUsersList.textContent = 'No DM contacts yet.';
    return;
  }
  dmUsersList.innerHTML = '';
  users.forEach((user) => {
    const preview = user.userTag || user.id;
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="member-line">
        <strong>${preview}</strong>
        <span class="presence-pill ${user.presence || 'offline'}">${capitalizePresence(user.presence || 'offline')}</span>
      </div>
      <small>${user.messageCount} messages</small>
    `;
    item.addEventListener('click', () => {
      selectedUserId = user.id;
      selectedUserName = preview;
      dmUserTitle.textContent = `Chat with ${preview}`;
      sendDmButton.disabled = false;
      fetchDmHistory(user.id);
    });
    dmUsersList.appendChild(item);
  });
}

function renderDmHistory(history) {
  if (!history || history.length === 0) {
    dmHistoryList.innerHTML = '<div class="chat-empty">No conversation yet. New messages will appear live when they arrive.</div>';
    dmHistoryList.scrollTop = dmHistoryList.scrollHeight;
    return;
  }
  dmHistoryList.innerHTML = '';
  history.forEach((entry) => {
    const item = document.createElement('div');
    item.className = `chat-item ${entry.direction}`;
    let attachmentsHtml = '';
    if (entry.attachments?.length) {
      attachmentsHtml = '<div class="chat-attachments">' + entry.attachments.map((attachment) => {
        const url = escapeHtml(attachment.url || '');
        const name = escapeHtml(attachment.name || attachment.id || 'attachment');
        const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(attachment.url || '');
        if (isImage) {
          return `<img class="chat-image" src="${url}" alt="${name}" />`;
        }
        return `<a class="chat-attachment" href="${url}" target="_blank" rel="noopener noreferrer">${name}</a>`;
      }).join('') + '</div>';
    }
    let stickersHtml = '';
    if (entry.stickers?.length) {
      stickersHtml = '<div class="chat-stickers">' + entry.stickers.map((sticker) => {
        const name = escapeHtml(sticker.name || 'Sticker');
        return `<div class="chat-sticker">Sticker: ${name}</div>`;
      }).join('') + '</div>';
    }
    let mentionsHtml = '';
    if (entry.mentions?.length) {
      mentionsHtml = `<div class="chat-mentions">Mentions: ${entry.mentions.map(escapeHtml).join(', ')}</div>`;
    }
    item.innerHTML = `
      <div class="chat-direction">${entry.direction === 'incoming' ? 'From user' : 'To user'} • ${entry.userTag || ''}</div>
      <div class="chat-content">${escapeHtml(entry.content || '')}</div>
      ${mentionsHtml}
      ${attachmentsHtml}
      ${stickersHtml}
      <div class="chat-time">${new Date(entry.timestamp).toLocaleString()}</div>
    `;
    dmHistoryList.appendChild(item);
  });
  dmHistoryList.scrollTop = dmHistoryList.scrollHeight;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendDm() {
  if (!selectedUserId || !dmMessageInput.value.trim()) return;
  try {
    sendDmButton.disabled = true;
    const response = await fetch(`/api/dm-users/${selectedUserId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: dmMessageInput.value.trim() })
    });
    const data = await response.json();
    if (data.error) {
      messageEl.textContent = 'Failed to send DM.';
      return;
    }
    dmMessageInput.value = '';
    fetchDmHistory(selectedUserId);
    fetchDmUsers();
  } catch (error) {
    messageEl.textContent = 'Failed to send DM.';
  } finally {
    sendDmButton.disabled = false;
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

sendDmButton.addEventListener('click', sendDm);
dmTabHistory.addEventListener('click', () => setDmViewMode('history'));
dmTabLive.addEventListener('click', () => setDmViewMode('live'));
window.addEventListener('DOMContentLoaded', () => {
  fetchStatus();
  fetchGuilds();
  fetchDmUsers();
  setDmViewMode('history');
});
