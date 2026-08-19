const fs = require('fs');
const html = fs.readFileSync('scratch/spot_embed.html', 'utf8');

const match = html.match(/<script id="initial-state" type="text\/plain">([\s\S]*?)<\/script>/);
if (match) {
    const data = JSON.parse(decodeURIComponent(match[1]));
    console.log(data.data.entity.name);
    console.log(data.data.entity.trackList.length);
    console.log(data.data.entity.trackList[0].title);
} else {
    console.log("No initial-state found");
}
