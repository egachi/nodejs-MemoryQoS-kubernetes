const express = require('express');
const fs = require('fs');
const path = require('path');
const v8 = require('v8');

const app = express();
const BASE = '/var/cachetest';
let active = false;

app.get('/start-all', (req, res) => {
  if (active) return res.send('Already running');
  active = true;

  // Phase 1: Create file cache
  const dir = path.join(BASE, 'data');
  fs.mkdirSync(dir, { recursive: true });
  const data = Buffer.alloc(128 * 1024, 1);
  for (let i = 0; i < 2000; i++) {
    fs.writeFileSync(path.join(dir, `f_${i}`), data);
  }

  // Phase 2: Keep reading files (page cache stays active)
  const files = fs.readdirSync(dir).map(f => path.join(dir, f));
  const readLoop = () => {
    if (!active) return;
    for (let i = 0; i < 200; i++) {
      try { fs.readFileSync(files[Math.floor(Math.random() * files.length)]); } catch (e) {}
    }
    setTimeout(readLoop, 50);
  };
  setTimeout(readLoop, 0);

  // Phase 3: Heap churn — allocates ~50 MB/sec, overwrites old references
  // V8 GC automatically frees old chunks when approaching --max-old-space-size
  const slots = new Array(20);
  let index = 0;
  const churnLoop = () => {
    if (!active) return;
    try {
      const chunk = [];
      for (let i = 0; i < 500000; i++) {
        chunk.push({ id: i, ts: Date.now(), data: 'x'.repeat(100) });
      }
      slots[index % slots.length] = chunk;
      index++;
    } catch (e) {
      console.error('Churn error:', e.message);
    }
    setTimeout(churnLoop, 1000);
  };
  setTimeout(churnLoop, 0);

  res.send('Started: cache + heap churn (GC will reclaim automatically)');
});

app.get('/status', (req, res) => {
  const mem = process.memoryUsage();
  const heap = v8.getHeapStatistics();
  res.json({
    rss: (mem.rss / 1048576).toFixed(1) + ' MB',
    heapUsed: (mem.heapUsed / 1048576).toFixed(1) + ' MB',
    heapLimit: Math.round(heap.heap_size_limit / 1048576) + ' MB',
    available: Math.round(heap.total_available_size / 1048576) + ' MB',
  });
});

app.get('/stop', (req, res) => {
  active = false;
  res.send('Stopped');
});

app.get('/', (req, res) => {
  res.send('/start-all  /status  /stop');
});

app.listen(3000, () => console.log('Server on :3000'));