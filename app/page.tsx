"use client";

import { useEffect, useRef, useState } from "react";

type Dir = "PR" | "PL";
type Weapon = "N" | "M" | "R" | "S" | "F" | "L";
type InputName = "left" | "right" | "up" | "down" | "jump" | "fire";
type Input = Record<InputName, boolean>;
type ProjectileKind = "normal" | "spread" | "fire" | "laser" | "enemy" | "grenade";
type Projectile = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  kind: ProjectileKind;
  enemy: boolean;
  piercing?: boolean;
  gravity?: number;
  phase?: number;
};
type EnemyKind = "runner" | "water" | "turret" | "hidden" | "grenadier" | "mortar" | "bossGun" | "core";
type Enemy = {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  fire: number;
  flash: number;
  dir: number;
  active: boolean;
  vy: number;
  surface: number;
};
type Pickup = {
  x: number;
  y: number;
  spawnY: number;
  weapon: Exclude<Weapon, "N">;
  taken: boolean;
  released: boolean;
  phase: number;
  vy: number;
};
type Explosion = { x: number; y: number; life: number; size: number };
type BridgePiece = { x: number; y: number; vy: number; delay: number; falling: boolean; intact: boolean };
type BridgeState = { trigger: number; started: boolean; locked: boolean; timer: number; pieces: BridgePiece[] };
type CollisionData = { step: number; width: number; surfaces: number[][] };
type Hud = { score: number; lives: number; weapon: Weapon; paused: boolean; phase: string; cheat: boolean; win: boolean; mapX: number; inWater: boolean; diving: boolean; bridge: boolean; bossHp: number; playerY: number; bullets: number; enemyBullets: number; waterEnemyY: number; enemies: string; pose: string; falls: string };

const SCREEN_W = 816;
const SCREEN_H = 765;
const MAP_W = 11374;
const GROUND_OFFSET = 44;
const LANDING_SNAP = 34;
const JUMP_VELOCITY = -740;
const WATER_FLOOR = 732;
const BRIDGE_PIECE_W = 64;
const BRIDGE_Y = 367;
const BRIDGE_PIECES = 6;
const BRIDGE_SPANS = [
  { trigger: 2350, start: 2550 },
  { trigger: 3350, start: 3550 },
];
const BOSS_START_X = 10600;
const BOSS_CAMERA_X = MAP_W - SCREEN_W;
const BOSS_PLAYER_MAX_X = 500;
const BOSS_SPRITE_X = 220;
const BOSS_SPRITE_Y = 109;
const BOSS_SPRITE_W = 647;
const BOSS_SPRITE_H = 578;
const BOSS_GROUND_Y = BOSS_SPRITE_Y + BOSS_SPRITE_H;
const BOSS_GATE_SOURCE_X = 204;
const BOSS_GATE_X = BOSS_SPRITE_X + Math.round(BOSS_SPRITE_W * BOSS_GATE_SOURCE_X / 431);
const WATER_RANGES = [
  { start: 0, end: 985 },
  { start: 1209, end: 1973 },
  { start: 2197, end: 4707 },
  { start: 5039, end: 5801 },
];
const LOW_PLATFORMS = [
  { start: 986, end: 1208, floor: 731 },
  { start: 1974, end: 2196, floor: 731 },
  { start: 4708, end: 5038, floor: 731 },
  { start: 5802, end: 6460, floor: 731 },
  { start: 7876, end: 7988, floor: 731 },
  { start: 8423, end: 8535, floor: 731 },
  { start: 9188, end: 9518, floor: 731 },
  { start: 10172, end: 11097, floor: 731 },
];
const ASSET = "/contra-local";
const CHEAT = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "KeyX", "KeyZ", "KeyX", "KeyZ", "Enter",
];

const makeInput = (): Input => ({ left: false, right: false, up: false, down: false, jump: false, fire: false });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

const phaseFor = (x: number) => {
  if (x < 2800) return "河滩";
  if (x < 4300) return "断桥";
  if (x < 7600) return "峡谷";
  if (x < 9800) return "炮台区";
  return "堡垒核心";
};

const weaponColor: Record<Weapon, string> = {
  N: "#ffffff", M: "#6ee7ff", R: "#ffe15a", S: "#ff5c5c", F: "#ff9b32", L: "#86ff7a",
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const inputRef = useRef<Input>(makeInput());
  const queuedJumpRef = useRef(false);
  const queuedFireRef = useRef(false);
  const pauseQueuedRef = useRef(false);
  const cheatQueuedRef = useRef(false);
  const cheatRef = useRef<string[]>([]);
  const cheatActivatedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState<Hud>({ score: 0, lives: 3, weapon: "N", paused: false, phase: "河滩", cheat: false, win: false, mapX: 190, inWater: false, diving: false, bridge: false, bossHp: 20, playerY: 380, bullets: 0, enemyBullets: 0, waterEnemyY: -1, enemies: "", pose: "stand", falls: "" });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let raf = 0;
    let stopped = false;

    const audio = () => {
      if (!audioRef.current) audioRef.current = new AudioContext();
      if (audioRef.current.state === "suspended") void audioRef.current.resume();
      return audioRef.current;
    };
    const tone = (startHz: number, duration: number, volume = 0.025, endHz = startHz, delay = 0) => {
      const context = audio();
      const start = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(startHz, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endHz), start + duration);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    };
    const noise = (duration: number, volume = 0.035, delay = 0) => {
      const context = audio();
      const sampleCount = Math.ceil(context.sampleRate * duration);
      const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < sampleCount; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.setValueAtTime(volume, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + duration);
      source.connect(gain).connect(context.destination);
      source.start(context.currentTime + delay);
    };
    const sfx = {
      jump: () => tone(150, 0.11, 0.022, 360),
      shoot: () => { noise(0.035, 0.018); tone(520, 0.045, 0.016, 180); },
      enemyShot: () => tone(190, 0.08, 0.012, 115),
      pickupOpen: () => { noise(0.1, 0.025); tone(210, 0.12, 0.018, 520); },
      pickup: () => { tone(440, 0.08, 0.025, 660); tone(660, 0.12, 0.025, 990, 0.08); },
      explosion: () => { noise(0.18, 0.045); tone(110, 0.2, 0.02, 45); },
      death: () => { tone(310, 0.14, 0.03, 150); tone(150, 0.32, 0.028, 45, 0.13); },
      boss: () => { tone(110, 0.18, 0.025, 110); tone(82, 0.26, 0.028, 55, 0.19); },
      clear: () => [0, 0.11, 0.22, 0.34].forEach((delay, index) => tone([392, 523, 659, 784][index], 0.18, 0.028, [523, 659, 784, 1047][index], delay)),
      pause: () => tone(330, 0.08, 0.018, 220),
    };

    const run = async () => {
      const [map, bulletImg, fireImg, laserImg, tankImg, tankShotImg, bossStageImg, bossImg, death1, death2, waterWalkImg, waterShootImg] = await Promise.all([
        loadImage(`${ASSET}/map01.jpeg`),
        loadImage(`${ASSET}/bullet1.png`),
        loadImage(`${ASSET}/bullet2.png`),
        loadImage(`${ASSET}/bullet3.png`),
        loadImage(`${ASSET}/tanke/image.png`),
        loadImage(`${ASSET}/tanke/tank-shot.png`),
        loadImage(`${ASSET}/boss/boss-stage.png`),
        loadImage(`${ASSET}/boss/boss-wechat-wide.png`),
        loadImage(`${ASSET}/PR/death1.png`),
        loadImage(`${ASSET}/PR/death2.png`),
        loadImage(`${ASSET}/water/walk.png`),
        loadImage(`${ASSET}/water/shoot.png`),
      ]);
      const collision = await fetch(`${ASSET}/collision.json`).then((response) => response.json() as Promise<CollisionData>);
      const sprites: Record<string, HTMLImageElement> = {};
      const enemySprites: HTMLImageElement[] = [];
      await Promise.all([
        ...(["PR", "PL"] as Dir[]).flatMap((dir) =>
          ["player", "player1", "player2", "player3", "player4", "player5", "shooting1", "shooting2", "shooting3", "jump1", "jump2", "jump3", "jump4", "down", "up"].map(async (name) => {
            sprites[`${dir}/${name}`] = await loadImage(`${ASSET}/${dir}/${name}.png`);
          }),
        ),
        ...[1, 2, 3, 4].map(async (frame) => {
          enemySprites[frame - 1] = await loadImage(`${ASSET}/enemy/EL/bag${frame}.png`);
        }),
      ]);
      if (stopped) return;
      setReady(true);

      const surfacesAt = (mapX: number) => {
        const index = Math.max(0, Math.min(collision.surfaces.length - 1, Math.round(mapX / collision.step)));
        return collision.surfaces[index] ?? [];
      };
      const hasWaterAt = (mapX: number) => {
        return WATER_RANGES.some((range) => mapX >= range.start && mapX <= range.end);
      };
      const lowPlatformFloorAt = (mapX: number) =>
        LOW_PLATFORMS.find((platform) => mapX >= platform.start && mapX <= platform.end)?.floor ?? null;
      const exposedSurfacesAt = (mapX: number) => surfacesAt(mapX).filter((candidate, index, surfaces) =>
        index === 0 || candidate - surfaces[index - 1] > 42,
      );
      const playableSurfacesAt = (mapX: number) => {
        const lowPlatformFloor = lowPlatformFloorAt(mapX);
        const deepSurfaceCutoff = lowPlatformFloor === null ? WATER_FLOOR - 8 : 700;
        const surfaces = exposedSurfacesAt(mapX).filter((surface) => surface < deepSurfaceCutoff);
        if (lowPlatformFloor !== null) surfaces.push(lowPlatformFloor);
        return surfaces.filter((surface, index) => surfaces.indexOf(surface) === index).sort((a, b) => a - b);
      };
      const supportedSurfacesAt = (mapX: number) => {
        const center = playableSurfacesAt(mapX);
        const samples = [-18, -12, -6, 0, 6, 12, 18].map((offset) => playableSurfacesAt(mapX + offset));
        const normalized = center.flatMap((surface) => {
          const matches = samples.flatMap((sample) => {
            const nearest = sample
              .filter((candidate) => Math.abs(candidate - surface) <= 36)
              .sort((a, b) => Math.abs(a - surface) - Math.abs(b - surface))[0];
            return nearest === undefined ? [] : [nearest];
          }).sort((a, b) => a - b);
          return matches.length >= 4 ? [Math.round(matches[Math.floor(matches.length / 2)])] : [];
        }).sort((a, b) => a - b);
        return normalized.filter((surface, index) => index === 0 || Math.abs(surface - normalized[index - 1]) > 8);
      };
      const playerSupportedSurfacesAt = (mapX: number) => {
        const samples = [-18, -9, 0, 9, 18].map((offset) => playableSurfacesAt(mapX + offset));
        const candidates = samples.flat().sort((a, b) => a - b);
        const normalized = candidates.flatMap((surface) => {
          const matches = samples.flatMap((sample) => {
            const nearest = sample
              .filter((candidate) => Math.abs(candidate - surface) <= 36)
              .sort((a, b) => Math.abs(a - surface) - Math.abs(b - surface))[0];
            return nearest === undefined ? [] : [nearest];
          }).sort((a, b) => a - b);
          return matches.length >= 2 ? [Math.round(matches[Math.floor(matches.length / 2)])] : [];
        }).sort((a, b) => a - b);
        return normalized.filter((surface, index) => index === 0 || Math.abs(surface - normalized[index - 1]) > 8);
      };
      const groundAt = (mapX: number, fromY: number, minimumY = 115) => {
        const threshold = Math.max(minimumY, fromY) + GROUND_OFFSET;
        return supportedSurfacesAt(mapX).find((surface) => surface >= threshold) ?? null;
      };
      const playerGroundAt = (mapX: number, fromY: number, minimumY = 115) => {
        const threshold = Math.max(minimumY, fromY) + GROUND_OFFSET - LANDING_SNAP;
        return playerSupportedSurfacesAt(mapX).find((surface) => surface >= threshold) ?? null;
      };
      const standingGroundAt = (mapX: number, currentY: number) => {
        const nearby = playerSupportedSurfacesAt(mapX)
          .filter((surface) => Math.abs(surface - currentY) <= 48)
          .sort((a, b) => Math.abs(a - currentY) - Math.abs(b - currentY));
        return nearby[0] ?? null;
      };
      const enemyFloorAt = (x: number, preferredY = 315) => {
        const threshold = preferredY + GROUND_OFFSET;
        const offsets = [0, -24, 24, -48, 48, -80, 80, -120, 120];
        let fallback: { x: number; floor: number } | null = null;
        for (const offset of offsets) {
          const sampleX = x + offset;
          const surfaces = supportedSurfacesAt(sampleX);
          if (surfaces.length === 0) continue;
          if (!fallback || Math.abs(offset) < Math.abs(fallback.x - x)) {
            fallback = { x: sampleX, floor: surfaces[0] };
          }
          const floor = surfaces.find((surface) => surface >= threshold);
          if (floor !== undefined) return { x: sampleX, floor };
        }
        return fallback;
      };

      const player = {
        screenX: 190,
        y: groundAt(190, 320, 320) ?? 380,
        vy: 0,
        dir: 1,
        jumping: false,
        crouching: false,
        shooting: false,
        runFrame: 0,
        jumpFrame: 0,
        shootFrame: 0,
        shootingTimer: 0,
        fireCooldown: 0,
        dead: false,
        deathTimer: 0,
        invulnerable: 2.5,
        unsupported: 0,
        lives: 3,
        weapon: "N" as Weapon,
        score: 0,
        inWater: false,
      };
      let camera = 0;
      let paused = false;
      let win = false;
      let gameTime = 0;
      let enemyId = 1;
      let bossHp = 20;
      let bossStarted = false;
      let previousMapX = 190;
      let enemyShotLock = 0;
      let checkpointX = 190;
      let checkpointY = player.y;
      let hudTimer = 0;
      const spawned = new Set<number>();
      const bullets: Projectile[] = [];
      const enemyBullets: Projectile[] = [];
      const enemies: Enemy[] = [];
      const explosions: Explosion[] = [];
      const destroyedBossGuns: Array<{ x: number; y: number; w: number; h: number }> = [];
      const fallXs: number[] = [];
      const bridges: BridgeState[] = BRIDGE_SPANS.map((span) => ({
        trigger: span.trigger,
        started: false,
        locked: false,
        timer: 0,
        pieces: Array.from({ length: BRIDGE_PIECES }, (_, index) => ({
          x: span.start + BRIDGE_PIECE_W / 2 + index * BRIDGE_PIECE_W,
          y: BRIDGE_Y,
          vy: 0,
          delay: 0.18 + index * 0.32,
          falling: false,
          intact: true,
        })),
      }));
      const pickups: Pickup[] = [
        { x: 1250, y: 185, spawnY: 185, weapon: "M", taken: false, released: false, phase: 0, vy: 0 },
        { x: 2480, y: 170, spawnY: 170, weapon: "R", taken: false, released: false, phase: 1, vy: 0 },
        { x: 4680, y: 180, spawnY: 180, weapon: "S", taken: false, released: false, phase: 2, vy: 0 },
        { x: 6820, y: 165, spawnY: 165, weapon: "F", taken: false, released: false, phase: 3, vy: 0 },
        { x: 8680, y: 180, spawnY: 180, weapon: "L", taken: false, released: false, phase: 4, vy: 0 },
      ];

      const mapX = () => player.screenX - camera;
      const isDiving = () => player.inWater && !player.jumping && inputRef.current.down;
      const bridgeFloorAt = (x: number) => {
        const piece = bridges.flatMap((bridge) => bridge.pieces)
          .find((candidate) => candidate.intact && Math.abs(x - candidate.x) <= BRIDGE_PIECE_W / 2);
        return piece?.y ?? null;
      };
      const qaParams = new URLSearchParams(window.location.search);
      const qaStart = Number(qaParams.get("qa"));
      const qaMode = Number.isFinite(qaStart) && qaStart >= 190 && qaStart < MAP_W - 150;
      const qaDamage = qaParams.get("damage") === "1";
      const qaWater = qaParams.get("water") === "1";
      const qaAuto = qaMode && qaParams.get("autorun") === "1";
      const qaWeapon = qaParams.get("weapon") as Weapon | null;
      const qaRateValue = Number(qaParams.get("rate"));
      const qaRate = qaMode && Number.isFinite(qaRateValue) ? Math.max(1, Math.min(12, qaRateValue)) : 1;
      const qaY = Number(qaParams.get("y"));
      const hasQaY = qaParams.has("y") && Number.isFinite(qaY) && qaY >= 100 && qaY <= WATER_FLOOR;
      if (qaMode) {
        camera = Math.max(-(MAP_W - SCREEN_W), Math.min(0, 190 - qaStart));
        player.screenX = Math.max(70, Math.min(qaStart > BOSS_START_X ? BOSS_PLAYER_MAX_X : SCREEN_W * 0.62, qaStart + camera));
        player.y = qaWater ? WATER_FLOOR : hasQaY ? qaY : bridgeFloorAt(qaStart) ?? groundAt(qaStart, 250) ?? WATER_FLOOR;
        player.inWater = qaWater || hasWaterAt(qaStart) && player.y === WATER_FLOOR;
        player.invulnerable = qaDamage ? 0 : 999;
        if (qaWeapon && ["N", "M", "R", "S", "F", "L"].includes(qaWeapon)) player.weapon = qaWeapon;
        checkpointX = qaStart;
        checkpointY = player.y;
        previousMapX = qaStart;
        if (qaParams.get("move") === "right") inputRef.current.right = true;
        if (qaParams.get("move") === "left") inputRef.current.left = true;
        if (qaParams.get("aim") === "up") inputRef.current.up = true;
        if (qaParams.get("dive") === "1") inputRef.current.down = true;
        if (qaParams.get("fire") === "1") inputRef.current.fire = true;
        if (qaAuto) {
          inputRef.current.right = true;
          inputRef.current.fire = true;
        }
        if (qaParams.get("jump") === "1") queuedJumpRef.current = true;
      }
      const enemyOnGround = (kind: EnemyKind, x: number, hp = 1, y?: number): Enemy => {
        const sizes: Record<EnemyKind, [number, number]> = {
          runner: [54, 78], water: [50, 58], turret: [92, 72], hidden: [109, 110], grenadier: [54, 78], mortar: [100, 72], bossGun: [38, 34], core: [72, 78],
        };
        const [w, h] = sizes[kind];
        if (kind === "water") {
          return { id: enemyId++, kind, x, y: WATER_FLOOR + 6, w, h, hp, fire: 0.7, flash: 0, dir: -1, active: false, vy: 0, surface: 0 };
        }
        const placement = y === undefined ? enemyFloorAt(x) : { x, floor: y };
        if (!placement) return { id: enemyId++, kind, x, y: 390 - h, w, h, hp, fire: 0.7 + Math.random() * 0.7, flash: 0, dir: -1, active: false, vy: 0, surface: 0 };
        return { id: enemyId++, kind, x: placement.x, y: placement.floor - h, w, h, hp, fire: 0.7 + Math.random() * 0.7, flash: 0, dir: -1, active: true, vy: 0, surface: 0 };
      };
      const spawnWave = (id: number, trigger: number, list: Array<[EnemyKind, number, number?, number?]>) => {
        if (spawned.has(id) || mapX() + SCREEN_W < trigger) return;
        spawned.add(id);
        list.forEach(([kind, x, hp = 1, y]) => {
          if (x > mapX() - 650) enemies.push(enemyOnGround(kind, x, hp, y));
        });
      };
      const spawnLevel = () => {
        spawnWave(1, 600, [["runner", 980]]);
        spawnWave(2, 1450, [["runner", 1900], ["runner", 2140]]);
        spawnWave(3, 2500, [["turret", 3000, 3], ["runner", 3220], ["runner", 3400]]);
        spawnWave(4, 3900, [["runner", 4300], ["runner", 4490]]);
        spawnWave(5, 5200, [["runner", 5600], ["runner", 6200]]);
        spawnWave(6, 6500, [["turret", 6880, 3], ["runner", 7130], ["hidden", 7662, 2, 683]]);
        spawnWave(7, 7700, [["turret", 8460, 3], ["runner", 8770], ["runner", 8990]]);
        spawnWave(8, 9000, [["turret", 9580, 3]]);
        spawnWave(9, 9450, [["hidden", 10065, 2, 683]]);
      };

      const playerBox = () => {
        if (player.inWater && !player.jumping) return { x: player.screenX - 25, y: player.y - 38, w: 50, h: 34 };
        if (player.jumping) return { x: player.screenX - 18, y: player.y - 48, w: 36, h: 38 };
        if (player.crouching) return { x: player.screenX - 34, y: player.y - 30, w: 68, h: 28 };
        return { x: player.screenX - 17, y: player.y - 84, w: 34, h: 80 };
      };
      const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

      const resetLevel = () => {
        camera = 0;
        player.screenX = 190;
        player.y = groundAt(190, 320, 320) ?? 380;
        player.vy = 0;
        player.jumping = false;
        player.dead = false;
        player.inWater = false;
        player.weapon = "N";
        player.score = 0;
        player.invulnerable = 2;
        checkpointX = 190;
        checkpointY = player.y;
        bullets.length = 0;
        enemyBullets.length = 0;
        enemies.length = 0;
        explosions.length = 0;
        fallXs.length = 0;
        spawned.clear();
        pickups.forEach((pickup) => {
          pickup.taken = false;
          pickup.released = false;
          pickup.y = pickup.spawnY;
          pickup.vy = 0;
        });
        bossHp = 20;
        bossStarted = false;
        destroyedBossGuns.length = 0;
        previousMapX = 190;
        bridges.forEach((bridge) => {
          bridge.started = false;
          bridge.locked = false;
          bridge.timer = 0;
          bridge.pieces.forEach((piece) => { piece.y = BRIDGE_Y; piece.vy = 0; piece.falling = false; piece.intact = true; });
        });
        win = false;
      };

      const killPlayer = (force = false) => {
        if (player.dead || (!force && player.invulnerable > 0) || win) return;
        if (force) fallXs.push(Math.round(mapX()));
        sfx.death();
        player.dead = true;
        player.deathTimer = 1.05;
        player.lives -= 1;
        player.weapon = "N";
        bullets.length = 0;
        enemyBullets.length = 0;
      };

      const revive = () => {
        if (player.lives <= 0) {
          player.lives = cheatActivatedRef.current ? 30 : 3;
        }
        camera = bossStarted
          ? Math.max(-(MAP_W - SCREEN_W), Math.min(0, -BOSS_CAMERA_X))
          : Math.max(-(MAP_W - SCREEN_W), Math.min(0, 190 - checkpointX));
        player.screenX = Math.max(70, Math.min(bossStarted ? BOSS_PLAYER_MAX_X : SCREEN_W * 0.62, checkpointX + camera));
        player.y = checkpointY;
        player.vy = 0;
        player.jumping = false;
        player.crouching = false;
        player.shooting = false;
        player.inWater = false;
        player.dead = false;
        player.invulnerable = 2.2;
      };

      const aimVector = () => {
        const input = inputRef.current;
        let ax = 0;
        let ay = 0;
        if (input.left) ax = -1;
        else if (input.right) ax = 1;
        if (input.up) ay = -1;
        else if (input.down && player.jumping) ay = 1;
        if (ax === 0 && ay === 0) ax = player.dir;
        if (!player.jumping && player.crouching) ay = 0;
        const length = Math.hypot(ax, ay) || 1;
        return { x: ax / length, y: ay / length };
      };

      const shoot = () => {
        if (player.fireCooldown > 0 || player.dead || isDiving() || paused || win) return;
        const aim = aimVector();
        const originX = mapX() + aim.x * 36;
        const originY = player.inWater ? player.y - 29 : player.crouching ? player.y - 22 : player.y - 58;
        const activePlayerShots = bullets.filter((bullet) => !bullet.enemy).length;
        const push = (angleOffset: number, speed: number, kind: ProjectileKind, piercing = false) => {
          const base = Math.atan2(aim.y, aim.x) + angleOffset;
          bullets.push({ x: originX, y: originY, vx: Math.cos(base) * speed, vy: Math.sin(base) * speed, life: 1.65, kind, enemy: false, piercing, phase: 0 });
        };
        if (player.weapon === "S") {
          if (activePlayerShots > 12) return;
          [-0.32, -0.16, 0, 0.16, 0.32].forEach((angle) => push(angle, 720, "spread"));
          player.fireCooldown = 0.34;
        } else if (player.weapon === "M") {
          if (activePlayerShots > 7) return;
          push(0, 820, "normal");
          player.fireCooldown = 0.105;
        } else if (player.weapon === "R") {
          if (activePlayerShots > 5) return;
          push(0, 980, "normal");
          player.fireCooldown = 0.16;
        } else if (player.weapon === "F") {
          if (activePlayerShots > 4) return;
          push(0, 620, "fire");
          player.fireCooldown = 0.28;
        } else if (player.weapon === "L") {
          if (activePlayerShots > 3) return;
          push(0, 1080, "laser", true);
          player.fireCooldown = 0.22;
        } else {
          if (activePlayerShots > 3) return;
          push(0, 820, "normal");
          player.fireCooldown = 0.27;
        }
        sfx.shoot();
        player.shooting = true;
      };

      const enemyShoot = (enemy: Enemy, targetX: number, targetY: number) => {
        const fixedGun = enemy.kind === "turret" || enemy.kind === "hidden" || enemy.kind === "mortar" || enemy.kind === "bossGun";
        const sx = enemy.kind === "bossGun" ? enemy.x + 3 : fixedGun ? enemy.x + (enemy.dir < 0 ? 7 : enemy.w - 7) : enemy.x + enemy.w / 2;
        const sy = enemy.kind === "bossGun" ? enemy.y + enemy.h / 2 : enemy.kind === "hidden" ? enemy.y + 55 : fixedGun ? enemy.y + 34 : enemy.y + enemy.h * 0.42;
        const dx = targetX - sx;
        const dy = targetY - sy;
        const len = Math.hypot(dx, dy) || 1;
        if (enemy.kind === "grenadier" || enemy.kind === "mortar") {
          const direction = Math.sign(dx) || -1;
          enemyBullets.push({ x: sx, y: sy, vx: direction * (enemy.kind === "mortar" ? 230 : 185), vy: enemy.kind === "mortar" ? -440 : -360, gravity: 820, life: 3, kind: "grenade", enemy: true });
        } else {
          const speed = enemy.kind === "bossGun" ? 420 : enemy.kind === "turret" || enemy.kind === "hidden" ? 360 : 290;
          enemyBullets.push({ x: sx, y: sy, vx: dx / len * speed, vy: dy / len * speed, life: 2.8, kind: "enemy", enemy: true });
        }
        sfx.enemyShot();
      };

      const startBoss = () => {
        if (bossStarted) return;
        bossStarted = true;
        sfx.boss();
        const worldX = mapX();
        camera = Math.max(-(MAP_W - SCREEN_W), Math.min(0, -BOSS_CAMERA_X));
        player.screenX = Math.max(70, Math.min(BOSS_PLAYER_MAX_X, worldX + camera));
        if (!player.jumping) {
          player.y = WATER_FLOOR;
          player.vy = 0;
        }
        player.inWater = false;
        player.unsupported = 0;
        checkpointX = mapX();
        checkpointY = WATER_FLOOR;
        enemies.length = 0;
        enemyBullets.length = 0;
        destroyedBossGuns.length = 0;
        const core = enemyOnGround("core", BOSS_CAMERA_X + 340, bossHp, 609);
        core.y = 511;
        core.w = 88;
        core.h = 98;
        enemies.push(core);
        const upperGun = enemyOnGround("bossGun", BOSS_CAMERA_X + 374, 1, 267);
        upperGun.y = 222;
        upperGun.w = 52;
        upperGun.h = 45;
        enemies.push(upperGun);
        const lowerGun = enemyOnGround("bossGun", BOSS_CAMERA_X + 314, 1, 439);
        lowerGun.y = 394;
        lowerGun.w = 60;
        lowerGun.h = 45;
        enemies.push(lowerGun);
      };

      const updateHud = (dt: number) => {
        hudTimer -= dt;
        if (hudTimer > 0) return;
        hudTimer = 0.1;
        const input = inputRef.current;
        const horizontalInput = input.left || input.right;
        const diving = isDiving();
        const pose = player.dead ? "death" : diving ? "dive" : player.inWater && !player.jumping ? "water" : player.jumping ? "jump" : player.crouching ? "crouch" : input.up && !horizontalInput ? "up" : player.shooting ? "shoot" : horizontalInput ? "run" : "stand";
        setHud({ score: player.score, lives: player.lives, weapon: player.weapon, paused, phase: phaseFor(mapX()), cheat: cheatActivatedRef.current, win, mapX: Math.round(mapX()), inWater: player.inWater, diving, bridge: bridges.some((bridge) => bridge.started), bossHp, playerY: Math.round(player.y), bullets: bullets.length, enemyBullets: enemyBullets.length, waterEnemyY: Math.round(enemies.find((enemy) => enemy.active && enemy.kind === "water")?.y ?? -1), enemies: enemies.filter((enemy) => enemy.active && enemy.hp > 0).slice(0, 8).map((enemy) => `${enemy.kind}:${Math.round(enemy.x)},${Math.round(enemy.y)}:${enemy.hp}`).join("|"), pose, falls: fallXs.join(",") });
      };

      const update = (dt: number) => {
        if (cheatQueuedRef.current) {
          cheatQueuedRef.current = false;
          player.lives = 30;
          sfx.pickup();
        }
        if (pauseQueuedRef.current) {
          pauseQueuedRef.current = false;
          paused = !paused;
          sfx.pause();
        }
        updateHud(dt);
        if (paused || win) return;
        gameTime += dt;
        player.invulnerable = Math.max(0, player.invulnerable - dt);
        player.fireCooldown = Math.max(0, player.fireCooldown - dt);
        enemyShotLock = Math.max(0, enemyShotLock - dt);

        if (player.dead) {
          player.deathTimer -= dt;
          player.y += 260 * dt;
          if (player.deathTimer <= 0) revive();
          return;
        }

        const input = inputRef.current;
        const wantsJump = queuedJumpRef.current || input.jump || (qaAuto && !player.jumping);
        const wantsFire = (queuedFireRef.current || input.fire) && !isDiving();
        queuedJumpRef.current = false;
        queuedFireRef.current = false;
        player.crouching = input.down && !player.jumping && !player.inWater;
        let move = 0;
        if (!player.crouching) move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (move !== 0) player.dir = move;

        if (wantsJump && !player.jumping && !player.crouching) {
          sfx.jump();
          player.jumping = true;
          player.inWater = false;
          player.vy = JUMP_VELOCITY;
        }

        const speed = 190;
        const proposedMapX = mapX() + move * speed * dt;
        const leadingSurfaces = bossStarted ? [WATER_FLOOR] : move === 0 ? [] : [18, 26, 34]
          .flatMap((offset) => supportedSurfacesAt(proposedMapX + move * offset))
          .filter((surface, index, surfaces) => surfaces.indexOf(surface) === index)
          .sort((a, b) => a - b);
        const hasFootLevel = leadingSurfaces.some((surface) => Math.abs(surface - player.y) <= 52);
        const ledgeTop = leadingSurfaces.filter((surface) => surface < player.y - 52).at(-1);
        const movingIntoWater = hasWaterAt(proposedMapX + move * 34);
        const blockedByRock = !player.inWater && !player.jumping && !movingIntoWater && !hasFootLevel && ledgeTop !== undefined && player.y - ledgeTop > 52;
        if (move !== 0 && !blockedByRock) {
          if (move > 0 && player.screenX >= SCREEN_W * 0.5 && mapX() < MAP_W - 520 && !bossStarted) camera -= speed * dt;
          else player.screenX += move * speed * dt;
        }
        player.screenX = Math.max(34, Math.min(bossStarted ? BOSS_PLAYER_MAX_X : SCREEN_W * 0.62, player.screenX));
        camera = Math.max(-(MAP_W - SCREEN_W), Math.min(0, camera));

        const worldX = mapX();
        const terrainFloor = bossStarted ? WATER_FLOOR : standingGroundAt(worldX, player.y);
        const rawBridgeFloor = bridgeFloorAt(worldX);
        const dynamicBridgeFloor = rawBridgeFloor !== null && rawBridgeFloor >= player.y - 80 ? rawBridgeFloor : null;
        const waterFloor = hasWaterAt(worldX) ? WATER_FLOOR : null;
        const floor = dynamicBridgeFloor ?? terrainFloor ?? (player.inWater ? waterFloor : null);
        if (!player.jumping) {
          if (floor === null) {
            player.unsupported += dt;
            if (player.unsupported > 0.12) {
              player.jumping = true;
              player.vy = 90;
            }
          } else {
            player.unsupported = 0;
            player.y = floor;
            player.inWater = dynamicBridgeFloor === null && terrainFloor === null && waterFloor !== null;
            if (terrainFloor !== null && !player.inWater) {
              checkpointX = worldX;
              checkpointY = terrainFloor;
            }
          }
        }
        if (player.jumping) {
          const previousY = player.y;
          player.y += player.vy * dt;
          player.vy += (player.vy < 0 ? 1180 : 1500) * dt;
          player.vy = Math.min(player.vy, 900);
          const terrainLanding = bossStarted ? WATER_FLOOR : playerGroundAt(worldX, previousY - GROUND_OFFSET - 8, 110);
          const bridgeLanding = bridgeFloorAt(worldX);
          const waterLanding = hasWaterAt(worldX) ? WATER_FLOOR : null;
          const landingCandidates = [terrainLanding, bridgeLanding, waterLanding]
            .filter((candidate): candidate is number => candidate !== null && candidate >= previousY - 8);
          const landing = landingCandidates.length > 0 ? Math.min(...landingCandidates) : null;
          if (player.vy >= 0 && landing !== null && previousY <= landing + LANDING_SNAP && player.y >= landing && player.y <= landing + LANDING_SNAP) {
            player.y = landing;
            player.vy = 0;
            player.jumping = false;
            player.unsupported = 0;
            player.inWater = bridgeLanding === null && terrainLanding === null && waterLanding !== null;
            if (terrainLanding !== null && !player.inWater) {
              checkpointX = worldX;
              checkpointY = terrainLanding;
            }
          }
          player.jumpFrame += 10 * dt;
        }
        if (player.y > SCREEN_H + 30) {
          if (hasWaterAt(worldX)) {
            player.y = WATER_FLOOR;
            player.vy = 0;
            player.jumping = false;
            player.inWater = true;
          } else killPlayer(true);
        }

        if (wantsFire) {
          shoot();
          player.shootingTimer = 0.18;
        } else player.shootingTimer = Math.max(0, player.shootingTimer - dt);
        player.shooting = player.shootingTimer > 0;
        player.runFrame += Math.abs(move) * 10 * dt;
        player.shootFrame += wantsFire ? 11 * dt : 0;

        bridges.forEach((bridge) => {
          if (!bridge.locked && previousMapX < bridge.trigger && worldX >= bridge.trigger) {
            bridge.locked = true;
            bridge.started = true;
            bridge.timer = 0;
          }
          if (!bridge.started) return;
          bridge.timer += dt;
          bridge.pieces.forEach((piece) => {
            if (!piece.falling && bridge.timer >= piece.delay) {
              piece.falling = true;
              piece.intact = false;
              explosions.push({ x: piece.x, y: piece.y, life: 0.72, size: 54 });
              sfx.explosion();
              if (Math.abs(worldX - piece.x) < BRIDGE_PIECE_W / 2 && Math.abs(player.y - piece.y) < 80) killPlayer();
            }
            if (piece.falling) {
              piece.vy += 760 * dt;
              piece.y += piece.vy * dt;
            }
          });
        });
        previousMapX = worldX;

        spawnLevel();
        if (worldX > BOSS_START_X) startBoss();

        pickups.forEach((pickup) => {
          if (pickup.taken) return;
          pickup.phase += dt * 3;
          const screenX = pickup.x + camera;
          const py = pickup.released ? pickup.y : pickup.y + Math.sin(pickup.phase) * 14;
          if (!pickup.released) {
            bullets.forEach((bullet) => {
              if (pickup.released || bullet.life <= 0 || bullet.enemy) return;
              const bx = bullet.x + camera;
              if (!overlaps({ x: bx - 8, y: bullet.y - 8, w: 16, h: 16 }, { x: screenX - 31, y: py - 16, w: 62, h: 32 })) return;
              if (!bullet.piercing) bullet.life = 0;
              pickup.released = true;
              pickup.y = py;
              pickup.vy = -95;
              explosions.push({ x: pickup.x, y: py, life: 0.35, size: 28 });
              sfx.pickupOpen();
            });
            return;
          }
          pickup.vy = Math.min(620, pickup.vy + 620 * dt);
          pickup.y += pickup.vy * dt;
          const pickupFloor = groundAt(pickup.x, pickup.y - 54, 110) ?? (hasWaterAt(pickup.x) ? WATER_FLOOR : null);
          if (pickupFloor !== null && pickup.y + 20 >= pickupFloor) {
            pickup.y = pickupFloor - 20;
            pickup.vy = 0;
          }
          if (overlaps(playerBox(), { x: screenX - 20, y: pickup.y - 20, w: 40, h: 40 })) {
            pickup.taken = true;
            player.weapon = pickup.weapon;
            player.score += 500;
            sfx.pickup();
          }
        });

        bullets.forEach((bullet) => {
          bullet.x += bullet.vx * dt;
          bullet.y += bullet.vy * dt;
          bullet.life -= dt;
          if (bullet.kind === "fire") {
            bullet.phase = (bullet.phase ?? 0) + dt * 13;
            bullet.y += Math.sin(bullet.phase) * 2.6;
          }
        });
        enemyBullets.forEach((bullet) => {
          bullet.vy += (bullet.gravity ?? 0) * dt;
          bullet.x += bullet.vx * dt;
          bullet.y += bullet.vy * dt;
          bullet.life -= dt;
          const sx = bullet.x + camera;
          if (!isDiving() && overlaps(playerBox(), { x: sx - 6, y: bullet.y - 6, w: 12, h: 12 })) {
            bullet.life = 0;
            killPlayer();
          }
        });

        enemies.forEach((enemy) => {
          if (!enemy.active || enemy.hp <= 0) return;
          const sx = enemy.x + camera;
          const distance = enemy.x - worldX;
          enemy.dir = distance > 0 ? -1 : 1;
          if (enemy.kind === "runner" && Math.abs(distance) < 720) {
            const nextX = enemy.x + enemy.dir * 72 * dt;
            const enemyFoot = enemy.y + enemy.h;
            const enemyLeading = playableSurfacesAt(nextX + enemy.dir * enemy.w / 2);
            const enemyHasFloor = enemyLeading.some((surface) => Math.abs(surface - enemyFoot) <= 44);
            const wallTop = enemyLeading.filter((surface) => surface < enemyFoot - 44).at(-1);
            const blocked = !enemyHasFloor && wallTop !== undefined && enemyFoot - wallTop <= 150;
            if (!blocked) enemy.x = nextX;
            const terrain = groundAt(enemy.x, enemyFoot - GROUND_OFFSET - 16, 110);
            const bridge = bridgeFloorAt(enemy.x);
            const candidates = [terrain, bridge].filter((candidate): candidate is number => candidate !== null && candidate >= enemyFoot - 18);
            const enemyFloor = candidates.length > 0 ? Math.min(...candidates) : null;
            if (enemyFloor !== null && enemyFoot + enemy.vy * dt >= enemyFloor - 3 && enemyFoot <= enemyFloor + 42) {
              enemy.y = enemyFloor - enemy.h;
              enemy.vy = 0;
            } else {
              enemy.vy = Math.min(850, enemy.vy + 1500 * dt);
              enemy.y += enemy.vy * dt;
            }
            if (hasWaterAt(enemy.x) && enemy.y + enemy.h >= WATER_FLOOR - 4) enemy.active = false;
            if (enemy.y > SCREEN_H + 160) enemy.active = false;
          }
          if (enemy.kind === "water") {
            const shouldSurface = gameTime > 4 && Math.abs(distance) < 470 && enemy.fire <= 0.65;
            enemy.surface = Math.max(0, Math.min(1, enemy.surface + (shouldSurface ? 4 : -5) * dt));
            enemy.y = WATER_FLOOR + 6 - enemy.surface * 34 + Math.sin(gameTime * 3 + enemy.id) * 2;
          }
          enemy.flash = Math.max(0, enemy.flash - dt);
          enemy.fire -= dt;
          const attackRange = enemy.kind === "hidden" ? 720 : 520;
          const canAttack = sx > -100 && sx < SCREEN_W + 100 && Math.abs(distance) < attackRange && gameTime > 4;
          const attackPoseReady = enemy.kind !== "water" || enemy.surface >= 0.72;
          const independentShot = enemy.kind === "bossGun" || enemy.kind === "hidden";
          const shotLockReady = independentShot || enemyShotLock <= 0;
          if (canAttack && attackPoseReady && enemy.kind !== "core" && enemy.fire <= 0 && shotLockReady) {
            enemyShoot(enemy, worldX, player.y - 50);
            enemy.flash = enemy.kind === "hidden" ? 0.24 : 0.16;
            if (!independentShot) enemyShotLock = 0.55;
            enemy.fire = enemy.kind === "runner" ? 1.5 : enemy.kind === "water" ? 1.8 : enemy.kind === "grenadier" ? 1.35 : enemy.kind === "mortar" ? 1.05 : enemy.kind === "hidden" ? 0.85 : enemy.kind === "bossGun" ? enemy.y > 260 ? 0.95 : 1.25 : 1.2;
          }
          if (!isDiving() && sx > -120 && sx < SCREEN_W + 120 && enemy.kind !== "core" && overlaps(playerBox(), { x: sx, y: enemy.y, w: enemy.w, h: enemy.h })) killPlayer();

          bullets.forEach((bullet) => {
            if (bullet.life <= 0 || enemy.hp <= 0) return;
            const bx = bullet.x + camera;
            const hitBox = { x: sx, y: enemy.y, w: enemy.w, h: enemy.h };
            if (!overlaps({ x: bx - 8, y: bullet.y - 8, w: bullet.kind === "laser" ? 34 : 16, h: 16 }, hitBox)) return;
            if (!bullet.piercing) bullet.life = 0;
            enemy.hp -= 1;
            if (enemy.kind === "core") bossHp = enemy.hp;
            if (enemy.hp <= 0) {
              enemy.active = false;
              if (enemy.kind === "bossGun") destroyedBossGuns.push({ x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h });
              explosions.push({ x: enemy.x + enemy.w / 2, y: enemy.y + enemy.h / 2, life: enemy.kind === "core" ? 2 : 0.6, size: enemy.kind === "core" ? 180 : 48 });
              sfx.explosion();
              player.score += enemy.kind === "core" ? 10000 : enemy.kind === "turret" || enemy.kind === "mortar" || enemy.kind === "bossGun" ? 500 : 100;
              if (enemy.kind === "core") {
                win = true;
                sfx.clear();
              }
            }
          });
        });
        for (let i = enemies.length - 1; i >= 0; i -= 1) {
          if (!enemies[i].active || enemies[i].x < worldX - 900) enemies.splice(i, 1);
        }

        explosions.forEach((explosion) => { explosion.life -= dt; });
        for (let i = explosions.length - 1; i >= 0; i -= 1) if (explosions[i].life <= 0) explosions.splice(i, 1);
        for (let i = bullets.length - 1; i >= 0; i -= 1) {
          const sx = bullets[i].x + camera;
          if (bullets[i].life <= 0 || sx < -120 || sx > SCREEN_W + 120 || bullets[i].y < -100 || bullets[i].y > SCREEN_H + 100) bullets.splice(i, 1);
        }
        for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
          const sx = enemyBullets[i].x + camera;
          if (enemyBullets[i].life <= 0 || sx < -140 || sx > SCREEN_W + 140 || enemyBullets[i].y > SCREEN_H + 100) enemyBullets.splice(i, 1);
        }
      };

      const currentSprite = () => {
        const dir: Dir = player.dir > 0 ? "PR" : "PL";
        const horizontalInput = inputRef.current.left || inputRef.current.right;
        if (player.inWater && !player.jumping) return player.shooting ? waterShootImg : waterWalkImg;
        if (player.crouching) return sprites[`${dir}/down`];
        if (inputRef.current.up && !player.jumping && !horizontalInput) return sprites[`${dir}/up`];
        if (player.jumping) return sprites[`${dir}/jump${1 + Math.floor(player.jumpFrame) % 4}`];
        if (player.shooting) return sprites[`${dir}/shooting${1 + Math.floor(player.shootFrame) % 3}`];
        if (inputRef.current.left || inputRef.current.right) return sprites[`${dir}/player${1 + Math.floor(player.runFrame) % 5}`];
        return sprites[`${dir}/player`];
      };

      const drawProjectile = (projectile: Projectile) => {
        const x = projectile.x + camera;
        if (projectile.kind === "laser") ctx.drawImage(laserImg, x - 20, projectile.y - 4, 52, 8);
        else if (projectile.kind === "fire") {
          ctx.save();
          ctx.translate(x, projectile.y);
          ctx.rotate(projectile.phase ?? 0);
          ctx.drawImage(fireImg, -18, -18, 36, 36);
          ctx.restore();
        } else if (projectile.enemy || projectile.kind === "grenade") {
          ctx.fillStyle = projectile.kind === "grenade" ? "#ffcf4a" : "#ff4b39";
          ctx.fillRect(x - 6, projectile.y - 6, 12, 12);
        } else ctx.drawImage(bulletImg, x - 8, projectile.y - 8, 16, 16);
      };

      const draw = () => {
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
        ctx.drawImage(map, Math.round(camera), 0);
        if (bossStarted) {
          ctx.drawImage(bossStageImg, 0, 0, SCREEN_W, SCREEN_H);
          ctx.drawImage(bossImg, BOSS_SPRITE_X, BOSS_SPRITE_Y, BOSS_SPRITE_W, BOSS_SPRITE_H);
          ctx.drawImage(
            bossImg,
            BOSS_GATE_SOURCE_X, 333, 431 - BOSS_GATE_SOURCE_X, 52,
            BOSS_GATE_X, BOSS_GROUND_Y, BOSS_SPRITE_W * (431 - BOSS_GATE_SOURCE_X) / 431, SCREEN_H - BOSS_GROUND_Y,
          );
          destroyedBossGuns.forEach((gun) => {
            const x = Math.round(gun.x + camera);
            ctx.fillStyle = "#050509";
            ctx.fillRect(x, gun.y, gun.w, gun.h);
            ctx.fillStyle = "#6f7385";
            ctx.fillRect(x + 5, gun.y + 7, 7, 5);
            ctx.fillRect(x + 19, gun.y + 19, 10, 6);
          });
        }

        bridges.flatMap((bridge) => bridge.pieces).forEach((piece) => {
          if (piece.y > SCREEN_H + 60) return;
          const x = piece.x + camera;
          if (x < -150 || x > SCREEN_W + 150) return;
          const left = x - BRIDGE_PIECE_W / 2;
          ctx.fillStyle = "#f0f0e8";
          ctx.fillRect(left, piece.y, BRIDGE_PIECE_W, 12);
          ctx.fillStyle = "#70787b";
          ctx.fillRect(left, piece.y + 12, BRIDGE_PIECE_W, 5);
          ctx.fillRect(left + 7, piece.y + 26, BRIDGE_PIECE_W - 14, 5);
          ctx.fillStyle = "#d85619";
          ctx.fillRect(left + 12, piece.y + 5, BRIDGE_PIECE_W - 24, 4);
          ctx.fillStyle = "#d9dfe0";
          ctx.fillRect(left + 5, piece.y + 17, 5, 14);
          ctx.fillRect(left + BRIDGE_PIECE_W - 10, piece.y + 17, 5, 14);
        });

        pickups.forEach((pickup) => {
          if (pickup.taken) return;
          const x = pickup.x + camera;
          if (x < -60 || x > SCREEN_W + 60) return;
          const y = pickup.released ? pickup.y : pickup.y + Math.sin(pickup.phase) * 14;
          if (!pickup.released) {
            ctx.fillStyle = "#7d1111";
            ctx.fillRect(x - 31, y - 12, 62, 24);
            ctx.fillStyle = "#f4f2df";
            ctx.fillRect(x - 25, y - 15, 14, 30);
            ctx.fillRect(x + 12, y - 15, 14, 30);
            ctx.fillStyle = "#ef3c28";
            ctx.fillRect(x - 10, y - 10, 21, 20);
            ctx.fillStyle = "#161616";
            ctx.fillRect(x - 3, y - 7, 6, 14);
            return;
          }
          ctx.fillStyle = "#e9eef2";
          ctx.fillRect(x - 21, y - 20, 42, 40);
          ctx.fillStyle = "#171717";
          ctx.fillRect(x - 16, y - 15, 32, 30);
          ctx.fillStyle = weaponColor[pickup.weapon];
          ctx.font = "bold 24px monospace";
          ctx.fillText(pickup.weapon, x - 7, y + 9);
        });

        enemies.forEach((enemy) => {
          if (!enemy.active || enemy.hp <= 0) return;
          const x = Math.round(enemy.x + camera);
          if (x < -400 || x > SCREEN_W + 200) return;
          if (enemy.kind === "runner" || enemy.kind === "water" || enemy.kind === "grenadier") {
            const image = enemySprites[Math.floor(gameTime * 9 + enemy.id) % enemySprites.length] ?? enemySprites[0];
            if (!image) return;
            ctx.save();
            if (enemy.kind === "water") {
              if (enemy.surface <= 0.02) {
                ctx.restore();
                return;
              }
              ctx.beginPath();
              ctx.rect(x - 4, 0, enemy.w + 8, WATER_FLOOR + 1);
              ctx.clip();
            }
            if (enemy.dir > 0) {
              ctx.translate(x + enemy.w, enemy.y);
              ctx.scale(-1, 1);
              ctx.drawImage(image, 0, 0, enemy.w, enemy.h);
            } else ctx.drawImage(image, x, enemy.y, enemy.w, enemy.h);
            ctx.restore();
          } else if (enemy.kind === "bossGun" && bossStarted) {
            if (enemy.flash > 0) {
              ctx.fillStyle = "#fff36a";
              ctx.fillRect(x - 8, enemy.y + 12, 10, 10);
              ctx.fillStyle = "#ff4b20";
              ctx.fillRect(x - 13, enemy.y + 15, 7, 5);
            }
          } else if (enemy.kind === "mortar" && bossStarted) {
            return;
          } else if (enemy.kind === "hidden") {
            if (enemy.flash > 0) ctx.drawImage(tankShotImg, x, enemy.y, enemy.w, enemy.h);
          } else if (enemy.kind === "turret" || enemy.kind === "mortar") {
            ctx.drawImage(enemy.flash > 0 ? tankShotImg : tankImg, x, enemy.y, enemy.w, enemy.h);
          } else if (enemy.kind === "core") {
            return;
          }
        });

        bullets.forEach(drawProjectile);
        enemyBullets.forEach(drawProjectile);
        explosions.forEach((explosion) => {
          const x = explosion.x + camera;
          const pulse = 0.55 + Math.abs(Math.sin(explosion.life * 18)) * 0.45;
          ctx.fillStyle = "#fff36a";
          ctx.beginPath();
          ctx.arc(x, explosion.y, explosion.size * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ff3b20";
          ctx.beginPath();
          ctx.arc(x, explosion.y, explosion.size * 0.55 * pulse, 0, Math.PI * 2);
          ctx.fill();
        });

        if (player.dead) {
          const death = player.deathTimer > 0.55 ? death1 : death2;
          ctx.drawImage(death, player.screenX - 48, player.y - 56, 96, 50);
        } else if (isDiving()) {
          const rippleY = Math.round(player.y - 10);
          ctx.fillStyle = "#dffcff";
          ctx.fillRect(Math.round(player.screenX - 27), rippleY, 18, 4);
          ctx.fillRect(Math.round(player.screenX + 7), rippleY + 2, 20, 4);
          ctx.fillStyle = "#2b8dff";
          ctx.fillRect(Math.round(player.screenX - 17), rippleY + 6, 34, 4);
        } else if (qaMode || player.invulnerable <= 0 || Math.floor(gameTime * 12) % 2 === 0) {
          const sprite = currentSprite() ?? sprites[`${player.dir > 0 ? "PR" : "PL"}/player`];
          if (!sprite) return;
          let w = 70;
          let h = 92;
          if (player.inWater && !player.jumping) { w = player.shooting ? 64 : 78; h = player.shooting ? 46 : 48; }
          if (player.jumping) w = h = 62;
          if (player.crouching) { w = 102; h = 38; }
          if (inputRef.current.up && !player.jumping && !player.inWater && !inputRef.current.left && !inputRef.current.right) { w = 44; h = 104; }
          if (player.inWater && !player.jumping && player.dir < 0) {
            ctx.save();
            ctx.translate(Math.round(player.screenX + w / 2), 0);
            ctx.scale(-1, 1);
            ctx.drawImage(sprite, 0, Math.round(player.y - h), w, h);
            ctx.restore();
          } else ctx.drawImage(sprite, Math.round(player.screenX - w / 2), Math.round(player.y - h), w, h);
        }

        ctx.fillStyle = "rgba(0,0,0,.78)";
        ctx.fillRect(0, 0, SCREEN_W, 28);
        ctx.fillStyle = "#fff";
        ctx.font = "16px monospace";
        ctx.fillText(`1UP ${player.score.toString().padStart(6, "0")}`, 20, 19);
        ctx.fillText(`REST ${player.lives}`, 205, 19);
        ctx.fillStyle = weaponColor[player.weapon];
        ctx.fillText(`WEAPON ${player.weapon}`, 340, 19);
        ctx.fillStyle = "#fff";
        ctx.fillText(phaseFor(mapX()), 520, 19);
        if (bossStarted && !win) {
          ctx.fillStyle = "#191919";
          ctx.fillRect(SCREEN_W - 250, 8, 230, 12);
          ctx.fillStyle = "#ff3b38";
          ctx.fillRect(SCREEN_W - 246, 11, 222 * Math.max(0, bossHp / 20), 6);
        }
        if (paused || win) {
          ctx.fillStyle = "rgba(0,0,0,.72)";
          ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
          ctx.textAlign = "center";
          ctx.fillStyle = win ? "#ffe15a" : "#fff";
          ctx.font = "bold 54px monospace";
          ctx.fillText(win ? "MISSION CLEAR" : "PAUSE", SCREEN_W / 2, 330);
          ctx.font = "20px monospace";
          ctx.fillText(win ? "FORTRESS CORE DESTROYED" : "PRESS ENTER", SCREEN_W / 2, 375);
          ctx.textAlign = "start";
        }
      };

      let last = performance.now();
      const loop = (now: number) => {
        const elapsed = Math.min(0.25, (now - last) / 1000);
        last = now;
        if (qaRate > 1) {
          const steps = Math.max(1, Math.min(180, Math.ceil(elapsed * 60 * qaRate)));
          const fixedDt = elapsed * qaRate / steps;
          for (let step = 0; step < steps; step += 1) update(fixedDt);
        } else update(Math.min(0.033, elapsed));
        draw();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };

    run().catch((error) => {
      console.error(error);
      setReady(false);
    });

    const keyMap: Record<string, InputName> = {
      ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      KeyA: "left", KeyD: "right", KeyW: "up", KeyS: "down",
      KeyJ: "jump", KeyK: "fire",
    };
    const onKey = (event: KeyboardEvent, down: boolean) => {
      if (down && !event.repeat) {
        const sequence = [...cheatRef.current, event.code].slice(-CHEAT.length);
        cheatRef.current = sequence;
        if (sequence.length === CHEAT.length && sequence.every((code, index) => code === CHEAT[index])) {
          cheatActivatedRef.current = true;
          cheatQueuedRef.current = true;
          cheatRef.current = [];
          setHud((current) => ({ ...current, lives: 30, cheat: true }));
          return;
        }
      }
      if (event.code === "Enter") {
        event.preventDefault();
        if (down && !event.repeat) pauseQueuedRef.current = true;
        return;
      }
      const key = keyMap[event.code];
      if (!key) return;
      event.preventDefault();
      inputRef.current[key] = down;
      if (down && key === "jump") queuedJumpRef.current = true;
      if (down && key === "fire") queuedFireRef.current = true;
    };
    const keyDown = (event: KeyboardEvent) => onKey(event, true);
    const keyUp = (event: KeyboardEvent) => onKey(event, false);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      if (audioRef.current) {
        void audioRef.current.close();
        audioRef.current = null;
      }
    };
  }, []);

  const hold = (name: InputName, value: boolean) => {
    inputRef.current[name] = value;
    if (value && name === "jump") queuedJumpRef.current = true;
    if (value && name === "fire") queuedFireRef.current = true;
  };

  return (
    <main className="arcade-shell">
      <section className="game-stage" aria-label="FC Contra stage one">
        <div className="cabinet-top">
          <div>
            <p className="eyebrow">FC STAGE 1 · LOCAL ASSETS</p>
            <h1>魂斗罗网页版</h1>
          </div>
          <div className="status" aria-live="polite">
            <span>{ready ? (hud.paused ? "PAUSED" : "READY") : "LOADING"}</span>
            <span>{hud.phase}</span>
            <span style={{ color: weaponColor[hud.weapon] }}>W-{hud.weapon}</span>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={SCREEN_W}
          height={SCREEN_H}
          className="game-canvas local-canvas"
          tabIndex={0}
          aria-label="Contra game canvas"
          data-lives={hud.lives}
          data-weapon={hud.weapon}
          data-phase={hud.phase}
          data-paused={hud.paused}
          data-cheat={hud.cheat}
          data-win={hud.win}
          data-map-x={hud.mapX}
          data-water={hud.inWater}
          data-diving={hud.diving}
          data-bridge={hud.bridge}
          data-boss-hp={hud.bossHp}
          data-player-y={hud.playerY}
          data-bullets={hud.bullets}
          data-enemy-bullets={hud.enemyBullets}
          data-water-enemy-y={hud.waterEnemyY}
          data-enemies={hud.enemies}
          data-pose={hud.pose}
          data-falls={hud.falls}
          onPointerDown={(event) => event.currentTarget.focus()}
        />
        <div className="control-bar" aria-label="Game controls">
          <div className="pad">
            {(["up", "left", "down", "right"] as const).map((name) => (
              <button
                key={name}
                className={`pad-key ${name}`}
                aria-label={name}
                onPointerDown={() => hold(name, true)}
                onPointerUp={() => hold(name, false)}
                onPointerCancel={() => hold(name, false)}
                onPointerLeave={() => hold(name, false)}
              >
                {name === "up" ? "↑" : name === "down" ? "↓" : name === "left" ? "←" : "→"}
              </button>
            ))}
          </div>
          <div className="score-readout">
            <span>{hud.cheat ? "30 LIVES" : hud.phase}</span>
            <strong>{hud.score.toString().padStart(6, "0")}</strong>
            <span>REST {hud.lives} · WEAPON {hud.weapon}</span>
          </div>
          <div className="actions">
            <button
              aria-label="J Jump"
              onPointerDown={() => hold("jump", true)}
              onPointerUp={() => hold("jump", false)}
              onPointerCancel={() => hold("jump", false)}
              onPointerLeave={() => hold("jump", false)}
            >
              J JUMP
            </button>
            <button
              aria-label="K Fire"
              onPointerDown={() => hold("fire", true)}
              onPointerUp={() => hold("fire", false)}
              onPointerCancel={() => hold("fire", false)}
              onPointerLeave={() => hold("fire", false)}
            >
              K FIRE
            </button>
            <button className="pause-button" aria-label="Pause" onClick={() => { pauseQueuedRef.current = true; }}>
              II
            </button>
          </div>
        </div>
      </section>
      <aside className="brief-panel">
        <h2>第一关</h2>
        <p>方向键 / WASD 移动与八方向瞄准，J 跳跃，K 射击，Enter 暂停。落水后按 ↓ / S 潜水躲避攻击。</p>
        <p>武器：M 连发、R 加速、S 扇形弹、F 火球、L 穿透弹。摧毁堡垒中央核心即可通关。</p>
        <p className="secret-line">30 命：↑ ↑ ↓ ↓ ← → ← → X Z X Z Enter</p>
      </aside>
    </main>
  );
}
