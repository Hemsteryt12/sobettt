'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { promisify } = require('util');
const { WebSocketServer, WebSocket } = require('ws');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');
const PORT = Number(process.env.PORT || 8011);
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const MESSAGE_TTL = 60 * 60 * 1000;
const MAX_MESSAGES_PER_CHANNEL = 300;
const MAX_USERS = 500;
const CHANNELS = [
  { id: 'sohbet', name: 'Sohbet' },
  { id: 'kodlar', name: 'Kodlar' },
  { id: 'sesli', name: 'Sesli Oda' },
];
const ARENA_CLASSES = {
  scout: { health: 90, speed: 0.46 },
  vanguard: { health: 110, speed: 0.37 },
  bulwark: { health: 145, speed: 0.29 },
};
const ARENA_WEAPONS = {
  ak47: { name: 'AK-47 Otomatik', slot: 1, damage: 24, cooldown: 110, range: 34, pellets: 1, spread: 0.025, price: 0, rarity: 'standart' },
  pulse: { name: 'Arc Pulse', slot: 1, damage: 34, cooldown: 260, range: 31, pellets: 1, spread: 0, price: 0 },
  scatter: { name: 'Burst SG', slot: 1, damage: 12, cooldown: 680, range: 16, pellets: 6, spread: 0.095, price: 100 },
  rail: { name: 'AWP Sniper', slot: 1, damage: 88, cooldown: 920, range: 48, pellets: 1, spread: 0.003, price: 0, rarity: 'efsanevi' },
  pulse_pistol: { name: 'Echo-9', slot: 2, damage: 22, cooldown: 340, range: 23, pellets: 1, spread: 0.012, price: 0 },
  burst_pistol: { name: 'Twin Spark', slot: 2, damage: 13, cooldown: 510, range: 19, pellets: 2, spread: 0.025, price: 100, rarity: 'nadir' },
  impact_bomb: { name: 'Nova Bomb', slot: 3, damage: 62, cooldown: 1700, range: 24, radius: 5.5, pellets: 1, spread: 0, price: 0 },
  cluster_bomb: { name: 'Cluster Orb', slot: 3, damage: 44, cooldown: 1900, range: 22, radius: 7, pellets: 1, spread: 0, price: 100, rarity: 'nadir' },
  alloy_knife: { name: 'Alloy Knife', slot: 4, damage: 48, cooldown: 450, range: 2.8, pellets: 1, spread: 0, price: 0 },
  prism_knife: { name: 'Prism Blade', slot: 4, damage: 72, cooldown: 680, range: 3.2, pellets: 1, spread: 0, price: 150, rarity: 'destansi' },
};
const DEFAULT_INVENTORY = ['ak47', 'rail', 'pulse', 'pulse_pistol', 'impact_bomb', 'alloy_knife'];
const DEFAULT_LOADOUT = { 1: 'ak47', 2: 'pulse_pistol', 3: 'impact_bomb', 4: 'alloy_knife' };
const ARENA_MAPS = {
  ruins: {
    name: 'Eski Harabeler',
    sky: '#a9c5b5', floor: '#b3c393', wall: '#71857a',
    blocks: [
      { x: -12, z: -9, hx: 2, hz: 2, h: 3.5, color: '#d1815e' },
      { x: 11, z: -11, hx: 2.5, hz: 1.5, h: 2.5, color: '#557f7c' },
      { x: -10, z: 12, hx: 1.5, hz: 2.5, h: 3, color: '#cbad68' },
      { x: 12, z: 10, hx: 2, hz: 2, h: 4, color: '#65856c' },
      { x: 0, z: -16, hx: 3, hz: 1.2, h: 2.8, color: '#d0aa5f' },
      { x: 0, z: 16, hx: 3, hz: 1.2, h: 3.2, color: '#cb765a' },
      { x: -17, z: 1, hx: 1.2, hz: 3, h: 2.4, color: '#58817a' },
      { x: 17, z: -1, hx: 1.2, hz: 3, h: 3.6, color: '#c7a263' },
      { x: -5, z: -3, hx: 1.4, hz: 1.4, h: 2.8, color: '#718a62' },
      { x: 6, z: 4, hx: 1.4, hz: 1.4, h: 3.3, color: '#bd705d' },
    ],
  },
  harbor: {
    name: 'Sisli Liman',
    sky: '#91b5bd', floor: '#81999b', wall: '#405d66',
    blocks: [
      { x: -13, z: -12, hx: 4, hz: 2, h: 3, color: '#c77a55' },
      { x: 12, z: -13, hx: 2, hz: 4, h: 3.8, color: '#547982' },
      { x: -13, z: 12, hx: 2.5, hz: 4, h: 2.6, color: '#d0aa67' },
      { x: 13, z: 13, hx: 4, hz: 2.5, h: 3.2, color: '#618b79' },
      { x: 0, z: -7, hx: 5, hz: 1.1, h: 1.8, color: '#d6c48c' },
      { x: 0, z: 8, hx: 1.1, hz: 6, h: 2, color: '#bc7259' },
      { x: -7, z: 0, hx: 1.1, hz: 5, h: 2.3, color: '#4d7880' },
      { x: 9, z: 0, hx: 5, hz: 1.1, h: 2.5, color: '#c08e5a' },
    ],
  },
  canyon: {
    name: 'Kızıl Kanyon',
    sky: '#d5a28a', floor: '#b98b65', wall: '#765847',
    blocks: [
      { x: -15, z: -12, hx: 3.5, hz: 2, h: 4, color: '#9e604e' },
      { x: 13, z: -12, hx: 2, hz: 3.5, h: 3.5, color: '#d08a5b' },
      { x: -13, z: 13, hx: 2, hz: 4, h: 3.2, color: '#d19a58' },
      { x: 14, z: 12, hx: 3, hz: 2, h: 4.2, color: '#985847' },
      { x: -3, z: -14, hx: 1.2, hz: 4, h: 2.8, color: '#d49b6a' },
      { x: 4, z: 14, hx: 4, hz: 1.2, h: 3, color: '#9e614b' },
      { x: -10, z: 0, hx: 3.5, hz: 1.2, h: 2.4, color: '#bb7952' },
      { x: 10, z: 1, hx: 3.5, hz: 1.2, h: 2.5, color: '#d19a6c' },
      { x: 0, z: 0, hx: 1.7, hz: 1.7, h: 3.5, color: '#855544' },
    ],
  },
};
const ARENA_LIMIT = 27;
const COOKIE_NAME = 'yanyana_session';
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const scrypt = promisify(crypto.scrypt);
const sessions = new Map();
const socketsByUser = new Map();
const clients = new Map();
const voiceMembers = new Set();
const loginAttempts = new Map();
const arenaPlayers = new Map();
let activeArenaMap = null;

fs.mkdirSync(DATA_DIR, { recursive: true });

function freshData() {
  return {
    users: [],
    messages: Object.fromEntries(CHANNELS.map((channel) => [channel.id, []])),
  };
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return freshData();
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!Array.isArray(parsed.users) || !parsed.messages || typeof parsed.messages !== 'object') {
    throw new Error(`Invalid account data in ${DATA_FILE}`);
  }
  for (const channel of CHANNELS) {
    if (!Array.isArray(parsed.messages[channel.id])) parsed.messages[channel.id] = [];
    parsed.messages[channel.id] = parsed.messages[channel.id]
      .filter((message) => Number.isFinite(message.ts) && message.ts + MESSAGE_TTL > Date.now())
      .map((message) => ({ ...message, expiresAt: message.ts + MESSAGE_TTL }));
  }
  for (const user of parsed.users) ensureGameProfile(user);
  return parsed;
}

let data = loadData();

function saveData() {
  const temporary = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, DATA_FILE);
  gameDataDirty = false;
}

function ensureGameProfile(user) {
  if (!Number.isSafeInteger(user.gold) || user.gold < 0) user.gold = 100;
  if (!Array.isArray(user.inventory)) user.inventory = [...DEFAULT_INVENTORY];
  for (const weaponId of DEFAULT_INVENTORY) {
    if (!user.inventory.includes(weaponId)) user.inventory.push(weaponId);
  }
  if (!user.weaponUpgrades || typeof user.weaponUpgrades !== 'object' || Array.isArray(user.weaponUpgrades)) {
    user.weaponUpgrades = {};
  }
}

function arenaProfile(user) {
  ensureGameProfile(user);
  return {
    gold: user.gold,
    inventory: user.inventory,
    upgrades: user.weaponUpgrades,
    weapons: Object.entries(ARENA_WEAPONS).map(([id, weapon]) => ({
      id,
      name: weapon.name,
      slot: weapon.slot,
      price: weapon.price,
      rarity: weapon.rarity || 'standart',
    })),
    maps: Object.entries(ARENA_MAPS).map(([id, map]) => ({ id, name: map.name })),
  };
}
let gameDataDirty = false;

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function safeDisplayName(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);
}

function publicUser(user) {
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return ['', ''];
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

function sessionUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const session = token && sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = data.users.find((item) => item.id === session.userId);
  return user ? { token, user } : null;
}

function clientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

function isLocalRequest(req) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(clientIp(req));
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function setSessionCookie(res, token, req) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}${secure ? '; Secure' : ''}`);
}

function clearSessionCookie(res, req) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
}

function jsonResponse(res, status, payload) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 12 * 1024) {
        reject(new Error('Request too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64);
  return { salt, hash: hash.toString('hex') };
}

async function passwordMatches(password, user) {
  const actual = await scrypt(password, user.passwordSalt, 64);
  const expected = Buffer.from(user.passwordHash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function authRateLimited(key) {
  const attempts = loginAttempts.get(key) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  if (attempts.resetAt <= Date.now()) {
    loginAttempts.delete(key);
    return false;
  }
  return attempts.count >= 10;
}

function recordAuthFailure(key) {
  const attempts = loginAttempts.get(key) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  attempts.count += 1;
  loginAttempts.set(key, attempts);
}

function makeSession(user, res, req) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL });
  setSessionCookie(res, token, req);
}

function roomUsers(channelId) {
  return [...clients.values()]
    .filter((client) => client.channelId === channelId && !client.kicked)
    .map((client) => ({
      ...publicUser(client.user),
      speaking: voiceMembers.has(client.id),
      connectionId: client.id,
    }));
}

function broadcast(channelId, payload, exclude) {
  for (const client of clients.values()) {
    if (client.channelId === channelId && client.id !== exclude) send(client.ws, payload);
  }
}

function removeExpiredMessages(channelId, now = Date.now()) {
  const messages = data.messages[channelId];
  const expiredIds = messages.filter((message) => message.expiresAt <= now).map((message) => message.messageId);
  if (!expiredIds.length) return;
  const expired = new Set(expiredIds);
  data.messages[channelId] = messages.filter((message) => !expired.has(message.messageId));
  saveData();
  broadcast(channelId, { type: 'chat-delete', messageIds: expiredIds });
}

function addMessage(channelId, message) {
  const storedMessage = {
    ...message,
    messageId: crypto.randomUUID(),
    expiresAt: message.ts + MESSAGE_TTL,
  };
  const messages = data.messages[channelId];
  messages.push(storedMessage);
  if (messages.length > MAX_MESSAGES_PER_CHANNEL) {
    const removed = messages.splice(0, messages.length - MAX_MESSAGES_PER_CHANNEL);
    broadcast(channelId, { type: 'chat-delete', messageIds: removed.map((item) => item.messageId) });
  }
  saveData();
  broadcast(channelId, storedMessage);
}

function disconnectClient(client, code = 1000, reason = 'Disconnected') {
  if (!client || client.kicked) return;
  client.kicked = true;
  if (client.channelId) {
    const channelId = client.channelId;
    if (voiceMembers.delete(client.id)) broadcast(channelId, { type: 'voice-left', id: client.id });
    clients.delete(client.id);
    const userSockets = socketsByUser.get(client.user.id);
    userSockets?.delete(client.id);
    if (userSockets && !userSockets.size) socketsByUser.delete(client.user.id);
    addMessage(channelId, { type: 'system', text: `${client.user.displayName} sohbetten ayrıldı.`, ts: Date.now() });
    broadcast(channelId, { type: 'presence', users: roomUsers(channelId) });
  }
  client.ws.close(code, reason);
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/status') {
    jsonResponse(res, 200, { needsAdminSetup: !data.users.some((user) => user.role === 'admin'), channels: CHANNELS });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const session = sessionUser(req);
    jsonResponse(res, 200, { user: session ? publicUser(session.user) : null });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/arena-profile') {
    const session = sessionUser(req);
    if (!session) {
      jsonResponse(res, 401, { error: 'Arena mağazası için giriş yap.' });
      return;
    }
    const profile = arenaProfile(session.user);
    jsonResponse(res, 200, profile);
    return;
  }

  if (!['POST'].includes(req.method) || !isSameOrigin(req)) {
    jsonResponse(res, 403, { error: 'İstek reddedildi.' });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    jsonResponse(res, 400, { error: 'İstek okunamadı.' });
    return;
  }

  if (url.pathname === '/api/setup-admin') {
    if (!isLocalRequest(req)) {
      jsonResponse(res, 403, { error: 'İlk yönetici kurulumu sunucu bilgisayarında yapılmalı.' });
      return;
    }
    if (data.users.some((user) => user.role === 'admin')) {
      jsonResponse(res, 409, { error: 'Yönetici hesabı zaten oluşturulmuş.' });
      return;
    }
    const displayName = safeDisplayName(body.name || body.displayName);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!displayName || password.length < 12 || password.length > 128) {
      jsonResponse(res, 400, { error: 'Yönetici adı ve en az 12 karakterli bir parola gerekli.' });
      return;
    }
    const credentials = await passwordHash(password);
    const admin = {
      id: crypto.randomUUID(),
      username: 'admin',
      displayName,
      role: 'admin',
      passwordSalt: credentials.salt,
      passwordHash: credentials.hash,
      createdAt: Date.now(),
    };
    ensureGameProfile(admin);
    data.users.push(admin);
    saveData();
    makeSession(admin, res, req);
    jsonResponse(res, 201, { user: publicUser(admin) });
    return;
  }

  if (url.pathname === '/api/register') {
    if (!data.users.some((user) => user.role === 'admin')) {
      jsonResponse(res, 403, { error: 'Önce sunucu bilgisayarında yönetici hesabı kurulmalı.' });
      return;
    }
    if (data.users.length >= MAX_USERS) {
      jsonResponse(res, 403, { error: 'Kayıt kapasitesi dolu.' });
      return;
    }
    const displayName = safeDisplayName(body.name || body.displayName);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!displayName || !password) {
      jsonResponse(res, 400, { error: 'Adını ve boş olmayan bir parola gir.' });
      return;
    }
    if (data.users.some((user) => user.displayName.toLocaleLowerCase('tr-TR') === displayName.toLocaleLowerCase('tr-TR'))) {
      jsonResponse(res, 409, { error: 'Bu ad zaten kullanılıyor.' });
      return;
    }
    const credentials = await passwordHash(password);
    const id = crypto.randomUUID();
    const user = {
      id,
      username: `user-${id.slice(0, 8)}`,
      displayName,
      role: 'user',
      passwordSalt: credentials.salt,
      passwordHash: credentials.hash,
      createdAt: Date.now(),
    };
    ensureGameProfile(user);
    data.users.push(user);
    saveData();
    makeSession(user, res, req);
    jsonResponse(res, 201, { user: publicUser(user) });
    return;
  }

  if (url.pathname === '/api/login') {
    const name = safeDisplayName(body.name || body.username).toLocaleLowerCase('tr-TR');
    const key = `${clientIp(req)}:${name}`;
    if (authRateLimited(key)) {
      jsonResponse(res, 429, { error: 'Çok fazla deneme. 15 dakika sonra tekrar dene.' });
      return;
    }
    const user = data.users.find((item) => item.displayName.toLocaleLowerCase('tr-TR') === name || item.username.toLowerCase() === name);
    const valid = user && typeof body.password === 'string' && await passwordMatches(body.password, user);
    if (!valid) {
      recordAuthFailure(key);
      jsonResponse(res, 401, { error: 'Ad veya parola hatalı.' });
      return;
    }
    loginAttempts.delete(key);
    ensureGameProfile(user);
    makeSession(user, res, req);
    jsonResponse(res, 200, { user: publicUser(user) });
    return;
  }

  if (url.pathname === '/api/logout') {
    const session = sessionUser(req);
    if (session) {
      sessions.delete(session.token);
      for (const clientId of [...(socketsByUser.get(session.user.id) || [])]) {
        disconnectClient(clients.get(clientId));
      }
      for (const player of arenaPlayers.values()) {
        if (player.user.id === session.user.id) player.ws.close(1000, 'Logged out');
      }
    }
    clearSessionCookie(res, req);
    jsonResponse(res, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/arena-shop') {
    const session = sessionUser(req);
    if (!session) {
      jsonResponse(res, 401, { error: 'Mağaza için yeniden giriş yap.' });
      return;
    }
    const user = session.user;
    ensureGameProfile(user);
    const action = String(body.action || '');
    if (action === 'open-case') {
      if (user.gold < 50) {
        jsonResponse(res, 400, { error: 'Kasa 50 altın. Altının yetmiyor.' });
        return;
      }
      user.gold -= 50;
      const locked = Object.keys(ARENA_WEAPONS).filter((id) => !user.inventory.includes(id));
      const rarityRoll = Math.random() * 100;
      const rarity = rarityRoll < 70 ? 'standart' : rarityRoll < 94 ? 'nadir' : rarityRoll < 99 ? 'destansi' : 'efsanevi';
      const candidates = locked.filter((id) => (ARENA_WEAPONS[id].rarity || 'standart') === rarity);
      if (candidates.length) {
        const weaponId = candidates[Math.floor(Math.random() * candidates.length)];
        user.inventory.push(weaponId);
        saveData();
        jsonResponse(res, 200, { profile: arenaProfile(user), reward: { type: 'weapon', id: weaponId, name: ARENA_WEAPONS[weaponId].name, rarity: ARENA_WEAPONS[weaponId].rarity || 'standart' } });
        return;
      }
      const goldReward = rarity === 'efsanevi' ? 100 : 50;
      user.gold += goldReward;
      saveData();
      jsonResponse(res, 200, { profile: arenaProfile(user), reward: { type: 'gold', amount: goldReward } });
      return;
    }
    if (action === 'buy-weapon') {
      const weaponId = String(body.weaponId || '');
      const weapon = ARENA_WEAPONS[weaponId];
      if (!weapon) {
        jsonResponse(res, 400, { error: 'Bu ekipman bulunamadı.' });
        return;
      }
      if (user.inventory.includes(weaponId)) {
        jsonResponse(res, 400, { error: 'Bu ekipman zaten sende.' });
        return;
      }
      if (user.gold < weapon.price) {
        jsonResponse(res, 400, { error: `Bu ekipman ${weapon.price} altın. Altının yetmiyor.` });
        return;
      }
      user.gold -= weapon.price;
      user.inventory.push(weaponId);
      saveData();
      jsonResponse(res, 200, { profile: arenaProfile(user), reward: { type: 'weapon', id: weaponId, name: weapon.name } });
      return;
    }
    if (action === 'upgrade') {
      const weaponId = String(body.weaponId || '');
      const weapon = ARENA_WEAPONS[weaponId];
      if (!weapon || !user.inventory.includes(weaponId)) {
        jsonResponse(res, 400, { error: 'Yalnızca sahip olduğun ekipmanı yükseltebilirsin.' });
        return;
      }
      const level = Math.min(5, user.weaponUpgrades[weaponId] || 0);
      const price = (level + 1) * 50;
      if (level >= 5) {
        jsonResponse(res, 400, { error: 'Bu ekipmanın tüm yükseltmeleri tamamlandı.' });
        return;
      }
      if (user.gold < price) {
        jsonResponse(res, 400, { error: `Yükseltme ${price} altın. Altının yetmiyor.` });
        return;
      }
      user.gold -= price;
      user.weaponUpgrades[weaponId] = level + 1;
      saveData();
      jsonResponse(res, 200, { profile: arenaProfile(user), reward: { type: 'upgrade', name: weapon.name, level: level + 1 } });
      return;
    }
    jsonResponse(res, 400, { error: 'Mağaza işlemi tanınmadı.' });
    return;
  }

  jsonResponse(res, 404, { error: 'Bulunamadı.' });
}

function resolvePublicPath(url) {
  let pathname;
  try {
    pathname = new URL(url, 'http://localhost').pathname;
  } catch {
    return null;
  }
  if (pathname === '/') return path.join(PUBLIC, 'index.html');
  if (pathname === '/arena' || pathname === '/arena/') return path.join(PUBLIC, 'arena.html');
  if (pathname.startsWith('/vendor/')) {
    const moduleName = pathname.slice('/vendor/'.length);
    if (!['three.module.js', 'three.core.js'].includes(moduleName)) return null;
    return path.join(ROOT, 'node_modules', 'three', 'build', moduleName);
  }
  let relative;
  try {
    relative = decodeURIComponent(pathname.slice(1));
  } catch {
    return null;
  }
  if (!relative || relative.includes('..') || relative.includes('\\')) return null;
  return path.join(PUBLIC, relative);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, url);
    } catch (error) {
      console.error('[api] İstek işlenemedi:', error);
      if (!res.headersSent) jsonResponse(res, 500, { error: 'Sunucu hatası oluştu.' });
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const file = resolvePublicPath(req.url || '/');
  if (!file) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  fs.readFile(file, (error, content) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Unable to read requested file');
      return;
    }
    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 40 * 1024 });
const arenaWss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 });

function sendArena(ws, payload) {
  send(ws, payload);
}

function arenaSnapshot() {
  return [...arenaPlayers.values()].map((player) => ({
    id: player.id,
    name: player.user.displayName,
    x: player.x,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
    character: player.character,
    weapon: player.weapon,
    health: player.health,
    kills: player.kills,
    deaths: player.deaths,
    respawnAt: player.respawnAt,
    slot: player.slot,
    gold: player.user.gold,
    mapId: activeArenaMap,
  }));
}

function broadcastArena(payload) {
  for (const player of arenaPlayers.values()) sendArena(player.ws, payload);
}

function arenaSpawn() {
  const spawns = [
    { x: -21, z: -21 }, { x: 21, z: -21 },
    { x: -21, z: 21 }, { x: 21, z: 21 },
  ];
  const spawn = spawns[Math.floor(Math.random() * spawns.length)];
  return { ...spawn, yaw: Math.atan2(spawn.x, spawn.z) };
}

function arenaBlocked(x, z) {
  const map = ARENA_MAPS[activeArenaMap || 'ruins'];
  return Math.abs(x) > ARENA_LIMIT || Math.abs(z) > ARENA_LIMIT
    || map.blocks.some((block) => Math.abs(x - block.x) < block.hx + 0.45 && Math.abs(z - block.z) < block.hz + 0.45);
}

function shootArena(player, now) {
  const weaponId = player.loadout[player.slot] || DEFAULT_INVENTORY[player.slot - 1];
  const weapon = ARENA_WEAPONS[weaponId] || ARENA_WEAPONS.pulse;
  const upgrade = Math.min(5, player.user.weaponUpgrades[weaponId] || 0);
  if (now - player.lastShotAt < weapon.cooldown || player.health <= 0) return;
  player.lastShotAt = now;
  broadcastArena({ type: 'arena-shot', id: player.id, weapon: weaponId, slot: player.slot });
  const origin = { x: player.x, y: 1.45, z: player.z };
  const hits = new Map();

  for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
    const yaw = player.yaw + (Math.random() - 0.5) * weapon.spread;
    const pitch = player.pitch + (Math.random() - 0.5) * weapon.spread;
    const cosPitch = Math.cos(pitch);
    const direction = {
      x: -Math.sin(yaw) * cosPitch,
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * cosPitch,
    };
    const explosive = weapon.slot === 3;
    const melee = weapon.slot === 4;
    const bombPoint = {
      x: origin.x + direction.x * Math.min(weapon.range * 0.7, 16),
      y: origin.y + direction.y * Math.min(weapon.range * 0.7, 16),
      z: origin.z + direction.z * Math.min(weapon.range * 0.7, 16),
    };
    let closest = null;
    let closestDistance = melee ? weapon.range : weapon.range;
    let closestHeadshot = false;

    for (const target of arenaPlayers.values()) {
      if (target.id === player.id || target.health <= 0) continue;
      if (explosive) {
        const distanceToBomb = Math.hypot(target.x - bombPoint.x, target.z - bombPoint.z);
        if (distanceToBomb <= weapon.radius) {
          const entry = hits.get(target.id) || { damage: 0, headshots: 0, hits: 0 };
          entry.hits += 1;
          entry.damage += Math.round(weapon.damage * (1 - 0.45 * distanceToBomb / weapon.radius) + upgrade * 4);
          hits.set(target.id, entry);
        }
        continue;
      }
      const targetY = melee ? 0.95 : 1.02;
      const toTarget = { x: target.x - origin.x, y: targetY - origin.y, z: target.z - origin.z };
      const distance = toTarget.x * direction.x + toTarget.y * direction.y + toTarget.z * direction.z;
      if (distance <= 0 || distance >= closestDistance) continue;
      const missX = toTarget.x - direction.x * distance;
      const missY = toTarget.y - direction.y * distance;
      const missZ = toTarget.z - direction.z * distance;
      const missDistance = Math.hypot(missX, missY, missZ);
      if (melee && (target.x - origin.x) * -Math.sin(player.yaw) + (target.z - origin.z) * -Math.cos(player.yaw) < 0) continue;
      if (missDistance < (melee ? 0.9 : 0.72)) {
        closest = target;
        closestDistance = distance;
        const head = { x: target.x - origin.x, y: 1.58 - origin.y, z: target.z - origin.z };
        const headDistance = head.x * direction.x + head.y * direction.y + head.z * direction.z;
        const headX = head.x - direction.x * headDistance;
        const headY = head.y - direction.y * headDistance;
        const headZ = head.z - direction.z * headDistance;
        closestHeadshot = !melee && !explosive && headDistance > 0
          && headX * headX + headY * headY + headZ * headZ < 0.13;
      }
    }
    if (closest) {
      const entry = hits.get(closest.id) || { damage: 0, headshots: 0, hits: 0 };
      entry.hits += 1;
      entry.headshots += Number(closestHeadshot);
      entry.damage += Math.round(weapon.damage * (closestHeadshot ? 1.8 : 1) + upgrade * 4);
      hits.set(closest.id, entry);
    }
  }

  for (const [targetId, result] of hits) {
    const target = arenaPlayers.get(targetId);
    if (!target || target.health <= 0) continue;
    target.health = Math.max(0, target.health - result.damage);
    const down = target.health === 0;
    const reward = result.hits * 10 + result.headshots * 20;
    player.user.gold += reward;
    gameDataDirty = true;
    sendArena(player.ws, {
      type: 'arena-feedback',
      name: target.user.displayName,
      hit: true,
      headshot: result.headshots > 0,
      down,
      gold: reward,
    });
    if (down) {
      player.kills += 1;
      target.deaths += 1;
      target.respawnAt = now + 1800;
      player.user.gold += 25;
      const topKillsBefore = Math.max(0, ...[...arenaPlayers.values()].filter((item) => item.id !== player.id).map((item) => item.kills));
      const mvpReward = player.kills > topKillsBefore ? 25 : 0;
      player.user.gold += mvpReward;
      gameDataDirty = true;
      sendArena(player.ws, { type: 'arena-reward', gold: 25 + mvpReward, reason: mvpReward ? 'ELEME + MVP' : 'ELEME' });
      sendArena(target.ws, { type: 'arena-death', respawnAt: target.respawnAt, by: player.user.displayName });
    }
    sendArena(player.ws, { type: 'arena-wallet', gold: player.user.gold });
  }
}

server.on('upgrade', (req, socket, head) => {
  let requestUrl;
  try {
    requestUrl = new URL(req.url || '/', 'http://localhost');
  } catch {
    socket.destroy();
    return;
  }
  const origin = req.headers.origin;
  let validOrigin = true;
  try {
    if (origin) validOrigin = new URL(origin).host === req.headers.host;
  } catch {
    validOrigin = false;
  }
  if (!['/ws', '/arena-ws'].includes(requestUrl.pathname) || !validOrigin) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const session = token && sessions.get(token);
  const user = session && session.expiresAt > Date.now()
    ? data.users.find((item) => item.id === session.userId)
    : null;
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  const targetWss = requestUrl.pathname === '/arena-ws' ? arenaWss : wss;
  targetWss.handleUpgrade(req, socket, head, (ws) => targetWss.emit('connection', ws, req, user));
});

arenaWss.on('connection', (ws, req, user) => {
  if (arenaPlayers.size >= 40) {
    ws.close(1013, 'Arena is full');
    return;
  }
  const id = crypto.randomUUID();
  const spawn = arenaSpawn();
  const player = {
    id,
    ws,
    user,
    x: spawn.x,
    z: spawn.z,
    yaw: spawn.yaw,
    pitch: 0,
    character: 'scout',
    weapon: DEFAULT_LOADOUT[1],
    slot: 1,
    loadout: Object.fromEntries([1, 2, 3, 4].map((slot) => [
      slot,
      user.inventory.includes(DEFAULT_LOADOUT[slot])
        ? DEFAULT_LOADOUT[slot]
        : user.inventory.find((weaponId) => ARENA_WEAPONS[weaponId]?.slot === slot) || DEFAULT_LOADOUT[slot],
    ])),
    maxHealth: ARENA_CLASSES.scout.health,
    loadoutLocked: false,
    inputX: 0,
    inputZ: 0,
    health: ARENA_CLASSES.scout.health,
    kills: 0,
    deaths: 0,
    respawnAt: 0,
    lastShotAt: 0,
    lastInputAt: 0,
  };
  arenaPlayers.set(id, player);
  sendArena(ws, {
    type: 'arena-ready',
    id,
    mapId: activeArenaMap,
    profile: arenaProfile(user),
    players: arenaSnapshot(),
  });

  ws.on('message', (buffer) => {
    let message;
    try {
      message = JSON.parse(buffer.toString());
    } catch {
      return;
    }
    if (!message || typeof message.type !== 'string') return;
    const now = Date.now();

    if (message.type === 'arena-loadout' && !player.loadoutLocked) {
      let chosenMap = Object.hasOwn(ARENA_MAPS, message.mapId) ? message.mapId : 'ruins';
      const hasOtherPlayers = [...arenaPlayers.values()].some((item) => item.id !== player.id && item.loadoutLocked);
      if (activeArenaMap && activeArenaMap !== chosenMap && hasOtherPlayers) {
        sendArena(ws, { type: 'arena-error', text: `Bu maç ${ARENA_MAPS[activeArenaMap].name} haritasında. Sonraki maçta harita seçebilirsin.` });
        chosenMap = activeArenaMap;
      }
      const requestedLoadout = message.loadout && typeof message.loadout === 'object' ? message.loadout : {};
      const safeLoadout = {};
      for (const slot of [1, 2, 3, 4]) {
        const weaponId = String(requestedLoadout[slot] || player.loadout[slot]);
        const weapon = ARENA_WEAPONS[weaponId];
        safeLoadout[slot] = weapon && weapon.slot === slot && user.inventory.includes(weaponId)
          ? weaponId
          : player.loadout[slot];
      }
      if (Object.hasOwn(ARENA_CLASSES, message.character)) {
        if (!activeArenaMap || !hasOtherPlayers) activeArenaMap = chosenMap;
        player.character = message.character;
        player.loadout = safeLoadout;
        player.weapon = player.loadout[1];
        player.slot = 1;
        player.maxHealth = ARENA_CLASSES[player.character].health;
        player.health = player.maxHealth;
        player.loadoutLocked = true;
        broadcastArena({ type: 'arena-map', mapId: activeArenaMap });
        broadcastArena({ type: 'arena-state', players: arenaSnapshot() });
      }
    } else if (message.type === 'arena-input') {
      if (now - player.lastInputAt < 25) return;
      player.lastInputAt = now;
      player.inputX = Math.max(-1, Math.min(1, Number(message.x) || 0));
      player.inputZ = Math.max(-1, Math.min(1, Number(message.z) || 0));
      player.yaw = Number.isFinite(message.yaw) ? message.yaw : player.yaw;
      player.pitch = Math.max(-1.35, Math.min(1.35, Number(message.pitch) || 0));
    } else if (message.type === 'arena-slot') {
      const slot = Number(message.slot);
      if ([1, 2, 3, 4].includes(slot) && player.loadoutLocked) {
        player.slot = slot;
        player.weapon = player.loadout[slot];
        sendArena(ws, { type: 'arena-slot', slot, weapon: player.weapon });
        broadcastArena({ type: 'arena-state', players: arenaSnapshot() });
      }
    } else if (message.type === 'arena-fire') {
      if (!player.loadoutLocked) return;
      shootArena(player, now);
    } else if (message.type === 'ping') {
      sendArena(ws, { type: 'pong' });
    }
  });

  ws.on('close', () => {
    arenaPlayers.delete(id);
    if (!arenaPlayers.size) activeArenaMap = null;
  });
});

wss.on('connection', (ws, req, user) => {
  const id = crypto.randomUUID();
  const client = {
    id,
    ws,
    user,
    channelId: null,
    windowStart: Date.now(),
    eventCount: 0,
    kicked: false,
  };
  clients.set(id, client);
  if (!socketsByUser.has(user.id)) socketsByUser.set(user.id, new Set());
  socketsByUser.get(user.id).add(id);

  ws.on('message', (buffer) => {
    let message;
    try {
      message = JSON.parse(buffer.toString());
    } catch {
      send(ws, { type: 'error', text: 'Mesaj biçimi geçersiz.' });
      return;
    }
    if (!message || typeof message.type !== 'string') return;

    const now = Date.now();
    if (now - client.windowStart >= 10000) {
      client.windowStart = now;
      client.eventCount = 0;
    }
    client.eventCount += 1;
    if (client.eventCount > 100) {
      send(ws, { type: 'error', text: 'Çok hızlı işlem yaptın. Biraz bekle.' });
      return;
    }

    if (message.type === 'channel-join') {
      const channelId = String(message.channelId || '');
      if (!CHANNELS.some((channel) => channel.id === channelId)) {
        send(ws, { type: 'error', text: 'Sohbet kanalı bulunamadı.' });
        return;
      }
      if (client.channelId) {
        const oldChannel = client.channelId;
        if (voiceMembers.delete(id)) broadcast(oldChannel, { type: 'voice-left', id });
        clients.delete(id);
        addMessage(oldChannel, { type: 'system', text: `${client.user.displayName} kanaldan ayrıldı.`, ts: now });
        broadcast(oldChannel, { type: 'presence', users: roomUsers(oldChannel) });
      }
      client.channelId = channelId;
      clients.set(id, client);
      removeExpiredMessages(channelId, now);
      send(ws, {
        type: 'channel-state',
        connectionId: id,
        channelId,
        users: roomUsers(channelId),
        history: data.messages[channelId],
      });
      addMessage(channelId, {
        type: 'system',
        text: `${client.user.displayName} #${CHANNELS.find((channel) => channel.id === channelId).name} kanalına katıldı.`,
        ts: now,
      });
      broadcast(channelId, { type: 'presence', users: roomUsers(channelId) });
      return;
    }

    if (!client.channelId) {
      send(ws, { type: 'error', text: 'Önce bir sohbet kanalına katıl.' });
      return;
    }
    const channelId = client.channelId;

    if (message.type === 'chat') {
      const text = String(message.text || '')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 500);
      if (text) addMessage(channelId, {
        type: 'chat',
        id: client.user.id,
        nick: client.user.displayName,
        text,
        ts: now,
      });
    } else if (message.type === 'chat-reset') {
      if (client.user.role !== 'admin') {
        send(ws, { type: 'error', text: 'Sohbeti temizleme yetkin yok.' });
        return;
      }
      data.messages[channelId] = [];
      saveData();
      broadcast(channelId, { type: 'chat-reset' });
    } else if (message.type === 'voice-join') {
      if (voiceMembers.has(id)) return;
      voiceMembers.add(id);
      send(ws, { type: 'voice-peers', users: roomUsers(channelId).filter((peer) => peer.speaking && peer.connectionId !== id) });
      broadcast(channelId, {
        type: 'voice-peer-joined',
        user: { ...publicUser(client.user), connectionId: id, speaking: true },
      }, id);
      broadcast(channelId, { type: 'presence', users: roomUsers(channelId) });
    } else if (message.type === 'voice-leave') {
      if (!voiceMembers.delete(id)) return;
      broadcast(channelId, { type: 'voice-left', id }, id);
      broadcast(channelId, { type: 'presence', users: roomUsers(channelId) });
    } else if (message.type === 'voice-signal') {
      const targetId = String(message.to || '');
      const target = clients.get(targetId);
      const signal = message.signal;
      if (!voiceMembers.has(id) || !target || target.channelId !== channelId || !voiceMembers.has(targetId)) return;
      if (!signal || typeof signal !== 'object' || Array.isArray(signal) || JSON.stringify(signal).length > 32 * 1024) return;
      send(target.ws, { type: 'voice-signal', from: id, signal });
    } else if (message.type === 'voice-screen-stop') {
      if (!voiceMembers.has(id)) return;
      broadcast(channelId, { type: 'voice-screen-stop', id }, id);
    } else if (message.type === 'kick') {
      if (client.user.role !== 'admin') {
        send(ws, { type: 'error', text: 'Kullanıcı çıkarma yetkin yok.' });
        return;
      }
      const targetUserId = String(message.targetUserId || '');
      const targetUser = data.users.find((item) => item.id === targetUserId);
      const targetSockets = [...(socketsByUser.get(targetUserId) || [])]
        .map((socketId) => clients.get(socketId))
        .filter((target) => target && target.channelId === channelId);
      if (!targetUser || targetUser.role === 'admin' || targetUser.id === client.user.id || !targetSockets.length) {
        send(ws, { type: 'error', text: 'Bu kullanıcı çıkarılamıyor.' });
        return;
      }
      for (const [token, session] of sessions) {
        if (session.userId === targetUserId) sessions.delete(token);
      }
      const allTargetSockets = [...(socketsByUser.get(targetUserId) || [])]
        .map((socketId) => clients.get(socketId))
        .filter(Boolean);
      for (const target of allTargetSockets) {
        send(target.ws, { type: 'kicked', text: 'Yönetici tarafından sohbetten çıkarıldın.' });
        disconnectClient(target, 4001, 'Removed by administrator');
      }
      for (const player of arenaPlayers.values()) {
        if (player.user.id === targetUserId) player.ws.close(4001, 'Removed by administrator');
      }
    } else if (message.type === 'ping') {
      send(ws, { type: 'pong' });
    }
  });

  ws.on('close', () => {
    if (client.kicked) return;
    clients.delete(id);
    const userSockets = socketsByUser.get(user.id);
    userSockets?.delete(id);
    if (userSockets && !userSockets.size) socketsByUser.delete(user.id);
    if (!client.channelId) return;
    const channelId = client.channelId;
    if (voiceMembers.delete(id)) broadcast(channelId, { type: 'voice-left', id });
    addMessage(channelId, { type: 'system', text: `${user.displayName} sohbetten ayrıldı.`, ts: Date.now() });
    broadcast(channelId, { type: 'presence', users: roomUsers(channelId) });
  });
});

setInterval(() => {
  for (const channel of CHANNELS) removeExpiredMessages(channel.id);
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
  for (const [key, attempts] of loginAttempts) {
    if (attempts.resetAt <= now) loginAttempts.delete(key);
  }
}, 15 * 1000).unref();

setInterval(() => {
  if (!gameDataDirty) return;
  saveData();
  gameDataDirty = false;
}, 5000).unref();

setInterval(() => {
  const now = Date.now();
  for (const player of arenaPlayers.values()) {
    if (player.health <= 0) {
      if (player.respawnAt && now >= player.respawnAt) {
        const spawn = arenaSpawn();
        player.x = spawn.x;
        player.z = spawn.z;
        player.health = player.maxHealth;
        player.respawnAt = 0;
      }
      continue;
    }

    const length = Math.hypot(player.inputX, player.inputZ) || 1;
    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);
    const rightX = Math.cos(player.yaw);
    const rightZ = -Math.sin(player.yaw);
    const speed = ARENA_CLASSES[player.character].speed / length;
    const nextX = player.x + (rightX * player.inputX + forwardX * player.inputZ) * speed;
    const nextZ = player.z + (rightZ * player.inputX + forwardZ * player.inputZ) * speed;
    if (!arenaBlocked(nextX, player.z)) player.x = nextX;
    if (!arenaBlocked(player.x, nextZ)) player.z = nextZ;
  }
  if (arenaPlayers.size) broadcastArena({ type: 'arena-state', players: arenaSnapshot() });
}, 50).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`YanYana hazır: http://localhost:${PORT}`);
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((network) => network && network.family === 'IPv4' && !network.internal)
    .map((network) => network.address);
  for (const address of addresses) {
    console.log(`Aynı ağdaki cihazlar: http://${address}:${PORT}`);
  }
  console.log(`Veri klasörü: ${DATA_DIR}`);
  if (!data.users.some((user) => user.role === 'admin')) {
    console.log('İlk kurulum: Bu bilgisayarda http://localhost:8011 adresini aç.');
  } else {
    console.log('Yerel ağdaki arkadaşların, sunucu bilgisayarının IP adresi ve PORT üzerinden bağlanabilir.');
  }
});
