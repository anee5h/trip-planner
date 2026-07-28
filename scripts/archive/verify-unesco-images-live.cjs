const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const destPath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
let destinations = JSON.parse(fs.readFileSync(destPath, "utf8"));

const unescoDests = destinations.filter(
  (d) =>
    d.collections &&
    d.collections.some((c) => c.collectionId === "unesco-japan"),
);

console.log(
  `Checking live image status for ${unescoDests.length} UNESCO destinations...`,
);

function checkUrl(url) {
  return new Promise((resolve) => {
    try {
      const req = https.request(
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
      req.setTimeout(4000, () => {
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
  for (const d of unescoDests) {
    const res = await checkUrl(d.heroImage);
    console.log(
      `[${d.id}] ${d.name} -> Status: ${res.status} | URL: ${d.heroImage}`,
    );
  }
}

run();
