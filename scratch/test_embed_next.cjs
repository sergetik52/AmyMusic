const fs = require('fs');
const html = fs.readFileSync('scratch/spot_embed.html', 'utf8');

const startStr = '<script id="__NEXT_DATA__" type="application/json">';
const start = html.indexOf(startStr);
if (start > -1) {
    const end = html.indexOf('</script>', start);
    const jsonStr = html.substring(start + startStr.length, end);
    const data = JSON.parse(jsonStr);
    console.log("Keys:", Object.keys(data.props.pageProps));
    console.log("State:", Object.keys(data.props.pageProps.state));
    console.log("State data entity:", Object.keys(data.props.pageProps.state.data.entity));
    if (data.props.pageProps.state.data.entity.trackList) {
        console.log("TrackList length:", data.props.pageProps.state.data.entity.trackList.length);
        console.log("First track:", data.props.pageProps.state.data.entity.trackList[0].title);
    }
} else {
    console.log("NOT FOUND");
}
