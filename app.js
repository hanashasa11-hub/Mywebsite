// ─────────────────────────────────────────────────────────────
//  Q-Eco AI  |  Carbon-Aware Scheduler  |  Full Runtime Engine
// ─────────────────────────────────────────────────────────────

const regions = [
    { id: 'us-west',     name: 'US West (Oregon)',       x: 15, y: 35, baseCarbon: 250, costMultiplier: 1.1, weather: 'clear' },
    { id: 'eu-central',  name: 'EU Central (Frankfurt)', x: 50, y: 25, baseCarbon: 300, costMultiplier: 1.2, weather: 'clear' },
    { id: 'ap-northeast',name: 'AP Northeast (Tokyo)',   x: 80, y: 35, baseCarbon: 400, costMultiplier: 1.0, weather: 'clear' },
    { id: 'sa-east',     name: 'SA East (São Paulo)',    x: 30, y: 70, baseCarbon: 150, costMultiplier: 0.9, weather: 'clear' }
];

const defaultDistribution = { 'us-west': 350, 'eu-central': 350, 'ap-northeast': 400, 'sa-east': 100 };
const regionState = {};
regions.forEach(r => {
    regionState[r.id] = {
        intensity: r.baseCarbon,
        pods:      defaultDistribution[r.id],
        weather:   r.weather,
        cpu:       40 + Math.random() * 30,   // % utilisation
        mem:       50 + Math.random() * 25,
        energy:    r.baseCarbon * 0.004
    };
});

let ecoAggressiveness    = 50;
let photosynthesisEnabled = true;
let hibernatedJobs        = 0;

// ────── Chart state ──────
let finopsChart, forecastChart, cpuChart;
const costData = [], carbonData = [], chartLabels = [];
const forecastData = [], forecastLabels = [];
const cpuDatasets = {};         // one series per region

const weatherIcons = {
    clear:  '<i class="fa-solid fa-sun"    style="color:#ffea00;text-shadow:0 0 8px #ffea00;"></i>',
    windy:  '<i class="fa-solid fa-wind"   style="color:#00d4ff;text-shadow:0 0 8px #00d4ff;"></i>',
    cloudy: '<i class="fa-solid fa-cloud"  style="color:#7dd3fc;"></i>'
};

// ═══════════════════════════════════════════
//  INIT CHARTS
// ═══════════════════════════════════════════
function initCharts() {
    Chart.defaults.color      = '#7dd3fc';
    Chart.defaults.font.family = 'Space Grotesk';

    /* ── FinOps twin-axis ── */
    const ctx = document.getElementById('finopsChart').getContext('2d');
    finopsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [
                { label: 'Carbon Eq (kg)',  borderColor: '#00ff66', backgroundColor: 'rgba(0,255,102,0.1)', data: carbonData, fill: true, tension: 0.4, pointRadius: 2 },
                { label: 'OpEx ($/hr)',     borderColor: '#00d4ff', borderDash: [4,4],                        data: costData,   tension: 0.4, pointRadius: 2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 400 },
            scales: {
                y: { grid: { color: 'rgba(0,212,255,0.05)' }, ticks: { color: '#7dd3fc' } },
                x: { grid: { color: 'rgba(0,212,255,0.05)' }, ticks: { color: '#7dd3fc' } }
            },
            plugins: { legend: { position: 'top' } }
        }
    });

    /* ── 24h forecast bar ── */
    for (let i = 0; i < 24; i++) {
        forecastLabels.push(`+${i}h`);
        forecastData.push(300 + Math.sin(i / 3) * 150 + Math.random() * 50);
    }
    const ctxF = document.getElementById('forecastChart').getContext('2d');
    forecastChart = new Chart(ctxF, {
        type: 'bar',
        data: {
            labels: forecastLabels,
            datasets: [{
                label: 'Grid Avg (gCO2eq)',
                backgroundColor: forecastData.map(v => v > 400 ? 'rgba(255,0,85,0.6)' : 'rgba(0,255,102,0.6)'),
                data: forecastData,
                borderRadius: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 300 },
            scales: {
                y: { grid: { color: 'rgba(0,212,255,0.05)' } },
                x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }
            },
            plugins: { legend: { display: false } }
        }
    });

    /* ── Per-region CPU telemetry line chart ── */
    const cpuColors = ['#00ff66', '#00d4ff', '#ffea00', '#ff0055'];
    const cpuDatasetArr = regions.map((r, i) => {
        cpuDatasets[r.id] = [];
        return {
            label: r.name,
            borderColor: cpuColors[i],
            backgroundColor: cpuColors[i] + '22',
            data: cpuDatasets[r.id],
            tension: 0.4,
            fill: false,
            pointRadius: 2
        };
    });

    const ctxC = document.getElementById('cpuChart').getContext('2d');
    cpuChart = new Chart(ctxC, {
        type: 'line',
        data: { labels: chartLabels, datasets: cpuDatasetArr },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 400 },
            scales: {
                y: { min: 0, max: 100, grid: { color: 'rgba(0,212,255,0.05)' }, ticks: { callback: v => v + '%' } },
                x: { grid: { color: 'rgba(0,212,255,0.05)' } }
            },
            plugins: { legend: { position: 'top' } }
        }
    });
}

// ═══════════════════════════════════════════
//  MAP  (all DOM work deferred inside DOMContentLoaded)
// ═══════════════════════════════════════════
let mapContainer, canvas, ctxCanvas;
let particles = [];

function resizeCanvas() {
    canvas.width  = mapContainer.clientWidth;
    canvas.height = mapContainer.clientHeight;
}

function initMap() {
    mapContainer = document.getElementById('map-container');
    canvas       = document.getElementById('flowCanvas');
    ctxCanvas    = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    regions.forEach(r => {
        const node    = document.createElement('div');
        node.className = 'map-node';
        node.id        = `node-${r.id}`;
        node.style.left = `${r.x}%`;
        node.style.top  = `${r.y}%`;

        const label   = document.createElement('div');
        label.className = 'node-label';
        label.innerText = r.name;

        const weather = document.createElement('div');
        weather.className = 'weather-indicator';
        weather.id        = `weather-${r.id}`;
        weather.innerHTML = weatherIcons[r.weather];

        node.appendChild(label);
        node.appendChild(weather);
        mapContainer.appendChild(node);
    });
}

// ═══════════════════════════════════════════
//  CANVAS PARTICLE FLOW
// ═══════════════════════════════════════════
function spawnParticle(fromX, fromY, toX, toY, color) {
    particles.push({
        x: fromX, y: fromY, tx: toX, ty: toY,
        progress: 0,
        speed:    0.008 + Math.random() * 0.012,
        color,
        size:     Math.random() * 2.5 + 1,
        ctrlX:    (fromX + toX) / 2 + (Math.random() - 0.5) * 120,
        ctrlY:    (fromY + toY) / 2 - 60
    });
}

function drawCanvas() {
    ctxCanvas.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.progress += p.speed;
        if (p.progress >= 1) { particles.splice(i, 1); continue; }

        const t  = p.progress;
        const x  = Math.pow(1-t,2)*p.x  + 2*(1-t)*t*p.ctrlX + Math.pow(t,2)*p.tx;
        const y  = Math.pow(1-t,2)*p.y  + 2*(1-t)*t*p.ctrlY + Math.pow(t,2)*p.ty;

        ctxCanvas.beginPath();
        ctxCanvas.arc(x, y, p.size, 0, Math.PI * 2);
        ctxCanvas.fillStyle   = p.color;
        ctxCanvas.shadowBlur  = 12;
        ctxCanvas.shadowColor = p.color;
        ctxCanvas.fill();
    }
    requestAnimationFrame(drawCanvas);
}

function triggerMigrationFlow(fromId, toId, count) {
    const fn = regions.find(r => r.id === fromId);
    const tn = regions.find(r => r.id === toId);
    if (!fn || !tn) return;

    const w = canvas.width, h = canvas.height;
    const fx = (fn.x / 100) * w, fy = (fn.y / 100) * h;
    const tx = (tn.x / 100) * w, ty = (tn.y / 100) * h;

    for (let i = 0; i < Math.min(count, 18); i++) {
        setTimeout(() => spawnParticle(fx, fy, tx, ty, '#00d4ff'), i * 60);
    }
}

// ═══════════════════════════════════════════
//  SIMULATION TICK
// ═══════════════════════════════════════════
function tickSimulation() {
    let totalCarbon = 0, totalCost = 0;

    /* 1 ─ Environment (weather + intensity) */
    regions.forEach(r => {
        if (Math.random() < 0.08) {
            const wTypes = ['clear', 'windy', 'cloudy'];
            regionState[r.id].weather = wTypes[Math.floor(Math.random() * 3)];
            const el = document.getElementById(`weather-${r.id}`);
            if (el) el.innerHTML = weatherIcons[regionState[r.id].weather];
        }

        let target = r.baseCarbon;
        if (regionState[r.id].weather === 'windy')  target *= 0.30;
        if (regionState[r.id].weather === 'clear')  target *= 0.65;
        if (regionState[r.id].weather === 'cloudy') target *= 1.40;

        regionState[r.id].intensity += (target - regionState[r.id].intensity) * 0.15;

        // CPU random walk (realistic jitter)
        regionState[r.id].cpu    = Math.max(5,  Math.min(99,  regionState[r.id].cpu    + (Math.random()-0.5)*8));
        regionState[r.id].mem    = Math.max(20, Math.min(95,  regionState[r.id].mem    + (Math.random()-0.5)*4));
        regionState[r.id].energy = regionState[r.id].intensity * 0.004 * (regionState[r.id].cpu / 60);

        // Node color
        const nodeEl = document.getElementById(`node-${r.id}`);
        if (nodeEl) {
            const i = regionState[r.id].intensity;
            nodeEl.className = i < 180 ? 'map-node active-low' : i > 380 ? 'map-node active-high' : 'map-node';
        }
    });

    /* 2 ─ Photosynthesis (batch job hibernation) */
    const globalHigh = regions.every(r => regionState[r.id].intensity > 250);
    if (photosynthesisEnabled && globalHigh && hibernatedJobs < 200) {
        hibernatedJobs += 20;
        regions.forEach(r => { if (regionState[r.id].pods > 80) regionState[r.id].pods -= 4; });
        setText('hibernate-status', `⏸ HIBERNATING: ${hibernatedJobs} BATCH JOBS`, 'status-subtext text-neon-yellow');
    } else if (hibernatedJobs > 0 && (!globalHigh || !photosynthesisEnabled)) {
        hibernatedJobs = Math.max(0, hibernatedJobs - 20);
        regions.forEach(r => { regionState[r.id].pods += 4; });
        setText('hibernate-status', `▶ SYSTEM NORMAL: All tasks active`, 'status-subtext text-neon-green');
    }

    /* 3 ─ AI Scheduler migration */
    const threshold = 350 - ecoAggressiveness * 3;
    const dirtiest  = regions.reduce((id, r) => regionState[r.id].intensity > regionState[id].intensity ? r.id : id, regions[0].id);
    const greenest  = regions.reduce((id, r) => regionState[r.id].intensity < regionState[id].intensity ? r.id : id, regions[0].id);

    const intensityDiff = regionState[dirtiest].intensity - regionState[greenest].intensity;
    if (intensityDiff > threshold && regionState[dirtiest].pods > 50) {
        const migrate = Math.max(5, Math.floor(regionState[dirtiest].pods * (ecoAggressiveness / 100) * 0.5));
        regionState[dirtiest].pods -= migrate;
        regionState[greenest].pods += migrate;
        triggerMigrationFlow(dirtiest, greenest, migrate);
    }

    /* 4 ─ Aggregates */
    regions.forEach(r => {
        totalCarbon += regionState[r.id].pods * regionState[r.id].intensity * 0.001;
        totalCost   += regionState[r.id].pods * r.costMultiplier * 1.5;
    });

    /* 5 ─ Chart updates */
    const ts = new Date();
    const label = `${ts.getMinutes()}:${String(ts.getSeconds()).padStart(2,'0')}`;
    chartLabels.push(label);
    carbonData.push(+totalCarbon.toFixed(1));
    costData.push(+totalCost.toFixed(2));

    regions.forEach(r => {
        cpuDatasets[r.id].push(+regionState[r.id].cpu.toFixed(1));
        if (cpuDatasets[r.id].length > 20) cpuDatasets[r.id].shift();
    });

    if (chartLabels.length > 20) { chartLabels.shift(); carbonData.shift(); costData.shift(); }

    finopsChart.update();
    cpuChart.update();

    // Occasional forecast refresh
    if (Math.random() < 0.08) {
        forecastData.shift();
        forecastData.push(300 + Math.sin(Math.random()*10)*150 + Math.random()*50);
        forecastChart.data.datasets[0].backgroundColor = forecastData.map(v => v > 400 ? 'rgba(255,0,85,0.6)' : 'rgba(0,255,102,0.6)');
        forecastChart.update();
    }

    /* 6 ─ KPI */
    const baseline = regions.reduce((acc, r) => acc + defaultDistribution[r.id] * regionState[r.id].intensity * 0.001, 0);
    const saved    = Math.max(0, (baseline - totalCarbon) / baseline * 100);
    const kpi      = document.getElementById('kpi-carbon-reduction');
    if (kpi) kpi.innerText = `${saved.toFixed(1)}%`;

    updateRegionCards();
}

// ═══════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════
function setText(id, text, cls) {
    const el = document.getElementById(id);
    if (el) { el.innerText = text; if (cls) el.className = cls; }
}

function bar(pct, color) {
    return `<div style="background:rgba(255,255,255,0.07);border-radius:2px;height:6px;margin-top:4px;overflow:hidden;">
              <div style="width:${pct.toFixed(0)}%;height:100%;background:${color};box-shadow:0 0 6px ${color};transition:width 0.6s;"></div>
            </div>`;
}

function updateRegionCards() {
    const grid = document.getElementById('region-stats-grid');
    if (!grid) return;
    grid.innerHTML = '';

    regions.forEach(r => {
        const s = regionState[r.id];
        const intColor = s.intensity < 200 ? '#00ff66' : s.intensity > 380 ? '#ff0055' : '#ffea00';

        grid.innerHTML += `
        <div class="region-card">
            <div class="r-header">
                <span>${r.name}</span>
                <span class="r-pods">${Math.floor(s.pods)} PODS</span>
            </div>
            <div class="r-metric">Grid Intensity:
                <span style="color:${intColor};font-weight:700;text-shadow:0 0 6px ${intColor};">${Math.floor(s.intensity)} gCO2/kWh</span>
            </div>
            <div class="r-metric" style="margin-top:6px;">
                CPU&nbsp;${s.cpu.toFixed(0)}% ${bar(s.cpu,'#00d4ff')}
            </div>
            <div class="r-metric" style="margin-top:4px;">
                MEM&nbsp;${s.mem.toFixed(0)}% ${bar(s.mem,'#00ff66')}
            </div>
            <div class="r-metric" style="margin-top:4px;">
                Energy&nbsp;<span style="color:#ffea00;">${s.energy.toFixed(2)} kW</span>
                &nbsp;|&nbsp;${weatherIcons[s.weather]}
            </div>
        </div>`;
    });
}

// ═══════════════════════════════════════════
//  EVENT BINDINGS
// ═══════════════════════════════════════════
function bindControls() {
    document.getElementById('eco-dial').addEventListener('input', e => {
        ecoAggressiveness = +e.target.value;
        const dv = document.getElementById('eco-dial-val');
        dv.innerText  = `${ecoAggressiveness}%`;
        dv.className  = ecoAggressiveness > 70 ? 'text-neon-green'
                      : ecoAggressiveness < 30 ? 'text-neon-danger'
                      : 'text-neon-blue';
    });

    document.getElementById('photosynthesis-toggle').addEventListener('change', e => {
        photosynthesisEnabled = e.target.checked;
        if (!photosynthesisEnabled)
            setText('hibernate-status', 'Photosynthesis mode DISABLED', 'status-subtext text-gray');
    });
}

// ═══════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    initMap();
    bindControls();
    updateRegionCards();

    requestAnimationFrame(drawCanvas);
    setInterval(tickSimulation, 1500);
});
