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
  const elevSourceSelect = document.getElementById('elevSource');
  const elevZoomSelect = document.getElementById('elevZoom');
  const elevZoomInfo = document.getElementById('elevZoomInfo');
  const loadRiversCheckbox = document.getElementById('loadRivers');

  let gisMap = null, drawnRect = null;

  function updateZoomInfo() {
    if (!drawnRect) {
      elevZoomInfo.textContent = '';
      return;
    }
    const b = drawnRect.getBounds();
    const south = b.getSouth(), north = b.getNorth();
    const west = b.getWest(), east = b.getEast();

    function lngToTileX(lng, z) { return Math.floor((lng + 180) / 360 * Math.pow(2, z)); }
    function latToTileY(lat, z) {
      const r = lat * Math.PI / 180;
      return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
    }

    const zoomValue = elevZoomSelect.value;
    let zoom;
    let isAuto = false;
    
    if (zoomValue === 'auto') {
      isAuto = true;
      zoom = 5;
      for (let z = 14; z >= 3; z--) {
        const tileCount = (lngToTileX(east, z) - lngToTileX(west, z) + 1) *
                          (latToTileY(south, z) - latToTileY(north, z) + 1);
        if (tileCount <= 16) { zoom = z; break; }
      }
    } else {
      zoom = parseInt(zoomValue);
    }

    const tx0 = lngToTileX(west, zoom), tx1 = lngToTileX(east, zoom);
    const ty0 = latToTileY(north, zoom), ty1 = latToTileY(south, zoom);
    const tileW = tx1 - tx0 + 1, tileH = ty1 - ty0 + 1;
    const tileCount = tileW * tileH;
    const pixelW = tileW * 256, pixelH = tileH * 256;

    const autoLabel = isAuto ? ` — auto selected zoom ${zoom}` : '';
    elevZoomInfo.textContent = `${tileCount} tile${tileCount > 1 ? 's' : ''} (${pixelW}×${pixelH}px)${autoLabel}`;
  }

  function updateStatus() {
    if (!drawnRect) return;
    const b = drawnRect.getBounds();
    gisStatus.textContent = `${b.getSouth().toFixed(3)}°S  ${b.getNorth().toFixed(3)}°N  ${b.getWest().toFixed(3)}°W  ${b.getEast().toFixed(3)}°E`;
    gisLoadBtn.disabled = false;
    updateZoomInfo();
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

      // Update zoom info when zoom selection changes
      elevZoomSelect.addEventListener('change', updateZoomInfo);
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
    const elevSource = elevSourceSelect?.value || 'terrarium';
    gisStatus.textContent = `Loading: Loading elevation tiles (${elevSource})…`;

    function lngToTileX(lng, z) { return Math.floor((lng + 180) / 360 * Math.pow(2, z)); }
    function latToTileY(lat, z) {
      const r = lat * Math.PI / 180;
      return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
    }

    const zoomValue = elevZoomSelect?.value || 'auto';
    let zoom;
    
    if (zoomValue === 'auto') {
      zoom = 5;
      for (let z = 14; z >= 3; z--) {
        const tileCount = (lngToTileX(east, z) - lngToTileX(west, z) + 1) *
                          (latToTileY(south, z) - latToTileY(north, z) + 1);
        if (tileCount <= 16) { zoom = z; break; }
      }
    } else {
      zoom = parseInt(zoomValue);
    }

    const tx0 = lngToTileX(west, zoom),  tx1 = lngToTileX(east, zoom);
    const ty0 = latToTileY(north, zoom), ty1 = latToTileY(south, zoom);
    const tileW = tx1 - tx0 + 1, tileH = ty1 - ty0 + 1;
    const TILE = 256;
    const tileCount = tileW * tileH;

    // Warn if too many tiles
    if (tileCount > 50) {
      const proceed = confirm(`Warning: You're about to download ${tileCount} tiles (${tileW * TILE}×${tileH * TILE}px). This may take a while and use significant bandwidth. Continue?`);
      if (!proceed) {
        gisLoadBtn.disabled = false;
        gisStatus.textContent = 'Cancelled';
        return;
      }
    }

    gisStatus.textContent = `Loading: Loading ${tileCount} tile(s) at zoom ${zoom}…`;

    try {
      const tileImgs = [];
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => { tileImgs.push({ tx, ty, img }); resolve(); };
            img.onerror = reject;
            
            // Choose tile source based on selection
            if (elevSource === 'srtm') {
              img.src = `https://s3.amazonaws.com/elevation-tiles-prod/skadi/${zoom}/${tx}/${ty}.png`;
            } else {
              img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${tx}/${ty}.png`;
            }
          });
        }
      }

      const stitchW = tileW * TILE, stitchH = tileH * TILE;
      const stitchC = document.createElement('canvas');
      stitchC.width = stitchW; stitchC.height = stitchH;
      const sCtx = stitchC.getContext('2d', { willReadFrequently: true });
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
      
      // Decode elevation based on source format
      if (elevSource === 'srtm') {
        // SRTM format: RGB encoding where elevation = (R * 256 + G + B / 256) - 32768
        for (let i = 0; i < cropW * cropH; i++) {
          const si = i * 4;
          elevations[i] = rawData[si] * 256 + rawData[si+1] + rawData[si+2] / 256 - 32768;
        }
      } else {
        // Terrarium format: same encoding
        for (let i = 0; i < cropW * cropH; i++) {
          const si = i * 4;
          elevations[i] = rawData[si] * 256 + rawData[si+1] + rawData[si+2] / 256 - 32768;
        }
      }

      let maxE = 1;
      for (const e of elevations) if (e > maxE) maxE = e;

      const [tw, th] = clampedSize(cropW, cropH);
      const tmpC = document.createElement('canvas');
      tmpC.width = cropW; tmpC.height = cropH;
      const tmpCtx = tmpC.getContext('2d', { willReadFrequently: true });

      const sliderSeaLevel = document.getElementById('sliderSeaLevel');
      const valSeaLevel    = document.getElementById('valSeaLevel');
      sliderSeaLevel.value = 0;
      valSeaLevel.textContent = '0';

      function buildElevationImageData(seaLevel) {
        const imgData = tmpCtx.createImageData(cropW, cropH);
        const d = imgData.data;
        for (let i = 0; i < cropW * cropH; i++) {
          const e = elevations[i] - seaLevel;
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
        return imgData;
      }

      // Update value label live while dragging, recalculate only on release
      sliderSeaLevel.oninput = () => { valSeaLevel.textContent = sliderSeaLevel.value; };

      document.getElementById('resetSeaLevel').onclick = () => {
        sliderSeaLevel.value = 0;
        valSeaLevel.textContent = '0';
        sliderSeaLevel.dispatchEvent(new Event('change'));
      };

      const imgData = buildElevationImageData(0);
      tmpCtx.putImageData(imgData, 0, 0);

      // Rivers + water bodies from Overpass
      const waterFailModal  = document.getElementById('waterFailModal');
      const waterFailRetry  = document.getElementById('waterFailRetry');
      const waterFailDismiss= document.getElementById('waterFailDismiss');

      const OVERPASS_SERVERS = [
        'https://overpass.private.coffee/api/interpreter',
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      ];

      async function overpassFetch(query) {
        for (let i = 0; i < OVERPASS_SERVERS.length; i++) {
          const server = OVERPASS_SERVERS[i];
          const host = new URL(server).hostname;
          gisStatus.textContent = `Loading: OSM water — ${host} (${i + 1}/${OVERPASS_SERVERS.length})…`;
          try {
            const resp = await fetch(server, { method: 'POST', body: query, signal: AbortSignal.timeout(20000) });
            if (resp.ok) return resp;
            console.warn(`[GIS] ${server} returned ${resp.status}, trying next…`);
          } catch (e) {
            console.warn(`[GIS] ${server} failed: ${e.message}, trying next…`);
          }
        }
        return null;
      }

      async function loadWaterFeatures() {
        gisStatus.textContent = `Loading: Loading water features from OpenStreetMap…`;
        const bbox = `${south},${west},${north},${east}`;

        const waysQuery = `[out:json][timeout:20];(way["waterway"~"^(river|stream|canal|drain)$"](${bbox});way["natural"~"^(water|wetland|bay)$"](${bbox});way["water"](${bbox}););out geom;`;
        const waysResp = await overpassFetch(waysQuery);

        // All servers failed
        if (!waysResp) {
          _applyToCanvas(tmpC, tw, th, cropW, cropH, zoom);
          gisLoadBtn.disabled = false;
          gisLoadBtn.textContent = 'Load elevation';
          closeGisModal();
          waterFailModal.classList.add('open');
          waterFailRetry.onclick = () => {
            waterFailModal.classList.remove('open');
            openGisModal();
            setTimeout(() => gisLoadBtn.click(), 150);
          };
          waterFailDismiss.onclick = () => waterFailModal.classList.remove('open');
          return;
        }

        let elements = [];
        const data = await waysResp.json().catch(() => ({ elements: [] }));
        elements = data.elements || [];
        console.log(`[GIS] ways: ${elements.length}`);

        const relQuery = `[out:json][timeout:20];relation["natural"~"^(water|wetland)$"](${bbox});out geom;`;
        try {
          const relResp = await overpassFetch(relQuery);
          if (relResp) {
            const relData = await relResp.json().catch(() => ({ elements: [] }));
            const rels = relData.elements || [];
            console.log(`[GIS] relations: ${rels.length}`, rels.map(r => `${r.id} "${r.tags?.name||''}" members:${(r.members||[]).length} geom:${(r.members||[]).filter(m=>m.geometry?.length>0).length}`));
            elements = elements.concat(rels);
          }
        } catch(relErr) {
          console.warn('[GIS] relation query failed:', relErr.message);
        }

        function drawWaterOverlay(baseImgData) {
          tmpCtx.putImageData(baseImgData, 0, 0);
          if (elements.length === 0) return;

          function latToMercY(lat) {
            const r = lat * Math.PI / 180;
            return Math.log(Math.tan(Math.PI / 4 + r / 2));
          }
          const northY = latToMercY(north), southY = latToMercY(south);

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

          let drawnWater = 0, drawnRivers = 0;
          tmpCtx.fillStyle = 'rgb(20,20,30)';
          for (const el of elements) {
            const isWaterBody = el.tags?.natural === 'water' || el.tags?.natural === 'wetland' ||
                                el.tags?.natural === 'bay' || el.tags?.water;
            if (!isWaterBody) continue;
            if (el.type === 'way' && el.geometry) {
              if (drawGeomPath(el.geometry)) { tmpCtx.closePath(); tmpCtx.fill(); drawnWater++; }
            } else if (el.type === 'relation' && el.members) {
              for (const member of el.members) {
                if ((member.role || '') === 'inner') continue;
                if (!member.geometry || member.geometry.length < 3) continue;
                if (drawGeomPath(member.geometry)) { tmpCtx.closePath(); tmpCtx.fill(); drawnWater++; }
              }
            }
          }
          tmpCtx.strokeStyle = 'rgb(20,20,30)';
          tmpCtx.lineCap = 'round'; tmpCtx.lineJoin = 'round';
          for (const el of elements) {
            if (el.type !== 'way') continue;
            const wtype = el.tags?.waterway;
            if (!wtype) continue;
            tmpCtx.lineWidth = wtype === 'river' ? 3 : wtype === 'canal' ? 2 : 1;
            if (drawGeomPath(el.geometry)) { tmpCtx.stroke(); drawnRivers++; }
          }
          const relCount = elements.filter(e => e.type === 'relation').length;
          console.log(`[GIS] drawn: ${drawnWater} water polygons, ${drawnRivers} rivers, ${relCount} relations`);
          gisStatus.textContent = `Loading: Drew ${drawnWater} water bodies, ${drawnRivers} rivers, finalizing…`;
        }

        drawWaterOverlay(imgData);

        // Wire sea level slider to redraw with water overlay
        sliderSeaLevel.onchange = () => {
          const seaLevel = parseInt(sliderSeaLevel.value);
          valSeaLevel.textContent = seaLevel;
          const newImgData = buildElevationImageData(seaLevel);
          drawWaterOverlay(newImgData);
          _applyToCanvas(tmpC, tw, th, cropW, cropH, zoom);
        };

        _applyToCanvas(tmpC, tw, th, cropW, cropH, zoom);
        gisStatus.textContent = `Done: Loaded ${cropW}×${cropH}px elevation (zoom ${zoom})`;
        gisLoadBtn.disabled = false;
        gisLoadBtn.textContent = 'Load elevation';
        closeGisModal();
      }

      try {
        const shouldLoadRivers = loadRiversCheckbox?.checked !== false;
        if (shouldLoadRivers) {
          await loadWaterFeatures();
        } else {
          // Skip rivers, just apply elevation data
          _applyToCanvas(tmpC, tw, th, cropW, cropH, zoom);
          gisStatus.textContent = `Done: Loaded ${cropW}×${cropH}px elevation (zoom ${zoom}) — rivers skipped`;
          gisLoadBtn.disabled = false;
          gisLoadBtn.textContent = 'Load elevation';
          closeGisModal();
        }
      } catch (riverErr) {
        console.warn('[GIS] water features error:', riverErr);
        _applyToCanvas(tmpC, tw, th, cropW, cropH, zoom);
        gisStatus.textContent = `Done: Loaded ${cropW}×${cropH}px elevation (zoom ${zoom})`;
        gisLoadBtn.disabled = false;
        gisLoadBtn.textContent = 'Load elevation';
        closeGisModal();
      }

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
