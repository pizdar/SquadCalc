import L from "leaflet";
import "./ellipse";

import { App } from "./conf";
import { MAPS } from  "./maps";
import SquadSimulation from "./squadSimulation";
import { isTouchDevice } from "./utils";

import { 
    getDist,
    getElevation,
    radToMil,
    radToDeg,
    getBearing,
    getSpreadParameter,
    getTimeOfFlight
} from "./utils";

import { mortarIcon, targetIcon1, targetIconAnimated1 } from "./squadIcon";


/*
 * Global Squad Marker Class 
*/
export var squadMarker = L.Marker.extend({
    options: {
        draggable: true,
        riseOnHover: true,
        keyboard: false,
        animate: true,
    },

    // Initialize method
    initialize: function (latlng, options, map) {
        this.map = map;
        L.Marker.prototype.initialize.call(this, latlng, options);
        this.on("dragstart", this._handleDragStart, this);
        this.on("dragend", this._handleDragEnd, this);
    },

    /**
     * Force a given event to stay inside the map bounds
     * @param {e} [event] - event
     * @returns {e} - same event with corrected Latlng 
     */
    keepOnMap: function(e){
        if (e.latlng.lng > this.map.tilesSize) {e.latlng.lng = this.map.tilesSize;}
        if (e.latlng.lat < -this.map.tilesSize ) {e.latlng.lat = -this.map.tilesSize;}
        if (e.latlng.lng < 0) {e.latlng.lng = 0;}
        if (e.latlng.lat > 0) {e.latlng.lat = 0;}
        return e;
    },
});

export var squadWeaponMarker = squadMarker.extend({
    options: {
        autoPan: false,
    },

    initialize: function (latlng, options, map) {
        var cursorClass;


        L.setOptions(this, options);
        squadMarker.prototype.initialize.call(this, latlng, options, map);

        if (App.userSettings.cursor) {
            cursorClass = "crosshair";
        }
        else {
            cursorClass = "default";
        }

        this.maxDistCircleOn = {
            radius: App.activeWeapon.getMaxDistance() * (this.map.tilesSize / MAPS.find((elem, index) => index == App.activeMap).size),
            opacity: 0.7,
            color: "#00137f",
            fillOpacity: 0,
            weight: 2,
            autoPan: false,
            className: cursorClass,
        };

        this.minDistCircleOn = {
            radius: App.activeWeapon.minDistance * (this.map.tilesSize / MAPS.find((elem, index) => index == App.activeMap).size),
            opacity: 0.7,
            color: "#00137f",
            fillOpacity: 0.2,
            weight: 1,
            autoPan: false,
            className: cursorClass,
        };

        this.minMaxDistCircleOff = {
            radius: 0,
            opacity: 0,
            fillOpacity: 0,
        };

        this.miniCircleOptions = {
            radius: 4,
            opacity: 0,
            color: "#00137f",
            fillOpacity: 0,
            weight: 1,
            autoPan: false,
        };





        // Create the min/max range markers
        this.minRangeMarker = L.circle(latlng, this.minDistCircleOn).addTo(this.map.markersGroup);
        this.rangeMarker = L.circle(latlng, this.maxDistCircleOn).addTo(this.map.markersGroup);
        this.miniCircle = L.circleMarker(latlng, this.miniCircleOptions).addTo(this.map.markersGroup);
        
        if (!App.userSettings.weaponMinMaxRange) {
            this.minRangeMarker.setStyle(this.minMaxDistCircleOff);
            this.rangeMarker.setStyle(this.minMaxDistCircleOff);
        }
        // Hide minRangeMarker if weapon doesn't have minimum range
        if (this.minRangeMarker.getRadius() == 0) {
            this.minRangeMarker.setStyle(this.minMaxDistCircleOff);
        }

        // Custom events handlers
        this.on("click", this._handleClick, this);
        this.on("drag", this._handleDrag, this);
        this.on("dragStart", this._handleDragStart, this);
        this.on("dragEnd", this._handleDragEnd, this);
        this.on("dblclick", this._handleDblclick, this);
        this.on("contextmenu", this._handleContextMenu, this);
    },

    /**
     * Remove the Weapon marker and every object tied
     * @param {this}
     */
    delete: function(){

        this.removeFrom(this.map.activeWeaponsMarkers);

        if (this.map.activeWeaponsMarkers.getLayers().length === 0) { 
            this.map.deleteTargets();
        }
        else {
            // Set default icon on remaining weapon
            this.map.activeWeaponsMarkers.getLayers()[0].setIcon(mortarIcon);
        }

        // Delete the weapon marker and everthing tied to it
        this.remove();
        this.removeFrom(this.map.activeWeaponsMarkers);
        this.minRangeMarker.remove();
        this.rangeMarker.remove();

        // Update remaining targets if they exists
        this.map.updateTargets();
    },


    /**
     * update calcs, spread markers
     */
    updateWeapon: function(){

        var radiusMax = App.activeWeapon.getMaxDistance() * (this.map.tilesSize / MAPS.find((elem, index) => index == App.activeMap).size);
        var radiusMin = App.activeWeapon.minDistance * (this.map.tilesSize / MAPS.find((elem, index) => index == App.activeMap).size);
        
        this.minRangeMarker.setRadius(radiusMin);
        this.rangeMarker.setRadius(radiusMax);

        if (!App.userSettings.weaponMinMaxRange) {
            this.minRangeMarker.setStyle(this.minMaxDistCircleOff);
            this.rangeMarker.setStyle(this.minMaxDistCircleOff);
        }
        else {
            // Update MinRange circle opacity
            if (this.minRangeMarker.getRadius() != 0) {
                this.minRangeMarker.setStyle(this.minDistCircleOn);
            }
            else {
                this.minRangeMarker.setStyle(this.minMaxDistCircleOff);
            }
            this.rangeMarker.setStyle(this.maxDistCircleOn);
        }
    },


    _handleContextMenu: function(e){
        this.delete(e);
    },

    _handleDrag: function (e) {
        e = this.keepOnMap(e);
        this.setLatLng(e.latlng);
        this.rangeMarker.setLatLng(e.latlng);
        this.minRangeMarker.setLatLng(e.latlng);
        this.miniCircle.setLatLng(e.latlng);

    },

    // Catch this events so user can't place a target by mistake while trying to delete weapon
    _handleClick: function() {},
    _handleDblclick: function(){},

    _handleDragStart: function () {

        $(".leaflet-marker-icon").css("cursor", "grabbing");
        this.map.mouseLocationPopup.close();
        this.map.off("mousemove", this.map._handleMouseMove);

        this.map.activeTargetsMarkers.eachLayer(function (layer) {
            layer.calcMarker1.setContent("  ");
            layer.calcMarker2.setContent("  ");
            layer.spreadMarker1.setStyle({opacity: 0, fillOpacity: 0});
            layer.spreadMarker2.setStyle({opacity: 0, fillOpacity: 0});
        }); 
        this.miniCircle.setStyle({opacity: 1});
    },

    _handleDragEnd: function () {

        if (App.userSettings.keypadUnderCursor){
            this.map.on("mousemove", this.map._handleMouseMove);
        }
        $(".leaflet-marker-icon").css("cursor", "grab");
        this.miniCircle.setStyle({opacity: 0});
        this.setOpacity(0);
        this.map.updateTargets();

    },
});


export var squadTargetMarker = squadMarker.extend({
    options: {
        calcMarker1: null,
        calcMarker2: null,
        spreadMarker1: null,
        spreadMarker2: null,
        results: {

        }
    },

    initialize: function (latlng, options, map) {
        var radiiElipse;
        var angleElipse;
        var cursorClass;
        var popUpOptions_weapon1;
        var popUpOptions_weapon2;
        var weaponPos;
        var a;
        var b;
        var weaponHeight;
        var targetHeight;
        var dist;
        var velocity;
        var elevation;
        var mapScale;

        L.setOptions(this, options);
        squadMarker.prototype.initialize.call(this, latlng, options, map);

        mapScale = MAPS.find((elem, index) => index == App.activeMap).size / this.map.tilesSize;

        
        if (App.userSettings.cursor) {
            cursorClass = "crosshair";
        }
        else {
            cursorClass = "default";
        }

        
        popUpOptions_weapon1 = {
            autoPan: false,
            autoClose: false,
            closeButton: false,
            closeOnEscapeKey: false,
            bubblingMouseEvents: false,
            interactive: false,
            className: "calcPopup",
            minWidth: 100,
            offset: [-65, 0],
        };

        popUpOptions_weapon2 = {
            closeButton: false,
            className: "calcPopup2",
            autoClose: false,
            closeOnEscapeKey: false,
            autoPan: false,
            bubblingMouseEvents: false,
            interactive: false,
            minWidth: 100,
            offset: [68, 0],
        };


        this.spreadOptionsOn = {
            opacity: 1,
            fillOpacity: 0.1,
            color: "#b22222",
            weight: 1,
            className: cursorClass,
        };

        this.spreadOptionsOff = {
            opacity: 0,
            fillOpacity: 0,
            className: cursorClass,
        };

        this.miniCircleOptions = {
            radius: 4,
            opacity: 0,
            color: "#b22222",
            fillOpacity: 0,
            weight: 1,
            autoPan: false,
        };

        // Create marker

        this.addTo(this.map.activeTargetsMarkers);
        this.miniCircle = L.circleMarker(latlng, this.miniCircleOptions).addTo(this.map.markersGroup);

        if (this.options.animate){
            this.setIcon(targetIconAnimated1);
        }
        else {
            this.setIcon(targetIcon1);
        }


        weaponPos = this.map.activeWeaponsMarkers.getLayers()[0].getLatLng();
        weaponHeight = this._map.heightmap.getHeight(weaponPos);
        targetHeight = this._map.heightmap.getHeight(latlng);

        a = L.latLng([weaponPos.lng * mapScale, weaponPos.lat * -mapScale]);
        b = L.latLng([latlng.lng * mapScale, latlng.lat * -mapScale]);

        dist = getDist(a, b);
        velocity = App.activeWeapon.getVelocity(dist);
        elevation = getElevation(dist, targetHeight - weaponHeight, velocity);
        
        this.options.results = {
            distance: dist,
            elevation: getElevation(dist, targetHeight - weaponHeight, velocity),
            bearing: getBearing(a, b),
            velocity: velocity,
            gravityScale: App.activeWeapon.gravityScale,
            weaponHeight: weaponHeight,
            targetHeight: targetHeight,
            diffHeight: targetHeight - weaponHeight,
            spreadParameters: getSpreadParameter(elevation, velocity),
            timeOfFlight: getTimeOfFlight(elevation, velocity, targetHeight - weaponHeight),
        };

        radiiElipse = [(this.options.results.spreadParameters.semiMajorAxis * this.map.gameToMapScale)/2, (this.options.results.spreadParameters.semiMinorAxis * this.map.gameToMapScale)/2];
        angleElipse = this.options.results.spreadParameters.elevation;

        // Calc PopUp for weapon 1
        this.calcMarker1 = L.popup(popUpOptions_weapon1).setLatLng(latlng).openOn(this.map).addTo(this.map.markersGroup);

        // Calc PopUp for weapon 2 (not displayed yet)
        this.calcMarker2 = L.popup(popUpOptions_weapon2).setLatLng(latlng).addTo(this.map.markersGroup);

        this.spreadMarker1 = L.ellipse(latlng, radiiElipse, this.options.results.bearing, this.spreadOptionsOn).addTo(this.map.markersGroup);
        this.spreadMarker2 = L.ellipse(latlng, radiiElipse, angleElipse, this.spreadOptionsOff).addTo(this.map.markersGroup);

        if (App.userSettings.spreadRadius) {
            this.spreadMarker1.setStyle(this.spreadOptionsOff);
        }

        // If two weapons already on the map
        if (this.map.activeWeaponsMarkers.getLayers().length === 2) {

            weaponPos = this.map.activeWeaponsMarkers.getLayers()[1].getLatLng();
            a = L.latLng([weaponPos.lng * mapScale, weaponPos.lat * -mapScale]);        
            weaponHeight = this._map.heightmap.getHeight(weaponPos);
            targetHeight = this._map.heightmap.getHeight(latlng);
            dist = getDist(a, b);
            velocity = App.activeWeapon.getVelocity(dist);
            elevation = getElevation(dist, targetHeight - weaponHeight, velocity);
    
            this.options.results2 = {
                elevation: elevation,
                bearing: getBearing(a, b),
                distance: dist,
                velocity: velocity,
                gravityScale: App.activeWeapon.gravityScale,
                weaponHeight: weaponHeight,
                targetHeight: targetHeight,
                diffHeight: targetHeight - weaponHeight,
                spreadParameters: getSpreadParameter(elevation, velocity),
                timeOfFlight: getTimeOfFlight(elevation, velocity, targetHeight - weaponHeight),
            };

            // Initiate Spread Ellipse Marker
            if (this.options.results2.elevation === "---" || this.options.results2.spreadParameters.semiMajorAxis === 0) {
                this.spreadMarker2.setStyle({opacity: 0, fillOpacity: 0});
            }
            else {
                this.spreadMarker2.setRadius([(this.options.results2.spreadParameters.semiMajorAxis * this.map.gameToMapScale)/2, (this.options.results2.spreadParameters.semiMinorAxis * this.map.gameToMapScale)/2]);
                this.spreadMarker2.setTilt(this.options.results2.bearing);
                if (App.userSettings.spreadRadius) {
                    this.spreadMarker2.setStyle(this.spreadOptionsOn);
                }
                else {
                    this.spreadMarker2.setStyle(this.spreadOptionsOff);
                }
            }
            this.calcMarker2.setContent(this.getContent(this.options.results2)).openOn(this.map);
        }

        
        
        // Initiate Spread Ellipse Marker
       
        if (this.options.results.elevation === "---" || this.options.results.spreadParameters.semiMajorAxis === 0) {
            this.spreadMarker1.setStyle(this.spreadOptionsOff);
        }
        else {
            this.spreadMarker1.setRadius([(this.options.results.spreadParameters.semiMajorAxis * this.map.gameToMapScale)/2, (this.options.results.spreadParameters.semiMinorAxis * this.map.gameToMapScale)/2]);
            if (App.userSettings.spreadRadius) {
                this.spreadMarker1.setStyle(this.spreadOptionsOn); 
            }
            else {
                this.spreadMarker1.setStyle(this.spreadOptionsOff); 
            }
        }

        this.calcMarker1.setContent(this.getContent(this.options.results));

        // Custom events handlers
        this.on("click", this._handleClick, this);
        this.on("drag", this._handleDrag, this);
        this.on("dragStart", this._handleDragStart, this);
        this.on("dragEnd", this._handleDragEnd, this);
        this.on("contextmenu", this._handleContextMenu, this);
    },



    /**
     * Remove the target marker and every object tied
     * @param {this}
     */
    delete: function(){
        this.spreadMarker1.removeFrom(this.map.markersGroup);
        this.spreadMarker2.removeFrom(this.map.markersGroup);

        this.calcMarker1.removeFrom(this.map.markersGroup);
        this.calcMarker2.removeFrom(this.map.markersGroup);

        this.removeFrom(this.map.activeTargetsMarkers);
        this.removeFrom(this.map.markersGroup);

        this.remove();

        if (this.map.activeTargetsMarkers.getLayers().length === 0) {
            $(".btn-delete").hide();
        }
    },

    getContent: function(results){
        const DIST = results.distance;
        const BEARING = results.bearing;
        var TOF = results.timeOfFlight;
        var ELEV = results.elevation;
        var content;

        if (isNaN(ELEV)) {
            ELEV = "---";
        } else {
            if (App.activeWeapon.unit === "mil"){
                ELEV = radToMil(ELEV).toFixed(0);
            } else {
                ELEV = radToDeg(ELEV).toFixed(1);
            }
        }

        if (isNaN(TOF)) { TOF = "---";} 
        else { TOF = TOF.toFixed(1) + "s";}
        
        content = "<span class='calcNumber'></span></br><span>" + ELEV + "</span>";

        if (App.userSettings.showBearing) {
            content += "<br><span class='bearingUiCalc'>" +  BEARING.toFixed(1) + "° </span>";
        }

        if (App.userSettings.showTimeOfFlight) {
            content += "<br><span class='bearingUiCalc'>" + TOF + "</span>";
        } 

        if (App.userSettings.showDistance) {
            content += "<br><span class='bearingUiCalc'>" +  DIST.toFixed(0) + "m </span>";
        }

        return content;
    },


    updateSpread: function(){

        if (App.userSettings.spreadRadius) {
            this.spreadMarker1.setStyle(this.spreadOptionsOn);
        }
        else {
            this.spreadMarker1.setStyle(this.spreadOptionsOff);
        }

        if (this.map.activeWeaponsMarkers.getLayers().length === 2) {
            if (App.userSettings.spreadRadius) {
                this.spreadMarker2.setStyle(this.spreadOptionsOn);
            }
            else {
                this.spreadMarker2.setStyle(this.spreadOptionsOff);
            }
        }
    },


    updateCalc: function(){
        const mapScale = MAPS.find((elem, index) => index == App.activeMap).size / this.map.tilesSize;
        var weaponPos = this.map.activeWeaponsMarkers.getLayers()[0].getLatLng();
        var a = L.latLng([weaponPos.lng * mapScale, weaponPos.lat * -mapScale]);
        var b = L.latLng([this.getLatLng().lng * mapScale, this.getLatLng().lat * -mapScale]);
        var weaponHeight = this.map.heightmap.getHeight(weaponPos);
        var targetHeight = this.map.heightmap.getHeight(this.getLatLng());
        var dist = getDist(a, b);
        var elevation = getElevation(dist, targetHeight - weaponHeight, App.activeWeapon.getVelocity(dist));
        var velocity = App.activeWeapon.getVelocity(dist);

        this.options.results = {
            elevation: elevation,
            bearing: getBearing(a, b),
            distance: dist,
            velocity: velocity,
            gravityScale: App.activeWeapon.gravityScale,
            weaponHeight: weaponHeight,
            targetHeight: targetHeight,
            diffHeight: targetHeight - weaponHeight,
            spreadParameters: getSpreadParameter(elevation, velocity),
            timeOfFlight: getTimeOfFlight(elevation, velocity, targetHeight - weaponHeight),
        };
              
        if (this.options.results.elevation === "---" || this.options.results.spreadParameters.semiMajorAxis === 0) {
            this.spreadMarker1.setStyle({opacity: 0, fillOpacity: 0});

        }
        else {

            this.spreadMarker1.setRadius([(this.options.results.spreadParameters.semiMajorAxis * this.map.gameToMapScale)/2, (this.options.results.spreadParameters.semiMinorAxis * this.map.gameToMapScale)/2]);
            if (App.userSettings.spreadRadius) {
                this.spreadMarker1.setStyle(this.spreadOptionsOn);
            }
            else {
                this.spreadMarker1.setStyle(this.spreadOptionsOff);
            }
            this.spreadMarker1.setTilt(this.options.results.bearing);
        }

        
        this.spreadMarker2.setStyle(this.spreadOptionsOff);

        if (this.map.activeWeaponsMarkers.getLayers().length === 2) {

            weaponPos = this.map.activeWeaponsMarkers.getLayers()[1].getLatLng();
            a = L.latLng([weaponPos.lng * mapScale, weaponPos.lat * -mapScale]);    
            weaponHeight = this._map.heightmap.getHeight(weaponPos);
            targetHeight = this._map.heightmap.getHeight(this.getLatLng());
            dist = getDist(a, b);
            velocity = App.activeWeapon.getVelocity(dist);
            elevation = getElevation(dist, targetHeight - weaponHeight, velocity);
    
            this.options.results2 = {
                elevation: elevation,
                bearing: getBearing(a, b),
                distance: dist,
                velocity: velocity,
                gravityScale: App.activeWeapon.gravityScale,
                weaponHeight: weaponHeight,
                targetHeight: targetHeight,
                diffHeight: targetHeight - weaponHeight,
                spreadParameters: getSpreadParameter(elevation, velocity),
                timeOfFlight: getTimeOfFlight(elevation, velocity, targetHeight - weaponHeight),
            };


            if (this.options.results2.elevation === "---" || this.options.results2.spreadParameters.semiMajorAxis === 0) {
                this.spreadMarker2.setStyle({opacity: 0, fillOpacity: 0});
            }
            else {
                this.spreadMarker2.setRadius([(this.options.results2.spreadParameters.semiMajorAxis * this.map.gameToMapScale)/2, (this.options.results2.spreadParameters.semiMinorAxis * this.map.gameToMapScale)/2]);
                this.spreadMarker2.setTilt(this.options.results2.bearing);

                if (App.userSettings.spreadRadius) {
                    this.spreadMarker2.setStyle(this.spreadOptionsOn);
                }
                else {
                    this.spreadMarker2.setStyle(this.spreadOptionsOff);
                }
            }
            this.calcMarker2.setContent(this.getContent(this.options.results2)).openOn(this.map);
        }
        else {
            this.calcMarker2.close();
        }
        this.calcMarker1.setContent(this.getContent(this.options.results));
    },


    _handleClick: function() {
        const dialog = document.getElementById("calcInformation");
        var simulation1;
        var simulation2;
        var weaponPos1;
        var weaponPos2;
        var heightPath1;
        var heightPath2;
              
        dialog.showModal();
        $("#sim1").addClass("active");
        $("#sim2").removeClass("active");
        $("#canvasControls > .active").first().removeClass("active");

        $("#canvasControls > button").first().addClass("active");

        weaponPos1 = this.map.activeWeaponsMarkers.getLayers()[0].getLatLng();
        heightPath1 = this._map.heightmap.getHeightPath(weaponPos1, this.getLatLng());
        simulation1 = new SquadSimulation("#sim1", this.options.results, heightPath1);
        $("#canvasControls").css("display", "none");

        if (this.map.activeWeaponsMarkers.getLayers().length === 2){
            $("#canvasControls").css("display", "block");
            weaponPos2 = this.map.activeWeaponsMarkers.getLayers()[1].getLatLng();
            heightPath2 = this._map.heightmap.getHeightPath(weaponPos2, this.getLatLng());
            simulation2 = new SquadSimulation("#sim2", this.options.results2, heightPath2);
        }

        // If the user close the modal, stop the animation
        // ...or it does crazy stuff if he reopen it before the animation runs out
        dialog.addEventListener("close", function(){
            cancelAnimationFrame(simulation1.animationFrame);
            if (simulation2){ cancelAnimationFrame(simulation2.animationFrame);}
        });

    },
    // Keep the marker on map & update calc while dragging
    _handleDrag: function (e) {

        // When dragging marker out of bounds, block it at the edge
        e = this.keepOnMap(e);

        // Update Position
        this.setLatLng(e.latlng);
        this.calcMarker1.setLatLng(e.latlng);
        this.spreadMarker1.setLatLng(e.latlng);
        this.calcMarker2.setLatLng(e.latlng);
        this.spreadMarker2.setLatLng(e.latlng);
        this.miniCircle.setLatLng(e.latlng);

        // Update bearing/elevation/spread marker
        // On mobile, save performance
        if (!isTouchDevice()){
            this.updateCalc();
        }
 
    },

    // set "grabbing" cursor on grab start
    _handleDragStart: function () {
        $(".leaflet-marker-icon").css("cursor", "grabbing");
        this.map.mouseLocationPopup.close();
        this.map.off("mousemove", this.map._handleMouseMove);

        if (isTouchDevice()){
            this.calcMarker1.setContent("  ");
            this.calcMarker2.setContent("  ");
            this.spreadMarker1.setStyle({opacity: 0, fillOpacity: 0});
            this.spreadMarker2.setStyle({opacity: 0, fillOpacity: 0});
        }
        this.miniCircle.setStyle({opacity: 1});
    },

    // Reset cursor on drag end
    _handleDragEnd: function () {
        if (App.userSettings.keypadUnderCursor){
            this.map.on("mousemove", this.map._handleMouseMove);
        }
        $(".leaflet-marker-icon").css("cursor", "grab");

        this.miniCircle.setStyle({opacity: 0});

        // update one last time when drag end
        this.updateCalc();
    },

    // Delete targetMarker on right clic
    _handleContextMenu: function(){
        this.delete();
    },

});


