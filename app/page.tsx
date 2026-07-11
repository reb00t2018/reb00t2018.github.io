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
  sky: "#162036",
  sky2: "#243654",
  ink: "#08111e",
  ground: "#2f3c2b",
  groundDark: "#161e17",
  neon: "#79f29f",
  amber: "#ffd166",
  red: "#ff4d5d",
  blue: "#5bd2ff",
  white: "#f8ffe8",
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
      { x: 680, y: 270, kind: "spread" },
      { x: 1460, y: 220, kind: "rapid" },
      { x: 2320, y: 260, kind: "heart" },
    ];
    const enemies: Enemy[] = [
      { x: 520, y: GROUND - 40, w: 30, h: 40, hp: 2, type: "runner", fire: 0, dir: -1 },
      { x: 860, y: GROUND - 34, w: 36, h: 34, hp: 3, type: "turret", fire: 0.8, dir: -1 },
      { x: 1180, y: 250, w: 34, h: 26, hp: 2, type: "drone", fire: 0.6, dir: -1 },
      { x: 1500, y: GROUND - 40, w: 30, h: 40, hp: 2, type: "runner", fire: 0, dir: -1 },
      { x: 1850, y: 250, w: 34, h: 26, hp: 2, type: "drone", fire: 1.1, dir: -1 },
      { x: 2140, y: GROUND - 34, w: 36, h: 34, hp: 4, type: "turret", fire: 0.4, dir: -1 },
      { x: 2660, y: GROUND - 40, w: 30, h: 40, hp: 3, type: "runner", fire: 0, dir: -1 },
      { x: 3100, y: GROUND - 124, w: 118, h: 124, hp: 28, type: "boss", fire: 0.5, dir: -1 },
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
            if (e.type === "boss") e.hp = 28;
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
        boss: boss ? Math.max(0, boss.hp / 28) : 0,
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

    const drawBackground = () => {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, palette.sky);
      grad.addColorStop(0.55, palette.sky2);
      grad.addColorStop(1, "#0d1817");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      [0.18, 0.35, 0.62].forEach((rate, layer) => {
        ctx.fillStyle = layer === 0 ? "#0e1827" : layer === 1 ? "#17283a" : "#20372f";
        for (let x = -160; x < W + 260; x += 170) {
          const sx = x - (scroll * rate) % 170;
          ctx.beginPath();
          ctx.moveTo(sx, 380 - layer * 56);
          ctx.lineTo(sx + 86, 250 - layer * 42);
          ctx.lineTo(sx + 178, 380 - layer * 56);
          ctx.closePath();
          ctx.fill();
        }
      });
      for (let x = -80; x < W + 120; x += 96) {
        const sx = x - (scroll * 0.8) % 96;
        ctx.fillStyle = "#15251f";
        ctx.fillRect(sx + 28, 260, 16, 174);
        ctx.fillRect(sx + 6, 304, 62, 12);
        ctx.fillRect(sx + 16, 346, 48, 10);
      }
      ctx.fillStyle = palette.ground;
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = palette.groundDark;
      for (let x = -40; x < W + 60; x += 44) {
        const sx = x - (scroll % 44);
        ctx.fillRect(sx, GROUND, 36, 14);
        ctx.fillRect(sx + 10, GROUND + 42, 24, 10);
      }
      ctx.fillStyle = "#506241";
      ctx.fillRect(0, GROUND - 10, W, 10);
    };

    const drawPlayer = () => {
      const px = player.x - scroll;
      const py = player.y;
      const flicker = invuln > 0 && Math.floor(performance.now() / 80) % 2 === 0;
      if (flicker) return;
      ctx.save();
      ctx.translate(px + player.w / 2, py);
      ctx.scale(player.facing, 1);
      ctx.fillStyle = "#1b201e";
      ctx.fillRect(-12, player.h - 8, 24, 8);
      ctx.fillStyle = palette.neon;
      ctx.fillRect(-11, 6, 22, player.crouch ? 18 : 26);
      ctx.fillStyle = "#d5c38b";
      ctx.fillRect(-8, -4, 16, 12);
      ctx.fillStyle = palette.red;
      ctx.fillRect(-10, 2, 20, 5);
      ctx.fillStyle = palette.blue;
      ctx.fillRect(10, player.crouch ? 16 : 20, 30, 6);
      ctx.fillStyle = "#d6f4ff";
      ctx.fillRect(36, player.crouch ? 18 : 22, 8, 4);
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(-13, player.h - 18, 9, 18);
      ctx.fillRect(5, player.h - 18, 9, 18);
      ctx.restore();
    };

    const drawEnemy = (e: Enemy) => {
      if (e.hp <= 0) return;
      const x = e.x - scroll;
      if (x < -160 || x > W + 160) return;
      ctx.save();
      ctx.translate(x, e.y);
      if (e.type === "runner") {
        ctx.fillStyle = "#55282d";
        ctx.fillRect(4, 8, 22, 26);
        ctx.fillStyle = "#e6a077";
        ctx.fillRect(8, 0, 14, 10);
        ctx.fillStyle = palette.amber;
        ctx.fillRect(e.dir < 0 ? -16 : 24, 18, 18, 5);
        ctx.fillStyle = "#111";
        ctx.fillRect(5, 33, 7, 8);
        ctx.fillRect(18, 33, 7, 8);
      } else if (e.type === "turret") {
        ctx.fillStyle = "#514232";
        ctx.fillRect(0, 10, 36, 24);
        ctx.fillStyle = palette.red;
        ctx.fillRect(-18, 16, 22, 6);
        ctx.fillStyle = "#161a1f";
        ctx.fillRect(4, 0, 28, 14);
      } else if (e.type === "drone") {
        ctx.fillStyle = "#271f38";
        ctx.fillRect(0, 6, 34, 14);
        ctx.fillStyle = palette.blue;
        ctx.fillRect(8, 10, 18, 5);
        ctx.fillStyle = "#9bf6ff";
        ctx.fillRect(-10, 0, 12, 5);
        ctx.fillRect(32, 0, 12, 5);
      } else {
        ctx.fillStyle = "#30203c";
        ctx.fillRect(0, 0, 118, 124);
        ctx.fillStyle = "#4f2d58";
        ctx.fillRect(12, 18, 92, 82);
        ctx.fillStyle = palette.red;
        ctx.fillRect(-26, 42, 40, 13);
        ctx.fillRect(100, 42, 40, 13);
        ctx.fillStyle = palette.amber;
        ctx.fillRect(38, 34, 42, 28);
        ctx.fillStyle = palette.ink;
        ctx.fillRect(48, 43, 8, 8);
        ctx.fillRect(65, 43, 8, 8);
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
        ctx.fillStyle = p.kind === "heart" ? palette.red : p.kind === "rapid" ? palette.blue : palette.amber;
        ctx.fillRect(x - 14, p.y - 14, 28, 28);
        ctx.fillStyle = palette.ink;
        drawPixelText(p.kind === "heart" ? "+" : p.kind === "rapid" ? "M" : "S", x - 7, p.y + 6, 18, palette.ink);
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
        ctx.fillRect(292, 500, Math.max(0, (boss.hp / 28) * 376), 8);
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
            <p className="eyebrow">ORIGINAL WEB ARCADE</p>
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
        <p>移动端：使用下方虚拟方向键与射击键。拾取 S 是散弹，M 是高速连射，+ 恢复生命。</p>
      </aside>
    </main>
  );
}
