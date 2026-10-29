const socketUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
const state = {
  user: null,
  connectionId: null,
  channels: [],
  channelId: 'sohbet',
  users: [],
  ws: null,
  reconnectTimer: null,
  heartbeat: null,
  stream: null,
  screenStream: null,
  voicePeers: new Map(),
  muted: false,
  expiryTimers: new Map(),
};

const $ = (selector) => document.querySelector(selector);
const colors = ['#e9e5ff', '#e3f2ea', '#f7eadb', '#e2eff5', '#f3e5ee', '#e9eee0', '#f5e9df'];
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('tr-TR');

let toastTimer;
function toast(text) {
  const element = $('#toast');
  element.textContent = text;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2800);
}

async function requestJson(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Sunucudan geçerli bir yanıt alınamadı.');
  }
  if (!response.ok) throw new Error(result.error || 'İstek tamamlanamadı.');
  return result;
}

function send(data) {
  if (state.ws?.readyState !== WebSocket.OPEN) return false;
  state.ws.send(JSON.stringify(data));
  return true;
}

function showAuth(message = '') {
  state.user = null;
  state.users = [];
  renderUsers();
  $('#accountBar').classList.add('is-hidden');
  $('#authOverlay').classList.remove('is-hidden');
  if (message) toast(message);
  initializeAuth().catch((error) => {
    console.error('[auth] Oturum kontrol edilemedi:', error);
    toast(error.message);
  });
}

function setAuthMode(mode) {
  const forms = {
    login: $('#loginForm'),
    register: $('#registerForm'),
    setup: $('#setupAdminForm'),
  };
  for (const [name, form] of Object.entries(forms)) form.classList.toggle('is-hidden', name !== mode);
  $('#authTabs').classList.toggle('is-hidden', mode === 'setup');
  document.querySelectorAll('.auth-tab').forEach((button) => {
    const active = button.dataset.authMode === mode;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (mode === 'setup') {
    $('#authTitle').textContent = 'Yönetici hesabını oluştur';
    $('#authDescription').textContent = 'İlk yönetici kurulumu yalnızca sunucu bilgisayarında yapılabilir.';
    $('#authNote').textContent = 'Kendine özel, en az 12 karakterli bir parola seç. Parola dosyalara düz metin olarak yazılmaz.';
  } else {
    $('#authTitle').textContent = mode === 'register' ? 'Yeni hesap oluştur' : 'Sohbete giriş yap';
    $('#authDescription').textContent = mode === 'register'
      ? 'Bir ad ve parola belirle.'
      : 'Sohbete katılmak için adını ve parolanı gir.';
    $('#authNote').textContent = 'Parolalar güvenli özet olarak saklanır.';
  }
}

async function initializeAuth() {
  const status = await requestJson('/api/status');
  state.channels = status.channels || [];
  if (status.needsAdminSetup) {
    setAuthMode('setup');
    return;
  }
  const { user } = await requestJson('/api/me');
  if (user) {
    startSession(user);
    return;
  }
  setAuthMode('login');
}

function startSession(user) {
  state.user = user;
  $('#authOverlay').classList.add('is-hidden');
  $('#accountBar').classList.remove('is-hidden');
  $('#accountName').textContent = `${user.displayName}${user.role === 'admin' ? ' · Yönetici' : ''}`;
  $('#profileAvatar').textContent = initials(user.displayName) || '?';
  $('#profileDisplayName').textContent = user.displayName;
  $('#profileUsername').textContent = user.role === 'admin' ? 'Yönetici' : 'Üye';
  $('#resetChatButton').classList.toggle('is-hidden', user.role !== 'admin');
  connect();
}

function renderUsers() {
  const list = $('#driverList');
  if (!list) return;
  list.replaceChildren();
  const seen = new Set();
  const uniqueUsers = state.users.filter((user) => {
    if (seen.has(user.id)) return false;
    seen.add(user.id);
    return true;
  });
  $('#driverCount').textContent = String(uniqueUsers.length);
  $('#chatOnlineCount').textContent = String(uniqueUsers.length);

  uniqueUsers.forEach((user, index) => {
    const row = document.createElement('div');
    row.className = `person-row${user.id === state.user?.id ? ' me' : ''}`;
    const avatar = document.createElement('span');
    avatar.className = 'person-avatar';
    avatar.style.background = colors[index % colors.length];
    avatar.textContent = initials(user.displayName) || '?';
    const name = document.createElement('span');
    name.className = 'person-name';
    name.textContent = user.displayName;
    row.append(avatar, name);

    if (user.role === 'admin') {
      const badge = document.createElement('span');
      badge.className = 'admin-badge';
      badge.textContent = 'ADMİN';
      row.appendChild(badge);
    }
    if (user.speaking) {
      const speaking = document.createElement('span');
      speaking.className = 'person-speaking';
      speaking.textContent = 'SESTE';
      row.appendChild(speaking);
    }
    if (user.id === state.user?.id) {
      const you = document.createElement('span');
      you.className = 'you-label';
      you.textContent = 'SEN';
      row.appendChild(you);
    } else if (state.user?.role === 'admin' && user.role !== 'admin') {
      const kick = document.createElement('button');
      kick.type = 'button';
      kick.className = 'kick-button';
      kick.textContent = 'Çıkar';
      kick.setAttribute('aria-label', `${user.displayName} kullanıcısını çıkar`);
      kick.addEventListener('click', () => {
        if (window.confirm(`${user.displayName} kullanıcısını sohbetten çıkarmak istiyor musun?`)) {
          send({ type: 'kick', targetUserId: user.id });
        }
      });
      row.appendChild(kick);
    }
    list.appendChild(row);
  });
  updateVoiceControls();
}

function appendEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'chat-empty';
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '☁';
  const title = document.createElement('strong');
  title.textContent = 'Kanal hazır!';
  const description = document.createElement('p');
  description.textContent = 'İlk mesajı arkadaşlarına gönder.';
  empty.append(icon, title, description);
  return empty;
}

function appendMessage({ type, nick, text, ts, messageId, expiresAt }) {
  const box = $('#chatMessages');
  box.querySelector('.chat-empty')?.remove();
  const row = document.createElement('article');
  if (messageId) row.dataset.messageId = messageId;
  if (type === 'system') {
    row.className = 'message system';
    row.textContent = text;
  } else {
    row.className = 'message';
    const avatar = document.createElement('span');
    avatar.className = 'message-avatar';
    avatar.textContent = initials(nick) || '?';
    const body = document.createElement('div');
    body.className = 'message-content';
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const author = document.createElement('strong');
    author.textContent = nick;
    const clock = document.createElement('time');
    const sentAt = Number.isFinite(ts) ? new Date(ts) : new Date();
    clock.dateTime = sentAt.toISOString();
    clock.textContent = sentAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    clock.title = expiresAt
      ? `Bu mesaj ${new Date(expiresAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} saatinde silinecek.`
      : sentAt.toLocaleString('tr-TR');
    const content = document.createElement('p');
    content.textContent = text;
    meta.append(author, clock);
    body.append(meta, content);
    row.append(avatar, body);
  }
  box.appendChild(row);
  if (messageId && Number.isFinite(expiresAt)) {
    const expiryTimer = setTimeout(() => removeMessages([messageId]), Math.max(0, expiresAt - Date.now()));
    state.expiryTimers.set(messageId, expiryTimer);
  }
  box.scrollTop = box.scrollHeight;
}

function removeMessages(messageIds) {
  const box = $('#chatMessages');
  for (const messageId of messageIds) {
    clearTimeout(state.expiryTimers.get(messageId));
    state.expiryTimers.delete(messageId);
    box.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)?.remove();
  }
  if (!box.querySelector('.message')) box.appendChild(appendEmptyState());
}

function clearChannelMessages() {
  for (const timer of state.expiryTimers.values()) clearTimeout(timer);
  state.expiryTimers.clear();
  $('#chatMessages').replaceChildren(appendEmptyState());
}

function setActiveChannel(channelId) {
  if (!state.channels.some((channel) => channel.id === channelId)) return;
  if (state.channelId === channelId) return;
  leaveVoice(true);
  state.channelId = channelId;
  state.users = [];
  for (const timer of state.expiryTimers.values()) clearTimeout(timer);
  state.expiryTimers.clear();
  const box = $('#chatMessages');
  box.replaceChildren(appendEmptyState());
  const channel = state.channels.find((item) => item.id === channelId);
  $('#activeChannelTitle').textContent = channel.name;
  $('#chatInput').placeholder = `#${channel.name.toLocaleLowerCase('tr-TR')} kanalına mesaj yaz...`;
  document.querySelectorAll('.channel-tab').forEach((button) => {
    const active = button.dataset.channel === channelId;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  renderUsers();
  send({ type: 'channel-join', channelId });
}

function updateVoiceControls() {
  const active = Boolean(state.stream);
  const sharing = Boolean(state.screenStream);
  $('#voiceJoin').disabled = active || !state.user || !state.ws || state.ws.readyState !== WebSocket.OPEN;
  $('#voiceJoin').textContent = active ? 'Sesteysin' : 'Sese katıl';
  $('#voiceMute').disabled = !active;
  $('#voiceLeave').disabled = !active;
  $('#shareScreen').disabled = !active || sharing;
  $('#stopScreenShare').classList.toggle('is-hidden', !sharing);
  $('#screenShareStatus').textContent = sharing
    ? 'Ekranını sesli odadakiler görüyor.'
    : active ? 'Ekranını sesli odadakilerle paylaş.' : 'Ekran paylaşmak için sesli odaya katıl.';
  $('#voiceMute').classList.toggle('is-muted', state.muted);
  $('#voiceMute').textContent = state.muted ? 'Kapalı' : 'Mic';
  $('#voiceMute').setAttribute('aria-label', state.muted ? 'Mikrofonu aç' : 'Mikrofonu kapat');
  $('#voiceMute').title = state.muted ? 'Mikrofonu aç' : 'Mikrofonu kapat';
  $('#voiceStatus').textContent = active
    ? `${state.muted ? 'Mikrofon kapalı' : 'Mikrofon açık'} · ${state.voicePeers.size} kişi bağlı`
    : 'Arkadaşlarınla konuş';
}

function closePeer(id) {
  const peer = state.voicePeers.get(id);
  if (!peer) return;
  peer.connection.ontrack = null;
  peer.connection.onicecandidate = null;
  peer.connection.onconnectionstatechange = null;
  peer.connection.close();
  peer.audio?.remove();
  peer.screenTile?.remove();
  state.voicePeers.delete(id);
  updateVoiceControls();
}

function leaveVoice(notify = true) {
  if (notify && state.stream) send({ type: 'voice-leave' });
  if (state.screenStream) stopScreenShare(false);
  for (const id of [...state.voicePeers.keys()]) closePeer(id);
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  state.muted = false;
  updateVoiceControls();
}

function addScreenTile(id, name, stream, local = false) {
  const grid = $('#screenShareGrid');
  let tile = local ? $('#localScreenTile') : state.voicePeers.get(id)?.screenTile;
  if (!tile) {
    tile = document.createElement('figure');
    tile.className = 'screen-share-tile';
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    const caption = document.createElement('figcaption');
    tile.append(video, caption);
    grid.appendChild(tile);
    if (local) tile.id = 'localScreenTile';
    else if (state.voicePeers.has(id)) state.voicePeers.get(id).screenTile = tile;
  }
  tile.querySelector('video').srcObject = stream;
  tile.querySelector('figcaption').textContent = local ? 'Sen · ekran paylaşımı' : `${name} · ekran paylaşımı`;
  return tile;
}

function removeScreenTile(id) {
  const peer = state.voicePeers.get(id);
  peer?.screenTile?.remove();
  if (peer) peer.screenTile = null;
}

function stopScreenShare(notify = true) {
  const screenStream = state.screenStream;
  if (!screenStream) return;
  state.screenStream = null;
  if (notify) send({ type: 'voice-screen-stop' });
  for (const peer of state.voicePeers.values()) {
    for (const sender of peer.connection.getSenders()) {
      if (screenStream.getTracks().includes(sender.track)) peer.connection.removeTrack(sender);
    }
  }
  screenStream.getTracks().forEach((track) => track.stop());
  $('#localScreenTile')?.remove();
  updateVoiceControls();
}

async function startScreenShare() {
  if (!state.stream) {
    toast('Ekran paylaşmak için önce sesli odaya katıl.');
    return;
  }
  if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) {
    toast('Ekran paylaşımı için HTTPS bağlantısı ve destekleyen bir tarayıcı gerekir.');
    return;
  }
  $('#shareScreen').disabled = true;
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    if (!state.stream || state.ws?.readyState !== WebSocket.OPEN) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('Sesli oda bağlantısı kesildi.');
    }
    state.screenStream = stream;
    addScreenTile('local', state.user.displayName, stream, true);
    const [track] = stream.getVideoTracks();
    track.addEventListener('ended', () => stopScreenShare());
    for (const peer of state.voicePeers.values()) {
      stream.getTracks().forEach((screenTrack) => peer.connection.addTrack(screenTrack, stream));
    }
    updateVoiceControls();
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      toast('Ekran paylaşımı iptal edildi veya izin verilmedi.');
    } else {
      console.error('[voice] Ekran paylaşımı başlatılamadı:', error);
      toast(`Ekran paylaşılamadı: ${error.message}`);
    }
    updateVoiceControls();
  }
}

function makePeer(user) {
  const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  const peer = {
    connection,
    nick: user.displayName,
    audio: null,
    screenTile: null,
    pendingCandidates: [],
    makingOffer: false,
    ignoreOffer: false,
    polite: state.connectionId.localeCompare(user.connectionId) > 0,
  };
  state.voicePeers.set(user.connectionId, peer);
  state.stream?.getTracks().forEach((track) => connection.addTrack(track, state.stream));
  state.screenStream?.getTracks().forEach((track) => connection.addTrack(track, state.screenStream));
  connection.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      await connection.setLocalDescription();
      send({
        type: 'voice-signal',
        to: user.connectionId,
        signal: { description: { type: connection.localDescription.type, sdp: connection.localDescription.sdp } },
      });
    } catch (error) {
      console.error('[voice] Bağlantı teklifi oluşturulamadı:', error);
      toast(`Ses veya ekran bağlantısı kurulamadı: ${error.message}`);
    } finally {
      peer.makingOffer = false;
    }
  };
  connection.onicecandidate = (event) => {
    if (event.candidate) send({
      type: 'voice-signal',
      to: user.connectionId,
      signal: { candidate: event.candidate.toJSON() },
    });
  };
  connection.ontrack = (event) => {
    const stream = event.streams[0] || new MediaStream([event.track]);
    if (event.track.kind === 'video') {
      const tile = addScreenTile(user.connectionId, peer.nick, stream);
      event.track.addEventListener('ended', () => removeScreenTile(user.connectionId));
      tile.querySelector('video').play().catch((error) => {
        if (error.name !== 'AbortError') console.warn('[voice] Ekran videosu oynatılamadı:', error);
      });
      return;
    }
    if (!peer.audio) {
      peer.audio = document.createElement('audio');
      peer.audio.autoplay = true;
      peer.audio.playsInline = true;
      peer.audio.setAttribute('aria-label', `${peer.nick} sesli sohbet`);
      document.body.appendChild(peer.audio);
    }
    peer.audio.srcObject = stream;
    peer.audio.play().catch((error) => {
      console.warn('[voice] Tarayıcı sesi oynatamadı:', error);
      toast('Arkadaşının sesini duymak için sayfaya dokun.');
    });
  };
  connection.onconnectionstatechange = () => {
    if (connection.connectionState === 'failed') {
      toast(`${peer.nick} ile ses bağlantısı kurulamadı. Bu ağ TURN sunucusu gerektirebilir.`);
      closePeer(user.connectionId);
    } else if (connection.connectionState === 'closed') {
      closePeer(user.connectionId);
    }
  };
  updateVoiceControls();
  return peer;
}

async function connectVoicePeer(user) {
  const id = user.connectionId;
  if (!state.stream || user.id === state.user?.id || state.voicePeers.has(id)) return;
  makePeer(user);
}

async function signalPeer(from, signal) {
  if (!state.stream) return;
  const user = state.users.find((item) => item.connectionId === from);
  if (!user) return;
  let peer = state.voicePeers.get(from);
  if (!peer) peer = makePeer(user);
  try {
    if (signal.description) {
      const connection = peer.connection;
      const readyForOffer = !peer.makingOffer && (connection.signalingState === 'stable' || peer.settingRemoteAnswer);
      const offerCollision = signal.description.type === 'offer' && !readyForOffer;
      peer.ignoreOffer = !peer.polite && offerCollision;
      if (peer.ignoreOffer) return;
      if (offerCollision && peer.polite) await connection.setLocalDescription({ type: 'rollback' });
      peer.settingRemoteAnswer = signal.description.type === 'answer';
      await peer.connection.setRemoteDescription(new RTCSessionDescription(signal.description));
      peer.settingRemoteAnswer = false;
      while (peer.pendingCandidates.length) await peer.connection.addIceCandidate(peer.pendingCandidates.shift());
      if (signal.description.type === 'offer') {
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        send({
          type: 'voice-signal',
          to: from,
          signal: { description: { type: answer.type, sdp: answer.sdp } },
        });
      }
    } else if (signal.candidate) {
      const candidate = new RTCIceCandidate(signal.candidate);
      if (peer.ignoreOffer) return;
      if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(candidate);
      else peer.pendingCandidates.push(candidate);
    }
  } catch (error) {
    peer.settingRemoteAnswer = false;
    console.error('[voice] Bağlantı sinyali işlenemedi:', error);
    toast(`Ses bağlantısı kurulamadı: ${error.message}`);
  }
}

async function joinVoice() {
  if (!state.user || !state.ws || state.ws.readyState !== WebSocket.OPEN) {
    toast('Önce sohbete giriş yap.');
    return;
  }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    toast('Mikrofon için HTTPS bağlantısı gerekir.');
    return;
  }
  $('#voiceJoin').disabled = true;
  $('#voiceStatus').textContent = 'Mikrofon izni bekleniyor';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    if (!send({ type: 'voice-join' })) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('Sohbet bağlantısı kesildi.');
    }
    state.stream = stream;
    state.muted = false;
    updateVoiceControls();
  } catch (error) {
    state.stream = null;
    updateVoiceControls();
    console.error('[voice] Mikrofon erişimi başarısız:', error);
    toast(`Mikrofon açılamadı: ${error.message}`);
  }
}

function connect() {
  clearTimeout(state.reconnectTimer);
  if (!state.user) return;
  const ws = new WebSocket(socketUrl);
  state.ws = ws;
  const connection = $('.connection');
  connection.classList.remove('is-connected', 'is-error');
  $('#connectionLabel').textContent = 'Bağlanıyor';

  ws.addEventListener('open', () => {
    if (state.ws !== ws) return;
    send({ type: 'channel-join', channelId: state.channelId });
    state.heartbeat = setInterval(() => send({ type: 'ping' }), 25000);
    updateVoiceControls();
  });

  ws.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      console.warn('[ws] Sunucudan geçersiz mesaj alındı:', error);
      return;
    }
    if (message.type === 'channel-state') {
      state.channelId = message.channelId;
      state.connectionId = message.connectionId;
      state.users = message.users || [];
      document.querySelectorAll('.channel-tab').forEach((button) => {
        const active = button.dataset.channel === state.channelId;
        button.classList.toggle('is-active', active);
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      });
      const activeChannel = state.channels.find((channel) => channel.id === state.channelId);
      if (activeChannel) {
        $('#activeChannelTitle').textContent = activeChannel.name;
        $('#chatInput').placeholder = `#${activeChannel.name.toLocaleLowerCase('tr-TR')} kanalına mesaj yaz...`;
      }
      connection.classList.add('is-connected');
      $('#connectionLabel').textContent = 'Bağlandı';
      const box = $('#chatMessages');
      box.replaceChildren();
      (message.history || []).forEach(appendMessage);
      if (!message.history?.length) box.appendChild(appendEmptyState());
      renderUsers();
    } else if (message.type === 'presence') {
      state.users = message.users || [];
      renderUsers();
    } else if (message.type === 'chat' || message.type === 'system') {
      appendMessage(message);
    } else if (message.type === 'chat-delete') {
      removeMessages(message.messageIds || []);
    } else if (message.type === 'chat-reset') {
      clearChannelMessages();
    } else if (message.type === 'voice-peers') {
      message.users.forEach((user) => connectVoicePeer(user));
    } else if (message.type === 'voice-peer-joined') {
      connectVoicePeer(message.user);
    } else if (message.type === 'voice-signal') {
      signalPeer(message.from, message.signal);
    } else if (message.type === 'voice-left') {
      closePeer(message.id);
    } else if (message.type === 'voice-screen-stop') {
      removeScreenTile(message.id);
    } else if (message.type === 'kicked') {
      state.kicked = true;
      toast(message.text || 'Sohbetten çıkarıldın.');
      ws.close(4001, 'Removed by administrator');
    } else if (message.type === 'error') {
      toast(message.text || 'Bir sunucu hatası oluştu.');
    }
  });

  ws.addEventListener('close', (event) => {
    if (state.ws !== ws) return;
    clearInterval(state.heartbeat);
    leaveVoice(false);
    state.users = [];
    renderUsers();
    connection.classList.remove('is-connected');
    if (event.code === 4001 || state.kicked) {
      state.kicked = false;
      state.ws = null;
      showAuth('Yönetici seni sohbetten çıkardı.');
      return;
    }
    if (event.code === 1008 || event.code === 1001) {
      state.ws = null;
      showAuth('Oturumun sona erdi. Yeniden giriş yap.');
      return;
    }
    $('#connectionLabel').textContent = 'Yeniden bağlanıyor';
    state.reconnectTimer = setTimeout(connect, 2000);
  });

  ws.addEventListener('error', () => {
    connection.classList.add('is-error');
    $('#connectionLabel').textContent = 'Bağlantı hatası';
  });
}

function channelName(channelId) {
  return state.channels.find((channel) => channel.id === channelId)?.name || channelId;
}

$('#roomLink').value = `${location.origin}${location.pathname}`;

document.querySelectorAll('.auth-tab').forEach((button) => {
  button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
});

for (const [formId, endpoint, fields] of [
  ['loginForm', '/api/login', ['name', 'password']],
  ['registerForm', '/api/register', ['name', 'password']],
  ['setupAdminForm', '/api/setup-admin', ['name', 'password']],
]) {
  $(`#${formId}`).addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const payload = Object.fromEntries(fields.map((field) => [field, form.elements.namedItem(field).value]));
      const result = await requestJson(endpoint, payload);
      startSession(result.user);
      form.reset();
    } catch (error) {
      console.error('[auth] İşlem başarısız:', error);
      toast(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

document.querySelectorAll('.channel-tab').forEach((button) => {
  button.addEventListener('click', () => setActiveChannel(button.dataset.channel));
});

$('#resetChatButton').addEventListener('click', () => {
  const channel = channelName(state.channelId);
  if (window.confirm(`#${channel} kanalındaki tüm mesajları silmek istiyor musun?`)) {
    send({ type: 'chat-reset' });
  }
});

$('#chatForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text) return;
  if (!send({ type: 'chat', text })) {
    toast('Mesaj göndermek için bağlantının kurulmasını bekle.');
    return;
  }
  input.value = '';
  input.focus();
});

$('#voiceJoin').addEventListener('click', joinVoice);
$('#shareScreen').addEventListener('click', startScreenShare);
$('#stopScreenShare').addEventListener('click', () => stopScreenShare());
$('#voiceMute').addEventListener('click', () => {
  if (!state.stream) return;
  state.muted = !state.muted;
  state.stream.getAudioTracks().forEach((track) => { track.enabled = !state.muted; });
  updateVoiceControls();
});
$('#voiceLeave').addEventListener('click', () => leaveVoice(true));

$('#logoutButton').addEventListener('click', async () => {
  try {
    await requestJson('/api/logout', {});
  } catch (error) {
    console.error('[auth] Çıkış yapılamadı:', error);
    toast(error.message);
  }
  if (state.ws && state.ws.readyState < WebSocket.CLOSING) state.ws.close(1000, 'Logged out');
  state.user = null;
  showAuth('Oturum kapatıldı.');
});

$('#copyLink').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#roomLink').value);
    toast('Davet bağlantısı kopyalandı.');
  } catch (error) {
    console.warn('[invite] Bağlantı kopyalanamadı:', error);
    const link = $('#roomLink');
    link.select();
    if (document.execCommand('copy')) toast('Davet bağlantısı kopyalandı.');
    else toast('Bağlantı kopyalanamadı. Adres çubuğundan kopyalayabilirsin.');
  }
});

window.addEventListener('beforeunload', () => {
  clearTimeout(state.reconnectTimer);
  clearInterval(state.heartbeat);
  state.screenStream?.getTracks().forEach((track) => track.stop());
  state.stream?.getTracks().forEach((track) => track.stop());
  state.voicePeers.forEach((peer) => peer.connection.close());
  for (const timer of state.expiryTimers.values()) clearTimeout(timer);
});

initializeAuth().catch((error) => {
  console.error('[auth] Giriş ekranı başlatılamadı:', error);
  toast(error.message);
});
