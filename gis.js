// GIS modal: Leaflet map, bbox selection, Terrarium elevation tiles, OSM rivers
// Depends on globals from app.js: srcCanvas, srcImageData, imgInfo, fileNameEl,
//   aiMask, clampedSize, setGisMode, scheduleRender

export function initGis({ srcCanvas, outCanvas, imgInfo, fileNameEl, getAiMask, setAiMask,
                           clampedSize, setGisMode, scheduleRender }) {

  const fromMapBtn    = document.getElementById('fromMapBtn');
  const gisModal      = document.getElementById('gisModal');
  const gisModalClose = document.getElementById('gisModalClose');
  const gisModalClose2= document.getElementById('gisModalClose2');
  const gisLoadBtn    = document.getElementById('gisLoadBtn');
  const gisStatus     = document.getElementById('gisStatus');

  let gisMap = null, drawnRect = null;

  function updateStatus() {
    if (!drawnRect) return;
    const b = drawnRect.getBounds();
    gisStatus.textContent = `${b.getSouth().toFixed(3)}°S  ${b.getNorth().toFixed(3)}°N  ${b.getWest().toFixed(3)}°W  ${b.getEast().toFixed(3)}°E`;
    gisLoadBtn.disabled = false;
  }

  function openGisModal() {
    gisModal.classList.add('open');
    if (!gisMap) {
      gisMap = L.map('gisMap').setView([20, 0], 2);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd', maxZoom: 19,
      }).addTo(gisMap);

      const drawnItems = new L.FeatureGroup();
      gisMap.addLayer(drawnItems);

      const drawControl = new L.Control.Draw({
        draw: {
          rectangle: { shapeOptions: { color: '#58a6ff', weight: 2 } },
          polyline: false, polygon: false, circle: false, circlemarker: false, marker: false,
        },
        edit: { featureGroup: drawnItems, remove: false },
      });
      gisMap.addControl(drawControl);

      const handleMarkers = [];

      function removeHandles() {
        handleMarkers.forEach(m => gisMap.removeLayer(m));
        handleMarkers.length = 0;
      }

      function addHandles(rect) {
        removeHandles();
        const b = rect.getBounds();
        let n = b.getNorth(), s = b.getSouth(), w = b.getWest(), e = b.getEast();

        const handleIcon = L.divIcon({
          className: '',
          html: '<div style="width:10px;height:10px;background:#58a6ff;border:2px solid #fff;border-radius:2px;cursor:crosshair;box-shadow:0 0 3px rgba(0,0,0,.5)"></div>',
          iconSize: [10, 10], iconAnchor: [5, 5],
        });

        const defs = [
          { lat: () => n, lng: () => w, setLat: v => { n = v; }, setLng: v => { w = v; } },
          { lat: () => n, lng: () => (w+e)/2, setLat: v => { n = v; }, setLng: null },
          { lat: () => n, lng: () => e, setLat: v => { n = v; }, setLng: v => { e = v; } },
          { lat: () => (n+s)/2, lng: () => e, setLat: null, setLng: v => { e = v; } },
          { lat: () => s, lng: () => e, setLat: v => { s = v; }, setLng: v => { e = v; } },
          { lat: () => s, lng: () => (w+e)/2, setLat: v => { s = v; }, setLng: null },
          { lat: () => s, lng: () => w, setLat: v => { s = v; }, setLng: v => { w = v; } },
          { lat: () => (n+s)/2, lng: () => w, setLat: null, setLng: v => { w = v; } },
        ];

        defs.forEach(def => {
          const m = L.marker([def.lat(), def.lng()], { icon: handleIcon, draggable: true, zIndexOffset: 1000 });
          m.on('drag', ev => {
            const ll = ev.target.getLatLng();
            if (def.setLat) def.setLat(ll.lat);
            if (def.setLng) def.setLng(ll.lng);
            if (n < s) { const t = n; n = s; s = t; }
            if (e < w) { const t = e; e = w; w = t; }
            rect.setBounds([[s, w], [n, e]]);
            handleMarkers.forEach((hm, i) => hm.setLatLng([defs[i].lat(), defs[i].lng()]));
            updateStatus();
          });
          m.addTo(gisMap);
          handleMarkers.push(m);
        });
      }

      gisMap.on(L.Draw.Event.CREATED, e => {
        if (drawnRect) { drawnItems.removeLayer(drawnRect); removeHandles(); }
        drawnRect = e.layer;
        drawnItems.addLayer(drawnRect);
        addHandles(drawnRect);
        updateStatus();
      });
    }
    setTimeout(() => gisMap.invalidateSize(), 100);
  }

  function closeGisModal() { gisModal.classList.remove('open'); }

  fromMapBtn.addEventListener('click', openGisModal);
  gisModalClose.addEventListener('click', closeGisModal);
  gisModalClose2.addEventListener('click', closeGisModal);
  gisModal.addEventListener('click', e => { if (e.target === gisModal) closeGisModal(); });

  gisLoadBtn.addEventListener('click', async () => {
    if (!drawnRect) return;
    const b = drawnRect.getBounds();
    const south = b.getSouth(), north = b.getNorth();
    const west  = b.getWest(),  east  = b.getEast();

    gisLoadBtn.disabled = true;
    gisStatus.textContent = `Loading: Loading elevation tiles…`;

    function lngToTileX(lng, z) { return Math.floor((lng + 180) / 360 * Math.pow(2, z)); }
    function latToTileY(lat, z) {
      const r = lat * Math.PI / 180;
      return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
    }

    let zoom = 5;
    for (let z = 14; z >= 3; z--) {
      const tileCount = (lngToTileX(east, z) - lngToTileX(west, z) + 1) *
                        (latToTileY(south, z) - latToTileY(north, z) + 1);
      if (tileCount <= 16) { zoom = z; break; }
    }

    const tx0 = lngToTileX(west, zoom),  tx1 = lngToTileX(east, zoom);
    const ty0 = latToTileY(north, zoom), ty1 = latToTileY(south, zoom);
    const tileW = tx1 - tx0 + 1, tileH = ty1 - ty0 + 1;
    const TILE = 256;

    gisStatus.textContent = `Loading: Loading ${tileW * tileH} tile(s) at zoom ${zoom}…`;

    try {
      const tileImgs = [];
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => { tileImgs.push({ tx, ty, img }); resolve(); };
            img.onerror = reject;
            img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${tx}/${ty}.png`;
          });
        }
      }

      const stitchW = tileW * TILE, stitchH = tileH * TILE;
      const stitchC = document.createElement('canvas');
      stitchC.width = stitchW; stitchC.height = stitchH;
      const sCtx = stitchC.getContext('2d');
      for (const { tx, ty, img } of tileImgs) {
        sCtx.drawImage(img, (tx - tx0) * TILE, (ty - ty0) * TILE);
      }

      function tileToLng(tx, z) { return tx / Math.pow(2, z) * 360 - 180; }
      function tileToLat(ty, z) {
        const n = Math.PI - 2 * Math.PI * ty / Math.pow(2, z);
        return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
      }

      const tileNorth = tileToLat(ty0, zoom), tileSouth = tileToLat(ty1 + 1, zoom);
      const tileWest  = tileToLng(tx0, zoom), tileEast  = tileToLng(tx1 + 1, zoom);

      const cropX = Math.round((west  - tileWest)  / (tileEast  - tileWest)  * stitchW);
      const cropY = Math.round((tileNorth - north)  / (tileNorth - tileSouth) * stitchH);
      const cropW = Math.round((east  - west)       / (tileEast  - tileWest)  * stitchW);
      const cropH = Math.round((north - south)      / (tileNorth - tileSouth) * stitchH);

      const rawData = sCtx.getImageData(cropX, cropY, cropW, cropH).data;

      const elevations = new Float32Array(cropW * cropH);
      for (let i = 0; i < cropW * cropH; i++) {
        const si = i * 4;
        elevations[i] = rawData[si] * 256 + rawData[si+1] + rawData[si+2] / 256 - 32768;
      }

      let maxE = 1;
      for (const e of elevations) if (e > maxE) maxE = e;

      const [tw, th] = clampedSize(cropW, cropH);
      const tmpC = document.createElement('canvas');
      tmpC.width = cropW; tmpC.height = cropH;
      const tmpCtx = tmpC.getContext('2d');
      const imgData = tmpCtx.createImageData(cropW, cropH);
      const d = imgData.data;

      for (let i = 0; i < cropW * cropH; i++) {
        const e = elevations[i];
        let v;
        if (e <= 0) {
          v = Math.max(0, Math.min(99, Math.round(99 * (1 + e / 200))));
        } else {
          const t = Math.sqrt(Math.min(e, maxE) / maxE);
          v = Math.round(102 + t * 153);
        }
        const si = i * 4;
        d[si] = d[si+1] = d[si+2] = v; d[si+3] = 255;
      }
      tmpCtx.putImageData(imgData, 0, 0);

      // Rivers + water bodies from Overpass
      gisStatus.textContent = `Loading: Loading rivers and water bodies from OpenStreetMap…`;
      try {
        const overpassQuery = `[out:json][timeout:30];(way["waterway"~"^(river|stream|canal|drain)$"](${south},${west},${north},${east});way["natural"~"^(water|wetland|bay)$"](${south},${west},${north},${east});way["water"~"^(lake|reservoir|pond|lagoon|oxbow|river)$"](${south},${west},${north},${east});relation["natural"~"^(water|wetland)$"](${south},${west},${north},${east}););out geom;`;
        const overpassResp = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST', body: overpassQuery,
        });
        if (overpassResp.ok) {
          const elements = (await overpassResp.json()).elements || [];
          if (elements.length > 0) {
            tmpCtx.putImageData(imgData, 0, 0);
            function latToMercY(lat) {
              const r = lat * Math.PI / 180;
              return Math.log(Math.tan(Math.PI / 4 + r / 2));
            }
            const northY = latToMercY(north), southY = latToMercY(south);

            // Helper: draw a geometry path
            function drawGeomPath(geometry) {
              if (!geometry || geometry.length < 2) return false;
              tmpCtx.beginPath();
              geometry.forEach((pt, k) => {
                const px = (pt.lon - west) / (east - west) * cropW;
                const py = (latToMercY(pt.lat) - northY) / (southY - northY) * cropH;
                k === 0 ? tmpCtx.moveTo(px, py) : tmpCtx.lineTo(px, py);
              });
              return true;
            }

            // First pass: fill water body polygons
            tmpCtx.fillStyle = 'rgb(20,20,30)';
            for (const el of elements) {
              const isWaterBody = el.tags?.natural === 'water' || el.tags?.natural === 'wetland' ||
                                  el.tags?.natural === 'bay' || el.tags?.water;
              if (!isWaterBody) continue;

              if (el.type === 'way' && el.geometry) {
                if (drawGeomPath(el.geometry)) {
                  tmpCtx.closePath();
                  tmpCtx.fill();
                }
              } else if (el.type === 'relation' && el.members) {
                // draw each outer member
                for (const member of el.members) {
                  if (member.role === 'outer' && member.geometry) {
                    if (drawGeomPath(member.geometry)) {
                      tmpCtx.closePath();
                      tmpCtx.fill();
                    }
                  }
                }
              }
            }

            // Second pass: stroke waterways (rivers/streams)
            tmpCtx.strokeStyle = 'rgb(20,20,30)';
            tmpCtx.lineCap = 'round'; tmpCtx.lineJoin = 'round';
            for (const el of elements) {
              if (el.type !== 'way') continue;
              const wtype = el.tags?.waterway;
              if (!wtype) continue;
              tmpCtx.lineWidth = wtype === 'river' ? 3 : wtype === 'canal' ? 2 : 1;
              if (drawGeomPath(el.geometry)) tmpCtx.stroke();
            }

            gisStatus.textContent = `Loading: Drew ${elements.length} water features, finalizing…`;
          }
        }
      } catch (riverErr) {
        gisStatus.textContent = `Warning: Water features failed (${riverErr.message}) — elevation loaded without water overlay.`;
        gisLoadBtn.disabled = false;
        gisLoadBtn.textContent = 'Retry with water';
        _applyToCanvas(tmpC, tw, th, cropW, cropH, zoom);
        fileNameEl.textContent = `elevation z${zoom} ${cropW}×${cropH} (no rivers)`;
        return;
      }

      _applyToCanvas(tmpC, tw, th, cropW, cropH, zoom);
      gisStatus.textContent = `Done: Loaded ${cropW}×${cropH}px elevation (zoom ${zoom})`;
      gisLoadBtn.disabled = false;
      gisLoadBtn.textContent = 'Load elevation';
      closeGisModal();

    } catch (err) {
      gisStatus.textContent = 'Error: ' + err.message;
      gisLoadBtn.disabled = false;
    }
  });

  function _applyToCanvas(tmpC, tw, th, cropW, cropH, zoom) {
    srcCanvas.width = tw; srcCanvas.height = th;
    const ctx = srcCanvas.getContext('2d');
    ctx.drawImage(tmpC, 0, 0, tw, th);
    // srcImageData is set via the exported setter
    const imageData = ctx.getImageData(0, 0, tw, th);
    imgInfo.textContent = `${tw} × ${th}`;
    fileNameEl.textContent = `elevation z${zoom} ${cropW}×${cropH}`;
    fileNameEl.style.display = 'block';
    setAiMask(null);
    setGisMode(true);
    scheduleRender(imageData);
  }
}
