/* Levels are data (the Studio Level DSL). The Level Design agent edits this file. */
window.LEVELS = [
  {
    name: 'Green Run', tile: 40, width: 1920, height: 540, groundY: 470, sky: 0x1d2b53,
    spawn: { x: 60, y: 360 }, goal: 1860,
    ground: [[0, 420, 'solid'], [560, 1100, 'solid'], [1180, 1920, 'solid']], // gaps: 420-560, 1100-1180
    walls: [{ x: 760, tiles: 2, mat: 'stone' }],
    coins: [{ x: 300, y: 440 }, { x: 360, y: 440 }, { x: 900, y: 440 }, { x: 1300, y: 440 }, { x: 1400, y: 440 }, { x: 1640, y: 360 }],
    enemies: [{ x: 980, patrol: 50 }],
    conveyor: [{ x0: 1280, x1: 1460, dir: 1, push: 70 }]   // a sample mechanic — the SDK runtime (Studio.Mechanics) is wired + telegraphed
    // the SDK also handles dashpad/crumble/oneway/fields + a `boss:{x,hp}` finale — opt-in per level.
    // a boss finale is supported via `boss: { x, hp }` (Studio.Boss); it needs the multi-stomp
    // autopilot policy (coupled to #40's deferred autopilot extensions) before the gate can certify it.
  }
];
