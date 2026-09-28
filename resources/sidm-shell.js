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
