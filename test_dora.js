import { searchAlbums, getAlbumDetails } from './src/services/soundcloudApi.js';

async function test() {
  console.log("Searching for Dora LOVESONGS...");
  const albums = await searchAlbums("Dora LOVESONGS");
  if (!albums || albums.length === 0) {
    console.log("Not found");
    return;
  }
  
  const album = albums[0];
  console.log("Found album:", album.title, album.permalinkUrl);
  
  const details = await getAlbumDetails(album);
  console.log("Tracks in album:", details.tracks?.length);
  details.tracks.forEach((t, i) => {
    console.log(`${i + 1}. ${t.title}`);
  });
}

test().catch(console.error);
