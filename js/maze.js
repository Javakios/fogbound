// Maze generation (seeded recursive backtracker) on a tile grid.
// A maze of N×N cells becomes a (2N+1)×(2N+1) tile grid: 1 = wall, 0 = floor.
window.HM = window.HM || {};
(function (HM) {
  // Small deterministic PRNG so the same seed always gives the same maze
  // (important for fair comparisons in the user study).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generateMaze(cells, seed, loopChance = 0.06) {
    const rand = mulberry32(seed);
    const size = cells * 2 + 1;
    const grid = new Uint8Array(size * size).fill(1);
    const idx = (x, y) => y * size + x;
    const visited = new Uint8Array(cells * cells);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    const stack = [[0, 0]];
    visited[0] = 1;
    grid[idx(1, 1)] = 0;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const options = [];
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < cells && ny < cells && !visited[ny * cells + nx]) {
          options.push([nx, ny, dx, dy]);
        }
      }
      if (!options.length) { stack.pop(); continue; }
      const [nx, ny, dx, dy] = options[Math.floor(rand() * options.length)];
      visited[ny * cells + nx] = 1;
      grid[idx(cx * 2 + 1 + dx, cy * 2 + 1 + dy)] = 0;
      grid[idx(nx * 2 + 1, ny * 2 + 1)] = 0;
      stack.push([nx, ny]);
    }

    // Knock out a few extra walls so there are loops: then "wrong direction"
    // is a real choice, not just a dead end.
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (grid[idx(x, y)] !== 1) continue;
        const between = (x % 2 === 0 && y % 2 === 1) || (x % 2 === 1 && y % 2 === 0);
        if (between && rand() < loopChance) grid[idx(x, y)] = 0;
      }
    }

    return {
      size,
      cells,
      seed,
      grid,
      start: { x: 1, y: 1 },
      exit: { x: size - 2, y: size - 2 },
      isWall(x, y) {
        return x < 0 || y < 0 || x >= size || y >= size || grid[y * size + x] === 1;
      },
    };
  }

  HM.generateMaze = generateMaze;
  HM.rng = mulberry32;
})(window.HM);
