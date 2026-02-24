const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const BASE = '/var/cachetest';
const leakedMemory = [];
let leakActive = false;
let readerActive = false;

// ============================================================
// /cache - Crea archivos y los lee para generar page cache
// ============================================================
app.get('/cache', (req, res) => {
  const dir = path.join(BASE, 'data');
  fs.mkdirSync(dir, { recursive: true });

  // Crear 2000 archivos × 128 KB = ~256 MB de file cache
  const data = Buffer.alloc(128 * 1024, 1);
  for (let i = 0; i < 2000; i++) {
    fs.writeFileSync(path.join(dir, `f_${i}`), data);
  }

  // Leer archivos continuamente para mantenerlos en active_file
  if (!readerActive) {
    readerActive = true;
    const files = fs.readdirSync(dir).map(f => path.join(dir, f));

    const readLoop = () => {
      if (!readerActive) return;
      for (let i = 0; i < 200; i++) {
        const f = files[Math.floor(Math.random() * files.length)];
        fs.readFileSync(f);
      }
      setTimeout(readLoop, 50);
    };
    setTimeout(readLoop, 0);
  }

  res.send('Cache iniciado: 2000 archivos, active_file');
});

// ============================================================
// /leak - Inicia fuga de memoria continua (50 MB/seg)
// ============================================================
app.get('/leak', (req, res) => {
  if (leakActive) return res.send('Memory leak en ejecución');
  leakActive = true;

  const leakLoop = () => {
    if (!leakActive) return;
    try {
      const block = Buffer.alloc(50 * 1024 * 1024); // 50 MB
      // Tocar cada página para forzar asignación física
      // Sin esto, Linux podría no asignar páginas reales (lazy allocation)
      for (let i = 0; i < block.length; i += 4096) block[i] = 1;
      // Guardar referencia para que el GC nunca lo libere (Memory Leak)
      leakedMemory.push(block);
      console.log(`[Memory Leak] ${leakedMemory.length * 50} MB total`);
    } catch (e) {
      console.error('[Memory Leak] Falló:', e.message);
      leakActive = false;
      return;
    }
    setTimeout(leakLoop, 1000);
  };
  setTimeout(leakLoop, 0);

  res.send('Memory Leak iniciada: 50 MB/seg');
});

// ============================================================
// /leak-once - Memory Leak de exactamente 50 MB una sola vez
// ============================================================
app.get('/leak-once', (req, res) => {
  try {
    const block = Buffer.alloc(50 * 1024 * 1024);
    for (let i = 0; i < block.length; i += 4096) block[i] = 1;
    leakedMemory.push(block);
    res.send(`Memory Leak: ${leakedMemory.length * 50} MB total`);
  } catch (e) {
    res.send(`Falló en ${leakedMemory.length * 50} MB: ${e.message}`);
  }
});

// ============================================================
// /start-all - Cache + Memory Leak juntos
// ============================================================
app.get('/start-all', async (req, res) => {
  // Disparar ambos
  await fetch(`http://localhost:8080/cache`).catch(() => {});
  await fetch(`http://localhost:8080/leak`).catch(() => {});
  res.send('Todo iniciado: cache + Memory Leak');
});

// ============================================================
// /status - Estado simple
// ============================================================
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

// ============================================================
// /cgroup - Leer estadísticas de memoria cgroup v2
// ============================================================
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

    // Calcular working_set como lo hace kubelet:
    // working_set = memory.current - inactive_file
    res.json({
      actual: MB(current),
      high,
      max,
      workingSet: MB(current - inactiveFile),
      desglose: {
        anon: MB(stat.anon || 0),                         // Memoria anónima (heap, variables)
        file: MB(stat.file || 0),                         // Caché de archivos
        active_file: MB(stat.active_file || 0),           // Caché usada recientemente
        inactive_file: MB(inactiveFile),                  // Caché no usada recientemente
        active_anon: MB(stat.active_anon || 0),           // Anónima usada recientemente
        inactive_anon: MB(stat.inactive_anon || 0),       // Anónima no usada recientemente
        slab_reclaimable: MB(stat.slab_reclaimable || 0)  // Caché del kernel recuperable
      },
      eventos: events
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// /stop - Detener fuga y lector
// ============================================================
app.get('/stop', (req, res) => {
  leakActive = false;
  readerActive = false;
  res.send('Detenido. Memoria fugada aún retenida: ' + (leakedMemory.length * 50) + ' MB');
});

// ============================================================
// Inicio
// ============================================================
app.get('/', (req, res) => {
  res.send('Endpoints: /start-all /cache /leak /leak-once /status /cgroup /stop');
});

app.listen(3000, () => console.log('Servidor en :3000'));