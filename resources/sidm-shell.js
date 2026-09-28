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
    var offlineBannerShownAt = 0;

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

    function setBasemap(id) {
      if (basemapLayer) {
        map.removeLayer(basemapLayer);
        basemapLayer = null;
      }
      if (mapEl) mapEl.classList.toggle('basemap-none', id === 'none');

      var source = buildBasemapSource(id);
      if (source) {
        basemapLayer = new ol.layer.Tile({ source: source, zIndex: -1, preload: 0, transition: 0 });
        source.on('tileloaderror', showOfflineBanner);
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
        btn.className = 'basemap-btn' + (b.id === 'none' ? ' active' : '');
        btn.textContent = b.label;
        btn.setAttribute('data-basemap', b.id);
        btn.addEventListener('click', function () { setBasemap(b.id); });
        basemapOptions.appendChild(btn);
      });
    }
    setBasemap('none');

    /* ── Module dock: pull the real measure + geolocate buttons
       (with their existing click handlers) into the dock ───── */
    function dockWrap(el, tip) {
      var wrap = document.createElement('div');
      wrap.className = 'dock-btn-wrap';
      wrap.setAttribute('data-tip', tip);
      wrap.appendChild(el);
      return wrap;
    }

    if (moduleDock) {
      if (typeof measureButton !== 'undefined') {
        measureButton.classList.add('dock-btn');
        measureButton.removeAttribute('title');
        moduleDock.appendChild(dockWrap(measureButton, 'Measure'));
        if (typeof selectLabel !== 'undefined') {
          selectLabel.classList.add('dock-measure-select');
          moduleDock.appendChild(selectLabel);
        }
      }
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
