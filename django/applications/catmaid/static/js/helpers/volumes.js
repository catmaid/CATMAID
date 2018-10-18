/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function (CATMAID) {

  "use strict";

  // Update volume list
  let initVolumeList = function (options, newSelectedIds) {
    return CATMAID.Volumes.listAll(project.id).then(function (json) {
      let volumes = json.sort(function (a, b) {
        return CATMAID.tools.compareStrings(a.name, b.name);
      }).map(function (volume) {
        return {
          title: volume.name,
          value: volume.id
        };
      });
      if (options.mode === "radio") {
        let selectedVolume = newSelectedIds || options.selectedVolumeIds;
        if (selectedVolume.length > 1){
          throw new CATMAID.ValueError("Radio select only takes one selected volume");
        }
        // Create actual element based on the returned data
        let node = CATMAID.DOM.createRadioSelect('Volumes', volumes,
          selectedVolume[0], true);
        // Add a selection handler
        node.onchange = function (e) {
          let volumeId = e.target.value;
          let selected = true;

          if (CATMAID.tools.isFn(options.select)) {
            options.select(volumeId, selected, e.target);
          }
        };
        return node;
      } else {
        let selectedVolumes = newSelectedIds || options.selectedVolumeIds;
        // Create actual element based on the returned data
        let node = CATMAID.DOM.createCheckboxSelect('Volumes', volumes,
          selectedVolumes, true, options.rowCallback);

        // Add a selection handler
        node.onchange = function (e) {
          let selected = e.target.checked;
          let volumeId = parseInt(e.target.value, 10);

          if (CATMAID.tools.isFn(options.select)) {
            options.select(volumeId, selected, e.target);
          }
        };
        return node;
      }
    });
  };

  CATMAID.createVolumeSelector = function (options) {
    var volumeSelectionWrapper = document.createElement('span');
    let volumeSelection;
    if (options.label){
      volumeSelection = CATMAID.DOM.createLabeledAsyncPlaceholder(options.label, initVolumeList(options), options.title);
    } else {
      volumeSelection = CATMAID.DOM.createAsyncPlaceholder(initVolumeList(options));
    }
    volumeSelectionWrapper.appendChild(volumeSelection);
    volumeSelectionWrapper.refresh = function(newSelectedIds){
      while (0 !== volumeSelectionWrapper.children.length) {
        volumeSelectionWrapper.removeChild(volumeSelectionWrapper.children[0]);
      }
      var volumeSelection = CATMAID.DOM.createAsyncPlaceholder(initVolumeList(options, newSelectedIds));
      volumeSelectionWrapper.appendChild(volumeSelection);
    };
    return volumeSelectionWrapper;
  };


})(CATMAID);