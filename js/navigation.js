// BFS navigation: distance of every floor tile to the exit, following real
// corridors (not straight-line distance through walls).
window.HM = window.HM || {};
(function (HM) {
  const DIRS = {
    U: { x: 0, y: -1 },
    D: { x: 0, y: 1 },
    L: { x: -1, y: 0 },
    R: { x: 1, y: 0 },
  };

  function bfs(maze, target) {
    const n = maze.size;
    const dist = new Int32Array(n * n).fill(-1);
    const queue = new Int32Array(n * n);
    let head = 0, tail = 0;
    dist[target.y * n + target.x] = 0;
    queue[tail++] = target.y * n + target.x;
    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % n, cy = (cur / n) | 0;
      for (const k in DIRS) {
        const nx = cx + DIRS[k].x, ny = cy + DIRS[k].y;
        if (maze.isWall(nx, ny)) continue;
        const ni = ny * n + nx;
        if (dist[ni] !== -1) continue;
        dist[ni] = dist[cur] + 1;
        queue[tail++] = ni;
      }
    }
    return dist;
  }

  // Next step on a shortest path: the neighbour with the smallest distance.
  function nextDir(maze, dist, pos) {
    const n = maze.size;
    let best = null, bestDist = dist[pos.y * n + pos.x];
    for (const k in DIRS) {
      const nx = pos.x + DIRS[k].x, ny = pos.y + DIRS[k].y;
      if (maze.isWall(nx, ny)) continue;
      const d = dist[ny * n + nx];
      if (d >= 0 && d < bestDist) { best = k; bestDist = d; }
    }
    return best;
  }

  function pathFrom(maze, dist, pos) {
    const path = [{ ...pos }];
    let p = { ...pos };
    for (let guard = 0; guard < maze.size * maze.size; guard++) {
      const k = nextDir(maze, dist, p);
      if (!k) break;
      p = { x: p.x + DIRS[k].x, y: p.y + DIRS[k].y };
      path.push(p);
    }
    return path;
  }

  HM.DIRS = DIRS;
  HM.bfs = bfs;
  HM.nextDir = nextDir;
  HM.pathFrom = pathFrom;
})(window.HM);
