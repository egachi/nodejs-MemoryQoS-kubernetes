const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const BASE = '/var/cachetest';
const leakedMemory = [];
let leakActive = false;
let readerActive = false;

// ============================================================
// Función: Crear caché de archivos
// ============================================================
function startCache() {
  const dir = path.join(BASE, 'data');
  fs.mkdirSync(dir, { recursive: true });

  const data = Buffer.alloc(128 * 1024, 1);
  for (let i = 0; i < 2000; i++) {
    fs.writeFileSync(path.join(dir, `f_${i}`), data);
  }

  if (!readerActive) {
    readerActive = true;
    const files = fs.readdirSync(dir).map(f => path.join(dir, f));

    const readLoop = () => {
      if (!readerActive) return;
      for (let i = 0; i < 200; i++) {
        const f = files[Math.floor(Math.random() * files.length)];
        try { fs.readFileSync(f); } catch (e) {}
      }
      setTimeout(readLoop, 50);
    };
    setTimeout(readLoop, 0);
  }

  return `Cache iniciado: 2000 archivos, lector activo`;
}

// ============================================================
// Función: Iniciar fuga de memoria
// ============================================================
function startLeak() {
  if (leakActive) return 'Fuga ya en ejecución';
  leakActive = true;

  const leakLoop = () => {
    if (!leakActive) return;
    try {
      const block = Buffer.alloc(50 * 1024 * 1024);
      for (let i = 0; i < block.length; i += 4096) block[i] = 1;
      leakedMemory.push(block);
      console.log(`[FUGA] ${leakedMemory.length * 50} MB total`);
    } catch (e) {
      console.error('[FUGA] Falló:', e.message);
      leakActive = false;
      return;
    }
    setTimeout(leakLoop, 1000);
  };
  setTimeout(leakLoop, 0);

  return 'Fuga iniciada: 50 MB/seg';
}

// ============================================================
// Rutas
// ============================================================
app.get('/cache', (req, res) => {
  const result = startCache();
  res.send(result);
});

app.get('/leak', (req, res) => {
  const result = startLeak();
  res.send(result);
});

app.get('/leak-once', (req, res) => {
  try {
    const block = Buffer.alloc(50 * 1024 * 1024);
    for (let i = 0; i < block.length; i += 4096) block[i] = 1;
    leakedMemory.push(block);
    res.send(`Fugados: ${leakedMemory.length * 50} MB total`);
  } catch (e) {
    res.send(`Falló en ${leakedMemory.length * 50} MB: ${e.message}`);
  }
});

// /start-all ahora llama funciones directamente (sin fetch)
app.get('/start-all', (req, res) => {
  const cacheResult = startCache();
  const leakResult = startLeak();
  res.send(`Cache: ${cacheResult} | Fuga: ${leakResult}`);
});

app.get('/status', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    rss: (mem.rss / 1048576).toFixed(1) + ' MB',
    heapUsado: (mem.heapUsed / 1048576).toFixed(1) + ' MB',
    fugado: (leakedMemory.length * 50) + ' MB',
    fugaActiva: leakActive,
    lectorActivo: readerActive
  });
});

app.get('/cgroup', (req, res) => {
  try {
    const current = parseInt(fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8'));
    const high = fs.readFileSync('/sys/fs/cgroup/memory.high', 'utf8').trim();
    const max = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    const events = fs.readFileSync('/sys/fs/cgroup/memory.events', 'utf8');
    const stat = {};
    fs.readFileSync('/sys/fs/cgroup/memory.stat', 'utf8')
      .split('\n')
      .forEach(l => { const [k, v] = l.split(' '); if (k && v) stat[k] = parseInt(v); });

    const MB = v => (v / 1048576).toFixed(2) + ' MB';
    const inactiveFile = stat.inactive_file || 0;

    res.json({
      actual: MB(current),
      high,
      max,
      workingSet: MB(current - inactiveFile),
      desglose: {
        anon: MB(stat.anon || 0),
        file: MB(stat.file || 0),
        active_file: MB(stat.active_file || 0),
        inactive_file: MB(inactiveFile),
        active_anon: MB(stat.active_anon || 0),
        inactive_anon: MB(stat.inactive_anon || 0),
        slab_reclaimable: MB(stat.slab_reclaimable || 0)
      },
      eventos: events
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/stop', (req, res) => {
  leakActive = false;
  readerActive = false;
  res.send('Detenido. Memoria fugada retenida: ' + (leakedMemory.length * 50) + ' MB');
});

app.get('/', (req, res) => {
  res.send('Endpoints: /start-all /cache /leak /leak-once /status /cgroup /stop');
});

app.listen(3000, () => console.log('Servidor en :3000'));