import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

async function generateQASheet() {
  const rootDir = process.cwd();
  const destIndexPath = path.join(
    rootDir,
    "src/shared/data/destinations-index.json",
  );
  const destinations = JSON.parse(
    fs.readFileSync(destIndexPath, "utf-8"),
  ) as Destination[];

  const reportsDir = path.join(rootDir, "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // 1. Generate CSV for Excel
  const csvHeaders = [
    "Destination ID",
    "Name",
    "Kind",
    "Role",
    "Prefecture",
    "Region",
    "Hero Image URL",
    "Image Status (OK / BROKEN / BAD_CONTENT / WRONG_LANDMARK)",
    "Replacement Image URL or Notes",
  ];

  function escapeCsvCell(cell: string | undefined): string {
    if (!cell) return '""';
    const str = String(cell).replace(/"/g, '""');
    return `"${str}"`;
  }

  const csvRows = [csvHeaders.map((h) => `"${h}"`).join(",")];

  for (const d of destinations) {
    const row = [
      escapeCsvCell(d.id),
      escapeCsvCell(d.name),
      escapeCsvCell(d.kind),
      escapeCsvCell(d.role),
      escapeCsvCell(d.prefecture),
      escapeCsvCell(d.region),
      escapeCsvCell(
        d.heroImage || d.image || (d.gallery && d.gallery[0]) || "",
      ),
      `"OK"`,
      `""`,
    ];
    csvRows.push(row.join(","));
  }

  const csvPath = path.join(reportsDir, "manual_image_qa.csv");
  fs.writeFileSync(csvPath, csvRows.join("\n"), "utf-8"); // 2. Generate Interactive HTML QA Audit Dashboard with 1-Click Action Buttons & Advanced Filtering/Sorting
  const destinationsWithOrder = destinations.map((d, idx) => ({
    ...d,
    addedOrder: idx + 1,
  }));

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TabiMap Image Manual QA Dashboard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
    header { margin-bottom: 15px; }
    h1 { margin: 0 0 5px 0; color: #38bdf8; font-size: 24px; display: flex; align-items: center; gap: 10px; }
    p { color: #94a3b8; font-size: 14px; margin: 0; }
    
    .controls { background: #1e293b; padding: 16px; border-radius: 12px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; position: sticky; top: 10px; z-index: 100; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); border: 1px solid #334155; }
    .control-group { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    
    .filter-pill { padding: 6px 14px; border-radius: 20px; border: 1px solid #334155; font-size: 13px; font-weight: bold; cursor: pointer; background: #0f172a; color: #94a3b8; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
    .filter-pill:hover { background: #334155; color: #f8fafc; }
    .filter-pill.active { background: #0284c7; color: white; border-color: #38bdf8; shadow: 0 0 10px rgba(56, 189, 248, 0.3); }
    .filter-pill.ok.active { background: #059669; border-color: #10b981; }
    .filter-pill.wrong.active { background: #ea580c; border-color: #f97316; }
    .filter-pill.low.active { background: #d97706; border-color: #f59e0b; }
    .filter-pill.broken.active { background: #dc2626; border-color: #ef4444; }

    select, input[type="text"] { background: #0f172a; color: #f8fafc; border: 1px solid #334155; padding: 8px 12px; border-radius: 8px; font-size: 13px; outline: none; }
    select:focus, input[type="text"]:focus { border-color: #38bdf8; }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
    .card { background: #1e293b; border-radius: 12px; overflow: hidden; border: 2px solid #334155; display: flex; flex-direction: column; transition: all 0.2s; position: relative; }
    .card img { width: 100%; height: 210px; object-fit: cover; background: #020617; }
    .card-body { padding: 15px; flex: 1; display: flex; flex-direction: column; gap: 10px; }
    
    .card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .title { font-weight: bold; font-size: 15px; color: #f1f5f9; margin: 0; line-height: 1.3; }
    .added-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #0f172a; color: #38bdf8; font-weight: bold; border: 1px solid #0284c7; shrink: 0; }
    
    .badges { display: flex; gap: 6px; flex-wrap: wrap; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; background: #0f172a; color: #cbd5e1; border: 1px solid #334155; }
    
    .btn-group { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 5px; }
    .action-btn { padding: 7px; border-radius: 6px; border: 1px solid #475569; font-weight: bold; font-size: 12px; cursor: pointer; text-align: center; background: #0f172a; color: #cbd5e1; transition: all 0.15s; }
    .action-btn:hover { background: #334155; }
    .action-btn.active-ok { background: #059669; color: white; border-color: #10b981; }
    .action-btn.active-broken { background: #dc2626; color: white; border-color: #ef4444; }
    .action-btn.active-wrong { background: #ea580c; color: white; border-color: #f97316; }
    .action-btn.active-low { background: #d97706; color: white; border-color: #f59e0b; }
    
    .export-btn { background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 13px; display: flex; align-items: center; gap: 6px; }
    .export-btn:hover { background: #0369a1; }
  </style>
</head>
<body>
  <header>
    <h1>📸 TabiMap Manual Image QA Dashboard</h1>
    <p>Review destination hero images below. Filter by QA status, sort by date added, or search destination names.</p>
  </header>

  <div class="controls">
    <div class="control-group">
      <div class="filter-pills">
        <button class="filter-pill active" data-filter="ALL" onclick="setFilter('ALL')">All (<span id="cnt-all">0</span>)</button>
        <button class="filter-pill ok" data-filter="OK" onclick="setFilter('OK')">✅ OK (<span id="cnt-ok">0</span>)</button>
        <button class="filter-pill wrong" data-filter="WRONG_LANDMARK" onclick="setFilter('WRONG_LANDMARK')">📍 WRONG (<span id="cnt-wrong">0</span>)</button>
        <button class="filter-pill low" data-filter="BAD_CONTENT" onclick="setFilter('BAD_CONTENT')">⚠️ LOW QUALITY (<span id="cnt-low">0</span>)</button>
        <button class="filter-pill broken" data-filter="BROKEN" onclick="setFilter('BROKEN')">❌ BROKEN (<span id="cnt-broken">0</span>)</button>
      </div>
    </div>

    <div class="control-group">
      <select id="sortSelect" onchange="renderGrid()">
        <option value="newest">🕒 Newest Added First</option>
        <option value="oldest">📜 Oldest Added First</option>
        <option value="name">🔤 Name (A-Z)</option>
        <option value="pref">🗺️ Prefecture</option>
      </select>

      <input type="text" id="searchInput" placeholder="Search destination, ID, prefecture..." oninput="renderGrid()" style="width: 220px;" />

      <button class="export-btn" onclick="exportUpdatedCSV()">📥 Export CSV</button>
    </div>
  </div>

  <div class="grid" id="destGrid"></div>

  <script>
    const destinations = ${JSON.stringify(destinationsWithOrder)};
    const grid = document.getElementById('destGrid');
    let currentFilter = 'ALL';

    // Load saved statuses from localStorage
    const savedState = JSON.parse(localStorage.getItem('tabimap_qa_state') || '{}');

    destinations.forEach(d => {
      if (savedState[d.id]) {
        d.qaStatus = savedState[d.id].status || 'OK';
        d.qaNotes = savedState[d.id].notes || '';
      } else {
        d.qaStatus = 'OK';
        d.qaNotes = '';
      }
    });

    function saveState() {
      const state = {};
      destinations.forEach(d => {
        state[d.id] = { status: d.qaStatus, notes: d.qaNotes };
      });
      localStorage.setItem('tabimap_qa_state', JSON.stringify(state));
    }

    function updateCounters() {
      let cntAll = destinations.length;
      let cntOk = 0, cntWrong = 0, cntLow = 0, cntBroken = 0;
      
      destinations.forEach(d => {
        if (d.qaStatus === 'OK') cntOk++;
        else if (d.qaStatus === 'WRONG_LANDMARK') cntWrong++;
        else if (d.qaStatus === 'BAD_CONTENT') cntLow++;
        else if (d.qaStatus === 'BROKEN') cntBroken++;
      });

      document.getElementById('cnt-all').innerText = cntAll;
      document.getElementById('cnt-ok').innerText = cntOk;
      document.getElementById('cnt-wrong').innerText = cntWrong;
      document.getElementById('cnt-low').innerText = cntLow;
      document.getElementById('cnt-broken').innerText = cntBroken;
    }

    function handleImageError(imgEl, destId) {
      imgEl.src = 'https://via.placeholder.com/400x210/020617/ef4444?text=BROKEN+IMAGE+404';
      const d = destinations.find(x => x.id === destId);
      if (d && d.qaStatus === 'OK') {
        d.qaStatus = 'BROKEN';
        saveState();
        updateCounters();
        const card = document.querySelector(\`.card[data-id="\${destId}"]\`);
        if (card) {
          card.dataset.status = 'BROKEN';
          card.style.border = '2px solid #ef4444';
          const btns = card.querySelectorAll('.action-btn');
          btns.forEach(b => b.className = 'action-btn');
          const brokenBtn = card.querySelector('.btn-broken');
          if (brokenBtn) brokenBtn.classList.add('active-broken');
        }
      }
    }

    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.filter === filter);
      });
      renderGrid();
    }

    function setStatus(btn, destId, status) {
      const d = destinations.find(x => x.id === destId);
      if (!d) return;
      
      d.qaStatus = status;
      saveState();
      updateCounters();

      const card = btn.closest('.card');
      card.dataset.status = status;
      const btns = card.querySelectorAll('.action-btn');
      btns.forEach(b => b.className = 'action-btn ' + (b.dataset.btnType ? 'btn-' + b.dataset.btnType : ''));

      if (status === 'OK') {
        btn.classList.add('active-ok');
        card.style.border = '2px solid #334155';
      } else if (status === 'BROKEN') {
        btn.classList.add('active-broken');
        card.style.border = '2px solid #ef4444';
      } else if (status === 'WRONG_LANDMARK') {
        btn.classList.add('active-wrong');
        card.style.border = '2px solid #f97316';
      } else if (status === 'BAD_CONTENT') {
        btn.classList.add('active-low');
        card.style.border = '2px solid #f59e0b';
      }

      if (currentFilter !== 'ALL' && currentFilter !== status) {
        card.style.display = 'none';
      }
    }

    function renderGrid() {
      const sortVal = document.getElementById('sortSelect').value;
      const searchVal = document.getElementById('searchInput').value.toLowerCase().trim();
      grid.innerHTML = '';

      let list = [...destinations];

      // Sort
      if (sortVal === 'newest') {
        list.sort((a, b) => b.addedOrder - a.addedOrder);
      } else if (sortVal === 'oldest') {
        list.sort((a, b) => a.addedOrder - b.addedOrder);
      } else if (sortVal === 'name') {
        list.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortVal === 'pref') {
        list.sort((a, b) => (a.prefecture || '').localeCompare(b.prefecture || ''));
      }

      // Filter
      list.forEach(d => {
        if (currentFilter !== 'ALL' && d.qaStatus !== currentFilter) return;

        if (searchVal) {
          const matchName = d.name.toLowerCase().includes(searchVal);
          const matchId = d.id.toLowerCase().includes(searchVal);
          const matchPref = (d.prefecture || '').toLowerCase().includes(searchVal);
          if (!matchName && !matchId && !matchPref) return;
        }

        const imgUrl = d.heroImage || d.image || (d.gallery && d.gallery[0]) || '';
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.id = d.id;
        card.dataset.status = d.qaStatus;

        let borderColor = '#334155';
        if (d.qaStatus === 'BROKEN') borderColor = '#ef4444';
        else if (d.qaStatus === 'WRONG_LANDMARK') borderColor = '#f97316';
        else if (d.qaStatus === 'BAD_CONTENT') borderColor = '#f59e0b';
        card.style.border = '2px solid ' + borderColor;

        card.innerHTML = \`
          <img src="\${imgUrl}" alt="\${d.name}" onerror="handleImageError(this, '\${d.id}')" />
          <div class="card-body">
            <div class="card-header">
              <h3 class="title">\${d.name}</h3>
              <span class="added-badge">#\${d.addedOrder}</span>
            </div>
            <div class="badges">
              <span class="badge">\${d.kind || d.role || 'POI'}</span>
              <span class="badge">\${d.prefecture || ''}</span>
              <span class="badge">\${d.id}</span>
            </div>
            <div class="btn-group">
              <button class="action-btn btn-ok \${d.qaStatus === 'OK' ? 'active-ok' : ''}" data-btn-type="ok" onclick="setStatus(this, '\${d.id}', 'OK')">✅ OK</button>
              <button class="action-btn btn-broken \${d.qaStatus === 'BROKEN' ? 'active-broken' : ''}" data-btn-type="broken" onclick="setStatus(this, '\${d.id}', 'BROKEN')">❌ BROKEN</button>
              <button class="action-btn btn-wrong \${d.qaStatus === 'WRONG_LANDMARK' ? 'active-wrong' : ''}" data-btn-type="wrong" onclick="setStatus(this, '\${d.id}', 'WRONG_LANDMARK')">📍 WRONG</button>
              <button class="action-btn btn-low \${d.qaStatus === 'BAD_CONTENT' ? 'active-low' : ''}" data-btn-type="low" onclick="setStatus(this, '\${d.id}', 'BAD_CONTENT')">⚠️ LOW</button>
            </div>
            <input type="text" class="qa-replacement" placeholder="Notes / Replacement URL..." value="\${d.qaNotes}" onchange="d.qaNotes = this.value; saveState();" />
          </div>
        \`;
        grid.appendChild(card);
      });

      updateCounters();
    }

    function exportUpdatedCSV() {
      const headers = ["Destination ID", "Name", "Kind", "Role", "Prefecture", "Region", "Hero Image URL", "Image Status (OK / BROKEN / BAD_CONTENT / WRONG_LANDMARK)", "Replacement Image URL or Notes"];
      const rows = [headers.map(h => '"' + h + '"').join(",")];

      destinations.forEach(d => {
        const row = [
          '"' + d.id + '"',
          '"' + d.name.replace(/"/g, '""') + '"',
          '"' + (d.kind || '') + '"',
          '"' + (d.role || '') + '"',
          '"' + (d.prefecture || '') + '"',
          '"' + (d.region || '') + '"',
          '"' + (d.heroImage || d.image || '') + '"',
          '"' + d.qaStatus + '"',
          '"' + (d.qaNotes || '').replace(/"/g, '""') + '"'
        ];
        rows.push(row.join(","));
      });

      const blob = new Blob([rows.join("\\n")], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'manual_image_qa_updated.csv';
      a.click();
    }

    renderGrid();
  </script>
</body>
</html>`;

  const htmlPath = path.join(reportsDir, "manual_image_qa.html");
  fs.writeFileSync(htmlPath, html, "utf-8");

  console.log(`✅ CSV generated: ${csvPath}`);
  console.log(
    `✅ Enhanced Interactive Image QA Dashboard generated: ${htmlPath}`,
  );
}

generateQASheet();
