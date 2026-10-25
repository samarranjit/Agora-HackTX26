import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

// Example layout only.
// Three.js should supply the real world's bounds and positions.
export const PROTOTYPE_MAP = {
  bounds: {
    minX: 0,
    maxX: 100,
    minZ: 0,
    maxZ: 100,
  },

  path: [
    { x: 12, z: 95 },
    { x: 30, z: 80 },
    { x: 65, z: 70 },
    { x: 75, z: 55 },
    { x: 45, z: 40 },
    { x: 30, z: 25 },
    { x: 60, z: 12 },
    { x: 84, z: 12 },
  ],

  checkpoints: [
    {
      id: 'goblin-1',
      x: 65,
      z: 70,
      villain: 'Goblin',
      completed: false,
    },
    {
      id: 'wolf-1',
      x: 30,
      z: 25,
      villain: 'Wolf',
      completed: false,
    },
  ],

  castle: {
    x: 84,
    z: 12,
    unlocked: false,
    entered: false,
  },

  dragonDefeated: false,
};

const START_POSITION = PROTOTYPE_MAP.path[0];

class MinimapScene extends Phaser.Scene {
  constructor() {
    super('MinimapScene');
  }

  preload() {
    [
      'prince',
      'goblin',
      'wolf',
      'princess',
      'dragon',
      'castle',
    ].forEach((key) => {
      this.load.image(key, `/assets/${key}.png`);
    });
  }

  create() {
    this.playerPlaced = false;
    this.lastTarget = null;
    this.movementTween = null;
    this.swayTween = null;
    this.rescueTimer = null;
    this.rescueStarted = false;

    this.mapLayer = this.add.container(0, 0);
    this.effectsLayer = this.add.container(0, 0).setDepth(50);

    this.prince = this.add.image(0, 0, 'prince')
      .setOrigin(0.5, 1)
      .setDepth(10);

    this.statusText = this.add.text(450, 478, '', {
      fontFamily: 'Georgia',
      fontSize: '20px',
      color: '#fff2ce',
      align: 'center',
      wordWrap: { width: 820 },
    }).setOrigin(0.5).setDepth(20);

    const refreshMap = () => this.drawMap();
    const refreshPlayer = () => this.positionPlayer();

    this.registry.events.on('changedata-mapState', refreshMap);
    this.registry.events.on('changedata-expanded', refreshMap);
    this.registry.events.on(
      'changedata-playerPosition',
      refreshPlayer
    );

    this.events.once('shutdown', () => {
      this.movementTween?.stop();
      this.swayTween?.stop();
      this.rescueTimer?.remove();

      this.registry.events.off(
        'changedata-mapState',
        refreshMap
      );
      this.registry.events.off(
        'changedata-expanded',
        refreshMap
      );
      this.registry.events.off(
        'changedata-playerPosition',
        refreshPlayer
      );
    });

    this.drawMap();
  }

  toMap(position) {
    const { bounds } = this.registry.get('mapState');

    const width = bounds.maxX - bounds.minX || 1;
    const depth = bounds.maxZ - bounds.minZ || 1;

    return {
      x: 60 + Phaser.Math.Clamp(
        (position.x - bounds.minX) / width,
        0,
        1
      ) * 780,

      y: 180 + Phaser.Math.Clamp(
        (position.z - bounds.minZ) / depth,
        0,
        1
      ) * 240,
    };
  }

  addLabel(x, y, text, color = '#fff2ce', size = 20) {
    const label = this.add.text(x, y, text, {
      fontFamily: 'Georgia',
      fontSize: `${size}px`,
      color,
      stroke: '#17232d',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5);

    this.mapLayer.add(label);
    return label;
  }

  addCharacter(key, x, y, height) {
    const image = this.add.image(x, y, key)
      .setOrigin(0.5, 1);

    image.setScale(height / image.height);
    this.mapLayer.add(image);

    return image;
  }

  drawWalkway(graphics, points) {
    if (points.length < 2) return;

    const route = new Phaser.Curves.Path(
      points[0].x,
      points[0].y
    );

    points.slice(1).forEach((point) => {
      route.lineTo(point.x, point.y);
    });

    graphics.lineStyle(34, 0x759b86, 0.08);
    graphics.strokePoints(points, false);

    graphics.lineStyle(24, 0x243e38, 0.85);
    graphics.strokePoints(points, false);

    points.forEach((point) => {
      graphics.fillStyle(0x243e38, 0.85);
      graphics.fillCircle(point.x, point.y, 12);
    });

    if (route.getLength() < 1) return;

    const count = Math.max(
      2,
      Math.ceil(route.getLength() / 12)
    );

    const colors = [
      0xc9bfdc,
      0xe0d9e8,
      0xb4c8ce,
      0xd4c9dd,
      0xc3d2c4,
    ];

    for (let i = 0; i <= count; i++) {
      for (let row = -1; row <= 1; row++) {
        const t = Math.min(
          1,
          (i + (row === 0 ? 0 : 0.45)) / count
        );

        const center = route.getPoint(t);
        const before = route.getPoint(Math.max(0, t - 0.002));
        const after = route.getPoint(Math.min(1, t + 0.002));

        const angle = Math.atan2(
          after.y - before.y,
          after.x - before.x
        );

        const fx = Math.cos(angle);
        const fy = Math.sin(angle);
        const nx = -fy;
        const ny = fx;

        const x = center.x + nx * row * 8;
        const y = center.y + ny * row * 8;

        const outline = [
          [-3.2, -3.3],
          [3.2, -3.3],
          [4.7, -2],
          [4.7, 2],
          [3.2, 3.3],
          [-3.2, 3.3],
          [-4.7, 2],
          [-4.7, -2],
        ];

        const stone = outline.map(([along, across]) => ({
          x: x + fx * along + nx * across,
          y: y + fy * along + ny * across,
        }));

        graphics.fillStyle(
          colors[(i * 3 + row + 1) % colors.length],
          0.95
        );
        graphics.fillPoints(stone, true);

        graphics.lineStyle(0.7, 0xfff5df, 0.45);
        graphics.lineBetween(
          stone[0].x,
          stone[0].y,
          stone[1].x,
          stone[1].y
        );
      }
    }
  }

  sparkleBurst(x, y, pink = false) {
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const distance = 30 + (i % 5) * 15;

      const sparkle = this.add.star(
        x,
        y,
        4,
        1.5,
        4,
        pink ? 0xff8fc7 : 0xffdf97
      );

      this.effectsLayer.add(sparkle);

      this.tweens.add({
        targets: sparkle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        angle: 160,
        duration: 1100,
        ease: 'Cubic.easeOut',
        onComplete: () => sparkle.destroy(),
      });
    }
  }

  drawMap() {
    this.tweens.killTweensOf(this.mapLayer.list);
    this.mapLayer.removeAll(true);

    const state = this.registry.get('mapState');
    const expanded = this.registry.get('expanded');

    // Allow a new game to reset the rescue sequence.
    if (!state.dragonDefeated) {
      this.rescueTimer?.remove();
      this.rescueTimer = null;

      if (this.rescueStarted) {
        this.movementTween?.stop();
        this.swayTween?.stop();
        this.prince.setAngle(0);
        this.lastTarget = null;

        this.tweens.killTweensOf(this.effectsLayer.list);
        this.effectsLayer.removeAll(true);
      }

      this.rescueStarted = false;
    }

    this.prince.setScale(
      (expanded ? 70 : 60) / this.prince.height
    );

    const graphics = this.add.graphics();
    this.mapLayer.add(graphics);

    this.drawWalkway(
      graphics,
      state.path.map((point) => this.toMap(point))
    );

    const nextIndex = state.checkpoints.findIndex(
      (checkpoint) => !checkpoint.completed
    );

    state.checkpoints.forEach((checkpoint, index) => {
      const spot = this.toMap(checkpoint);

      graphics.fillStyle(
        checkpoint.completed ? 0x8be0af : 0xffdc91,
        1
      );
      graphics.fillCircle(spot.x, spot.y, 16);

      this.addLabel(
        spot.x,
        spot.y,
        checkpoint.completed ? '✓' : `${index + 1}`,
        '#382c4b',
        20
      );

      const height = expanded ? 80 : 65;
      const markerX = spot.x - 75;
      const markerY = spot.y - 20;

      const requestedKey = (
        checkpoint.texture ??
        checkpoint.villain ??
        'goblin'
      ).toLowerCase();

      const key = this.textures.exists(requestedKey)
        ? requestedKey
        : 'goblin';

      const villain = this.addCharacter(
        key,
        markerX,
        markerY,
        height
      );

      villain.setAlpha(checkpoint.completed ? 0.45 : 1);

      if (expanded) {
        this.addLabel(
          markerX,
          markerY + 15,
          checkpoint.villain,
          '#fff2ce',
          18
        );
      }

      if (!checkpoint.completed && index === nextIndex) {
        const questionMark = this.addLabel(
          markerX,
          markerY - height - 18,
          '?',
          '#ffdc91',
          28
        );

        this.tweens.add({
          targets: questionMark,
          y: questionMark.y - 5,
          duration: 900,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
        });
      }
    });

    const entrance = this.toMap(state.castle);

    this.addCharacter(
      'castle',
      entrance.x,
      entrance.y + 8,
      200
    );

    graphics.lineStyle(2, 0xffdc91, 0.8);
    graphics.strokeEllipse(
      entrance.x,
      entrance.y + 4,
      32,
      12
    );

    if (!state.dragonDefeated) {
      const dragonX = entrance.x + 20;
      const dragonY = entrance.y + 145;

      const dragon = this.addCharacter(
        'dragon',
        dragonX,
        dragonY,
        expanded ? 115 : 85
      );

      const baseScale = dragon.scaleX;

      this.tweens.add({
        targets: dragon,
        scaleX: baseScale * 1.025,
        scaleY: baseScale * 1.025,
        duration: 1400,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });

      if (expanded) {
        this.addLabel(
          dragonX,
          dragonY + 17,
          'FINAL BOSS',
          '#ffb19e',
          17
        );
      }
    }

    const princessX = entrance.x + 100;
    const princessY = entrance.y + 45;

    this.princess = this.addCharacter(
      'princess',
      princessX,
      princessY,
      42
    );

    if (!state.dragonDefeated) {
      const cage = this.add.graphics();
      this.mapLayer.add(cage);

      const left = princessX - 18;
      const top = princessY - 50;

      cage.lineStyle(1.5, 0xffdf97, 0.9);
      cage.strokeRoundedRect(left, top, 36, 56, 7);

      for (let offset = 9; offset < 36; offset += 9) {
        cage.lineBetween(
          left + offset,
          top + 4,
          left + offset,
          top + 52
        );
      }
    }

    [
      [-65, -115],
      [45, -155],
      [78, -65],
    ].forEach(([dx, dy], index) => {
      const star = this.add.star(
        entrance.x + dx,
        entrance.y + dy,
        4,
        1.5,
        4,
        0xffdf97
      );

      this.mapLayer.add(star);

      this.tweens.add({
        targets: star,
        alpha: 0.2,
        duration: 850 + index * 200,
        yoyo: true,
        repeat: -1,
      });
    });

    const completed = state.checkpoints.filter(
      (checkpoint) => checkpoint.completed
    ).length;

    let status =
      `${completed}/${state.checkpoints.length} challenges complete`;

    if (state.castle.unlocked) {
      status = 'Castle unlocked — the dragon still awaits';
    }

    if (state.castle.entered) {
      status = 'Final challenge: defeat the dragon';
    }

    if (state.dragonDefeated) {
      status = 'Princess rescued!';
    }

    this.statusText.setText(status);
    this.positionPlayer();

    if (
      state.dragonDefeated &&
      !this.rescueStarted &&
      !this.rescueTimer
    ) {
      // Finish any current route movement before the reunion.
      this.rescueTimer = this.time.addEvent({
        delay: 150,
        loop: true,

        callback: () => {
          if (this.movementTween?.isPlaying()) return;

          this.rescueTimer.remove();
          this.rescueTimer = null;
          this.playRescueCelebration();
        },
      });
    }
  }

  playRescueCelebration() {
    if (this.rescueStarted || !this.princess) return;

    this.rescueStarted = true;
    this.swayTween?.stop();
    this.prince.setAngle(0);

    // Visual celebration only: does not move the 3D player.
    const princessX = this.princess.x;
    const princessY = this.princess.y;

    this.movementTween = this.tweens.add({
      targets: this.prince,
      x: princessX - 28,
      y: princessY,
      duration: 1600,
      ease: 'Sine.easeInOut',

      onComplete: () => {
        const centerX = princessX - 14;
        const centerY = princessY - 55;

        const heart = this.add.text(
          centerX,
          centerY,
          '♥',
          {
            fontFamily: 'Arial',
            fontSize: '48px',
            color: '#ff8fc7',
            stroke: '#fff0f8',
            strokeThickness: 2,
          }
        ).setOrigin(0.5).setScale(0);

        this.effectsLayer.add(heart);

        this.tweens.add({
          targets: heart,
          scale: 2.4,
          duration: 700,
          ease: 'Back.easeOut',

          onComplete: () => {
            this.tweens.add({
              targets: heart,
              scale: 12,
              alpha: 0,
              duration: 650,
              ease: 'Cubic.easeIn',
              onComplete: () => heart.destroy(),
            });

            for (let i = 0; i < 40; i++) {
              const angle = (i / 40) * Math.PI * 2;
              const distance = 70 + (i % 7) * 32;

              const sparkle = this.add.star(
                centerX,
                centerY,
                4,
                2,
                5,
                i % 3 === 0 ? 0xffdf97 : 0xff8fc7
              );

              this.effectsLayer.add(sparkle);

              this.tweens.add({
                targets: sparkle,
                x: centerX + Math.cos(angle) * distance,
                y: centerY + Math.sin(angle) * distance,
                alpha: 0,
                angle: 220,
                duration: 1300,
                ease: 'Cubic.easeOut',
                onComplete: () => sparkle.destroy(),
              });
            }
          },
        });
      },
    });
  }

  projectOntoPath(point, points) {
    let total = 0;
    let best = { distance: Infinity, along: 0 };

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const squaredLength = dx * dx + dy * dy;

      if (squaredLength === 0) continue;

      const length = Math.sqrt(squaredLength);

      const t = Phaser.Math.Clamp(
        ((point.x - a.x) * dx + (point.y - a.y) * dy) /
          squaredLength,
        0,
        1
      );

      const distance = Phaser.Math.Distance.Between(
        point.x,
        point.y,
        a.x + dx * t,
        a.y + dy * t
      );

      if (distance < best.distance) {
        best = {
          distance,
          along: total + length * t,
        };
      }

      total += length;
    }

    return best.along;
  }

  positionPlayer() {
    // After victory, the reunion controls the map character.
    if (this.rescueStarted) return;

    const position = this.registry.get('playerPosition');
    const destination = this.toMap(position);

    const targetKey = [
      position.x,
      position.z,
      position.targetId ?? '',
      !!position.live,
      !!position.teleport,
    ].join(':');

    if (targetKey === this.lastTarget) return;

    this.lastTarget = targetKey;
    this.movementTween?.stop();
    this.swayTween?.stop();
    this.prince.setAngle(0);

    // Actual Three.js movement should use live: true.
    if (!this.playerPlaced || position.teleport || position.live) {
      this.prince.setPosition(destination.x, destination.y);
      this.playerPlaced = true;
      return;
    }

    const finish = () => {
      this.swayTween?.stop();
      this.prince.setAngle(0);
      this.prince.setPosition(destination.x, destination.y);
      this.sparkleBurst(destination.x, destination.y - 10);
    };

    const start = {
      x: this.prince.x,
      y: this.prince.y,
    };

    const state = this.registry.get('mapState');
    const points = state.path.map((point) => this.toMap(point));

    if (points.length < 2) {
      finish();
      return;
    }

    const startAlong = this.projectOntoPath(start, points);
    const endAlong = this.projectOntoPath(destination, points);

    const vertices = [];
    let along = 0;

    points.forEach((point, index) => {
      if (index > 0) {
        along += Phaser.Math.Distance.Between(
          points[index - 1].x,
          points[index - 1].y,
          point.x,
          point.y
        );
      }

      if (
        along > Math.min(startAlong, endAlong) &&
        along < Math.max(startAlong, endAlong)
      ) {
        vertices.push(point);
      }
    });

    if (endAlong < startAlong) vertices.reverse();

    const route = new Phaser.Curves.Path(start.x, start.y);

    vertices.forEach((point) => {
      route.lineTo(point.x, point.y);
    });

    route.lineTo(destination.x, destination.y);

    const distance = route.getLength();

    if (distance < 1) {
      finish();
      return;
    }

    // Subtle travel sway; full walking frames can be added later.
    this.swayTween = this.tweens.add({
      targets: this.prince,
      angle: { from: -2, to: 2 },
      duration: 160,
      yoyo: true,
      repeat: -1,
    });

    this.movementTween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: Math.max(900, distance * 9),
      ease: 'Linear',

      onUpdate: (tween) => {
        const point = route.getPoint(tween.getValue());
        this.prince.setPosition(point.x, point.y);
      },

      onComplete: finish,
    });
  }
}

export default function PhaserGame({
  gameRef,
  mapState = PROTOTYPE_MAP,
  playerPosition = START_POSITION,
  expanded = false,
}) {
  const containerRef = useRef(null);
  const instanceRef = useRef(null);
  const latestRef = useRef(null);

  latestRef.current = {
    mapState,
    playerPosition,
    expanded,
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 900,
      height: 500,
      transparent: true,
      scene: MinimapScene,

      callbacks: {
        preBoot: (instance) => {
          const latest = latestRef.current;

          instance.registry.set('mapState', latest.mapState);
          instance.registry.set(
            'playerPosition',
            latest.playerPosition
          );
          instance.registry.set('expanded', latest.expanded);
        },
      },

      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    instanceRef.current = game;
    if (gameRef) gameRef.current = game;

    const resizeObserver = new ResizeObserver(() => {
      if (game.isBooted) game.scale.refresh();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      instanceRef.current = null;
      if (gameRef) gameRef.current = null;
      game.destroy(true);
    };
  }, [gameRef]);

  useEffect(() => {
    instanceRef.current?.registry.set('mapState', mapState);
  }, [mapState]);

  useEffect(() => {
    instanceRef.current?.registry.set(
      'playerPosition',
      playerPosition
    );
  }, [playerPosition]);

  useEffect(() => {
    instanceRef.current?.registry.set('expanded', expanded);
  }, [expanded]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        aspectRatio: '9 / 5',
      }}
    />
  );
}