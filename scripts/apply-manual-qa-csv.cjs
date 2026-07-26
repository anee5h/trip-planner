const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const csvPath = "/home/aneesh/Downloads/manual_image_qa_updated-0727.csv";
const destPath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);

let destinations = JSON.parse(fs.readFileSync(destPath, "utf8"));
const csvContent = fs.readFileSync(csvPath, "utf-8");

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const regex = /(?:^|,)(?:"([^"]*)"|([^,]*))/g;
    let match;
    const row = [];
    while ((match = regex.exec(lines[i])) !== null) {
      let value = match[1] !== undefined ? match[1] : match[2];
      row.push(value !== undefined ? value : "");
    }
    if (row.length > 1) {
      rows.push(row);
    }
  }
  return rows;
}

function checkUrl(url) {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith("https") ? https : http;
      const req = client.request(
        url,
        {
          method: "HEAD",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
        },
        (res) => {
          resolve({ url, status: res.statusCode });
        },
      );
      req.on("error", (err) =>
        resolve({ url, status: "ERROR", error: err.message }),
      );
      req.setTimeout(5000, () => {
        req.destroy();
        resolve({ url, status: "TIMEOUT" });
      });
      req.end();
    } catch (e) {
      resolve({ url, status: "EXCEPTION", error: e.message });
    }
  });
}

async function run() {
  const rows = parseCsv(csvContent);
  let updatedCount = 0;

  for (const r of rows) {
    const id = r[0];
    const status = r[7];
    let replacement = r[8] ? r[8].trim() : "";

    if (
      replacement &&
      (replacement.startsWith("http://") || replacement.startsWith("https://"))
    ) {
      // Scale 250px or 330px thumbnail URLs to 1280px / 1920px for high-res crisp display
      replacement = replacement
        .replace(/\/250px-/g, "/1280px-")
        .replace(/\/330px-/g, "/1280px-");

      const checkRes = await checkUrl(replacement);
      console.log(
        `[${id}] Checking URL: ${replacement} -> Status: ${checkRes.status}`,
      );

      const dest = destinations.find((d) => d.id === id);
      if (dest) {
        dest.heroImage = replacement;
        dest.image = replacement;
        dest.gallery = [replacement];
        updatedCount++;
        console.log(`  ✅ Updated ${id} heroImage to ${replacement}`);
      }
    }
  }

  fs.writeFileSync(destPath, JSON.stringify(destinations, null, 2));
  console.log(
    `\nSuccessfully applied ${updatedCount} image replacements to destinations-index.json!`,
  );
}

run();
