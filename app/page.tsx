"use client";

import { useEffect, useRef, useState } from "react";

type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  enemy?: boolean;
};

type Enemy = {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  type: "runner" | "turret" | "drone" | "boss";
  fire: number;
  dir: number;
};

type Pickup = {
  x: number;
  y: number;
  kind: "spread" | "rapid" | "heart";
  taken?: boolean;
};

type Input = Record<
  "left" | "right" | "up" | "down" | "jump" | "fire",
  boolean
>;

const W = 960;
const H = 540;
const GROUND = 432;
const LEVEL = 3900;

const emptyInput = (): Input => ({
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  fire: false,
});

const palette = {
  sky: "#1a2f4d",
  sky2: "#2d5b60",
  ink: "#071018",
  ground: "#4f4a2d",
  groundDark: "#1a1f18",
  vine: "#1f6b3a",
  leaf: "#4a9c46",
  neon: "#8cdf5f",
  amber: "#f2c14e",
  red: "#d6423a",
  blue: "#67c8d5",
  skin: "#d8a46d",
  white: "#fff3c7",
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<Input>(emptyInput());
  const audioRef = useRef<AudioContext | null>(null);
  const [hud, setHud] = useState({
    lives: 3,
    hp: 6,
    score: 0,
    weapon: "R",
    boss: 0,
    message: "READY",
    won: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let shake = 0;
    let scroll = 0;
    let fireCd = 0;
    let invuln = 0;
    let messageTimer = 1.8;

    const player = {
      x: 84,
      y: GROUND - 48,
      w: 28,
      h: 48,
      vx: 0,
      vy: 0,
      hp: 6,
      lives: 3,
      score: 0,
      weapon: "R" as "R" | "S" | "M",
      facing: 1,
      grounded: true,
      crouch: false,
      won: false,
    };

    const bullets: Bullet[] = [];
    const sparks: Bullet[] = [];
    const pickups: Pickup[] = [
      { x: 620, y: 258, kind: "spread" },
      { x: 1390, y: 226, kind: "rapid" },
      { x: 2380, y: 272, kind: "heart" },
    ];
    const enemies: Enemy[] = [
      { x: 420, y: GROUND - 42, w: 28, h: 42, hp: 2, type: "runner", fire: 0, dir: -1 },
      { x: 620, y: GROUND - 42, w: 28, h: 42, hp: 2, type: "runner", fire: 0, dir: -1 },
      { x: 850, y: GROUND - 32, w: 42, h: 32, hp: 4, type: "turret", fire: 0.7, dir: -1 },
      { x: 1120, y: 248, w: 34, h: 24, hp: 2, type: "drone", fire: 0.6, dir: -1 },
      { x: 1450, y: GROUND - 42, w: 28, h: 42, hp: 2, type: "runner", fire: 0, dir: -1 },
      { x: 1670, y: GROUND - 42, w: 28, h: 42, hp: 2, type: "runner", fire: 0, dir: -1 },
      { x: 1880, y: 232, w: 34, h: 24, hp: 2, type: "drone", fire: 1.1, dir: -1 },
      { x: 2130, y: GROUND - 32, w: 42, h: 32, hp: 4, type: "turret", fire: 0.4, dir: -1 },
      { x: 2480, y: GROUND - 42, w: 28, h: 42, hp: 3, type: "runner", fire: 0, dir: -1 },
      { x: 2730, y: GROUND - 42, w: 28, h: 42, hp: 3, type: "runner", fire: 0, dir: -1 },
      { x: 3130, y: GROUND - 132, w: 126, h: 132, hp: 32, type: "boss", fire: 0.5, dir: -1 },
    ];

    const beep = (freq: number, dur = 0.05, type: OscillatorType = "square") => {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!audioRef.current) audioRef.current = new AudioCtor();
      const ac = audioRef.current;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.025, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + dur);
    };

    const resetPlayer = () => {
      player.x = Math.max(80, scroll + 60);
      player.y = GROUND - 48;
      player.vx = 0;
      player.vy = 0;
      player.hp = 6;
      invuln = 2;
      messageTimer = 1.2;
    };

    const damage = () => {
      if (invuln > 0 || player.won) return;
      player.hp -= 1;
      shake = 0.25;
      invuln = 1.2;
      beep(120, 0.08, "sawtooth");
      if (player.hp <= 0) {
        player.lives -= 1;
        if (player.lives < 0) {
          player.lives = 3;
          player.score = 0;
          player.x = 84;
          scroll = 0;
          enemies.forEach((e) => {
            if (e.type === "boss") e.hp = 32;
            else e.hp = Math.max(e.hp, 2);
          });
        }
        resetPlayer();
      }
    };

    const shoot = () => {
      if (fireCd > 0 || player.won) return;
      const i = inputRef.current;
      const speed = player.weapon === "M" ? 600 : 520;
      const vertical = i.up ? -1 : i.down && !player.grounded ? 1 : 0;
      const baseY = player.y + (player.crouch ? 28 : 18);
      const vx = vertical ? player.facing * 290 : player.facing * speed;
      const vy = vertical * speed;
      const shots = player.weapon === "S" ? [-0.28, 0, 0.28] : [0];
      shots.forEach((s) => {
        bullets.push({
          x: player.x + player.w / 2 + player.facing * 18,
          y: baseY,
          vx,
          vy: vy + s * speed,
          life: 1.2,
        });
      });
      fireCd = player.weapon === "M" ? 0.12 : 0.2;
      beep(player.weapon === "S" ? 520 : 680, 0.035);
    };

    const rects = (
      a: { x: number; y: number; w: number; h: number },
      b: { x: number; y: number; w: number; h: number },
    ) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

    const update = (dt: number) => {
      const i = inputRef.current;
      player.crouch = i.down && player.grounded;
      player.vx = (i.right ? 230 : 0) - (i.left ? 230 : 0);
      if (player.vx) player.facing = Math.sign(player.vx);
      if (i.jump && player.grounded && !player.crouch) {
        player.vy = -560;
        player.grounded = false;
        beep(310, 0.04, "triangle");
      }
      player.vy += 1500 * dt;
      player.x = Math.max(28, Math.min(LEVEL - 180, player.x + player.vx * dt));
      player.y += player.vy * dt;
      const height = player.crouch ? 28 : 48;
      player.h = height;
      if (player.y + height >= GROUND) {
        player.y = GROUND - height;
        player.vy = 0;
        player.grounded = true;
      }
      if (i.fire) shoot();
      fireCd -= dt;
      invuln -= dt;
      shake -= dt;
      messageTimer -= dt;

      scroll += (player.x - scroll - W * 0.42) * Math.min(1, dt * 5);
      scroll = Math.max(0, Math.min(LEVEL - W, scroll));

      bullets.forEach((b) => {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
      });

      enemies.forEach((e) => {
        if (e.hp <= 0) return;
        if (Math.abs(e.x - player.x) > 900) return;
        if (e.type === "runner") {
          e.dir = e.x > player.x ? -1 : 1;
          e.x += e.dir * 78 * dt;
        } else if (e.type === "drone") {
          e.x += Math.sin(performance.now() / 420 + e.y) * 38 * dt;
          e.y += Math.cos(performance.now() / 520 + e.x) * 22 * dt;
        } else if (e.type === "boss") {
          e.y = GROUND - e.h + Math.sin(performance.now() / 380) * 8;
        }
        e.fire -= dt;
        if (e.fire <= 0) {
          const dx = player.x - e.x;
          const dy = player.y + 20 - e.y;
          const len = Math.hypot(dx, dy) || 1;
          bullets.push({
            x: e.x + e.w / 2,
            y: e.y + e.h * 0.45,
            vx: (dx / len) * (e.type === "boss" ? 310 : 220),
            vy: (dy / len) * (e.type === "boss" ? 310 : 220),
            life: 2.4,
            enemy: true,
          });
          e.fire = e.type === "boss" ? 0.46 : e.type === "turret" ? 1.25 : 1.65;
        }
        if (rects(player, e)) damage();
      });

      bullets.forEach((b) => {
        if (b.life <= 0) return;
        if (b.enemy) {
          if (rects({ x: b.x - 3, y: b.y - 3, w: 6, h: 6 }, player)) {
            b.life = 0;
            damage();
          }
          return;
        }
        enemies.forEach((e) => {
          if (e.hp > 0 && rects({ x: b.x - 5, y: b.y - 5, w: 10, h: 10 }, e)) {
            b.life = 0;
            e.hp -= 1;
            sparks.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25 });
            if (e.hp <= 0) {
              player.score += e.type === "boss" ? 5000 : 250;
              shake = 0.16;
              beep(e.type === "boss" ? 90 : 180, 0.11, "sawtooth");
              if (e.type === "boss") {
                player.won = true;
                messageTimer = 99;
              }
            }
          }
        });
      });

      pickups.forEach((p) => {
        if (!p.taken && rects(player, { x: p.x - 14, y: p.y - 14, w: 28, h: 28 })) {
          p.taken = true;
          if (p.kind === "heart") player.hp = Math.min(6, player.hp + 2);
          else player.weapon = p.kind === "spread" ? "S" : "M";
          player.score += 500;
          beep(880, 0.08, "triangle");
        }
      });

      for (let n = bullets.length - 1; n >= 0; n -= 1) {
        const b = bullets[n];
        if (b.life <= 0 || b.x < scroll - 120 || b.x > scroll + W + 160 || b.y < -80 || b.y > H + 80) {
          bullets.splice(n, 1);
        }
      }
      for (let n = sparks.length - 1; n >= 0; n -= 1) {
        sparks[n].life -= dt;
        if (sparks[n].life <= 0) sparks.splice(n, 1);
      }

      const boss = enemies.find((e) => e.type === "boss");
      setHud({
        lives: player.lives,
        hp: player.hp,
        score: player.score,
        weapon: player.weapon,
        boss: boss ? Math.max(0, boss.hp / 32) : 0,
        message: player.won ? "MISSION CLEAR" : messageTimer > 0 ? "READY" : "",
        won: player.won,
      });
    };

    const drawPixelText = (text: string, x: number, y: number, size = 16, color = palette.white) => {
      ctx.save();
      ctx.font = `${size}px var(--font-geist-mono), monospace`;
      ctx.fillStyle = color;
      ctx.shadowColor = palette.ink;
      ctx.shadowBlur = 6;
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    const drawBlock = (x: number, y: number, w: number, h: number, color: string, shade = palette.ink) => {
      ctx.fillStyle = shade;
      ctx.fillRect(x + 3, y + 3, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };

    const drawPalm = (x: number, y: number, scale = 1) => {
      ctx.fillStyle = "#2a1d18";
      ctx.fillRect(x + 18 * scale, y + 54 * scale, 14 * scale, 128 * scale);
      ctx.fillStyle = "#573720";
      for (let n = 0; n < 7; n += 1) {
        ctx.fillRect(x + (18 + (n % 2) * 8) * scale, y + (58 + n * 16) * scale, 14 * scale, 6 * scale);
      }
      ctx.fillStyle = palette.vine;
      ctx.fillRect(x - 20 * scale, y + 28 * scale, 92 * scale, 18 * scale);
      ctx.fillRect(x + 8 * scale, y, 28 * scale, 78 * scale);
      ctx.fillStyle = palette.leaf;
      ctx.fillRect(x - 42 * scale, y + 42 * scale, 78 * scale, 15 * scale);
      ctx.fillRect(x + 18 * scale, y + 34 * scale, 88 * scale, 16 * scale);
      ctx.fillRect(x - 12 * scale, y + 14 * scale, 74 * scale, 14 * scale);
    };

    const drawBackground = () => {
      ctx.fillStyle = palette.sky;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = palette.sky2;
      ctx.fillRect(0, 262, W, 170);
      for (let x = -120; x < W + 180; x += 112) {
        const sx = x - (scroll * 0.22) % 112;
        drawBlock(sx, 230, 72, 18, "#244c49", "#142a30");
        drawBlock(sx + 42, 202, 44, 28, "#244c49", "#142a30");
      }
      [0.32, 0.56, 0.84].forEach((rate, layer) => {
        const base = 384 - layer * 48;
        ctx.fillStyle = layer === 0 ? "#16251e" : layer === 1 ? "#1e3a29" : "#244d2d";
        for (let x = -160; x < W + 260; x += 150) {
          const sx = x - (scroll * rate) % 150;
          ctx.beginPath();
          ctx.moveTo(sx, base);
          ctx.lineTo(sx + 74, base - 106 + layer * 16);
          ctx.lineTo(sx + 156, base);
          ctx.closePath();
          ctx.fill();
        }
      });
      for (let x = -100; x < W + 180; x += 130) {
        drawPalm(x - (scroll * 0.72) % 130, 228 + (x % 2) * 12, 1);
      }
      for (let x = -70; x < W + 100; x += 48) {
        const sx = x - (scroll % 48);
        drawBlock(sx, GROUND - 8, 46, 16, "#795b2f", "#2a1d18");
        ctx.fillStyle = x % 96 === 0 ? "#9a713c" : palette.ground;
        ctx.fillRect(sx + 4, GROUND + 14, 40, 28);
        ctx.fillStyle = palette.groundDark;
        ctx.fillRect(sx + 8, GROUND + 44, 32, 16);
      }
      ctx.fillStyle = "#22321f";
      ctx.fillRect(0, GROUND + 60, W, H - GROUND - 60);
      for (let x = 1220; x < 1600; x += 34) {
        const sx = x - scroll;
        ctx.fillStyle = "#6b4123";
        ctx.fillRect(sx, GROUND - 12, 24, 18);
        ctx.fillStyle = "#2f1c12";
        ctx.fillRect(sx + 8, GROUND + 6, 8, 54);
      }
      for (let x = 2760; x < 3820; x += 64) {
        const sx = x - scroll;
        drawBlock(sx, 280, 58, 152, "#314049", "#111820");
        ctx.fillStyle = "#6b7780";
        ctx.fillRect(sx + 8, 294, 16, 16);
        ctx.fillRect(sx + 34, 330, 16, 16);
      }
      for (let y = 0; y < H; y += 4) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
        ctx.fillRect(0, y, W, 1);
      }
    };

    const drawPlayer = () => {
      const px = player.x - scroll;
      const py = player.y;
      const flicker = invuln > 0 && Math.floor(performance.now() / 80) % 2 === 0;
      if (flicker) return;
      ctx.save();
      ctx.translate(px + player.w / 2, py);
      ctx.scale(player.facing, 1);
      ctx.fillStyle = "#10141a";
      ctx.fillRect(-15, player.h - 5, 30, 5);
      ctx.fillStyle = palette.skin;
      ctx.fillRect(-8, -4, 16, 12);
      ctx.fillStyle = "#3d221b";
      ctx.fillRect(-10, -8, 20, 7);
      ctx.fillStyle = palette.red;
      ctx.fillRect(-11, 0, 22, 4);
      ctx.fillStyle = "#24463a";
      ctx.fillRect(-13, 8, 26, player.crouch ? 15 : 24);
      ctx.fillStyle = palette.neon;
      ctx.fillRect(-9, 10, 18, player.crouch ? 10 : 16);
      ctx.fillStyle = "#1c2c24";
      ctx.fillRect(-15, player.h - 18, 9, 18);
      ctx.fillRect(5, player.h - 18, 9, 18);
      ctx.fillStyle = palette.amber;
      ctx.fillRect(11, player.crouch ? 17 : 20, 12, 5);
      ctx.fillStyle = "#cfdab0";
      ctx.fillRect(22, player.crouch ? 18 : 21, 28, 4);
      ctx.fillStyle = palette.red;
      ctx.fillRect(48, player.crouch ? 17 : 20, 8, 6);
      ctx.restore();
    };

    const drawEnemy = (e: Enemy) => {
      if (e.hp <= 0) return;
      const x = e.x - scroll;
      if (x < -160 || x > W + 160) return;
      ctx.save();
      ctx.translate(x, e.y);
      if (e.type === "runner") {
        ctx.scale(e.dir < 0 ? 1 : -1, 1);
        ctx.fillStyle = "#10141a";
        ctx.fillRect(1, 38, 28, 4);
        ctx.fillStyle = "#5d2d24";
        ctx.fillRect(4, 11, 22, 23);
        ctx.fillStyle = palette.skin;
        ctx.fillRect(8, 0, 14, 11);
        ctx.fillStyle = "#273023";
        ctx.fillRect(6, 6, 18, 5);
        ctx.fillStyle = palette.amber;
        ctx.fillRect(-18, 19, 25, 5);
        ctx.fillStyle = "#171a17";
        ctx.fillRect(5, 33, 7, 9);
        ctx.fillRect(18, 33, 7, 9);
      } else if (e.type === "turret") {
        drawBlock(0, 8, 42, 24, "#354045", "#0c1115");
        ctx.fillStyle = "#111820";
        ctx.fillRect(6, 0, 30, 12);
        ctx.fillStyle = palette.red;
        ctx.fillRect(-26, 16, 28, 6);
        ctx.fillStyle = palette.amber;
        ctx.fillRect(13, 15, 16, 8);
      } else if (e.type === "drone") {
        ctx.fillStyle = "#111820";
        ctx.fillRect(0, 7, 34, 14);
        ctx.fillStyle = "#67502a";
        ctx.fillRect(5, 4, 24, 18);
        ctx.fillStyle = palette.blue;
        ctx.fillRect(10, 10, 14, 5);
        ctx.fillStyle = palette.white;
        ctx.fillRect(-14, 2, 14, 4);
        ctx.fillRect(34, 2, 14, 4);
      } else {
        drawBlock(0, 0, 126, 132, "#30383d", "#0b1118");
        ctx.fillStyle = "#17212a";
        ctx.fillRect(14, 14, 98, 104);
        ctx.fillStyle = "#52606a";
        for (let yy = 18; yy < 112; yy += 24) {
          ctx.fillRect(20, yy, 86, 8);
        }
        ctx.fillStyle = palette.red;
        ctx.fillRect(-30, 48, 46, 12);
        ctx.fillRect(110, 48, 46, 12);
        ctx.fillStyle = palette.amber;
        ctx.fillRect(39, 38, 48, 34);
        ctx.fillStyle = palette.ink;
        ctx.fillRect(50, 48, 8, 8);
        ctx.fillRect(68, 48, 8, 8);
        ctx.fillStyle = "#f27a3d";
        ctx.fillRect(56, 62, 24, 8);
      }
      ctx.restore();
    };

    const draw = () => {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      const bump = shake > 0 ? Math.sin(performance.now() / 18) * 5 : 0;
      ctx.clearRect(0, 0, W, H);
      ctx.translate(bump, 0);
      drawBackground();
      pickups.forEach((p) => {
        if (p.taken) return;
        const x = p.x - scroll;
        drawBlock(x - 16, p.y - 16, 32, 26, "#2d3b38", palette.ink);
        ctx.fillStyle = p.kind === "heart" ? palette.red : p.kind === "rapid" ? palette.blue : palette.amber;
        ctx.fillRect(x - 11, p.y - 11, 22, 16);
        drawPixelText(p.kind === "heart" ? "+" : p.kind === "rapid" ? "M" : "S", x - 7, p.y + 4, 16, palette.ink);
      });
      enemies.forEach(drawEnemy);
      drawPlayer();
      bullets.forEach((b) => {
        ctx.fillStyle = b.enemy ? palette.red : palette.amber;
        ctx.fillRect(b.x - scroll - 5, b.y - 2, 10, 4);
      });
      sparks.forEach((s) => {
        ctx.fillStyle = palette.white;
        ctx.fillRect(s.x - scroll - 8, s.y - 8, 16, 16);
      });
      drawPixelText(`SCORE ${player.score.toString().padStart(6, "0")}`, 24, 34, 18);
      drawPixelText(`LIVES ${player.lives}`, 24, 58, 18, palette.amber);
      drawPixelText(`WEAPON ${player.weapon}`, 166, 58, 18, palette.blue);
      ctx.fillStyle = "#1b2231";
      ctx.fillRect(754, 24, 156, 16);
      ctx.fillStyle = palette.neon;
      ctx.fillRect(758, 28, player.hp * 24, 8);
      const boss = enemies.find((e) => e.type === "boss");
      if (boss && boss.hp > 0 && player.x > 2500) {
        ctx.fillStyle = "#1b1118";
        ctx.fillRect(288, 496, 384, 16);
        ctx.fillStyle = palette.red;
        ctx.fillRect(292, 500, Math.max(0, (boss.hp / 32) * 376), 8);
        drawPixelText("CORE", 230, 512, 16, palette.red);
      }
      if (messageTimer > 0 || player.won) {
        drawPixelText(player.won ? "MISSION CLEAR" : "READY", W / 2 - 86, 210, 28, palette.amber);
      }
      ctx.restore();
    };

    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const keyMap: Record<string, keyof Input> = {
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
      ArrowUp: "up",
      KeyW: "up",
      ArrowDown: "down",
      KeyS: "down",
      Space: "jump",
      KeyJ: "jump",
      KeyK: "fire",
      KeyL: "fire",
    };
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const key = keyMap[e.code];
      if (!key) return;
      e.preventDefault();
      inputRef.current[key] = down;
      if (down && audioRef.current?.state === "suspended") audioRef.current.resume();
    };
    const down = (e: KeyboardEvent) => onKey(e, true);
    const up = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const hold = (name: keyof Input, on: boolean) => {
    inputRef.current[name] = on;
    if (on && audioRef.current?.state === "suspended") audioRef.current.resume();
  };

  return (
    <main className="arcade-shell">
      <section className="game-stage" aria-label="Iron Jungle Assault arcade game">
        <div className="cabinet-top">
          <div>
            <p className="eyebrow">8-BIT RUN AND GUN</p>
            <h1>Iron Jungle Assault</h1>
          </div>
          <div className="status">
            <span>HP {hud.hp}</span>
            <span>1UP {hud.lives}</span>
            <span>{hud.weapon}</span>
          </div>
        </div>
        <canvas ref={canvasRef} width={W} height={H} className="game-canvas" />
        <div className="control-bar" aria-label="Game controls">
          <div className="pad">
            {(["up", "left", "down", "right"] as const).map((name) => (
              <button
                key={name}
                className={`pad-key ${name}`}
                aria-label={name}
                onPointerDown={() => hold(name, true)}
                onPointerUp={() => hold(name, false)}
                onPointerLeave={() => hold(name, false)}
              >
                {name === "up" ? "^" : name === "down" ? "v" : name === "left" ? "<" : ">"}
              </button>
            ))}
          </div>
          <div className="score-readout">
            <span>{hud.message || (hud.won ? "CLEAR" : "RUN")}</span>
            <strong>{hud.score.toString().padStart(6, "0")}</strong>
          </div>
          <div className="actions">
            <button
              aria-label="Jump"
              onPointerDown={() => hold("jump", true)}
              onPointerUp={() => hold("jump", false)}
              onPointerLeave={() => hold("jump", false)}
            >
              JUMP
            </button>
            <button
              aria-label="Fire"
              onPointerDown={() => hold("fire", true)}
              onPointerUp={() => hold("fire", false)}
              onPointerLeave={() => hold("fire", false)}
            >
              FIRE
            </button>
          </div>
        </div>
      </section>
      <aside className="brief-panel">
        <h2>操作</h2>
        <p>键盘：A/D 或方向键移动，W/↑ 瞄准上方，S/↓ 蹲下，Space/J 跳跃，K/L 射击。</p>
        <p>移动端：使用下方虚拟方向键与射击键。拾取 S 是散弹，M 是高速连射，+ 恢复生命。画面素材是原创 8-bit 风格，参考经典横版跑枪的节奏与色彩。</p>
      </aside>
    </main>
  );
}
