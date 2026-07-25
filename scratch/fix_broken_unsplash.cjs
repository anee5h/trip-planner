const fs = require('fs');
const path = require('path');

const destIndexPath = path.join(__dirname, '../src/shared/data/destinations-index.json');
const publicDir = path.join(__dirname, '../public/data/destinations');
const destinations = JSON.parse(fs.readFileSync(destIndexPath, 'utf-8'));

const BROKEN_URL = "https://images.unsplash.com/photo-1576675784201-0e169823bb03?auto=format&fit=crop&q=80&w=1200";

const REPLACEMENTS = {
  "osaka-castle": "https://images.unsplash.com/photo-1590559899731-a382839e5549?auto=format&fit=crop&q=80&w=1200",
  "kamakura-city": "https://images.unsplash.com/photo-1570191830504-370011e97e85?auto=format&fit=crop&q=80&w=1200",
  "kinugawa-onsen": "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&q=80&w=1200",
  "suginami-city": "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&q=80&w=1200",
  "koya-town": "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&q=80&w=1200"
};

for (const dest of destinations) {
  const newUrl = REPLACEMENTS[dest.id] || "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&q=80&w=1200";

  if (dest.heroImage && dest.heroImage.includes('photo-1576675784201-0e169823bb03')) {
    dest.heroImage = newUrl;
  }
  if (dest.image && dest.image.includes('photo-1576675784201-0e169823bb03')) {
    dest.image = newUrl;
  }
  if (dest.gallery) {
    dest.gallery = dest.gallery.map(url => url.includes('photo-1576675784201-0e169823bb03') ? newUrl : url);
  }
}

fs.writeFileSync(destIndexPath, JSON.stringify(destinations, null, 2), 'utf-8');

for (const dest of destinations) {
  const filePath = path.join(publicDir, `${dest.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(dest, null, 2), 'utf-8');
}

console.log("Replaced 404 Unsplash links across all destinations!");
