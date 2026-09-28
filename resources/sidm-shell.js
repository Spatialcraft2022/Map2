/* ─────────────────────────────────────────────────────────────
   SIDM shell wiring for the qgis2web/OpenLayers offline export.
   Runs after qgis2web.js (same classic-script global scope, so
   `map`, `layersList`, `measureButton`, `selectLabel`,
   `geolocateButton` and `bottomAttribution` are already in scope).
   Moves the working controls qgis2web.js already built into the
   SIDM-style shell markup in index.html — no engine logic is
   reimplemented, only relocated and restyled.
   ───────────────────────────────────────────────────────────── */
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    if (typeof map === 'undefined') return;

    var moduleDock       = document.getElementById('moduleDock');
    var layersCard        = document.getElementById('layersCard');
    var layersCardHeader  = document.getElementById('layersCardHeader');
    var layersCardBody    = document.getElementById('layersCardBody');
    var layersCardCount   = document.getElementById('layersCardCount');
    var bottomBarScale    = document.getElementById('bottomBarScale');
    var bottomBarCoords   = document.getElementById('bottomBarCoords');
    var bottomBarAttrib   = document.getElementById('bottomBarAttribution');

    /* ── Layers card: one row per GeoJSON layer, wired to real
       OL layer visibility (no data touched) ───────────────── */
    if (layersCardBody && typeof layersList !== 'undefined') {
      layersCardCount.textContent = layersList.length;

      layersList.forEach(function (layer) {
        var titleHtml = layer.get('title') || '';
        var imgMatch = /src="([^"]+)"/.exec(titleHtml);
        var name = (titleHtml.replace(/<img[^>]*>/, '').trim())
          || (layer.get('popuplayertitle') || 'Layer').trim();

        var item = document.createElement('div');
        item.className = 'layer-item';

        var toggle = document.createElement('label');
        toggle.className = 'layer-toggle';

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = layer.getVisible();

        var swatch = document.createElement('span');
        swatch.className = 'layer-swatch';
        if (imgMatch) {
          var img = document.createElement('img');
          img.src = imgMatch[1];
          img.alt = '';
          img.className = 'layer-swatch-img';
          swatch.appendChild(img);
        }

        var label = document.createElement('span');
        label.className = 'layer-name' + (checkbox.checked ? '' : ' layer-name--off');
        label.textContent = name;

        checkbox.addEventListener('change', function () {
          layer.setVisible(checkbox.checked);
          label.classList.toggle('layer-name--off', !checkbox.checked);
        });

        toggle.appendChild(checkbox);
        toggle.appendChild(swatch);
        toggle.appendChild(label);
        item.appendChild(toggle);
        layersCardBody.appendChild(item);
      });
    }

    if (layersCardHeader && layersCard) {
      layersCardHeader.addEventListener('click', function () {
        layersCard.classList.toggle('layers-card--collapsed');
      });
    }

    /* ── Layers / Base tabs ───────────────────────────────────── */
    var layersTabs = document.getElementById('layersTabs');
    var baseTabPanel = document.getElementById('baseTabPanel');
    if (layersTabs && layersCardBody && baseTabPanel) {
      layersTabs.addEventListener('click', function (e) {
        var btn = e.target.closest('.layers-tab');
        if (!btn) return;
        var showBase = btn.getAttribute('data-tab') === 'base';
        layersTabs.querySelectorAll('.layers-tab').forEach(function (t) {
          t.classList.toggle('layers-tab--active', t === btn);
        });
        layersCardBody.style.display = showBase ? 'none' : '';
        baseTabPanel.style.display = showBase ? '' : 'none';
      });
    }

    /* ── Basemap: the only part of this export that needs the
       internet (satellite/street tiles). GeoJSON layers, measure,
       identify and everything else keep working with no connection.
       "None" is a plain white canvas, not the app's dark theme. ── */
    var BASEMAPS = [
      { id: 'none', label: 'None' },
      { id: 'satellite', label: 'Satellite' },
      { id: 'osm', label: 'Street' },
    ];
    var mapEl = document.getElementById('map');
    var basemapOptions = document.getElementById('basemapOptions');
    var basemapLayer = null;
    var currentBasemapId = null;
    var offlineBannerShownAt = 0;
    var autoFallback = false; // true while we've forced "None" because satellite/street failed
    var retryTimer = null;
    var RETRY_MS = 15000;

    function showOfflineBanner() {
      var now = Date.now();
      if (now - offlineBannerShownAt < 5000) return; // debounce tile-error floods
      offlineBannerShownAt = now;
      var banner = document.getElementById('offlineBanner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'offlineBanner';
        banner.className = 'offline-banner';
        var msg = document.createElement('span');
        msg.textContent = '⚠ No internet — basemap tiles unavailable. Offline map data still works.';
        var closeBtn = document.createElement('button');
        closeBtn.className = 'offline-banner-close';
        closeBtn.setAttribute('aria-label', 'Dismiss');
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', function () { banner.style.display = 'none'; });
        banner.appendChild(msg);
        banner.appendChild(closeBtn);
        document.querySelector('.shell-body').appendChild(banner);
      }
      banner.style.display = 'flex';
    }

    function hideOfflineBanner() {
      var banner = document.getElementById('offlineBanner');
      if (banner) banner.style.display = 'none';
    }

    function clearRetryTimer() {
      if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
    }

    function scheduleRetry() {
      if (retryTimer) return;
      retryTimer = setInterval(function () {
        if (!autoFallback) { clearRetryTimer(); return; }
        setBasemap('satellite');
      }, RETRY_MS);
    }

    function buildBasemapSource(id) {
      if (id === 'satellite') {
        return new ol.source.XYZ({
          url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          maxZoom: 22,
          crossOrigin: 'anonymous',
        });
      }
      if (id === 'osm') {
        return new ol.source.OSM();
      }
      return null;
    }

    // id: the basemap to show. fellBack: true when this call is the
    // automatic "no internet" substitution to None, so it doesn't
    // clear autoFallback / stop the background retry.
    function setBasemap(id, fellBack) {
      if (basemapLayer) {
        map.removeLayer(basemapLayer);
        basemapLayer = null;
      }
      if (mapEl) mapEl.classList.toggle('basemap-none', id === 'none');
      currentBasemapId = id;

      var source = buildBasemapSource(id);
      if (source) {
        var failed = false;
        source.on('tileloaderror', function () {
          failed = true;
          showOfflineBanner();
          autoFallback = true;
          scheduleRetry();
          setBasemap('none', true);
        });
        source.on('tileloadend', function () {
          if (!failed && autoFallback) {
            // a retry attempt just proved the connection is back
            autoFallback = false;
            clearRetryTimer();
            hideOfflineBanner();
          }
        });
        basemapLayer = new ol.layer.Tile({ source: source, zIndex: -1, preload: 0, transition: 0 });
        map.getLayers().insertAt(0, basemapLayer);
      }

      if (basemapOptions) {
        basemapOptions.querySelectorAll('.basemap-btn').forEach(function (btn) {
          btn.classList.toggle('active', btn.getAttribute('data-basemap') === id);
        });
      }
    }

    if (basemapOptions) {
      BASEMAPS.forEach(function (b) {
        var btn = document.createElement('button');
        btn.className = 'basemap-btn';
        btn.textContent = b.label;
        btn.setAttribute('data-basemap', b.id);
        btn.addEventListener('click', function () {
          // user's own choice overrides any auto-fallback bookkeeping
          autoFallback = false;
          clearRetryTimer();
          setBasemap(b.id);
        });
        basemapOptions.appendChild(btn);
      });
    }

    // Browser "back online" signal — try satellite again right away
    // instead of waiting for the next retry tick.
    window.addEventListener('online', function () {
      if (autoFallback) setBasemap('satellite');
    });

    setBasemap('satellite'); // default; auto-falls back to None if it can't load

    /* ── Module dock ──────────────────────────────────────────── */
    function dockWrap(el, tip) {
      var wrap = document.createElement('div');
      wrap.className = 'dock-btn-wrap';
      wrap.setAttribute('data-tip', tip);
      wrap.appendChild(el);
      return wrap;
    }

    /* ── Measure — a from-scratch port of the live SIDM
       MeasureTool.jsx, not qgis2web's own measure control (kept
       hidden, unused): Distance/Area toggle, live per-segment
       labels, Clear, same colors, same dock-subpanel chrome. Site
       CRS (EPSG:32643) is a UTM zone, so plain getLength()/getArea()
       on the drawn geometry is correct — no spherical reprojection
       needed, same as the real component does for UTM sites. ────── */
    var measureSource = new ol.source.Vector();
    var measureLayer = new ol.layer.Vector({
      source: measureSource,
      zIndex: 100,
      style: function (feature) {
        var geom = feature.getGeometry();
        var styles = [
          new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#e94560', width: 2 }),
            fill: new ol.style.Fill({ color: 'rgba(233,69,96,0.12)' }),
            image: new ol.style.Circle({
              radius: 4,
              fill: new ol.style.Fill({ color: '#e94560' }),
            }),
          }),
        ];
        var coords, type = geom.getType();
        if (type === 'LineString') coords = geom.getCoordinates();
        else if (type === 'Polygon') coords = geom.getLinearRing(0).getCoordinates();
        else return styles;

        for (var i = 0; i < coords.length - 1; i++) {
          var p1 = coords[i], p2 = coords[i + 1];
          var segLen = new ol.geom.LineString([p1, p2]).getLength();
          if (segLen < 0.1) continue;
          styles.push(new ol.style.Style({
            geometry: new ol.geom.Point([(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]),
            text: new ol.style.Text({
              text: fmtLen(segLen),
              font: 'bold 11px sans-serif',
              fill: new ol.style.Fill({ color: '#ffffff' }),
              stroke: new ol.style.Stroke({ color: '#1a1a2e', width: 3 }),
              offsetY: -10,
            }),
          }));
        }
        return styles;
      },
    });
    map.addLayer(measureLayer);

    function fmtLen(m) {
      return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : m.toFixed(1) + ' m';
    }
    function fmtTotal(geom, mode) {
      return mode === 'distance' ? fmtLen(geom.getLength()) : geom.getArea().toFixed(1) + ' m²';
    }

    var measureMode = null; // null | 'distance' | 'area'
    var measureDraw = null;
    var measureChangeGeom = null;
    var measureChangeHandler = null;

    var measureDockBtn, measureSubpanel, measureBtnDistance, measureBtnArea,
        measureBtnClear, measureHint, measureResultEl;

    function updateMeasureUI() {
      if (measureBtnDistance) measureBtnDistance.classList.toggle('active', measureMode === 'distance');
      if (measureBtnArea) measureBtnArea.classList.toggle('active', measureMode === 'area');
      if (measureBtnClear) measureBtnClear.style.display = measureMode ? '' : 'none';
      if (measureHint) measureHint.style.display = measureMode ? '' : 'none';
    }

    function setMeasureResult(text) {
      if (!measureResultEl) return;
      measureResultEl.textContent = text;
      measureResultEl.style.display = text ? '' : 'none';
    }

    function stopMeasureDraw() {
      if (measureDraw) { map.removeInteraction(measureDraw); measureDraw = null; }
      if (measureChangeGeom && measureChangeHandler) {
        measureChangeGeom.un('change', measureChangeHandler);
      }
      measureChangeGeom = null;
      measureChangeHandler = null;
    }

    function setMeasureMode(mode) {
      stopMeasureDraw();
      measureSource.clear();
      setMeasureResult('');
      measureMode = (measureMode === mode) ? null : mode;
      updateMeasureUI();
      if (!measureMode) return;

      measureDraw = new ol.interaction.Draw({
        source: measureSource,
        type: measureMode === 'distance' ? 'LineString' : 'Polygon',
      });
      map.addInteraction(measureDraw);

      measureDraw.on('drawstart', function (evt) {
        measureSource.clear();
        setMeasureResult('');
        measureChangeGeom = evt.feature.getGeometry();
        measureChangeHandler = function (e) {
          setMeasureResult(fmtTotal(e.target, measureMode));
          measureLayer.changed();
        };
        measureChangeGeom.on('change', measureChangeHandler);
      });
      measureDraw.on('drawend', function () {
        if (measureChangeGeom && measureChangeHandler) {
          measureChangeGeom.un('change', measureChangeHandler);
        }
        measureChangeGeom = null;
        measureChangeHandler = null;
      });
    }

    function clearMeasure() {
      stopMeasureDraw();
      measureSource.clear();
      setMeasureResult('');
      measureMode = null;
      updateMeasureUI();
    }

    function closeMeasurePanel() {
      if (measureSubpanel) measureSubpanel.style.display = 'none';
      if (measureDockBtn) measureDockBtn.classList.remove('dock-btn--active');
      clearMeasure(); // closing unmounts the tool in the real app — full reset
    }
    function openMeasurePanel() {
      if (measureSubpanel) measureSubpanel.style.display = '';
      if (measureDockBtn) measureDockBtn.classList.add('dock-btn--active');
    }

    if (moduleDock) {
      // dock-subpanel: direct child of .module-dock, floats above it
      measureSubpanel = document.createElement('div');
      measureSubpanel.className = 'dock-subpanel';
      measureSubpanel.style.display = 'none';
      measureSubpanel.innerHTML =
        '<div class="dock-subpanel-header">' +
          '<span class="dock-subpanel-title">Measure</span>' +
          '<button class="dock-subpanel-close" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="measure-btns">' +
          '<button class="measure-btn" data-measure="distance">Distance</button>' +
          '<button class="measure-btn" data-measure="area">Area</button>' +
          '<button class="measure-btn" data-measure="clear" style="display:none">Clear</button>' +
        '</div>' +
        '<p class="measure-hint" style="display:none">Click to draw · Double-click to finish</p>' +
        '<div class="measure-result" style="display:none"></div>';
      moduleDock.appendChild(measureSubpanel);

      measureBtnDistance = measureSubpanel.querySelector('[data-measure="distance"]');
      measureBtnArea = measureSubpanel.querySelector('[data-measure="area"]');
      measureBtnClear = measureSubpanel.querySelector('[data-measure="clear"]');
      measureHint = measureSubpanel.querySelector('.measure-hint');
      measureResultEl = measureSubpanel.querySelector('.measure-result');

      measureBtnDistance.addEventListener('click', function () { setMeasureMode('distance'); });
      measureBtnArea.addEventListener('click', function () { setMeasureMode('area'); });
      measureBtnClear.addEventListener('click', clearMeasure);
      measureSubpanel.querySelector('.dock-subpanel-close').addEventListener('click', closeMeasurePanel);

      measureDockBtn = document.createElement('button');
      measureDockBtn.className = 'dock-btn';
      measureDockBtn.setAttribute('aria-label', 'Measure');
      measureDockBtn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px">' +
        '<path d="M2 12h4M18 12h4M12 2v4M12 18v4"/><circle cx="12" cy="12" r="3"/>' +
        '<path d="M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M19.07 4.93l-2.83 2.83M7.76 16.24l-2.83 2.83"/>' +
        '</svg>';
      measureDockBtn.addEventListener('click', function () {
        var isOpen = measureSubpanel.style.display !== 'none';
        if (isOpen) closeMeasurePanel(); else openMeasurePanel();
      });
      moduleDock.appendChild(dockWrap(measureDockBtn, 'Measure'));

      if (typeof geolocateButton !== 'undefined') {
        geolocateButton.classList.add('dock-btn', 'fas');
        geolocateButton.removeAttribute('title');
        moduleDock.appendChild(dockWrap(geolocateButton, 'My Location'));
      }
    }

    /* ── Bottom bar: scale line, live coordinate readout,
       qgis2web/OpenLayers/QGIS attribution ──────────────────── */
    if (bottomBarScale) {
      map.addControl(new ol.control.ScaleLine({ target: bottomBarScale, units: 'metric' }));
    }

    if (bottomBarAttrib && typeof bottomAttribution !== 'undefined') {
      bottomBarAttrib.appendChild(bottomAttribution.element);
    }

    if (bottomBarCoords) {
      map.on('pointermove', function (evt) {
        if (evt.dragging) return;
        var c = evt.coordinate;
        bottomBarCoords.textContent = 'E ' + Math.round(c[0]) + '  N ' + Math.round(c[1]);
      });
    }
  });
})();
