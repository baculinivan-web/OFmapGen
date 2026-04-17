const COLORS = {
  water:    [18,  15,  34],
  plain:    [140, 170, 88],
  highland: [176, 159, 114],
  mountain: [190, 190, 190],
};

function filterSmallRegions(zones, width, height, minSize) {
  const visited = new Int32Array(width * height);
  const result  = new Uint8Array(zones);
  let labelId   = 0;
  for (let start = 0; start < width * height; start++) {
    if (visited[start]) continue;
    labelId++;
    const zone = zones[start];
    const stack = [start], cells = [];
    visited[start] = labelId;
    while (stack.length) {
      const idx = stack.pop(); cells.push(idx);
      const x = idx % width, y = (idx / width) | 0;
      const nb = [x>0?idx-1:-1, x<width-1?idx+1:-1, y>0?idx-width:-1, y<height-1?idx+width:-1];
      for (const n of nb) if (n>=0 && !visited[n] && zones[n]===zone) { visited[n]=labelId; stack.push(n); }
    }
    if (cells.length < minSize) {
      const freq = {};
      for (const idx of cells) {
        const x = idx % width, y = (idx / width) | 0;
        const nb = [x>0?idx-1:-1, x<width-1?idx+1:-1, y>0?idx-width:-1, y<height-1?idx+width:-1];
        for (const n of nb) if (n>=0 && zones[n]!==zone) freq[zones[n]] = (freq[zones[n]]||0)+1;
      }
      let best = zone, bestCount = 0;
      for (const [z,c] of Object.entries(freq)) if (c>bestCount) { bestCount=c; best=+z; }
      for (const idx of cells) result[idx] = best;
    }
  }
  return result;
}

function smoothPass(zones, width, height) {
  const out = new Uint8Array(zones);
  for (let y=1; y<height-1; y++) for (let x=1; x<width-1; x++) {
    const i = y*width+x, freq = {};
    for (const n of [i-1,i+1,i-width,i+width]) freq[zones[n]] = (freq[zones[n]]||0)+1;
    let best=zones[i], bestC=0;
    for (const [z,c] of Object.entries(freq)) if (c>bestC) { bestC=c; best=+z; }
    if (bestC===4) out[i]=best;
  }
  return out;
}

function smoothPassMasked(zones, width, height, mask) {
  const out = new Uint8Array(zones);
  for (let y=1; y<height-1; y++) for (let x=1; x<width-1; x++) {
    const i = y*width+x;
    if (mask[i]===0) continue;
    const freq = {};
    for (const n of [i-1,i+1,i-width,i+width]) freq[zones[n]] = (freq[zones[n]]||0)+1;
    let best=zones[i], bestC=0;
    for (const [z,c] of Object.entries(freq)) if (+c>bestC) { bestC=+c; best=+z; }
    if (bestC>=3) out[i]=best;
  }
  return out;
}

self.onmessage = function({ data }) {
  const { src, width, height, w, p, h, invert, algo, minSize, passes, aiMask } = data;

  const br = new Float32Array(width * height);
  for (let i=0; i<width*height; i++) {
    const si=i*4, b=(src[si]+src[si+1]+src[si+2])/(3*255);
    br[i] = invert ? 1-b : b;
  }

  let zones = new Uint8Array(width * height);
  for (let i=0; i<width*height; i++) {
    const b=br[i]; zones[i] = b<=w?0:b<=p?1:b<=h?2:3;
  }

  if (algo === 'smooth') {
    zones = filterSmallRegions(zones, width, height, minSize);
    for (let i=0; i<passes; i++) zones = smoothPass(zones, width, height);
  } else if (algo === 'advanced' && aiMask) {
    const mask = new Uint8Array(aiMask);
    for (let i=0; i<zones.length; i++) if (mask[i]===0) zones[i]=0;
    for (let i=0; i<3; i++) zones = smoothPassMasked(zones, width, height, mask);
    zones = filterSmallRegions(zones, width, height, 30);
  }

  const ZONE_COLORS = [COLORS.water, COLORS.plain, COLORS.highland, COLORS.mountain];
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i=0; i<width*height; i++) {
    const si=i*4, c=ZONE_COLORS[zones[i]];
    pixels[si]=c[0]; pixels[si+1]=c[1]; pixels[si+2]=c[2]; pixels[si+3]=255;
  }

  self.postMessage({ pixels, width, height }, [pixels.buffer]);
};
