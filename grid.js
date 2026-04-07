/**
 * Rift Hunters — 6×7 match-3 grid: swap validation, cascades, specials.
 */
(function () {
  const COLS = 6;
  const ROWS = 7;

  function cellKey(r, c) {
    return r + "," + c;
  }

  function parseKey(k) {
    const p = k.split(",");
    return { r: +p[0], c: +p[1] };
  }

  function createCell(type, special) {
    return { type: type, special: special || null };
  }

  function cloneGrid(grid) {
    const g = [];
    for (let r = 0; r < ROWS; r++) {
      g[r] = [];
      for (let c = 0; c < COLS; c++) {
        const x = grid[r][c];
        g[r][c] = createCell(x.type, x.special);
      }
    }
    return g;
  }

  function findHorizontalRuns(grid) {
    const runs = [];
    for (let r = 0; r < ROWS; r++) {
      let c = 0;
      while (c < COLS) {
        const t0 = grid[r][c].type;
        if (t0 === null) {
          c++;
          continue;
        }
        let len = 1;
        while (c + len < COLS && grid[r][c + len].type === t0) {
          len++;
        }
        if (len >= 3) {
          const cells = [];
          for (let i = 0; i < len; i++) cells.push([r, c + i]);
          runs.push(cells);
        }
        c += len;
      }
    }
    return runs;
  }

  function findVerticalRuns(grid) {
    const runs = [];
    for (let c = 0; c < COLS; c++) {
      let r = 0;
      while (r < ROWS) {
        const t0 = grid[r][c].type;
        if (t0 === null) {
          r++;
          continue;
        }
        let len = 1;
        while (r + len < ROWS && grid[r + len][c].type === t0) {
          len++;
        }
        if (len >= 3) {
          const cells = [];
          for (let i = 0; i < len; i++) cells.push([r + i, c]);
          runs.push(cells);
        }
        r += len;
      }
    }
    return runs;
  }

  /**
   * Returns array of [r,c] for all cells in 3+ horizontal or vertical runs.
   */
  function findMatchCells(grid) {
    const set = new Set();
    const add = (r, c) => set.add(cellKey(r, c));
    const h = findHorizontalRuns(grid);
    const v = findVerticalRuns(grid);
    for (let i = 0; i < h.length; i++) {
      for (let j = 0; j < h[i].length; j++) add(h[i][j][0], h[i][j][1]);
    }
    for (let i = 0; i < v.length; i++) {
      for (let j = 0; j < v[i].length; j++) add(v[i][j][0], v[i][j][1]);
    }
    const out = [];
    set.forEach(function (k) {
      const p = parseKey(k);
      out.push([p.r, p.c]);
    });
    return out;
  }

  function horizontalRunLength(grid, r, c) {
    const t = grid[r][c].type;
    if (t === null) return 0;
    let left = c;
    let right = c;
    while (left - 1 >= 0 && grid[r][left - 1].type === t) left--;
    while (right + 1 < COLS && grid[r][right + 1].type === t) right++;
    return right - left + 1;
  }

  function verticalRunLength(grid, r, c) {
    const t = grid[r][c].type;
    if (t === null) return 0;
    let top = r;
    let bot = r;
    while (top - 1 >= 0 && grid[top - 1][c].type === t) top--;
    while (bot + 1 < ROWS && grid[bot + 1][c].type === t) bot++;
    return bot - top + 1;
  }

  function expandRiftClears(grid, matchCells) {
    const set = new Set();
    for (let i = 0; i < matchCells.length; i++) {
      set.add(cellKey(matchCells[i][0], matchCells[i][1]));
    }
    for (let i = 0; i < matchCells.length; i++) {
      const r = matchCells[i][0];
      const c = matchCells[i][1];
      const cell = grid[r][c];
      if (cell.special !== "rift") continue;
      const hz = horizontalRunLength(grid, r, c);
      const vt = verticalRunLength(grid, r, c);
      const rowMatch = hz >= 3;
      const colMatch = vt >= 3;
      if (rowMatch && colMatch) {
        for (let cc = 0; cc < COLS; cc++) {
          set.add(cellKey(r, cc));
        }
        for (let rr = 0; rr < ROWS; rr++) {
          set.add(cellKey(rr, c));
        }
      } else if (rowMatch) {
        for (let cc = 0; cc < COLS; cc++) {
          set.add(cellKey(r, cc));
        }
      } else if (colMatch) {
        for (let rr = 0; rr < ROWS; rr++) {
          set.add(cellKey(rr, c));
        }
      }
    }
    return { allKeys: set };
  }

  function buildClearSet(grid, matchCells) {
    const exp = expandRiftClears(grid, matchCells);
    const list = [];
    exp.allKeys.forEach(function (k) {
      const p = parseKey(k);
      list.push([p.r, p.c]);
    });
    return list;
  }

  /**
   * Largest connected component (orthogonal) per tile type in clear set.
   * L/T shapes count as 5+ for Rift tiles (not only straight lines).
   */
  function pickSpecialSpawn(grid, clearSetKeys) {
    const cellSet = new Set();
    clearSetKeys.forEach(function (k) {
      cellSet.add(k);
    });
    const visited = new Set();
    let bestComp = null;

    cellSet.forEach(function (k) {
      if (visited.has(k)) return;
      const p = parseKey(k);
      if (grid[p.r][p.c].type === null) return;
      const t0 = grid[p.r][p.c].type;
      const queue = [[p.r, p.c]];
      const comp = [];
      visited.add(k);
      while (queue.length) {
        const cur = queue.pop();
        const r = cur[0];
        const c = cur[1];
        comp.push(cur);
        const neigh = [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ];
        for (let n = 0; n < neigh.length; n++) {
          const rr = neigh[n][0];
          const cc = neigh[n][1];
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
          const nk = cellKey(rr, cc);
          if (!cellSet.has(nk) || visited.has(nk)) continue;
          if (grid[rr][cc].type !== t0) continue;
          visited.add(nk);
          queue.push([rr, cc]);
        }
      }
      if (!bestComp || comp.length > bestComp.length) {
        bestComp = comp;
      }
    });

    if (!bestComp || bestComp.length < 4) return null;
    bestComp.sort(function (a, b) {
      return a[0] * COLS + a[1] - (b[0] * COLS + b[1]);
    });
    const mid = Math.floor(bestComp.length / 2);
    const cr = bestComp[mid][0];
    const cc = bestComp[mid][1];
    const t = grid[cr][cc].type;
    if (bestComp.length >= 5) {
      return { r: cr, c: cc, type: t, special: "rift" };
    }
    return { r: cr, c: cc, type: t, special: "power" };
  }

  function applyGravity(grid) {
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (grid[r][c].type !== null) {
          if (write !== r) {
            grid[write][c] = grid[r][c];
            grid[r][c] = createCell(null, null);
          }
          write--;
        }
      }
    }
  }

  function fillEmpty(grid, rng, weights, pickTile) {
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (grid[r][c].type === null) {
          const t = pickTile(grid, r, c, rng, weights);
          grid[r][c] = createCell(t, null);
        }
      }
    }
  }

  /** Avoid immediate auto-matches on refill (best-effort). */
  function pickTileNoAutoMatch(grid, r, c, rng, weights) {
    const data = window.RH_DATA;
    let attempts = 0;
    let t;
    do {
      t = data.pickWeightedTile(rng, weights);
      attempts++;
      if (attempts > 40) break;
    } while (wouldCreateImmediateMatch(grid, r, c, t));
    return t;
  }

  function wouldCreateImmediateMatch(grid, r, c, type) {
    if (type === null) return false;
    let horiz = 1;
    for (let cc = c - 1; cc >= 0 && grid[r][cc].type === type; cc--) horiz++;
    for (let cc = c + 1; cc < COLS && grid[r][cc].type === type; cc++) horiz++;
    if (horiz >= 3) return true;
    let vert = 1;
    for (let rr = r - 1; rr >= 0 && grid[rr][c].type === type; rr--) vert++;
    for (let rr = r + 1; rr < ROWS && grid[rr][c].type === type; rr++) vert++;
    return vert >= 3;
  }

  function swapCells(grid, r1, c1, r2, c2) {
    const t = grid[r1][c1];
    grid[r1][c1] = grid[r2][c2];
    grid[r2][c2] = t;
  }

  function wouldSwapCreateMatch(grid, r1, c1, r2, c2) {
    const g = cloneGrid(grid);
    swapCells(g, r1, c1, r2, c2);
    return findMatchCells(g).length > 0;
  }

  function createInitialGrid(rng, weights) {
    const grid = [];
    for (let r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        grid[r][c] = createCell(null, null);
      }
    }
    fillEmpty(grid, rng, weights, pickTileNoAutoMatch);
    return grid;
  }

  window.RH_GRID = {
    COLS,
    ROWS,
    cellKey,
    createCell,
    cloneGrid,
    findMatchCells,
    findHorizontalRuns,
    findVerticalRuns,
    verticalRunLength,
    buildClearSet,
    pickSpecialSpawn,
    applyGravity,
    fillEmpty,
    pickTileNoAutoMatch,
    swapCells,
    wouldSwapCreateMatch,
    createInitialGrid,
  };
})();
