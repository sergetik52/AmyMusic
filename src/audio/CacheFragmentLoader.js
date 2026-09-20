import Hls from "hls.js";

// HLS Custom Fragment Loader that uses the browser's CacheStorage
// to cache and serve .ts chunks. Works perfectly in Electron's file:// protocol.
export class CacheFragmentLoader extends Hls.DefaultConfig.loader {
  constructor(config) {
    super(config);
    this.originalLoad = this.load.bind(this);
    this.isAudioCacheEnabled = typeof localStorage !== 'undefined' 
      ? localStorage.getItem('amymusic.audioCacheEnabled') !== 'false' 
      : true;
  }

  load(context, config, callbacks) {
    const isAudioCacheEnabled = typeof localStorage !== 'undefined' 
      ? localStorage.getItem('amymusic.audioCacheEnabled') !== 'false' 
      : true;

    if (!isAudioCacheEnabled || typeof caches === 'undefined' || context.type !== 'fragment') {
      return this.originalLoad(context, config, callbacks);
    }

    const reqUrl = context.url;

    caches.open('amymusic-audio-cache-v1').then(cache => {
      cache.match(reqUrl).then(cachedResp => {
        if (cachedResp) {
          cachedResp.arrayBuffer().then(buffer => {
            const data = buffer;
            const stats = {
              trequest: performance.now(),
              tfirst: performance.now(),
              tload: performance.now(),
              loaded: data.byteLength,
              total: data.byteLength
            };
            callbacks.onSuccess({ url: reqUrl, data }, stats, context, null);
          }).catch(() => {
            this._fallbackToNetwork(cache, reqUrl, context, config, callbacks);
          });
        } else {
          this._fallbackToNetwork(cache, reqUrl, context, config, callbacks);
        }
      }).catch(() => {
        this._fallbackToNetwork(cache, reqUrl, context, config, callbacks);
      });
    }).catch(() => {
      this.originalLoad(context, config, callbacks);
    });
  }

  _fallbackToNetwork(cache, reqUrl, context, config, callbacks) {
    const originalOnSuccess = callbacks.onSuccess;
    callbacks.onSuccess = (response, stats, ctx, networkDetails) => {
      if (response && response.data) {
        // Need to duplicate arrayBuffer because hls.js will take ownership
        const bufferCopy = response.data.slice(0);
        cache.put(reqUrl, new Response(bufferCopy, {
          headers: { 'Content-Type': 'video/MP2T' }
        })).catch(err => console.warn('HLS cache put error', err));
      }
      originalOnSuccess(response, stats, ctx, networkDetails);
    };
    this.originalLoad(context, config, callbacks);
  }
}
