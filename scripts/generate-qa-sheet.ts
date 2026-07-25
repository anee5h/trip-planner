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
  fs.writeFileSync(csvPath, csvRows.join("\n"), "utf-8");

  // 2. Generate Interactive HTML QA Audit Dashboard with 1-Click Action Buttons
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TabiMap Image Manual QA Dashboard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
    h1 { margin-bottom: 5px; color: #38bdf8; }
    p { color: #94a3b8; font-size: 14px; }
    .controls { background: #1e293b; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; gap: 15px; align-items: center; position: sticky; top: 10px; z-index: 100; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
    .card { background: #1e293b; border-radius: 12px; overflow: hidden; border: 2px solid #334155; display: flex; flex-direction: column; transition: all 0.2s; }
    .card img { width: 100%; height: 200px; object-fit: cover; background: #020617; }
    .card-body { padding: 15px; flex: 1; display: flex; flex-direction: column; gap: 10px; }
    .title { font-weight: bold; font-size: 16px; color: #f1f5f9; margin: 0; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; background: #334155; color: #cbd5e1; }
    .btn-group { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 5px; }
    .action-btn { padding: 8px; border-radius: 6px; border: 1px solid #475569; font-weight: bold; font-size: 12px; cursor: pointer; text-align: center; background: #0f172a; color: #cbd5e1; transition: all 0.15s; }
    .action-btn:hover { background: #334155; }
    .action-btn.active-ok { background: #059669; color: white; border-color: #10b981; }
    .action-btn.active-broken { background: #dc2626; color: white; border-color: #ef4444; }
    .action-btn.active-wrong { background: #ea580c; color: white; border-color: #f97316; }
    .action-btn.active-low { background: #d97706; color: white; border-color: #f59e0b; }
    input { background: #0f172a; color: #f8fafc; border: 1px solid #475569; padding: 8px; border-radius: 6px; font-size: 13px; width: 100%; box-sizing: border-box; }
    .export-btn { background: #0284c7; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; }
    .export-btn:hover { background: #0369a1; }
  </style>
</head>
<body>
  <h1>📸 TabiMap Manual Image QA Dashboard</h1>
  <p>Review destination hero images below. Click an action button to flag broken/wrong/low quality images, then export CSV.</p>

  <div class="controls">
    <button class="export-btn" onclick="exportUpdatedCSV()">📥 Export Updated CSV for Excel</button>
    <span id="counter" style="color: #94a3b8; font-size: 14px;">Total Destinations: ${destinations.length}</span>
  </div>

  <div class="grid" id="destGrid"></div>

  <script>
    const destinations = ${JSON.stringify(destinations)};
    const grid = document.getElementById('destGrid');

    destinations.forEach(d => {
      const imgUrl = d.heroImage || d.image || (d.gallery && d.gallery[0]) || '';
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = d.id;
      card.dataset.status = 'OK';
      card.innerHTML = \`
        <img src="\${imgUrl}" alt="\${d.name}" onerror="this.src='https://via.placeholder.com/400x200?text=BROKEN+IMAGE+404'" />
        <div class="card-body">
          <div>
            <h3 class="title">\${d.name}</h3>
            <span class="badge">\${d.kind}</span>
            <span class="badge">\${d.prefecture}</span>
          </div>
          <div class="btn-group">
            <button class="action-btn active-ok" onclick="setStatus(this, 'OK')">✅ OK</button>
            <button class="action-btn" onclick="setStatus(this, 'BROKEN')">❌ BROKEN</button>
            <button class="action-btn" onclick="setStatus(this, 'WRONG_LANDMARK')">📍 WRONG</button>
            <button class="action-btn" onclick="setStatus(this, 'BAD_CONTENT')">⚠️ LOW QUALITY</button>
          </div>
          <input type="text" class="qa-replacement" placeholder="Notes / Replacement URL..." />
        </div>
      \`;
      grid.appendChild(card);
    });

    function setStatus(btn, status) {
      const card = btn.closest('.card');
      card.dataset.status = status;
      const btns = card.querySelectorAll('.action-btn');
      btns.forEach(b => b.className = 'action-btn');

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
    }

    function exportUpdatedCSV() {
      const headers = ["Destination ID", "Name", "Kind", "Role", "Prefecture", "Region", "Hero Image URL", "Image Status (OK / BROKEN / BAD_CONTENT / WRONG_LANDMARK)", "Replacement Image URL or Notes"];
      const rows = [headers.map(h => '"' + h + '"').join(",")];

      document.querySelectorAll('.card').forEach(card => {
        const id = card.dataset.id;
        const d = destinations.find(x => x.id === id);
        const status = card.dataset.status;
        const replacement = card.querySelector('.qa-replacement').value.replace(/"/g, '""');

        const row = [
          '"' + d.id + '"',
          '"' + d.name.replace(/"/g, '""') + '"',
          '"' + (d.kind || '') + '"',
          '"' + (d.role || '') + '"',
          '"' + (d.prefecture || '') + '"',
          '"' + (d.region || '') + '"',
          '"' + (d.heroImage || d.image || '') + '"',
          '"' + status + '"',
          '"' + replacement + '"'
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
  </script>
</body>
</html>`;

  const htmlPath = path.join(reportsDir, "manual_image_qa.html");
  fs.writeFileSync(htmlPath, html, "utf-8");

  console.log(`✅ CSV generated: ${csvPath}`);
  console.log(
    `✅ Updated Interactive 1-Click Button HTML Dashboard generated: ${htmlPath}`,
  );
}

generateQASheet();
