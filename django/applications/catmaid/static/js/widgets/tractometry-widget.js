(function(CATMAID) {

  /**
   * The tractometry widget allows users to look for tracts in a skeleton
   * dataset based on NBLAST similarity scores.
   */
  let TractometryWidgget = function() {
    InstanceRegistry.call(this);

    this.widgetID = this.registerInstance();

    this.currentLocation = null;
    this.bbDimensions = [2000.0, 2000.0, 2000.0];
    this.showBbInStackViewer = true;
    this.showBbIn3dViewers = true;
    this.similarityId = null;
  };

  CATMAID.TractometryWidgget = TractometryWidgget;

  TractometryWidgget.prototype = Object.create(InstanceRegistry.prototype);
  TractometryWidgget.prototype.constructor = TractometryWidgget;

  TractometryWidgget.prototype.destroy = function() {
    this.unregisterInstance();
  };

  TractometryWidgget.prototype.getName = function() {
    return `Tractometry ${this.widgetID}`;
  };

  TractometryWidgget.prototype.getWidgetConfiguration = function() {
    return {
      class: 'tractometry-widget',
      createControls: (controls) => {
        let tabs = CATMAID.DOM.addTabGroup(controls, this.widgetID,
            ['Main', 'Bounding box']);

        let initSimilarityQueryList = () => {
          return CATMAID.fetch(`${project.id}/similarity/queries/`)
              .then(availableSimilarities => {
                var similarities = availableSimilarities.map(s => {
                  return {
                    title: `${s['name']} (${s['id']})`,
                    value: s['id']
                  };
                });
                var node = CATMAID.DOM.createSelect(undefined, similarities,
                    undefined, e => {
                      this.similarityId = parseInt(this.value, 10);
                    });
                return node;
              })
              .catch(CATMAID.handleError);
        };
        let similaritySelector = CATMAID.DOM.createLabeledAsyncPlaceholder('NBLAST similarity result',
            initSimilarityQueryList());
        var similaritySelectorWrapper = document.createElement('span');
        similaritySelectorWrapper.appendChild(similaritySelector);
        similaritySelectorWrapper.title = 'The set of NBLAST result scores that should be used for clustering';

        CATMAID.DOM.appendToTab(tabs['Main'],
            [['Clear', this.clear.bind(this)],
             ['Refresh', this.refresh.bind(this)],
             ['Tracts at current location', this.initForCurrentLocation.bind(this)],
             {type: 'child', element: similaritySelectorWrapper},
            ]);

        CATMAID.DOM.appendToTab(tabs['Bounding box'], [
          {
            type: 'text',
            label: 'Center location',
            value: TractometryWidgget.locationToString(this.currentLocation),
            length: 10,
            onchange: e => {
              let components = e.target.value.split(',')
                  .map(v => v.trim())
                  .map(Number);
              if (components.length == 3 && components.every(v => !Number.isNaN(v))) {
                this.currentLocation = components;
              } else {
                CATMAID.warn('Not a valid coordinate');
              }
            }
          },
          {
            type: 'text',
            label: 'Dimensions',
            value: TractometryWidgget.locationToString(this.bbDimensions),
            title: 'Dimensions of bounding box in physical coordinates (nm)',
            length: 10,
            onchange: e => {
              let components = e.target.value.split(',')
                  .map(v => v.trim())
                  .map(Number);
              if (components.length == 3 && components.every(v => !Number.isNaN(v))) {
                this.bbDimensions = components;
              } else {
                CATMAID.warn('Not a valid dimension list (need list of three numbers)');
              }
            }
          },
          ['Current location', this.initForCurrentLocation.bind(this)],
          {
            type: 'checkbox',
            label: 'Show BB in stack viewer',
            title: 'Whether or not to show the current bounding box as a separate layer in the stack viwer and superimpose it on e.g. image data.',
            value: this.showBbInStackViewer,
            onclick: e => {
              this.showBbInStackViewer = e.target.checked;
            }
          },
          {
            type: 'checkbox',
            label: 'Show BB in 3D',
            title: 'Whether or not to show the current bounding box in open 3D viewers',
            value: this.showBbIn3dViewers,
            onclick: e => {
              this.showBbIn3dViewers = e.target.checked;
            }
          }]);

        $(controls).tabs();
      },
      createContent: (content, widget) => {
        this.content = content;
        this.refresh();
      },
      init: () => {
        CATMAID.fetch(`${project.id}/similarity/cluster/enabled`)
          .then(response => {
            if (!response.enabled) {
              CATMAID.warn('Similarity clustering could not be enabled on the server');
            }
          })
          .catch(CATMAID.handleError);
      },
      helpPath: 'tractometry-widget.html',
    };
  };

  TractometryWidgget.prototype.refresh = function() {
    if (!this.content) {
      return;
    }

    // Clear widget
    while (this.content.lastChild) {
      this.content.removeChild(this.content.lastChild);
    }

    let infoPanel = this.content.appendChild(document.createElement('span'));
    let contentPanel = this.content.appendChild(document.createElement('span'));

    // Hide content unless clustering is enabled on the back-end
    contentPanel.style.display = 'none';
    CATMAID.fetch(`${project.id}/similarity/cluster/enabled`)
      .then(response => {
        if (response.enabled) {
          contentPanel.style.display = 'block';
          infoPanel.style.display = 'none';
        } else {
          let p = infoPanel.appendChild(document.createElement('p'));
          p.appendChild(document.createTextNode('Similarity clustering could not be enabled on the server. Please have a look at the widget documentation on how to enable it.'));
        }
      })
      .catch(CATMAID.handleError);

    let infoParagraph1 = contentPanel.appendChild(document.createElement('p'));
    if (!this.currentLocation) {
      let msg = 'Please define a bounding box, either by clicking "Tracts at current location" or manually in the "Bounding box" tab.';
      infoParagraph1.appendChild(document.createTextNode(msg));
      return;
    }
    let msg = `Current BB center at: ${TractometryWidgget.locationToString(this.currentLocation)} with dimensions: ${this.bbDimensions.join(', ')}`;
    infoParagraph1.appendChild(document.createTextNode(msg));

    let propertiesPanel = contentPanel.appendChild(document.createElement('p'));

    let currentLoc = (typeof(this.currentLocation[0]) !== "number" ||
        typeof(this.currentLocation[1]) !== "number" ||
        typeof(this.currentLocation[2]) !== "number") ?
        '' : this.currentLocation.join(', ');
    $(propertiesPanel).append(CATMAID.DOM.createInputSetting(
        'Center Location',
        currentLoc,
        'The project coordinates (physical units) of the bounding box center location in format "X, Y, Z".',
        function() {
          try {
            let coords = this.value.trim().split(',').map(c => Number(c.trim()));
            if (coords.length !== 3) {
              CATMAID.warn("Can't parse location, need 3 coordinates.");
              return;
            } else if (coords.filter(c => Number.isNaN(c)).length > 0) {
              CATMAID.warn("Can't parse location, need 3 numeric coordinates.");
              return;
            }
            this.currentLocation = coords;
          } catch (e) {
            CATMAID.warn("Can't parse location");
          }
        }));
  };

  TractometryWidgget.prototype.clear = function() {
    this.currentLocation = null;
    this.refresh();
  };

  TractometryWidgget.prototype.initForCurrentLocation = function() {
    this.currentLocation = [
      project.coordinates.x,
      project.coordinates.y,
      project.coordinates.z,
    ];
    this.refresh();
  };

  TractometryWidgget.locationToString = function(loc) {
    return loc ? loc.join(', ') : '';
  };

  CATMAID.registerWidget({
    name: 'Tractometry Widget',
    description: 'Inspect tracts in a bounding box using NBLAST similarity',
    key: 'tractometry-widget',
    creator: TractometryWidgget,
  });

})(CATMAID);
