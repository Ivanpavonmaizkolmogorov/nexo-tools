const fs = require('fs');
const lines = fs.readFileSync('js/app.js', 'utf8').split('\n');

// Find the LAST "document.addEventListener('DOMContentLoaded'" - that's where the clean file ends
let lastBootstrap = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes("document.addEventListener('DOMContentLoaded'")) {
    lastBootstrap = i;
    break;
  }
}

// Find the FIRST one (the good one)
let firstBootstrap = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("document.addEventListener('DOMContentLoaded'")) {
    firstBootstrap = i;
    break;
  }
}

console.log('First bootstrap at line', firstBootstrap + 1);
console.log('Last bootstrap at line', lastBootstrap + 1);

// Keep everything up to first bootstrap + 1 blank line
const clean = lines.slice(0, firstBootstrap + 2);
fs.writeFileSync('js/app.js', clean.join('\n'), 'utf8');
console.log('Cleaned! Lines before:', lines.length, '-> after:', clean.length);
