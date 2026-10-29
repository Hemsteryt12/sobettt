import * as THREE from '/vendor/three.module.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#worldCanvas');
const state = {
  user: null,
  socket: null,
  selfId: null,
  players: new Map(),
  keys: new Set(),
  yaw: 0,
  pitch: 0,
  x: 0,
  z: 0,
  health: 100,
  kills: 0,
  deaths: 0,
  character: 'scout',
  weapon: 'ak47',
  slot: 1,
  mapId: 'ruins',
  profile: null,
  loadout: { 1: 'ak47', 2: 'pulse_pistol', 3: 'impact_bomb', 4: 'alloy_knife' },
  chatSocket: null,
  chatTimers: new Map(),
  started: false,
  inputAt: 0,
  matchStartedAt: 0,
  lookPointer: null,
  fireTimer: null,
  mouseFireTimer: null,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9c5b5');
scene.fog = new THREE.Fog('#a9c5b5', 37, 76);
const camera = new THREE.PerspectiveCamera(76, 1, 0.1, 110);
camera.rotation.order = 'YXZ';
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
} catch (error) {
  console.error('[arena] WebGL başlatılamadı:', error);
  $('#lobbyCopy').textContent = 'Bu bilgisayarda 3D oyun açılamadı. Tarayıcı WebGL desteğini ve okul bilgisayarındaki grafik ayarlarını kontrol et.';
  $('#joinButton').disabled = true;
}

scene.add(new THREE.HemisphereLight('#e9ffed', '#59675a', 2.0));
const sun = new THREE.DirectionalLight('#fff1cf', 2.4);
sun.position.set(-12, 24, 13);
scene.add(sun);

const sharedBox = new THREE.BoxGeometry(1, 1, 1);
const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#e5e0bb', roughness: 0.85 });
const mapCatalog = {
  ruins: {
    name: 'Eski Harabeler', sky: '#a9c5b5', floor: '#b3c393', wall: '#71857a',
    blocks: [
      [-12, -9, 2, 2, 3.5, '#d1815e'], [11, -11, 2.5, 1.5, 2.5, '#557f7c'],
      [-10, 12, 1.5, 2.5, 3, '#cbad68'], [12, 10, 2, 2, 4, '#65856c'],
      [0, -16, 3, 1.2, 2.8, '#d0aa5f'], [0, 16, 3, 1.2, 3.2, '#cb765a'],
      [-17, 1, 1.2, 3, 2.4, '#58817a'], [17, -1, 1.2, 3, 3.6, '#c7a263'],
      [-5, -3, 1.4, 1.4, 2.8, '#718a62'], [6, 4, 1.4, 1.4, 3.3, '#bd705d'],
    ],
  },
  harbor: {
    name: 'Sisli Liman', sky: '#91b5bd', floor: '#81999b', wall: '#405d66',
    blocks: [
      [-13, -12, 4, 2, 3, '#c77a55'], [12, -13, 2, 4, 3.8, '#547982'],
      [-13, 12, 2.5, 4, 2.6, '#d0aa67'], [13, 13, 4, 2.5, 3.2, '#618b79'],
      [0, -7, 5, 1.1, 1.8, '#d6c48c'], [0, 8, 1.1, 6, 2, '#bc7259'],
      [-7, 0, 1.1, 5, 2.3, '#4d7880'], [9, 0, 5, 1.1, 2.5, '#c08e5a'],
    ],
  },
  canyon: {
    name: 'Kızıl Kanyon', sky: '#d5a28a', floor: '#b98b65', wall: '#765847',
    blocks: [
      [-15, -12, 3.5, 2, 4, '#9e604e'], [13, -12, 2, 3.5, 3.5, '#d08a5b'],
      [-13, 13, 2, 4, 3.2, '#d19a58'], [14, 12, 3, 2, 4.2, '#985847'],
      [-3, -14, 1.2, 4, 2.8, '#d49b6a'], [4, 14, 4, 1.2, 3, '#9e614b'],
      [-10, 0, 3.5, 1.2, 2.4, '#bb7952'], [10, 1, 3.5, 1.2, 2.5, '#d19a6c'],
      [0, 0, 1.7, 1.7, 3.5, '#855544'],
    ],
  },
};
let mapMeshes = [];
let currentMapId = null;

function addBlock(x, y, z, width, height, depth, material) {
  const mesh = new THREE.Mesh(sharedBox, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  scene.add(mesh);
  mapMeshes.push(mesh);
  return mesh;
}

function buildMap(mapId) {
  const config = mapCatalog[mapId] || mapCatalog.ruins;
  for (const mesh of mapMeshes) {
    scene.remove(mesh);
    if (mesh.geometry !== sharedBox) mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material !== edgeMaterial) material.dispose();
    }
  }
  mapMeshes = [];
  scene.background.set(config.sky);
  scene.fog.color.set(config.sky);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshStandardMaterial({ color: config.floor, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.08;
  scene.add(floor);
  mapMeshes.push(floor);
  const grid = new THREE.GridHelper(56, 28, config.wall, config.floor);
  grid.position.y = -0.045;
  for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) {
    material.transparent = true;
    material.opacity = 0.37;
  }
  scene.add(grid);
  mapMeshes.push(grid);
  for (const [x, z, hx, hz, height, color] of config.blocks) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.88, flatShading: true });
    addBlock(x, height / 2, z, hx * 2, height, hz * 2, material);
    addBlock(x, height + 0.035, z, hx * 2 + 0.1, 0.07, hz * 2 + 0.1, edgeMaterial);
  }
  const wallMaterial = new THREE.MeshStandardMaterial({ color: config.wall, roughness: 1, flatShading: true });
  addBlock(0, 1.3, -29, 60, 2.6, 1.2, wallMaterial);
  addBlock(0, 1.3, 29, 60, 2.6, 1.2, wallMaterial);
  addBlock(-29, 1.3, 0, 1.2, 2.6, 60, wallMaterial);
  addBlock(29, 1.3, 0, 1.2, 2.6, 60, wallMaterial);
  currentMapId = mapId;
  $('#mapLabel').textContent = config.name.toLocaleUpperCase('tr-TR');
}

buildMap(state.mapId);

const weapon = new THREE.Group();
const weaponDark = new THREE.MeshStandardMaterial({ color: '#293534', roughness: 0.48, metalness: 0.3 });
const weaponLight = new THREE.MeshStandardMaterial({ color: '#d4ff58', roughness: 0.35, emissive: '#62801e', emissiveIntensity: 0.6 });
const weaponWarm = new THREE.MeshStandardMaterial({ color: '#dd8361', roughness: 0.55 });
function weaponPart(x, y, z, sx, sy, sz, material) {
  const part = new THREE.Mesh(sharedBox, material);
  part.position.set(x, y, z);
  part.scale.set(sx, sy, sz);
  weapon.add(part);
}

const weaponHud = {
  ak47: ['AK-47', 'OTOMATİK · ORTA MENZİL'],
  pulse: ['ARC PULSE', 'ORTA · HASSAS'],
  scatter: ['BURST SG', 'YAKIN · SAÇILIM'],
  rail: ['AWP SNIPER', 'UZAK · TEK ATIŞ'],
  pulse_pistol: ['ECHO-9', '2 · TABANCA'],
  burst_pistol: ['TWIN SPARK', '2 · ÇİFT ATIŞ'],
  impact_bomb: ['NOVA BOMB', '3 · ALAN ETKİSİ'],
  cluster_bomb: ['CLUSTER ORB', '3 · GENİŞ ALAN'],
  alloy_knife: ['ALLOY KNIFE', '4 · YAKIN DÖVÜŞ'],
  prism_knife: ['PRISM BLADE', '4 · GÜÇLÜ YAKIN'],
};

function rebuildWeapon(id) {
  weapon.clear();
  if (id.includes('bomb')) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), weaponLight);
    orb.position.set(0, 0.02, -0.22);
    weapon.add(orb);
    weaponPart(0, -0.12, 0.03, 0.18, 0.22, 0.18, weaponDark);
    weaponPart(0.1, 0.14, 0.02, 0.06, 0.12, 0.06, weaponWarm);
  } else if (id.includes('knife')) {
    weaponPart(0, -0.08, 0.02, 0.16, 0.24, 0.18, weaponDark);
    weaponPart(0, 0.08, -0.27, 0.075, 0.13, 0.54, weaponLight);
    weaponPart(0, 0.1, -0.55, 0.035, 0.08, 0.18, weaponWarm);
  } else if (id.includes('pistol')) {
    weaponPart(0, 0, 0.02, 0.2, 0.14, 0.36, weaponDark);
    weaponPart(0, 0.05, -0.21, 0.1, 0.06, 0.22, weaponLight);
    weaponPart(0, -0.12, 0.08, 0.12, 0.22, 0.13, weaponDark);
  } else if (id === 'scatter') {
    weaponPart(0, 0, 0.02, 0.28, 0.17, 0.58, weaponDark);
    weaponPart(-0.085, 0.08, -0.31, 0.075, 0.075, 0.52, weaponWarm);
    weaponPart(0.085, 0.08, -0.31, 0.075, 0.075, 0.52, weaponWarm);
    weaponPart(0, 0.13, -0.12, 0.11, 0.08, 0.18, weaponLight);
    weaponPart(0, -0.15, 0.16, 0.2, 0.25, 0.21, weaponDark);
  } else if (id === 'ak47') {
    weaponPart(0, 0, 0.02, 0.2, 0.18, 0.62, weaponDark);
    weaponPart(0, 0.055, -0.29, 0.12, 0.1, 0.52, weaponWarm);
    weaponPart(0, 0.11, -0.4, 0.14, 0.08, 0.28, weaponLight);
    weaponPart(0, -0.15, 0.12, 0.14, 0.28, 0.19, weaponDark);
    weaponPart(0, -0.19, 0.31, 0.11, 0.26, 0.1, weaponWarm);
  } else if (id === 'rail') {
    weaponPart(0, 0, 0, 0.22, 0.18, 0.67, weaponDark);
    weaponPart(0, 0.04, -0.52, 0.1, 0.1, 0.8, weaponLight);
    weaponPart(0, 0.17, -0.04, 0.18, 0.13, 0.28, weaponWarm);
    weaponPart(0, 0.26, -0.07, 0.12, 0.07, 0.15, weaponDark);
    weaponPart(0, -0.15, 0.17, 0.15, 0.31, 0.18, weaponDark);
  } else {
    weaponPart(0, 0, 0, 0.19, 0.16, 0.55, weaponDark);
    weaponPart(0, 0.07, -0.25, 0.12, 0.08, 0.35, weaponLight);
    weaponPart(0, -0.15, 0.05, 0.13, 0.28, 0.17, weaponDark);
    weaponPart(0, 0, -0.3, 0.09, 0.06, 0.16, weaponWarm);
  }
  const [name, info] = weaponHud[id] || weaponHud.pulse;
  $('#weaponHudName').textContent = name;
  $('#weaponHudInfo').textContent = info;
  $('#slotReadout').textContent = `${state.slot} · ${['', 'ANA SİLAH', 'TABANCA', 'BOMBA', 'BIÇAK'][state.slot]}`;
}

rebuildWeapon(state.weapon);
weapon.position.set(0.39, -0.34, -0.7);
camera.add(weapon);
scene.add(camera);

const palette = ['#d4ff58', '#ff805f', '#69d6bb', '#f4c655', '#88a7ff', '#ed95ce', '#73dc6e'];
const avatarBlocks = new Map();

function labelSprite(name, color) {
  const label = document.createElement('canvas');
  label.width = 256;
  label.height = 64;
  const context = label.getContext('2d');
  context.fillStyle = '#17221ee8';
  context.fillRect(15, 9, 226, 46);
  context.fillStyle = color;
  context.fillRect(15, 9, 4, 46);
  context.fillStyle = '#f2f1e7';
  context.font = '600 23px Space Grotesk, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(name.slice(0, 18), 132, 33);
  const texture = new THREE.CanvasTexture(label);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(2.4, 0.6, 1);
  sprite.position.y = 2.35;
  return sprite;
}

function makeAvatar(player) {
  const group = new THREE.Group();
  const color = palette[Math.abs([...player.id].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % palette.length];
  const looks = {
    scout: { suit: '#54c8a9', trim: '#d4ff58', width: 0.58, head: '#c4dfca' },
    vanguard: { suit: '#df805f', trim: '#f5cb67', width: 0.7, head: '#efc29a' },
    bulwark: { suit: '#7898b3', trim: '#e5e0bb', width: 0.88, head: '#bbcbd0' },
  };
  const look = looks[player.character] || looks.scout;
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: look.suit, roughness: 0.72, flatShading: true });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: '#263431', roughness: 0.85, flatShading: true });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: look.head, roughness: 0.9, flatShading: true });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: look.trim, roughness: 0.55, flatShading: true, emissive: look.trim, emissiveIntensity: 0.08 });
  const legs = [];
  const arms = [];
  const torso = new THREE.Mesh(sharedBox, bodyMaterial);
  torso.position.y = 0.98;
  torso.scale.set(look.width, 0.74, 0.4);
  group.add(torso);
  const head = new THREE.Mesh(sharedBox, skinMaterial);
  head.position.y = 1.56;
  head.scale.set(player.character === 'bulwark' ? 0.48 : 0.4, player.character === 'bulwark' ? 0.45 : 0.4, 0.43);
  group.add(head);
  const visor = new THREE.Mesh(sharedBox, trimMaterial);
  visor.position.set(0, 1.58, -0.225);
  visor.scale.set(player.character === 'bulwark' ? 0.43 : 0.35, 0.09, 0.045);
  group.add(visor);
  if (player.character !== 'scout') {
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(sharedBox, player.character === 'bulwark' ? darkMaterial : trimMaterial);
      shoulder.position.set(side * (look.width * 0.65), 1.23, 0);
      shoulder.scale.set(player.character === 'bulwark' ? 0.34 : 0.22, player.character === 'bulwark' ? 0.34 : 0.2, 0.48);
      group.add(shoulder);
    }
    const chestMark = new THREE.Mesh(sharedBox, trimMaterial);
    chestMark.position.set(0, 1.06, -0.215);
    chestMark.scale.set(player.character === 'vanguard' ? 0.34 : 0.2, 0.11, 0.045);
    group.add(chestMark);
  }
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(sharedBox, darkMaterial);
    leg.position.set(side * 0.18, 0.38, 0);
    leg.scale.set(0.2, 0.55, 0.27);
    group.add(leg);
    legs.push(leg);
    const arm = new THREE.Mesh(sharedBox, bodyMaterial);
    arm.position.set(side * (look.width * 0.78), 1.0, -0.02);
    arm.scale.set(player.character === 'bulwark' ? 0.26 : 0.18, 0.6, 0.25);
    group.add(arm);
    arms.push(arm);
  }
  group.add(labelSprite(player.name, color));
  group.position.set(player.x, 0, player.z);
  group.rotation.y = player.yaw;
  group.userData.legs = legs;
  group.userData.arms = arms;
  scene.add(group);
  return group;
}

function updatePlayers(players) {
  state.players = new Map(players.map((player) => [player.id, player]));
  const active = new Set(players.map((player) => player.id));
  for (const [id, group] of avatarBlocks) {
    if (!active.has(id)) {
      scene.remove(group);
      avatarBlocks.delete(id);
    }
  }
  for (const player of players) {
    if (player.id === state.selfId) {
      state.x = player.x;
      state.z = player.z;
      state.health = player.health;
      state.kills = player.kills;
      state.deaths = player.deaths;
      if (player.slot && player.slot !== state.slot) {
        state.slot = player.slot;
        state.weapon = player.weapon || state.loadout[state.slot];
        rebuildWeapon(state.weapon);
      }
      if (player.health === 0 && player.respawnAt) showDeath(player.respawnAt);
      else $('#deathOverlay').classList.add('is-hidden');
      continue;
    }
    let avatar = avatarBlocks.get(player.id);
    if (avatar && avatar.userData.character !== player.character) {
      scene.remove(avatar);
      avatarBlocks.delete(player.id);
      avatar = null;
    }
    if (!avatar) {
      avatar = makeAvatar(player);
      avatarBlocks.set(player.id, avatar);
      avatar.userData.character = player.character;
    }
    const previousX = avatar.position.x;
    const previousZ = avatar.position.z;
    avatar.visible = player.health > 0;
    avatar.position.x = THREE.MathUtils.lerp(avatar.position.x, player.x, 0.42);
    avatar.position.z = THREE.MathUtils.lerp(avatar.position.z, player.z, 0.42);
    avatar.rotation.y = player.yaw;
    const moving = Math.hypot(player.x - previousX, player.z - previousZ) > 0.006;
    const stride = moving ? Math.sin(Date.now() * 0.016 + player.x) * 0.48 : 0;
    avatar.userData.legs.forEach((leg, index) => { leg.rotation.x = index === 0 ? stride : -stride; });
    avatar.userData.arms.forEach((arm, index) => { arm.rotation.x = index === 0 ? -stride * 0.55 : stride * 0.55; });
  }
  renderLeaderboard(players);
  renderHud();
}

function renderLeaderboard(players) {
  const ordered = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).slice(0, 6);
  $('#leaderboard').replaceChildren(...ordered.map((player, index) => {
    const row = document.createElement('li');
    const position = document.createElement('span');
    position.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('strong');
    name.textContent = player.name + (player.id === state.selfId ? ' · SEN' : '');
    const score = document.createElement('b');
    score.textContent = String(player.kills).padStart(2, '0');
    row.append(position, name, score);
    return row;
  }));
  $('#playerCount').textContent = String(players.length).padStart(2, '0');
}

function renderHud() {
  $('#healthValue').textContent = String(state.health).padStart(3, '0');
  $('#healthFill').style.width = `${state.health}%`;
  $('#healthFill').parentElement.classList.toggle('is-low', state.health < 35);
  $('#killValue').textContent = String(state.kills).padStart(2, '0');
}

let toastTimer;
let deathTimer;
function showToast(message) {
  const toast = $('#connectionToast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1600);
}

function requestArenaPointerLock() {
  if (!renderer?.domElement.requestPointerLock) return;
  try {
    Promise.resolve(renderer.domElement.requestPointerLock()).catch((error) => {
      console.warn('[arena] Fare kilidi açılamadı:', error);
      showToast('Fare kilidi açılamadı. Yeniden denemek için oyun alanına tıkla.');
    });
  } catch (error) {
    console.warn('[arena] Fare kilidi açılamadı:', error);
    showToast('Fare kilidi açılamadı. Yeniden denemek için oyun alanına tıkla.');
  }
}

function showDeath(respawnAt) {
  const overlay = $('#deathOverlay');
  overlay.classList.remove('is-hidden');
  clearInterval(deathTimer);
  const update = () => {
    const seconds = Math.max(0, Math.ceil((respawnAt - Date.now()) / 1000));
    $('#respawnCountdown').textContent = String(seconds);
    if (!seconds) {
      overlay.classList.add('is-hidden');
      clearInterval(deathTimer);
    }
  };
  update();
  deathTimer = setInterval(update, 100);
}

function setNetwork(status) {
  const network = $('.network-state');
  network.classList.toggle('is-connected', status === 'connected');
  network.classList.toggle('is-error', status === 'error');
  $('#networkLabel').textContent = status === 'connected' ? 'BAĞLANDI' : status === 'error' ? 'BAĞLANTI KOPTU' : 'BAĞLANIYOR';
}

function spawnTracer(player) {
  const tracerColors = { pulse: '#d4ff58', ak47: '#ffcf68', scatter: '#ff805f', rail: '#86c9ff' };
  const weapon = player.weapon || 'ak47';
  const reach = weapon === 'scatter' ? 12 : weapon === 'rail' ? 42 : weapon === 'ak47' ? 26 : 21;
  const start = new THREE.Vector3(player.x, 1.35, player.z);
  const end = new THREE.Vector3(
    player.x - Math.sin(player.yaw) * reach,
    1.35 + Math.sin(player.pitch || 0) * reach * 0.45,
    player.z - Math.cos(player.yaw) * reach,
  );
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: tracerColors[weapon] || tracerColors.pulse, transparent: true, opacity: 0.88 }));
  scene.add(line);
  setTimeout(() => {
    scene.remove(line);
    geometry.dispose();
    line.material.dispose();
  }, 100);
}

function updateWallet(gold) {
  $('#goldValue').textContent = String(gold);
  $('#shopGold').textContent = String(gold);
}

function renderMapOptions() {
  const container = $('#mapOptions');
  container.replaceChildren(...state.profile.maps.map((map) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `map-option${map.id === state.mapId ? ' is-selected' : ''}`;
    button.dataset.search = map.name.toLocaleLowerCase('tr-TR');
    button.dataset.mapId = map.id;
    button.innerHTML = `<span>MAP / 0${state.profile.maps.indexOf(map) + 1}</span><strong></strong>`;
    button.querySelector('strong').textContent = map.name;
    button.addEventListener('click', () => {
      state.mapId = map.id;
      renderMapOptions();
    });
    return button;
  }));
}

function renderSlotOptions() {
  for (const slot of [1, 2, 3, 4]) {
    const select = $(`#slot${slot}Select`);
    const owned = state.profile.weapons.filter((item) => item.slot === slot && state.profile.inventory.includes(item.id));
    select.replaceChildren(...owned.map((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      option.selected = state.loadout[slot] === item.id;
      return option;
    }));
    if (!owned.some((item) => item.id === state.loadout[slot]) && owned[0]) state.loadout[slot] = owned[0].id;
    select.onchange = () => {
      state.loadout[slot] = select.value;
      if (slot === state.slot) {
        state.weapon = select.value;
        rebuildWeapon(state.weapon);
      }
    };
  }
}

function renderShopItems(query = '') {
  const container = $('#shopItems');
  const normalized = query.trim().toLocaleLowerCase('tr-TR');
  const matches = state.profile.weapons.filter((item) => item.name.toLocaleLowerCase('tr-TR').includes(normalized));
  container.replaceChildren(...matches.map((item) => {
    const owned = state.profile.inventory.includes(item.id);
    const level = Number(state.profile.upgrades[item.id] || 0);
    const row = document.createElement('article');
    row.className = 'shop-item';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = item.name;
    const details = document.createElement('small');
    details.textContent = `${item.slot} · ${['', 'ANA SİLAH', 'TABANCA', 'BOMBA', 'BIÇAK'][item.slot]} · ${item.rarity || 'standart'}${owned ? ` · +${level} seviye` : ''}`;
    info.append(name, details);
    const action = document.createElement('button');
    action.type = 'button';
    if (owned) {
      action.textContent = level >= 5 ? 'TAMAM' : `+${(level + 1) * 50} ✦`;
      action.disabled = level >= 5 || state.profile.gold < (level + 1) * 50;
      action.addEventListener('click', () => shopAction('upgrade', item.id));
    } else {
      action.textContent = `${item.price} ✦`;
      action.disabled = state.profile.gold < item.price;
      action.addEventListener('click', () => shopAction('buy-weapon', item.id));
    }
    row.append(info, action);
    return row;
  }));
}

async function loadArenaProfile() {
  const response = await fetch('/api/arena-profile', { credentials: 'same-origin', cache: 'no-store' });
  const profile = await response.json();
  if (!response.ok) throw new Error(profile.error || 'Arena profili yüklenemedi.');
  state.profile = profile;
  updateWallet(profile.gold);
  for (const slot of [1, 2, 3, 4]) {
    const first = profile.weapons.find((item) => item.slot === slot && profile.inventory.includes(item.id));
    if (first && !profile.inventory.includes(state.loadout[slot])) state.loadout[slot] = first.id;
  }
  renderMapOptions();
  renderSlotOptions();
  renderShopItems($('#shopSearch').value);
}

async function shopAction(action, weaponId) {
  try {
    const response = await fetch('/api/arena-shop', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, weaponId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Mağaza işlemi tamamlanamadı.');
    state.profile = result.profile;
    updateWallet(state.profile.gold);
    renderSlotOptions();
    renderShopItems($('#shopSearch').value);
    const reward = result.reward;
    showToast(reward.type === 'gold'
      ? `KASADAN ${reward.amount} ALTIN ÇIKTI`
      : reward.type === 'upgrade'
        ? `${reward.name} +${reward.level} YÜKSELTİLDİ`
        : `KASADAN ${reward.name} · ${reward.rarity || 'standart'} ÇIKTI`);
  } catch (error) {
    showToast(error.message);
  }
}

function setCrosshair() {
  const settings = {
    size: Number($('#crosshairSize').value),
    gap: Number($('#crosshairGap').value),
    color: $('#crosshairColor').value,
  };
  document.documentElement.style.setProperty('--reticle-size', `${settings.size}px`);
  document.documentElement.style.setProperty('--reticle-gap', `${settings.gap}px`);
  document.documentElement.style.setProperty('--reticle-color', settings.color);
  try {
    localStorage.setItem('yanyana-crosshair', JSON.stringify(settings));
  } catch (error) {
    console.warn('[arena] Nişangâh ayarı kaydedilemedi:', error);
  }
}

function initializeCrosshair() {
  try {
    const saved = JSON.parse(localStorage.getItem('yanyana-crosshair') || '{}');
    if (Number.isFinite(saved.size)) $('#crosshairSize').value = String(Math.max(2, Math.min(12, saved.size)));
    if (Number.isFinite(saved.gap)) $('#crosshairGap').value = String(Math.max(2, Math.min(14, saved.gap)));
    if (typeof saved.color === 'string' && /^#[\da-f]{6}$/i.test(saved.color)) $('#crosshairColor').value = saved.color;
  } catch (error) {
    console.warn('[arena] Nişangâh ayarı okunamadı:', error);
  }
  setCrosshair();
}

function addArenaChatMessage(message) {
  const box = $('#arenaChatMessages');
  const row = document.createElement('p');
  row.className = message.type === 'system' ? 'arena-chat-system' : 'arena-chat-line';
  if (message.messageId) row.dataset.messageId = message.messageId;
  if (message.type !== 'system') {
    const author = document.createElement('strong');
    author.textContent = message.nick || 'Oyuncu';
    row.append(author);
  }
  const text = document.createElement('span');
  text.textContent = message.text || '';
  row.append(text);
  box.append(row);
  if (message.messageId && Number.isFinite(message.expiresAt)) {
    const timer = setTimeout(() => {
      row.remove();
      state.chatTimers.delete(message.messageId);
    }, Math.max(0, message.expiresAt - Date.now()));
    state.chatTimers.set(message.messageId, timer);
  }
  while (box.children.length > 30) box.firstElementChild.remove();
  box.scrollTop = box.scrollHeight;
}

function connectArenaChat() {
  const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
  const socket = new WebSocket(url);
  state.chatSocket = socket;
  socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'channel-join', channelId: 'sohbet' })));
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'channel-state') {
      for (const timer of state.chatTimers.values()) clearTimeout(timer);
      state.chatTimers.clear();
      $('#arenaChatMessages').replaceChildren();
      (message.history || []).forEach(addArenaChatMessage);
    } else if (message.type === 'chat' || message.type === 'system') {
      addArenaChatMessage(message);
    } else if (message.type === 'chat-delete') {
      for (const id of message.messageIds || []) {
        clearTimeout(state.chatTimers.get(id));
        state.chatTimers.delete(id);
        $(`#arenaChatMessages [data-message-id="${CSS.escape(id)}"]`)?.remove();
      }
    } else if (message.type === 'chat-reset') {
      $('#arenaChatMessages').replaceChildren();
    }
  });
  socket.addEventListener('close', () => {
    if (state.chatSocket === socket) state.chatSocket = null;
  });
}

function connectArena() {
  if (state.socket || !state.user) return;
  const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/arena-ws`;
  const socket = new WebSocket(url);
  state.socket = socket;
  setNetwork('connecting');
  $('#joinButton').disabled = true;
  $('#lobbyCopy').textContent = 'Arenaya bağlanılıyor...';

  socket.addEventListener('open', () => setNetwork('connected'));
  socket.addEventListener('open', () => socket.send(JSON.stringify({
    type: 'arena-loadout',
    character: state.character,
    mapId: state.mapId,
    loadout: state.loadout,
  })));
  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === 'arena-ready') {
      state.selfId = message.id;
      state.started = true;
      state.matchStartedAt = Date.now();
      updatePlayers(message.players || []);
      if (message.profile) {
        state.profile = message.profile;
        updateWallet(message.profile.gold);
      }
      if (message.mapId) {
        state.mapId = message.mapId;
        buildMap(message.mapId);
        renderMapOptions();
      }
      $('#lobby').classList.add('is-hidden');
      $('#joinButton').disabled = false;
      requestArenaPointerLock();
      showToast('ARENAYA HOŞ GELDİN');
    } else if (message.type === 'arena-state') {
      updatePlayers(message.players || []);
    } else if (message.type === 'arena-map') {
      state.mapId = message.mapId;
      buildMap(message.mapId);
      renderMapOptions();
    } else if (message.type === 'arena-slot') {
      state.slot = message.slot;
      state.weapon = message.weapon;
      rebuildWeapon(state.weapon);
    } else if (message.type === 'arena-wallet') {
      if (state.profile) state.profile.gold = message.gold;
      updateWallet(message.gold);
      renderShopItems($('#shopSearch').value);
    } else if (message.type === 'arena-reward') {
      showToast(`+${message.gold} ALTIN · ${message.reason}`);
    } else if (message.type === 'arena-death') {
      showDeath(message.respawnAt);
      showToast(`${message.by} seni eledi`);
    } else if (message.type === 'arena-error') {
      showToast(message.text);
    } else if (message.type === 'arena-feedback') {
      const flash = $('#hitFlash');
      const reticle = $('.reticle');
      flash.classList.add('is-hit');
      reticle.classList.add('is-hit');
      setTimeout(() => {
        flash.classList.remove('is-hit');
        reticle.classList.remove('is-hit');
      }, 120);
      showToast(message.headshot
        ? `KAFA ATIŞI · +${message.gold} ALTIN${message.down ? ' · ELEME!' : ''}`
        : message.down ? `${message.name} ELENDİ · +${message.gold} ALTIN` : `İSABET · +${message.gold} ALTIN`);
    } else if (message.type === 'arena-shot') {
      const shooter = state.players.get(message.id);
      if (shooter) spawnTracer(shooter);
    }
  });
  socket.addEventListener('close', (event) => {
    if (state.socket !== socket) return;
    state.socket = null;
    setNetwork('error');
    $('#joinButton').disabled = false;
    if (event.code === 1013) $('#lobbyCopy').textContent = 'Arena şu anda dolu. Biraz sonra tekrar dene.';
    else if (event.code === 1006 || event.code === 1008) {
      $('#lobbyCopy').textContent = 'Oyun bağlantısı kurulamadı. Oturumunu kontrol et.';
    } else $('#lobbyCopy').textContent = 'Bağlantı kesildi. Yeniden katılabilirsin.';
    $('#lobby').classList.remove('is-hidden');
    state.started = false;
  });
  socket.addEventListener('error', () => setNetwork('error'));
}

function moveStick(event) {
  const rect = $('#joystick').getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const max = rect.width * 0.34;
  const length = Math.hypot(dx, dy) || 1;
  const scale = Math.min(max, length) / length;
  const x = dx * scale;
  const y = dy * scale;
  $('#joystick').style.setProperty('--stick-x', `${x}px`);
  $('#joystick').style.setProperty('--stick-y', `${y}px`);
  state.touchX = x / max;
  state.touchZ = -y / max;
}

function fire() {
  if (state.socket?.readyState !== WebSocket.OPEN || !state.started) return;
  state.socket.send(JSON.stringify({ type: 'arena-fire', slot: state.slot }));
  weapon.position.z = -0.61;
  setTimeout(() => { weapon.position.z = -0.7; }, 70);
}

function startFiring() {
  fire();
  if (state.weapon !== 'ak47' || state.mouseFireTimer) return;
  state.mouseFireTimer = setInterval(fire, 110);
}

function stopFiring() {
  clearInterval(state.mouseFireTimer);
  state.mouseFireTimer = null;
}

function updateInput(now) {
  if (!state.started || state.socket?.readyState !== WebSocket.OPEN || now - state.inputAt < 45) return;
  state.inputAt = now;
  let x = 0;
  let z = 0;
  if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) x -= 1;
  if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) x += 1;
  if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) z += 1;
  if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) z -= 1;
  x += state.touchX || 0;
  z += state.touchZ || 0;
  const length = Math.hypot(x, z);
  if (length > 1) { x /= length; z /= length; }
  state.socket.send(JSON.stringify({ type: 'arena-input', x, z, yaw: state.yaw, pitch: state.pitch }));
}

function animate(now = 0) {
  requestAnimationFrame(animate);
  updateInput(now);
  camera.position.set(state.x, 1.52, state.z);
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
  camera.rotation.z = 0;
  const walking = state.started && (state.keys.size > 0 || Math.abs(state.touchX || 0) + Math.abs(state.touchZ || 0) > 0.1);
  const bob = walking ? Math.sin(now * 0.012) * 0.012 : 0;
  weapon.position.y = -0.34 + bob;
  if (renderer) renderer.render(scene, camera);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer?.setSize(width, height, false);
}

$('#joinButton').addEventListener('click', async () => {
  $('#joinButton').disabled = true;
  try {
    const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json();
    if (!result.user) {
      $('#authMessage').classList.remove('is-hidden');
      $('#lobbyFoot').classList.add('is-hidden');
      $('#joinButton').classList.add('is-hidden');
      $('#lobbyCopy').textContent = 'Çevrimiçi arenaya girmek için hesabınla oturum aç.';
      $('#joinButton').disabled = false;
      return;
    }
    state.user = result.user;
    connectArena();
  } catch {
    $('#lobbyCopy').textContent = 'Sunucuya ulaşılamadı. Bağlantını kontrol et ve tekrar dene.';
    $('#joinButton').disabled = false;
  }
});

for (const button of document.querySelectorAll('[data-character]')) {
  button.addEventListener('click', () => {
    state.character = button.dataset.character;
    for (const option of document.querySelectorAll('[data-character]')) {
      const selected = option === button;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    }
  });
}

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
  const slots = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4 };
  if (slots[event.code] && state.started) {
    state.slot = slots[event.code];
    state.weapon = state.loadout[state.slot];
    rebuildWeapon(state.weapon);
    state.socket?.send(JSON.stringify({ type: 'arena-slot', slot: state.slot }));
  }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  state.keys.add(event.code);
});
window.addEventListener('keyup', (event) => state.keys.delete(event.code));
window.addEventListener('blur', () => state.keys.clear());
window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;
  state.yaw -= event.movementX * 0.0024;
  state.pitch = THREE.MathUtils.clamp(state.pitch - event.movementY * 0.0022, -1.25, 1.25);
});
canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch' && state.started) {
    state.lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (state.started && document.pointerLockElement === canvas && event.button === 0) startFiring();
});
canvas.addEventListener('pointermove', (event) => {
  if (!state.lookPointer || state.lookPointer.id !== event.pointerId) return;
  state.yaw -= (event.clientX - state.lookPointer.x) * 0.008;
  state.pitch = THREE.MathUtils.clamp(state.pitch - (event.clientY - state.lookPointer.y) * 0.008, -1.25, 1.25);
  state.lookPointer.x = event.clientX;
  state.lookPointer.y = event.clientY;
});
canvas.addEventListener('pointerup', (event) => {
  if (state.lookPointer?.id === event.pointerId) state.lookPointer = null;
  if (event.button === 0) stopFiring();
});
canvas.addEventListener('click', () => {
  if (state.started && !('ontouchstart' in window) && document.pointerLockElement !== canvas) requestArenaPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  $('#crosshairHint').classList.toggle('is-visible', state.started && document.pointerLockElement !== canvas && !('ontouchstart' in window));
  if (document.pointerLockElement !== canvas) stopFiring();
});
window.addEventListener('mouseup', (event) => { if (event.button === 0) stopFiring(); });
$('#joystick').addEventListener('pointerdown', (event) => {
  event.preventDefault();
  $('#joystick').setPointerCapture(event.pointerId);
  moveStick(event);
});
$('#joystick').addEventListener('pointermove', (event) => {
  if ($('#joystick').hasPointerCapture(event.pointerId)) moveStick(event);
});
function resetStick() {
  state.touchX = 0;
  state.touchZ = 0;
  $('#joystick').style.setProperty('--stick-x', '0px');
  $('#joystick').style.setProperty('--stick-y', '0px');
}
$('#joystick').addEventListener('pointerup', resetStick);
$('#joystick').addEventListener('pointercancel', resetStick);
$('#touchFire').addEventListener('pointerdown', (event) => {
  event.preventDefault();
  fire();
  clearInterval(state.fireTimer);
  if (state.weapon === 'ak47') state.fireTimer = setInterval(fire, 110);
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  $('#touchFire').addEventListener(type, () => clearInterval(state.fireTimer));
}
$('#loadoutSearch').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLocaleLowerCase('tr-TR');
  document.querySelectorAll('.map-option').forEach((button) => {
    button.hidden = !button.dataset.search.includes(query);
  });
  for (const slot of [1, 2, 3, 4]) {
    const select = $(`#slot${slot}Select`);
    for (const option of select.options) option.hidden = !option.textContent.toLocaleLowerCase('tr-TR').includes(query);
  }
});
$('#shopSearch').addEventListener('input', (event) => renderShopItems(event.target.value));
$('#shopToggle').addEventListener('click', () => {
  $('#shopPanel').classList.toggle('is-hidden');
  if (!state.profile) loadArenaProfile().catch((error) => showToast(error.message));
});
$('#shopClose').addEventListener('click', () => $('#shopPanel').classList.add('is-hidden'));
$('#openCase').addEventListener('click', () => shopAction('open-case'));
$('#crosshairToggle').addEventListener('click', () => $('#crosshairPanel').classList.toggle('is-hidden'));
$('#crosshairClose').addEventListener('click', () => $('#crosshairPanel').classList.add('is-hidden'));
$('#crosshairReset').addEventListener('click', () => {
  $('#crosshairSize').value = '4';
  $('#crosshairGap').value = '5';
  $('#crosshairColor').value = '#f8ffe9';
  setCrosshair();
});
for (const selector of ['#crosshairSize', '#crosshairGap', '#crosshairColor']) {
  $(selector).addEventListener('input', setCrosshair);
}
$('#fullscreenToggle').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) {
    showToast(`Tam ekran açılamadı: ${error.message}`);
  }
});
$('#chatCollapse').addEventListener('click', () => {
  const panel = $('.arena-chat');
  panel.classList.toggle('is-collapsed');
  $('#chatCollapse').textContent = panel.classList.contains('is-collapsed') ? '+' : '−';
});
$('#arenaChatForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#arenaChatInput');
  const text = input.value.trim();
  if (!text) return;
  if (state.chatSocket?.readyState !== WebSocket.OPEN) {
    showToast('Sohbet bağlantısı kuruluyor; tekrar dene.');
    return;
  }
  state.chatSocket.send(JSON.stringify({ type: 'chat', text }));
  input.value = '';
  input.focus();
});

initializeCrosshair();
window.addEventListener('resize', resize);
window.addEventListener('beforeunload', () => {
  clearInterval(state.fireTimer);
  clearInterval(state.mouseFireTimer);
  clearInterval(deathTimer);
  state.socket?.close();
  state.chatSocket?.close();
  for (const timer of state.chatTimers.values()) clearTimeout(timer);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
});

fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
  .then((response) => response.json())
  .then(async (result) => {
    if (!result.user) {
      $('#networkLabel').textContent = 'GİRİŞ GEREKİYOR';
      $('#lobbyCopy').textContent = 'Çevrimiçi arenaya girmek için hesabınla oturum aç.';
      $('#authMessage').classList.remove('is-hidden');
      $('#joinButton').classList.add('is-hidden');
      $('#lobbyFoot').classList.add('is-hidden');
    }
    state.user = result.user;
    await loadArenaProfile();
    connectArenaChat();
  })
  .catch((error) => {
    setNetwork('error');
    $('#lobbyCopy').textContent = error.message || 'Sunucuya ulaşılamadı. Sohbete dönüp bağlantını kontrol et.';
  });

resize();
requestAnimationFrame(animate);
setInterval(() => {
  if (!state.matchStartedAt) return;
  const seconds = Math.floor((Date.now() - state.matchStartedAt) / 1000);
  $('#roundClock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}, 1000);
