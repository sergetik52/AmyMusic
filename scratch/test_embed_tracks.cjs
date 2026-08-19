const fs = require('fs');
const html = fs.readFileSync('scratch/spot_embed.html', 'utf8');

const regex = /"name":"([^"]+)"\s*,\s*"artists"/g;
let match;
const tracks = [];
while ((match = regex.exec(html)) !== null) {
    tracks.push(match[1]);
}
console.log('Found tracks:', tracks.length);
console.log(tracks.slice(0, 10));
