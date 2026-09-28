ol.proj.proj4.register(proj4);
//ol.proj.get("EPSG:32643").setExtent([405592.500142, 1695645.979687, 407587.670142, 1696667.059687]);
var wms_layers = [];

var format_Buildings_0 = new ol.format.GeoJSON();
var features_Buildings_0 = format_Buildings_0.readFeatures(json_Buildings_0, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:32643'});
var jsonSource_Buildings_0 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_Buildings_0.addFeatures(features_Buildings_0);
var lyr_Buildings_0 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_Buildings_0, 
                style: style_Buildings_0,
                popuplayertitle: 'Buildings ',
                interactive: false,
                title: '<img src="styles/legend/Buildings_0.png" /> Buildings '
            });
var format_road_1 = new ol.format.GeoJSON();
var features_road_1 = format_road_1.readFeatures(json_road_1, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:32643'});
var jsonSource_road_1 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_road_1.addFeatures(features_road_1);
var lyr_road_1 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_road_1, 
                style: style_road_1,
                popuplayertitle: 'road',
                interactive: true,
                title: '<img src="styles/legend/road_1.png" /> road'
            });

lyr_Buildings_0.setVisible(true);lyr_road_1.setVisible(true);
var layersList = [lyr_Buildings_0,lyr_road_1];
lyr_Buildings_0.set('fieldAliases', {'fid': 'fid', 'building_name': 'building_name', });
lyr_road_1.set('fieldAliases', {'fid': 'fid', });
lyr_Buildings_0.set('fieldImages', {'fid': 'TextEdit', 'building_name': 'TextEdit', });
lyr_road_1.set('fieldImages', {'fid': 'TextEdit', });
lyr_Buildings_0.set('fieldLabels', {'fid': 'no label', 'building_name': 'no label', });
lyr_road_1.set('fieldLabels', {'fid': 'no label', });
lyr_road_1.on('precompose', function(evt) {
    evt.context.globalCompositeOperation = 'normal';
});