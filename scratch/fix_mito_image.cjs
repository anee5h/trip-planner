const fs = require('fs');
const path = require('path');

const destIndexPath = path.join(__dirname, '../src/shared/data/destinations-index.json');
const publicDir = path.join(__dirname, '../public/data/destinations');
const destinations = JSON.parse(fs.readFileSync(destIndexPath, 'utf-8'));

const mito = destinations.find(d => d.id === 'mito-city');
if (mito && mito.gallery) {
  mito.gallery = mito.gallery.map(url =>
    url.includes('1528164344705-475426879e0d')
      ? 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&q=80&w=1200'
      : url
  );
}

fs.writeFileSync(destIndexPath, JSON.stringify(destinations, null, 2), 'utf-8');

for (const dest of destinations) {
  const filePath = path.join(publicDir, `${dest.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(dest, null, 2), 'utf-8');
}

console.log("Replaced broken Mito city gallery image!");
