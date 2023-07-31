(function(CATMAID) {

  "use strict";

  /**
   * Create a new Neuron Similarity Widget. This widget allows users to explore
   * similarities between neurons.
   */
  var NeuronSimilarityWidget = function(options)
  {
    this.widgetID = this.registerInstance();
    this.idPrefix = "neuron-similarity-widget" + this.widgetID + '-';

    // Keep track of selected point clouds
    this.pointCloudSelection = {};
    this.pointClouds = {};

    this.lastSimilarityQuery = null;
    this.showOnlyMatchesInResult = true;
    this.showPointCloudImages = false;
    this.useCache = true;
    this.requiredBranches = 10;
    // Whether or not the results are displayed in a dialog (rather than a
    // window).
    this.resultMode = 'window';
    this.displayTransformationCache = {};
    this.storage = 'blob';

    // A currently displayed import job in the point cloud tab.
    this.importJob = null;

    CATMAID.DOM.asTabbedWidget(this, NeuronSimilarityWidget.Modes,
        ['similarity', 'configrations', 'pointclouds', 'pointcloud-import'],
        'similarity', () => this.update());

    this.neuronNameService = CATMAID.NeuronNameService.getInstance();

    CATMAID.Similarity.on(CATMAID.Similarity.EVENT_CONFIG_ADDED,
        this.handleAddedConfig, this);
    CATMAID.Similarity.on(CATMAID.Similarity.EVENT_CONFIG_DELETED,
        this.handleDeletedConfig, this);
    CATMAID.Landmarks.on(CATMAID.Landmarks.EVENT_DISPLAY_TRANSFORM_ADDED,
        this.updateDisplayTransformOptions, this);
    CATMAID.Landmarks.on(CATMAID.Landmarks.EVENT_DISPLAY_TRANSFORM_REMOVED,
        this.updateDisplayTransformOptions, this);
  };

  NeuronSimilarityWidget.prototype = {};
  $.extend(NeuronSimilarityWidget.prototype, new InstanceRegistry());

  CATMAID.asEventSource(NeuronSimilarityWidget.prototype);

  NeuronSimilarityWidget.prototype.getName = function() {
    return "Neuron Similarity " + this.widgetID;
  };

  NeuronSimilarityWidget.prototype.destroy = function() {
    this.unregisterInstance();
    this.neuronNameService.unregister(this);
    CATMAID.Similarity.off(CATMAID.Similarity.EVENT_CONFIG_ADDED,
        this.handleAddedConfig, this);
    CATMAID.Similarity.off(CATMAID.Similarity.EVENT_CONFIG_DELETED,
        this.handleDeletedConfig, this);
    CATMAID.Landmarks.off(CATMAID.Landmarks.EVENT_DISPLAY_TRANSFORM_ADDED,
        this.updateDisplayTransformOptions, this);
    CATMAID.Landmarks.off(CATMAID.Landmarks.EVENT_DISPLAY_TRANSFORM_REMOVED,
        this.updateDisplayTransformOptions, this);
  };

  NeuronSimilarityWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        this.controls = controls;
        this.createTabControls(controls, '-neuron-similarity');
      },
      contentID: this.idPrefix + 'content',
      createContent: function(content) {
        this.content = content;
      },
      init: function() {
        this.update();
        this.updatePointClouds();
        CATMAID.Similarity.testEnvironment(project.id)
          .then(function(result) {
            if (!result || !result.setup_ok) {
              CATMAID.warn("The NBLAST back-end isn't set up properly.");
            }
          })
          .catch(CATMAID.handleError);
      },
      helpText: [
        '<h1>Neuron Similarity Widget</h1>',
        '<p>This widget allows to compare neuron morphologies based on their spatial location and orientation.</p>',
        '<p>The first step is to create a <em>scoring matrix</em>, which is used ',
        'to give a score to a pair of points: a point in the query skeleton and ',
        'one in the current target skeleton. NBLAST works by summing up these ',
        'scores for all points in an input skeleton and its closest neighbor in ',
        'the target skeleton. There are of course also ways to normalize these ',
        'summed scores against e.g. the reverse score.</p>',

        '<p>CATMAID can handle multiple scoring matrices and in fact it might be ',
        'the case that different scoring matrices are useful for different types ',
        'of query partners. We can compare skeletons, transformed skeletons ',
        '(based on <em>landmarks</em>) and point clouds. A scoring matrix is ',
        'computed by looking at the distribution of distances and tangent ',
        'angels between two pairs of points in both a set of skeletons that ',
        'should be viewed as similar and another group that is considered ',
        'random.</p>',

        '<h2>Neuron similarity</h2>',

        '<h2>Configurations</h2>',
        '<p>The <em>Neuron Similarity Widget</em> allows to create scoring ',
        'matrices in the <em>Configurations tab</em>. The group of similar ',
        'neurons can be configured in various ways, the simplest one is ',
        'probably to select a particular cell class, a handful of neurons ',
        'that look very similar in another <em>skeleton source</em> and ',
        'select this source in the widget to get started. Since this is the ',
        'foundation of judging what is similar and what is not, care should be ',
        'taken to create a scoring matrix that is actually used for queries. ',
        'There are other modes of similarity definition like using pairwise ',
        'similarity between a neuron and its mirrored contralateral homologue. ',
        'The random group can be either defined explicitly or in terms of by ',
        'letting the back-end select a set of random skeletons for you where it\'s ',
        'possible to define the number of skeletons, the minimum cable length and ',
        'the minimum number of nodes.</p>',

        '<p>Once computed you can look at a similarity matrix by clicking on ',
        '"View" and you should see something like this:</p>',

        `<p><img src="${CATMAID.makeStaticURL('images/nblast_scoring_matrix.png')}" style="width: 50em;" /></p>`,

        '<p>It shows the similarity matrix with its histogram bins ("distance ',
        'breaks" and "dot breaks" in the UI) as well as a visualization which ',
        'shows where the scoring is the highest. In this case it is higher if ',
        'points are closer and their absolute tangent vector is similar.</p>',

        '<p>Often only a handful of similarity matrices are created and used. ',
        'Created scoring matrices  can be selected in the "Config" drop down in ',
        'the Neuron similarity tab, where queries are created.</p>',

        '<h3>CSV file import</h3>',
        '<p>It is possible to import similarity matrices from CSV files, optionally ',
        'including distance binning and dot binning information. By default a singlel ',
        'whitespace character is used as delimiter. The import dialog ',
        'also allows the scaling of the distance binning (without changing the ',
        'respective scores). This is available through the "Create from CSV file" ',
        'button in the Configuration tab.</p>',
        '<p>Without distance binning information, the distance binning configuration ',
        'set in the widget controls will be used. In this case the CSV file is expected ',
        'to have as many columns as <span class="inline-code">n_dot_breaks - 1</span> and ',
        'the number of rows needs to match <span class="inline-code">n_distance_breaks -1',
        '</span>. Without CSV embedded binning information, each cell is expected to have ',
        'a floating point value.</p>',
        '<p>With binning information, a header row and colum is expected. Each header ',
        'cell is expected to be of the form <span class="inline-code">"(a,b]"</span>, ',
        'with <span class="inline-code">a</span> is the start of the bin an and <span ',
        'class="inline-code">b</span> is the end of it.</p>',
        '<p>The following is a valid CSV file that includes the binning information:</p>',
        '<p><textarea rows="15" cols="100">',
        ' "(0,0.1]" "(0.1,0.2]" "(0.2,0.3]" "(0.3,0.4]" "(0.4,0.5]" "(0.5,0.6]" "(0.6,0.7]" "(0.7,0.8]" "(0.8,0.9]" "(0.9,1]"',
        '"(0,0.75]" 9.50009681841246 9.21508335662349 9.21115065315115 8.77846019988287 9.16480790878709 9.22670304852642 9.98177124602054 9.98769540562331 10.8047703362607 11.3892297520051',
        '"(0.75,1.5]" 8.44775535484291 9.04606831917705 8.66795898209567 8.62098080152923 8.77627481345128 8.99169678916886 9.61799941175952 9.49397224483499 9.9038964289191 10.5558600418055',
        '"(1.5,2]" 7.81414322934284 8.27557633457944 8.18660682886048 8.23731427922735 8.15598516511639 8.44982093548525 9.00303252641918 8.77951149081028 9.07759820573496 9.72735167147373',
        '"(2,2.5]" 7.51616719646677 7.68155524590478 7.82523642940135 7.79365902977448 7.88687632703958 8.03176502548019 7.90419447261403 7.89167667941778 8.46217860141364 9.35647238546052',
        '"(2.5,3]" 6.9783147327761 6.94307801953134 7.07921765812687 7.04965078503871 7.2130628384463 6.93874902118156 7.63696822638669 7.4002162293118 8.24372400571991 8.80558524903729',
        '"(3,3.5]" 6.33719877733494 6.51045037496395 6.35737422729476 6.73066764513181 6.64133577166606 6.68494299661635 6.84521100428193 6.96540340394039 7.58420978365021 8.30995640318606',
        '"(3.5,4]" 5.73499742229333 5.77656385564567 5.87488116875011 6.07846921345912 6.02417745573855 5.93648482795035 6.16518921344934 6.30063662788765 6.95985181784445 7.87373732354423',
        '"(4,5]" 5.11581548287475 5.02164949649811 5.15657495321943 5.10426523641483 5.14093105810577 5.10869075730527 5.31350417757688 5.3295303700301 5.90895075813729 6.51317233424717',
        '"(5,6]" 4.23399496093427 4.15794772207134 4.20728157596594 4.15459017748659 4.12686066546627 4.07336802392446 4.13970890702555 4.30027565331642 4.57805060814703 5.16486934998009',
        '"(6,7]" 3.34026906899444 3.3051324872601 3.29598747412083 3.26045243973712 3.29236938733991 3.17886713646518 3.35977585932096 3.35409654930982 3.57637236900113 3.97585033429852',
        '"(7,8]" 2.49516039627968 2.52098424995215 2.52305843981493 2.46950414929279 2.48275585435263 2.49589362243518 2.53247964713067 2.47889449294332 2.57140862978384 3.03387575286047',
        '"(8,9]" 1.80239308584322 1.78109465478104 1.70675762037913 1.77535908912846 1.75289855885997 1.75146698137153 1.79082680877923 1.71478695619744 1.76591615076793 2.11190542667794',
        '"(9,10]" 1.23204089761119 1.24902175781678 1.15056046332701 1.15360646172969 1.10537643865398 1.09095576409395 1.11211340817387 1.0739799591457 1.21329534346802 1.36231448114903',
        '"(10,12]" 0.401029977653807 0.405860318670642 0.364813354157233 0.445292761733466 0.340571513975563 0.338199499746287 0.28008292141423 0.257239082236011 0.309758722887181 0.460951328334644',
        '"(12,14]" -0.232687426817219 -0.284912539606733 -0.336660961477481 -0.341205197026599 -0.403612584363158 -0.449623119741235 -0.410464639556653 -0.494928060332013 -0.486278922443352 -0.343856434129093',
        '"(14,16]" -0.720642343060965 -0.737187893583455 -0.791598721371623 -0.913295681308958 -0.865874510428618 -0.929914609825734 -0.938060798925512 -0.949574939903263 -0.949001462020957 -0.892505828852155',
        '"(16,20]" -1.20775367451133 -1.22429143802357 -1.2328210224835 -1.31777889984332 -1.3345851397256 -1.38169640073789 -1.39943889386218 -1.35585589894259 -1.36677833201497 -1.31413253590163',
        '"(20,25]" -1.64590453464875 -1.67268478052567 -1.69807588928856 -1.75618281243588 -1.79136287047847 -1.87854037507812 -1.87418727262208 -1.91954256176612 -1.93941093200183 -1.93797132206708',
        '"(25,30]" -2.51777719454819 -2.54534918684165 -2.5397234879536 -2.54576319981858 -2.60681273498349 -2.68594630871072 -2.66326887245257 -2.70184701924541 -2.78173786253938 -2.91227645240933',
        '"(30,40]" -3.96009040652025 -4.03138759725922 -4.07211802129466 -4.14735135252196 -4.33002990458046 -4.42005336179794 -4.5079151442239 -4.79405146609799 -4.83321292801167 -5.08567253503641',
        '"(40,500]" -9.92103817171225 -10.08763000068 -10.0554347237019 -10.1026820447963 -10.0868240800316 -9.91220186436133 -10.0799576279701 -9.95197881595302 -10.0536078316845 -10.1287588679926',
        '</textarea>',
        '</p>',

        '<h2>Point clouds</h2>',
        '<p>This tab list all registered point clouds and allows to add single new point clouds. ',
        'To add new point clouds a <em>name</em> is needed as well as a set of points. By clicking ',
        'the <kbd>Point CSV</kbd> button, points can be loaded from a file. This CSV file is ',
        'expected to have three columns: <em>X, Y and Z</em>. When storing new point clouds in ',
        'the database, the coordinates are expected to be in <em>project space</em>.</p>',

        '<p>Since this isn\'t always easy to provide, separate <em>transformation</em> files ',
        'can be loaded using the <kbd>Transformation CSVs</kbd> button. These CSV files can have ',
        'either <em>4, 7, 9 or 15 columns</em>. The individual lengths correspond to the following ',
        'values: <ul>',
        '<li>4 columns: <span class="inline-code">Landmark</span>, ',
        '<span class="inline-code">Source x</span>, <span class="inline-code">Source y</span>,',
        '<span class="inline-code">Source z</span> This maps each source location to an existing ',
        'CATMAID landmark. Requires that there is only one location linked to the referenced ',
        'landmark in CATMAID.</li>',
        '<li>7 columns: <span class="inline-code">Landmark</span>, ',
        '<span class="inline-code">Source left x</span>, <span class="inline-code">Source left y</span>, ',
        '<span class="inline-code">Source left z</span>, <span class="inline-code">Source right x</span>, ',
        '<span class="inline-code">Source right y</span>, <span class="inline-code">Source right z</span> ',
        'This is like the 4 column variant, but further distinguishes between left and right side per ',
        'landmark. This expect a left and right location to be linked to the target landmark.</li>',
        '<li>9 columns: <span class="inline-code">Name</span>, ',
        '<span class="inline-code">Source name</span>, <span class="inline-code">Target name</span>, ',
        '<span class="inline-code">Source x</span>, <span class="inline-code">Source y</span>, ',
        '<span class="inline-code">Source z</span>, <span class="inline-code">Target x</span>, ',
        '<span class="inline-code">Target y</span>, <span class="inline-code">Target z</span>. ',
        'This will describe point matches from the source space (<em>Point CSV</em>) to the ',
        'target (project) space.</li>',
        '<li>15 columns: <span class="inline-code">Name</span>, ',
        '<span class="inline-code">Source name</span>, <span class="inline-code">Target name</span>, ',
        '<span class="inline-code">Source left x</span>, <span class="inline-code">Source left y</span>, ',
        '<span class="inline-code">Source left z</span>, <span class="inline-code">Target left x</span>, ',
        '<span class="inline-code">Target left y</span>, <span class="inline-code">Target left z</span>, ',
        '<span class="inline-code">Source right x</span>, <span class="inline-code">Source right y</span>, ',
        '<span class="inline-code">Source right z</span>, <span class="inline-code">Target right x</span>, ',
        '<span class="inline-code">Target right y</span>, <span class="inline-code">Target right z</span> ',
        'This works like the 9 column format, but further distringuishes between point matches on the ',
        'left and on the right side, which is useful in some datasets.</li>',
        '</ul></p>',
        '<p>It is possible to load multiple transformation files and each can have a different format.</p>'
      ].join('\n'),
    };
  };

  NeuronSimilarityWidget.prototype.refresh = function() {
    this.refreshTabContent();
  };

  NeuronSimilarityWidget.prototype.update = function() {
    this.updateTabContent(this.content);
  };

  NeuronSimilarityWidget.prototype.handleAddedConfig = function(config) {
    for (let modeName in NeuronSimilarityWidget.Modes) {
      let mode = NeuronSimilarityWidget.Modes[modeName];
      if (CATMAID.tools.isFn(mode.handleAddedConfig)) {
        mode.handleAddedConfig(this, config);
      }
    }
  };

  NeuronSimilarityWidget.prototype.handleDeletedConfig = function(config) {
    for (let modeName in NeuronSimilarityWidget.Modes) {
      let mode = NeuronSimilarityWidget.Modes[modeName];
      if (CATMAID.tools.isFn(mode.handleDeletedConfig)) {
        mode.handleDeletedConfig(this, config);
      }
    }
  };

  NeuronSimilarityWidget.prototype.handleConfigStatusChange = function(configId, status) {
    for (let modeName in NeuronSimilarityWidget.Modes) {
      let mode = NeuronSimilarityWidget.Modes[modeName];
      if (CATMAID.tools.isFn(mode.handleConfigStatusChange)) {
        mode.handleConfigStatusChange(this, configId, status);
      }
    }
  };

  NeuronSimilarityWidget.prototype.handleSimilarityStatusChange = function(similarityId, status) {
    for (let modeName in NeuronSimilarityWidget.Modes) {
      let mode = NeuronSimilarityWidget.Modes[modeName];
      if (CATMAID.tools.isFn(mode.handleSimilarityStatusChange)) {
        mode.handleSimilarityStatusChange(this, similarityId, status);
      }
    }
  };

  /**
   * Add a new point cloud.
   *
   * @params swapZY  {Boolean}   (optional) Whether or not to transform the
   *                             point data from a left handed system into a
   *                             right handed one.
   * @params invertY {Boolean}   (optional) Whether or not to invert the input
   *                             data's Y values wrt. to the bounding box.
   * @params groupId {Number}    (optional) Id of a group that is allowed
   *                             exclusive access on this point cloud. No one
   *                             else cann see it.
   * @params sampleSize {Number} (optional) A sampling can be performed based on
   *                             the passed in spacing value in nm.
   */
  NeuronSimilarityWidget.prototype.addPointCloud = function(newPointcloudName,
      newPointcloudDescription, pointData, pointMatches, images, swapZY,
      invertY, groupId, sampleSize) {
    if (!newPointcloudName) {
      throw new CATMAID.ValueError("Need a point cloud name");
    }
    if (!pointData) {
      throw new CATMAID.ValueError("Need point data for point cloud");
    }

    // If there are point matches, transform the input point data.
    if (pointMatches) {
      let matches = pointMatches.map(m => new CATMAID.transform.PointMatch(
          new CATMAID.transform.Point(m.source),
          new CATMAID.transform.Point(m.target), 1.0));

      if (!matches || matches.length === 0) {
        throw new CATMAID.ValueError("Could not create point matches for point cloud");
      }

      var mls = new CATMAID.transform.MovingLeastSquaresTransform();
      var model = new CATMAID.transform.AffineModel3D();
      mls.setModel(model);

      try {
        mls.setMatches(matches);
      } catch (error) {
        throw new CATMAID.ValueError("Could not fit model for point cloud transformation");
      }

      // Get a transformed copy of each point.
      pointData = pointData.map(p => mls.apply(p));

      // Optionally, swap Y and Z
      if (swapZY) {
        pointData.forEach(p => lhToRhInPlace(p));
      }

      if (invertY) {
        let bb = CATMAID.tools.getPointBoundingBox(pointData);
        pointData.forEach(p => {
          p[1] = bb.max.y - p[1];
          return p;
        });
      }

      // Optionally, resample point cloud
      if (sampleSize) {
        // Create a 3D grid with the respective sample size and find one point
        // in each cell.
        let cellConfig = pointData.reduce(addSampleToEmptyCell, {
          map: new Map(),
          sampleSize: sampleSize,
        });
        pointData = Array.from(cellConfig.map.values());
      }
    }

    return CATMAID.Pointcloud.add(project.id, newPointcloudName, pointData,
        newPointcloudDescription, images, groupId);
  };

  function addSampleToEmptyCell(target, point) {
    let cellX = Math.floor(point[0] / target.sampleSize),
        cellY = Math.floor(point[1] / target.sampleSize),
        cellZ = Math.floor(point[2] / target.sampleSize);
    let key = cellX + '_' + cellY + '_' + cellZ;
    if (!target.map.has(key)) {
      target.map.set(key, point);
    }
    return target;
  }

  function lhToRhInPlace(p) {
    let y = p[1];
    p[1] = p[2];
    p[2] = y;
    return p;
  }

  function listToStr(list) {
    if (list instanceof Array) {
      return '[' + list.join(', ') + ']';
    } else {
      return list;
    }
  }

  NeuronSimilarityWidget.prototype.getSelectedPointClouds = function() {
    return Object.keys(this.pointCloudSelection)
        .filter(pcId => this.pointCloudSelection[pcId])
        .map(pcId => parseInt(pcId, 10));
  };

  NeuronSimilarityWidget.prototype.getSelectedSkeletonTransformations = function(
      transform, landmarkGroupIndex, landmarkIndex, sourceLandmarkGroupIndex,
      sourceLandmarkIndex, transformedDataTarget) {
    let transformation = transform.displayTransform;
    let skeletonIds = [];

    CATMAID.Landmarks.addProvidersToTransformation(
        transformation, landmarkGroupIndex, landmarkIndex,
        undefined, sourceLandmarkGroupIndex, sourceLandmarkIndex);

    let promises = [];

    for (let skeletonModel of transformation.skeletons) {
      skeletonIds.push(skeletonModel.id);
      let getSkeleton = transformation.nodeProvider.get(skeletonModel.id)
        .then(function(json) {
          transformedDataTarget[skeletonModel.id] = json;
        })
        .catch(CATMAID.handleError);
      promises.push(getSkeleton);
    }

    return Promise.all(promises)
      .then(function() {
        return skeletonIds;
      });
  };

  NeuronSimilarityWidget.prototype.updatePointClouds = function() {
    let widget = this;
    return CATMAID.Pointcloud.listAll(project.id)
      .then(function(result) {
        // Save new point clouds in selection map, default to selected.
        result.forEach(pc => {
          if (!widget.pointCloudSelection.hasOwnProperty(pc.id)) {
            widget.pointCloudSelection[pc.id] = true;
            widget.pointClouds[pc.id] = pc;
          }
        });

        return result;
      });
  };

  NeuronSimilarityWidget.prototype.updateDisplayTransformationCache = function() {
    let dts = NeuronSimilarityWidget.getAvailableDisplayTransformations();
    this.displayTransformationCache = dts;
  };

  NeuronSimilarityWidget.getAvailableDisplayTransformations = function() {
    let windows = CATMAID.WindowMaker.getOpenWindows('landmarks', false,
      undefined, true);
    let displayTransformations = [];

    for (let widget of windows.values()) {
      for (let dt=0; dt<widget.displayTransformations.length; ++dt) {
        displayTransformations.push({
          widget: widget,
          displayTransform: widget.displayTransformations[dt],
          index: dt,
        });
      }
    }

    return displayTransformations;
  };

  NeuronSimilarityWidget.prototype.updateDisplayTransformSelect = function(select, autoDisable, addNoneAlways) {
    // Clear select
    while (select.options.length) {
      select.remove(0);
    }

    let dts = this.displayTransformationCache;

    if (dts.length === 0 || addNoneAlways) {
      if (autoDisable) {
        select.setAttribute('disabled', 'disabled');
      }
      let selected = addNoneAlways;
      select.add(new Option('(none)', 'none', selected, selected));
    } else {
      select.removeAttribute('disabled');
    }

    for (let i=0; i < dts.length; ++i) {
      let dt = dts[i];
      // Select first element by default
      let selected;
      if (!addNoneAlways) {
        selected = i === 0;
      }
      select.add(new Option(`${dt.widget.getName()}: Transform ${dt.index + 1}`, i, selected, selected));
    }

    return dts.length;
  };

  NeuronSimilarityWidget.prototype.updateDisplayTransformOptions = function() {
    this.updateDisplayTransformationCache();

    let transformedQuerySourceSelect = document.getElementById(this.idPrefix +
        'transformed-query-source');
    if (!transformedQuerySourceSelect) throw new CATMAID.ValueError("Transformed query element not found");
    this.updateDisplayTransformSelect(transformedQuerySourceSelect, true);

    let transformedTargetSourceSelect = document.getElementById(this.idPrefix +
        'transformed-target-source');
    if (!transformedTargetSourceSelect) throw new CATMAID.ValueError("Transformed target element not found");
    this.updateDisplayTransformSelect(transformedTargetSourceSelect, true);

    let configMatchSourceSelect = document.getElementById(this.idPrefix +
        'config-match-transformed-source');
    if (!configMatchSourceSelect) throw new CATMAID.ValueError("Config match source element not found");
    this.updateDisplayTransformSelect(configMatchSourceSelect, false, true);
  };

  function loadProjectLandmarks(projectId) {
    return Promise.all([
      CATMAID.Landmarks.listGroups(projectId, true, true, true, true)
        .then(result => result.reduce(CATMAID.Landmarks.addToIdIndex, new Map())),
      CATMAID.Landmarks.list(projectId, true)
        .then(result => result.reduce(CATMAID.Landmarks.addToIdIndex, new Map()))
    ]);
  }

  function getGroupConfirmation(widget, groups) {
    return new Promise((resolve, reject) => {

      if (!groups || groups.size === 0) {
        throw new CATMAID.Warning("No matching skeletons, transformed " +
            "skeletons or point clouds found.");
      }


      // With groups defined, get user confirmation.
      let dialog = new CATMAID.OptionsDialog('Confirm ' + groups.size +
          ' groups');
      dialog.dialog.classList.add('config-dialog');
      dialog.onOK = () => resolve();
      dialog.onCancel = () => reject(new CATMAID.Warning("Canceld by user"));

      dialog.appendMessage("Please make sure the displayed groups are correct. " +
        "The similarity will be computed per group and then merged into a single " +
        "matrix. The type of each group member is indicated through one or two " +
        "letters following its ID: Skeletons (S), Transformed Skeletons (TS) and " +
        "point clouds (PC). The similarity matrix will be created after the group " +
        "configuration is confirmed.");

      let widgetListContainer = document.createElement('div');
      let widgetNameTable = widgetListContainer.appendChild(
          document.createElement('table'));
      widgetNameTable.style.width = '100%';
      dialog.appendChild(widgetListContainer);

      let groupList = Array.from(groups.keys()).map(name => ({
        name: name,
        members: groups.get(name),
      }));
      let nns = CATMAID.NeuronNameService.getInstance();

      let getType = function(type) {
        if (type === 0) return 'S';
        if (type === 1) return 'TS';
        if (type === 2) return 'PC';
        return '?';
      };

      let getName = function(type, id) {
        if (type === 0 || type === 1) return nns.getName(id);
        if (type === 2) return widget.pointClouds[id].name;
        return '?';
      };

      $(widgetNameTable).DataTable({
        dom: 'th<ip>',
        order: [],
        data: groupList,
        language: {
          info: "Showing _START_ to _END_  of _TOTAL_ group(s)",
          infoFiltered: "(filtered from _MAX_ total group(s))",
          emptyTable: 'No groups found',
          zeroRecords: 'No matching groups found'
        },
        columns: [{
          data: 'name',
          title: 'Name',
          render: function(data, type, row, meta) {
              return (!data || data.length === 0) ? '<em>(none)</em>' : data;
          },
          width: '7em',
        }, {
          data: 'members',
          title: 'Group members',
          render: function(data, type, row, meta) {
            return data.map(e => `${getName(e[0], e[1])} (${getType(e[0])})`).join(', ');
          },
        }]
      });

      dialog.show(800, "auto", true);
    });
  }

  NeuronSimilarityWidget.Modes = {
    similarity: {
      title: "Neuron similarity",
      createControls: function(widget) {
        let newQueryName = '';
        let querySource = null;
        let targetSource = null;
        let configId = null;
        let queryType = 'skeleton';
        let targetType = 'all-skeletons';
        let normalizedScores = 'geometric-mean';
        let reverse = false;
        let useAlpha = false;
        let removeTargetDuplicates = true;
        let simplify = true;
        let topN = 0;

        widget.updateDisplayTransformationCache();

        let newScoringSection = document.createElement('span');
        newScoringSection.classList.add('section-header');
        newScoringSection.appendChild(document.createTextNode('New query'));

        let querySelect = document.createElement('label');
        let querySourceSelect = CATMAID.skeletonListSources.createUnboundSelect(widget.getName() + ' Query source');
        querySourceSelect.setAttribute('id', widget.idPrefix + 'query-source');
        querySelect.appendChild(querySourceSelect);
        querySource = querySourceSelect.value;
        querySourceSelect.onchange = function(e) {
          querySource = e.target.value;
        };

        let transformedQuerySelect = document.createElement('label');
        let transformedQuerySourceSelect = document.createElement('select');
        widget.updateDisplayTransformSelect(transformedQuerySourceSelect, true);
        transformedQuerySourceSelect.setAttribute('id', widget.idPrefix + 'transformed-query-source');
        if (queryType !== 'tranasformed-skeleton') {
          transformedQuerySourceSelect.setAttribute('disabled', 'disabled');
        }
        transformedQuerySelect.appendChild(transformedQuerySourceSelect);
        transformedQuerySourceSelect.onchange = function(e) {
          querySource = e.target.value;
        };

        let targetSelect = document.createElement('label');
        let targetSourceSelect = CATMAID.skeletonListSources.createUnboundSelect(widget.getName() + ' Target source');
        targetSourceSelect.setAttribute('id', widget.idPrefix + 'target-source');
        targetSelect.appendChild(targetSourceSelect);
        targetSource = targetSourceSelect.value;
        targetSourceSelect.onchange = function(e) {
          targetSource = e.target.value;
        };


        let transformedTargetSelect = document.createElement('label');
        let transformedTargetSourceSelect = document.createElement('select');
        widget.updateDisplayTransformSelect(transformedTargetSourceSelect, true);
        transformedTargetSourceSelect.setAttribute('id', widget.idPrefix + 'transformed-target-source');
        if (targetType !== 'tranasformed-skeleton') {
          transformedTargetSourceSelect.setAttribute('disabled', 'disabled');
        }
        transformedTargetSelect.appendChild(transformedTargetSourceSelect);
        transformedTargetSourceSelect.onchange = function(e) {
          querySource = e.target.value;
        };

        let configSelectWrapper = document.createElement('label');
        configSelectWrapper.appendChild(document.createTextNode('Config'));
        configSelectWrapper.setAttribute('title', 'Select a configuration to use (has to be complete)');
        let configSelect = document.createElement('select');
        configSelect.setAttribute('id', widget.idPrefix + 'config-select');
        configSelectWrapper.appendChild(configSelect);
        configId = configSelect.value && configSelect.value.length > 0 ?
            parseInt(configSelect.value, 10) : null;
        configSelect.onchange = function(e) {
          configId = configSelect.value === 'none' ? null :
              configId = parseInt(configSelect.value, 10);
        };

        // Add available configs to select
        NeuronSimilarityWidget.updateConfigSelect(configSelect)
          .then(function() {
            // Select first option by default.
            if (configSelect.options.length > 0 && !configId && configId !== 0) {
              configId = configSelect.options[0].value;
              configSelect.value = configId;
            }
          });

        function updateQueryVisibility() {
          querySelect.querySelector('select').disabled = queryType !== 'skeleton';
          transformedQuerySelect.querySelector('select').disabled = queryType !== 'transformed-skeleton';
        }

        function updateTargetVisibility() {
          targetSelect.querySelector('select').disabled = targetType !== 'skeleton';
          transformedTargetSelect.querySelector('select').disabled = targetType !== 'transformed-skeleton';
        }

        updateQueryVisibility();
        updateTargetVisibility();

        let computeSimilarity = function() {
          let prepare = Promise.resolve();
          // If transformed skeletons are used as query or target, we need to
          // get all available landmark groups. This can be two different
          // source landmarks, for both query and target. If either one is
          // defined, the regular landmarks for the global project need to be
          // loaded too.
          let landmarkGroupIndex;
          let landmarkIndex;
          let querySourceLandmarkGroupIndex;
          let querySourceLandmarkIndex;
          let targetSourceLandmarkGroupIndex;
          let targetSourceLandmarkIndex;

          let loadGlobalProjectLandmarks = function() {
            return loadProjectLandmarks(project.id)
              .then(results => {
                landmarkGroupIndex = results[0];
                landmarkIndex = results[1];
              });
          };

          // Map APIs to transformations.
          let queryLandmarkApi, targetLandmarkApi;
          if (queryType === 'transformed-skeleton') {
            let selectedDTIndex = transformedQuerySelect.querySelector('select').selectedOptions[0].value;
            let selectedDTEntry = widget.displayTransformationCache[selectedDTIndex];
            if (!selectedDTEntry) {
              CATMAID.warn("Could not find transformed query skeleton data");
              return;
            }
            let selectedDT = selectedDTEntry.displayTransform;
            // If no API is defined by the transformation, we assume the
            // global project from the local API.
            let querySourceProjectId = CATMAID.tools.getDefined(selectedDT.projectId, project.id);
            queryLandmarkApi = selectedDT.fromApi;

            prepare = CATMAID.Landmarks.listGroups(querySourceProjectId, true,
                true, true, true, queryLandmarkApi)
              .then(function(result) {
                querySourceLandmarkGroupIndex = result.reduce(CATMAID.Landmarks.addToIdIndex, new Map());
                return CATMAID.Landmarks.list(querySourceProjectId, true, queryLandmarkApi);
              })
              .then(function(result) {
                querySourceLandmarkIndex = result.reduce(CATMAID.Landmarks.addToIdIndex, new Map());

                // If a query landmark API is defined, make sure to also get the
                // target.
                if (queryLandmarkApi) {
                  return loadGlobalProjectLandmarks();
                } else {
                  landmarkIndex = querySourceLandmarkIndex;
                  landmarkGroupIndex = querySourceLandmarkGroupIndex;
                }
              });
          }

          if (targetType === 'transformed-skeleton') {
            let selectedDTIndex = transformedTargetSelect.querySelector('select').selectedOptions[0].value;
            let selectedDTEntry = widget.displayTransformationCache[selectedDTIndex];
            if (!selectedDTEntry) {
              CATMAID.warn("Could not find transformed target skeleton data");
              return;
            }
            let selectedDT = selectedDTEntry.displayTransform;
            // If no API is defined by the transformation, we assume the
            // global project from the local API.
            let targetSourceProjectId = CATMAID.tools.getDefined(selectedDT.projectId, project.id);
            let targetSourceLandmarkApi = selectedDT.fromApi;

            prepare = prepare
              .then(() => CATMAID.Landmarks.listGroups(targetSourceProjectId,
                  true, true, true, true, targetSourceLandmarkApi))
              .then(function(result) {
                targetSourceLandmarkGroupIndex = result.reduce(CATMAID.Landmarks.addToIdIndex, new Map());
                return CATMAID.Landmarks.list(targetSourceProjectId, true, targetSourceLandmarkApi);
              })
              .then(function(result) {
                targetSourceLandmarkIndex = result.reduce(CATMAID.Landmarks.addToIdIndex, new Map());

                // If a query landmark API is defined, make sure to also get the
                // target.
                if (targetLandmarkApi) {
                  return loadGlobalProjectLandmarks();
                } else if (!landmarkIndex || !landmarkGroupIndex) {
                  landmarkIndex = querySourceLandmarkIndex;
                  landmarkGroupIndex = querySourceLandmarkGroupIndex;
                }
              });
          }

          let toPointSet = function(data) {
            return [data[3], data[4], data[5]];
          };

          let makeTransformedSkeletonPointsets = function(data) {
            // TODO: Maybe resample in place?
            let newData = {};
            for (let skeletonId in data) {
              newData[skeletonId] = {
                'points': data[skeletonId][0].map(toPointSet),
                'name': 'Transformed skeleton ' + skeletonId,
              };
            }
            return newData;
          };

          prepare.then(function() {
            let loadingPromises = [];
            let queryIds = [];
            let queryMeta;
            let effectiveQueryType = queryType;
            if (queryType === 'skeleton') {
              let querySkeletonSource = CATMAID.skeletonListSources.getSource(querySource);
              if (!querySkeletonSource) {
                CATMAID.error("Can't find source: " + querySource);
                return;
              }
              queryIds = querySkeletonSource.getSelectedSkeletons();
            } else if (queryType === 'all-skeletons') {
              effectiveQueryType = 'skeleton';
            } else if (queryType === 'pointcloud') {
              queryIds = widget.getSelectedPointClouds();
            } else if (queryType === 'transformed-skeleton') {
              let transformedQuerySourceSelect = document.getElementById(widget.idPrefix +
                  'transformed-query-source');
              if (!transformedQuerySourceSelect) throw new CATMAID.ValueError("Transformed query element not found");
              let selectedTransformationIndex = transformedQuerySourceSelect.value;
              if (!/\d+/.test(selectedTransformationIndex)) {
                CATMAID.warn("No transformed query skeletons selected");
                return;
              }
              let selectedTransformation =
                  widget.displayTransformationCache[selectedTransformationIndex];

              // Map original skeleton IDs to their transformations
              let transformedData = {};
              loadingPromises.push(widget.getSelectedSkeletonTransformations(
                  selectedTransformation, landmarkGroupIndex, landmarkIndex,
                  querySourceLandmarkGroupIndex, querySourceLandmarkIndex,
                  transformedData)
                .then(function(skeletonIds) {
                  queryIds = skeletonIds;
                  // Transmit skeletons as smaller and more generic point set.
                  queryMeta = JSON.stringify(makeTransformedSkeletonPointsets(transformedData));
                  effectiveQueryType = 'pointset';
                }));
            } else {
              throw new CATMAID.ValueError("Unknown query type: " +  queryType);
            }

            let targetIds = [];
            let targetMeta;
            let effectiveTargetType = targetType;
            if (targetType === 'skeleton') {
              let targetSkeletonSource = CATMAID.skeletonListSources.getSource(targetSource);
              if (!targetSkeletonSource) {
                CATMAID.error("Can't find source: " + targetSource);
                return;
              }
              targetIds = targetSkeletonSource.getSelectedSkeletons();
            } else if (targetType === 'all-skeletons') {
              effectiveTargetType = 'skeleton';
            } else if (targetType === 'pointcloud') {
              targetIds = widget.getSelectedPointClouds();
            } else if (targetType === 'transformed-skeleton') {
              let transformedTargetSourceSelect = document.getElementById(widget.idPrefix +
                  'transformed-target-source');
              if (!transformedTargetSourceSelect) throw new CATMAID.ValueError("Transformed target element not found");
              let selectedTransformationIndex = transformedTargetSourceSelect.value;
              if (!/\d+/.test(selectedTransformationIndex)) {
                CATMAID.warn("No transformed target skeletons selected");
                return;
              }
              let selectedTransformation =
                  widget.displayTransformationCache[selectedTransformationIndex];

              let transformedData = {};
              loadingPromises.push(widget.getSelectedSkeletonTransformations(
                  selectedTransformation, landmarkGroupIndex, landmarkIndex,
                  targetSourceLandmarkGroupIndex, targetSourceLandmarkIndex,
                  transformedData)
                .then(function(skeletonIds) {
                  targetIds = skeletonIds;
                  // Transmit skeletons as smaller and more generic point set.
                  targetMeta = JSON.stringify(makeTransformedSkeletonPointsets(transformedData));
                  effectiveTargetType = 'pointset';
                }));
            } else {
              throw new CATMAID.ValueError("Unknown target type: " +  targetType);
            }

            // Make sure there is a selected config. Default to first element, if none was selected explicitly.
            if (configSelect.options.length > 0 && configSelect.value === -1) {
              configId = parseInt(configSelect.options[0].value, 10);
            }

            return Promise.all(loadingPromises)
              .then(function() {
                return CATMAID.Similarity.computeSimilarity(project.id, configId,
                    queryIds, targetIds, effectiveQueryType, effectiveTargetType,
                    newQueryName, normalizedScores, reverse, useAlpha,
                    queryMeta, targetMeta, removeTargetDuplicates, simplify,
                    widget.requiredBranches, widget.useCache, topN, widget.storage);
              })
              .then(function(response) {
                widget.lastSimilarityQuery = response;
                return widget.update();
              });
          })
          .catch(function(error) {
            widget.lastSimilarityQuery = null;
            CATMAID.handleError(error);
          });
        };

        return [{
          type: 'button',
          label: 'Refresh',
          onclick: widget.refresh.bind(widget),
        }, {
          id: widget.idPrefix + '-result-mode',
          type: 'select',
          label: 'View',
          title: 'Whether to view results in a window or a dialog',
          value: widget.resultMode,
          entries: [{
            title: 'Window',
            value: 'window'
          }, {
            title: 'Dialog',
            value: 'dialog'
          }],
          onchange: function() {
            widget.resultMode = this.value;
          }
        }, {
          type: 'child',
          element: newScoringSection,
        }, {
          type: 'text',
          label: 'Name',
          title: 'An optional name for this query',
          placeholder: '(optional)',
          value: newQueryName,
          length: 8,
          onchange: function() {
            newQueryName = this.value;
          },
        }, {
          type: 'select',
          label: 'Query',
          title: 'Select the query object type',
          value: queryType,
          entries: [{
            title: 'Skeleton source',
            value:  'skeleton',
          }, {
            title: 'All skeletons',
            value: 'all-skeletons',
          }, {
            title: 'Transformed skeletons',
            value: 'transformed-skeleton',
          }, {
            title: 'Selected point clouds (tab)',
            value: 'pointcloud',
          }],
          onchange: function() {
            queryType = this.value;
            updateQueryVisibility();
          }
        }, {
          type: 'child',
          element: querySelect,
        }, {
          type: 'child',
          element: transformedQuerySelect,
        }, {
          type: 'select',
          label: 'Target',
          title: 'Select the target object type',
          value: targetType,
          entries: [{
            title: 'Skeleton source',
            value:  'skeleton',
          }, {
            title: 'All skeletons',
            value: 'all-skeletons',
          }, {
            title: 'Transformed skeletons',
            value: 'transformed-skeleton',
          }, {
            title: 'Selected point clouds (tab)',
            value: 'pointcloud',
          }],
          onchange: function() {
            targetType = this.value;
            updateTargetVisibility();
          }
        }, {
          type: 'child',
          element: targetSelect,
        }, {
          type: 'child',
          element: transformedTargetSelect,
        }, {
          type: 'checkbox',
          label: 'No self-matches',
          title: 'If enabled, the target list will be cleaned of all query objects',
          value: removeTargetDuplicates,
          onclick: function() {
            removeTargetDuplicates = this.checked;
          },
        }, {
          type: 'select',
          label: 'Normalization',
          title: 'Scoring values can be normalized either by the self match-score or the mean with the reverse score.',
          value: normalizedScores,
          entries: [
            {title: 'None', value: 'raw'},
            {title: 'Self-match', value: 'normalized'},
            {title: 'Mean', value: 'mean'},
            {title: 'Geometric mean', value: 'geometric-mean'},
          ],
          onchange: function() {
            normalizedScores = this.value;
          },
        }, {
          type: 'numeric',
          label: 'Top N',
          title: 'Compute only the top n results for each query. Disable using a value of zero.',
          length: 4,
          min: 0,
          step: 10,
          value: topN,
          onchange: function() {
            topN = parseInt(this.value, 10);
          },
        }, {
          type: 'checkbox',
          label: 'Reverse',
          title: 'If enabled, the target is matched against the query',
          value: reverse,
          onclick: function() {
            reverse = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Use alpha',
          title: 'Whether to consider local directions in the similarity calculation.',
          value: useAlpha,
          onclick: function() {
            useAlpha = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Simplify neurons',
          id: widget.idPrefix + 'simplify-skeletons',
          title: 'Whether or not neurons should be simplified by removing parts below the 10. branch level',
          value: simplify,
          onclick: function() {
            simplify = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Use cache',
          id: widget.idPrefix + 'use-cache',
          title: 'Whether or not cached data for (optionally simplified) neurons can be used',
          value: widget.useCache,
          onclick: function() {
            widget.useCache = this.checked;
          },
        }, {
          type: 'select',
          label: 'Storage',
          title: 'How the NBLAST result should be stored. A relational storage has advantages for clustering analysis.',
          value: widget.storage,
          entries: [
            {title: 'BLOB', value: 'blob'},
            {title: 'Relation', value: 'relation'},
          ],
          onchange: function() {
            widget.storage = this.value;
          },
        }, {
          type: 'child',
          element: configSelectWrapper,
        }, {
          type: 'button',
          label: 'Compute similarity',
          onclick: function() {
            if (configId === 'none') {
              CATMAID.warn('No similarity configuration selected');
              return;
            }
            computeSimilarity();
          }
        }];
      },
      createContent: function(content, widget) {
        // Create table of all visible configurations.
        let container = content.appendChild(document.createElement('div'));
        container.classList.add('container');
        let p = container.appendChild(document.createElement('p'));
        p.classList.add('info-text');
        p.appendChild(document.createTextNode('Similarity computations are ' +
            'done asyncronously and individual requests are queued as tasks ' +
            'that are listed below.'));
        let table = container.appendChild(document.createElement('table'));
        table.setAttribute('id', widget.idPrefix + 'similarity-table');
        let datatable = $(table).DataTable({
          dom: 'lfrtip',
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            CATMAID.Similarity.listAllSkeletonSimilarities(project.id)
              .then(function(result) {
                callback({
                  draw: data.draw,
                  data: result,
                  recordsTotal: result.length,
                  recordsFiltered: result.length
                });
              })
              .catch(CATMAID.handleError);
          },
          order: [[5, 'desc']],
          columns: [{
              data: "id",
              title: "Id",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return row.id;
              }
            }, {
              data: "name",
              title: "Name",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                if ("display") {
                  return '<a href="#" data-action="select-group" data-group-id="' +
                      row.id + '" >' + row.name + '</a>';
                } else {
                  return row.name;
                }
              }
            }, {
              title: "User",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(row.user_id).login;
              }
            }, {
              data: "status",
              title: "Status",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                let status = row.detailed_status && row.detailed_status.length > 0 ?
                    row.detailed_status : 'No details availale';
                return `<span title="${status}">${data}</a>`;
              }
            }, {
              data: "config_id",
              title: "Config",
              orderable: true,
              class: 'cm-center',
            }, {
              data: "edition_time",
              title: "Last update (UTC)",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  var date = CATMAID.tools.isoStringToDate(row.creation_time);
                  if (date) {
                    return CATMAID.tools.dateToString(date);
                  } else {
                    return "(parse error)";
                  }
                } else {
                  return data;
                }
              }
            }, {
              data: "computation_time",
              title: "Runtime",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return data ? (Math.round(data) + 's') : 'N/A';
              },
            }, {
              data: "use_alpha",
              title: "Alpha",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                return data ? "Yes" : "No";
              },
            }, {
              data: "normalized",
              title: "Normalized",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                if (data === 'raw') {
                  return 'None';
                } else if (data === 'normalized') {
                  return 'Self-match';
                } else if (data === 'mean') {
                  return 'Mean';
                } else if (data === 'geometric-mean') {
                  return 'Geometric mean';
                }
                return 'Unknown: ' + data;
              }
            }, {
              data: "reverse",
              title: "Reverse",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                return data ? "Yes" : "No";
              },
            }, {
              data: "top_n",
              title: "Top N",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                return data ? data : "-";
              },
            }, {
              data: "query_objects",
              title: "Query objects",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                let typeLabel = CATMAID.Similarity.objectTypeToString(row.query_type);
                let capTypeLabel = CATMAID.tools.capitalize(typeLabel);

                let qo = row.initial_query_objects;
                if (qo) {
                  if (qo.length === 0) {
                    return `<span title="${row.n_query_objects} were used"><em>${row.n_initial_query_objects} ${typeLabel}s</em></span>`;
                  }

                  let allBins = qo.join(', ');
                  let text = qo.length > 4 ?
                      (qo[0] + ', ' +  qo[1] +  ' … ' + qo[qo.length - 2] + ', ' + qo[qo.length - 1]) :
                      allBins;

                  return `<span title="${qo.length}" ${typeLabel}}(s)"><em>${capTypeLabel}s:</em> ${text}</span>`;
                } else {
                  return `<span title="${row.n_query_objects} were used"><em>all ${typeLabel}s</em></span>`;
                }
              }
            }, {
              data: "target_objects",
              title: "Target objects",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                let typeLabel = CATMAID.Similarity.objectTypeToString(row.target_type);
                let capTypeLabel = CATMAID.tools.capitalize(typeLabel);

                let to = row.initial_target_objects;
                if (to) {
                  if (to.length === 0) {
                    return `<span title="${row.n_target_objects} were used"><em>${row.n_initial_target_objects} ${typeLabel}s</em></span>`;
                  }

                  let allBins = to.join(', ');
                  let text = to.length > 4 ?
                      (to[0] + ', ' +  to[1] +  ' … ' + to[to.length - 2] + ', ' + to[to.length - 1]) :
                      allBins;

                  return `<span title="${to.length}" ${typeLabel}}(s)"><em>${capTypeLabel}s:</em> ${text}</span>`;
                } else {
                  return `<span title="${row.n_target_objects} were used"><em>all ${typeLabel}s</em></span>`;
                }
              }
            }, {
              data: "scoring",
              title: "Scoring",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                if (row.status === 'complete') {
                  return '<a data-role="show-similarity" href="#" title="Show results">View</a>';
                } else {
                  return '-';
                }
              }
            }, {
              title: "Action",
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return '<a href="#" data-role="delete-similarity">Delete</a> <a href="#" data-role="recompute-similarity">Recompute</a>';
              }
            }]
        }).on('click', 'a[data-role=recompute-similarity]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          if (!confirm('Are you sure you want to to recompute NBLAST similarity #' +
              data.id + '?')) {
            return;
          }
          let simplify = $('#' + widget.idPrefix + 'simplify-skeletons').prop('checked');
          CATMAID.Similarity.recomputeSimilarity(project.id, data.id, simplify,
              widget.requiredBranches, widget.useCache, widget.storage)
            .then(function() {
              CATMAID.msg('Success', 'NBLAST similarity recomputation queued');
              widget.refresh();
            })
            .catch(CATMAID.handleError);
        }).on('click', 'a[data-role=delete-similarity]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          if (!confirm('Are you sure you want to to delete NBLAST similarity #' +
              data.id + '?')) {
            return;
          }
          CATMAID.Similarity.deleteSimilarity(project.id, data.id)
            .then(function() {
              CATMAID.msg('Success', 'NBLAST similarity deleted');
              widget.refresh();
            })
            .catch(CATMAID.handleError);
        }).on('click', 'a[data-role=show-similarity]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          widget.showSimilarity(data);
        });
      },
      handleAddedConfig: function(widget, config) {
        let configSelect = document.getElementById(widget.idPrefix + 'config-select');
        if (!configSelect) throw new CATMAID.ValueError("Config select element not found");
        NeuronSimilarityWidget.updateConfigSelect(configSelect);
      },
      handleDeletedConfig: function(widget, config) {
        let configSelect = document.getElementById(widget.idPrefix + 'config-select');
        if (!configSelect) throw new CATMAID.ValueError("Config select element not found");
        NeuronSimilarityWidget.updateConfigSelect(configSelect);
      },
      handleConfigStatusChange: function(widget, configId, status) {
        if (status === 'complete') {
          let configSelect = document.getElementById(widget.idPrefix + 'config-select');
          if (!configSelect) throw new CATMAID.ValueError("Config select element not found");
          NeuronSimilarityWidget.updateConfigSelect(configSelect);
        }
      },
      handleSimilarityStatusChange: function(widget, similarityId, status) {
        if (status === 'complete') {
          let table = document.getElementById(widget.idPrefix + 'similarity-table');
          if (table) {
            $(table).DataTable().ajax.reload();
          }
        }
      },
      refresh: function(widget) {
        let table = document.getElementById(widget.idPrefix + 'similarity-table');
        if (table) {
          $(table).DataTable().ajax.reload();
        }
        let configSelect = document.getElementById(widget.idPrefix + 'config-select');
        if (!configSelect) throw new CATMAID.ValueError("Config select element not found");
        NeuronSimilarityWidget.updateConfigSelect(configSelect);

        widget.updateDisplayTransformOptions();
      }
    },
    configrations: {
      title: "Configurations",
      createControls: function(widget) {
        let newIndexName = '';
        let newDistBreaks = CATMAID.Similarity.defaultDistanceBreaks;
        let newDotBreaks = CATMAID.Similarity.defaultDotBreaks;
        let newTangentNeighbors = 20;
        let backendRandomSelection = true;
        let numRandomNeurons = 1000;
        let lengthRandomNeurons = 10000;
        let minNodesRandomNeurons = 50;
        let matchingSource = null;
        let matchingTransformation = null;
        let matchingPointclouds = false;
        let randomSource = null;
        let similarityMode = 'all';
        let similarityModeRegex = '';
        let matchingSubset;

        let newScoringSection = document.createElement('span');
        newScoringSection.classList.add('section-header');
        newScoringSection.appendChild(document.createTextNode('New config'));

        let matchSelect = document.createElement('label');
        matchSelect.appendChild(document.createTextNode('Similar skeletons'));
        let matchSourceSelect = CATMAID.skeletonListSources.createUnboundSelect(widget.getName() + ' Match source');
        matchSourceSelect.setAttribute('id', widget.idPrefix + 'config-match-source');
        matchSelect.appendChild(matchSourceSelect);
        matchingSource = matchSourceSelect.value;
        matchSourceSelect.onchange = function(e) {
          matchingSource = e.target.value;
        };

        let matchTransformedSelect = document.createElement('label');
        matchTransformedSelect.appendChild(document.createTextNode('Sim. transformed skeletons'));
        let matchTransformedSourceSelect = document.createElement('select');
        matchTransformedSourceSelect.setAttribute('id', widget.idPrefix + 'config-match-transformed-source');
        widget.updateDisplayTransformSelect(matchTransformedSourceSelect, false, true);
        matchTransformedSelect.appendChild(matchTransformedSourceSelect);
        matchingTransformation = matchTransformedSourceSelect.value;
        matchTransformedSourceSelect.onchange = function(e) {
          matchingTransformation = e.target.value;
        };

        let randomSelect = document.createElement('label');
        randomSelect.appendChild(document.createTextNode('Random skeletons'));
        randomSelect.disabled = backendRandomSelection;
        let randomSourceSelect = CATMAID.skeletonListSources.createUnboundSelect(widget.getName() + ' Random source');
        randomSourceSelect.setAttribute('id', widget.idPrefix + '-config-random-source');
        randomSourceSelect.disabled = backendRandomSelection;
        randomSelect.appendChild(randomSourceSelect);
        randomSource = randomSourceSelect.value;
        randomSourceSelect.onchange = function(e) {
          randomSource = e.target.value;
        };

        let randomBackendCount = document.createElement('label');
        randomBackendCount.appendChild(document.createTextNode('# Random skeletons'));
        let randomBackendCountInput = document.createElement('input');
        randomBackendCount.appendChild(randomBackendCountInput);
        randomBackendCountInput.setAttribute('type', 'number');
        randomBackendCountInput.setAttribute('step', '1');
        randomBackendCountInput.setAttribute('min', '1');
        randomBackendCountInput.setAttribute('value', numRandomNeurons);
        randomBackendCountInput.style.width = "6em";
        randomBackendCountInput.disabled = !backendRandomSelection;
        randomBackendCountInput.onchange = function() {
          let value = Number(this.value);
          if (Number.isNaN(value)) {
            CATMAID.warn("Invalid length");
          } else {
            numRandomNeurons = Math.floor(value);
          }
        };

        let randomBackendMinNodes = document.createElement('label');
        randomBackendMinNodes.appendChild(document.createTextNode('Min N nodes'));
        randomBackendMinNodes.setAttribute('title', 'A minimum number of nodes needed in each valid skeletons');
        let randomBackendMinNodesInput = document.createElement('input');
        randomBackendMinNodes.appendChild(randomBackendMinNodesInput);
        randomBackendMinNodesInput.setAttribute('type', 'number');
        randomBackendMinNodesInput.setAttribute('step', '1');
        randomBackendMinNodesInput.setAttribute('min', '1');
        randomBackendMinNodesInput.setAttribute('value', minNodesRandomNeurons);
        randomBackendMinNodesInput.style.width = "6em";
        randomBackendMinNodesInput.disabled = !backendRandomSelection;
        randomBackendMinNodesInput.onchange = function() {
          let value = Number(this.value);
          if (Number.isNaN(value)) {
            CATMAID.warn("Invalid length");
          } else {
            minNodesRandomNeurons = value;
          }
        };

        let randomBackendMinLength = document.createElement('label');
        randomBackendMinLength.appendChild(document.createTextNode('Min length (nm)'));
        randomBackendMinLength.setAttribute('title', 'A minimum length of accepted skeletons');
        let randomBackendMinLengthInput = document.createElement('input');
        randomBackendMinLength.appendChild(randomBackendMinLengthInput);
        randomBackendMinLengthInput.setAttribute('type', 'number');
        randomBackendMinLengthInput.setAttribute('step', '1');
        randomBackendMinLengthInput.setAttribute('min', '1');
        randomBackendMinLengthInput.setAttribute('value', lengthRandomNeurons);
        randomBackendMinLengthInput.style.width = "6em";
        randomBackendMinLengthInput.disabled = !backendRandomSelection;
        randomBackendMinLengthInput.onchange = function() {
          let value = Number(this.value);
          if (Number.isNaN(value)) {
            CATMAID.warn("Invalid length");
          } else {
            lengthRandomNeurons = value;
          }
        };

        return [{
          type: 'button',
          label: 'Refresh',
          onclick: widget.refresh.bind(widget),
        }, {
          type: 'child',
          element: newScoringSection,
        }, {
          type: 'text',
          label: 'Name',
          title: 'The name of the new scoring index',
          value: newIndexName,
          length: 8,
          onchange: function() {
            newIndexName = this.value;
          }
        }, {
          type: 'text',
          label: 'Distance breaks',
          title: 'The distance histogram bin boundary values. By default [0,500] with an increasing bin size.',
          value: newDistBreaks.join(', '),
          length: 7,
          onchange: function() {
            newDistBreaks = this.value.split(',').filter(
                function(s) {
                  s = s.trim();
                  return s.length > 0;
                }).map(function(s) {
                  var val = parseInt(s, 10);
                  if (isNaN(val)) {
                    throw new CATMAID.ValueError("No number: " + s.trim());
                  }
                  return val;
                });
          }
        }, {
          type: 'text',
          label: 'Dot breaks',
          title: 'The absolute dot product histogram bin boundary values. By default [0,1] with a 0.1 step.',
          value: newDotBreaks.join(', '),
          length: 7,
          onchange: function() {
            newDotBreaks = this.value.split(',').filter(
                function(s) {
                  s = s.trim();
                  return s.length > 0;
                }).map(function(s) {
                  var val = parseInt(s, 10);
                  if (isNaN(val)) {
                    throw new CATMAID.ValueError("No number: " + s.trim());
                  }
                  return val;
                });
          }
        }, {
          type: 'numeric',
          label: 'Tangent neighbors',
          title: 'The number of neighbor nodes that should be considered when computing a tangent vector.',
          value: newTangentNeighbors,
          min: 2,
          step: 1,
          length: 3,
          onchange: function() {
            newTangentNeighbors = parseInt(this.value, 10);
          }
        }, {
          type: 'child',
          element: matchSelect,
        }, {
          type: 'child',
          element: matchTransformedSelect,
        }, {
          type: 'checkbox',
          label: 'Sim. point clouds',
          id: widget.idPrefix + '-config-match-point-clouds',
          value: matchingPointclouds,
          onclick: function() {
            matchingPointclouds = this.checked;
          }
        }, {
          id: widget.idPrefix + '-similarity-mode',
          type: 'select',
          label: 'Similarity mode',
          title: 'Whether similarity should be computed for the whole group ' +
              'of skeletons, sub-groups with the same suffix or pairs with ' +
              'the suffixes _left and _right in their name',
          value: similarityMode,
          entries: [{
            title: 'All objects',
            value: 'all'
          }, {
            title: 'Sub-groups with same suffix',
            value: 'same_suffix'
          }, {
            title: 'Pairs with suffixes _left and _right',
            value: 'lr_suffix'
          }, {
            title: 'Objects with same name',
            value: 'same_name',
          }, {
            title: 'Custom RegEx',
            value: 'regex',
          }],
          onchange: function() {
            similarityMode = this.value;
            let regexInput = document.getElementById('similarity-matrix-custom-regex-' + widget.widgetID);
            if (regexInput) {
              regexInput.disabled = similarityMode !== 'regex';
            }
          }
        }, {
          type: 'text',
          id: 'similarity-matrix-custom-regex-' + widget.widgetID,
          placeholder: 'Custom RegEx (no /)',
          value: similarityModeRegex,
          length: 10,
          disabled: similarityMode !== 'regex',
          onchange: function() {
            try {
              new RegExp(this.value);
            } catch(error) {
              similarityModeRegex = '';
              CATMAID.warn(error);
              return;
            }
            similarityModeRegex = this.value;
          },
        }, {
          type: 'child',
          element: randomSelect,
        }, {
          type: 'checkbox',
          label: 'Auto random selection',
          id: widget.idPrefix + '-config-auto-random',
          value: backendRandomSelection,
          onclick: function() {
            backendRandomSelection = this.checked;

            randomSelect.disabled = backendRandomSelection;
            randomSourceSelect.disabled = backendRandomSelection;
            randomBackendCount.disabled = !backendRandomSelection;
            randomBackendCountInput.disabled = !backendRandomSelection;
            randomBackendMinLength.disabled = !backendRandomSelection;
            randomBackendMinLengthInput.disabled = !backendRandomSelection;
            randomBackendMinNodes.disabled = !backendRandomSelection;
            randomBackendMinNodesInput.disabled = !backendRandomSelection;
          }
        }, {
          type: 'child',
          element: randomBackendCount,
        }, {
          type: 'child',
          element: randomBackendMinLength,
        }, {
          type: 'child',
          element: randomBackendMinNodes,
        }, {
          type: 'button',
          label: 'Create similarity matrix',
          title: 'Create a new similarity matrix with the specified settings',
          onclick: function() {
            let matchingSkeletonSource = CATMAID.skeletonListSources.getSource(matchingSource);
            if (!matchingSkeletonSource) {
              CATMAID.error("Can't find source: " + matchingSource);
              return;
            }
            let matchingSkeletonIds = matchingSkeletonSource.getSelectedSkeletons();
            let nns = CATMAID.NeuronNameService.getInstance();

            // Tasks that need to be done before the similarity matrix creation
            // job can be queued.
            let loadingPromises = [];

            let toPointSet = function(data) {
              return [data[3], data[4], data[5]];
            };

            let makeTransformedSkeletonPointsets = function(data) {
              let newData = {};
              for (let skeletonId in data) {
                newData[skeletonId] = {
                  'points': data[skeletonId][0].map(toPointSet),
                  'name': nns.getName(skeletonId),
                };
              }
              return newData;
            };

            // If transformed skeletons are used to create the similarity
            // matrix, send them as pointset type.
            let matchingPointSetIds, matchingMeta;
            if (matchingTransformation !== 'none') {
              let selectedTransformationIndex = matchTransformedSourceSelect.value;
              if (!/\d+/.test(selectedTransformationIndex)) {
                CATMAID.warn("No transformed matching skeletons selected");
                return;
              }

              // We need landmark information
              loadingPromises.push(
                loadProjectLandmarks(project.id)
                  .then(results => {
                    let landmarkGroupIndex = results[0];
                    let landmarkIndex = results[1];

                    let selectedTransformation =
                        widget.displayTransformationCache[selectedTransformationIndex];

                    // Map original skeleton IDs to their transformations
                    let transformedData = {};
                    return Promise.all([widget.getSelectedSkeletonTransformations(
                        selectedTransformation, landmarkGroupIndex, landmarkIndex,
                        landmarkGroupIndex, landmarkIndex, transformedData), transformedData]);
                  })
                  .then(results => {
                    let skeletonIds = results[0];
                    let transformedData = results[1];
                    matchingPointSetIds = skeletonIds;
                    // Transmit skeletons as smaller and more generic point set.
                    matchingMeta = JSON.stringify(makeTransformedSkeletonPointsets(transformedData));
                  }));
            }

            // If pointclouds are used to create the similarity matrix, them
            // them as pointclouds type.
            let matchingPointcloudIds;
            if (matchingPointclouds) {
              matchingPointcloudIds = widget.getSelectedPointClouds();
            }

            let prepare = Promise.all(loadingPromises)
              .then(() => {
                // Create explicit matching pairs if a similarity mode other than
                // 'all' is selected.
                if (similarityMode && similarityMode !== 'all') {
                  let nameService = new Map([
                      // type, getName()
                      [0, (id) => nns.getName(id)],
                      [1, (id) => nns.getName(id)],
                      [2, (id) => widget.pointClouds[id].name]]);
                  let matchingSources = new Map([
                      // type, ids
                      [0, matchingSkeletonIds],
                      [1, matchingPointSetIds],
                      [2, matchingPointcloudIds]]);
                  let groups = new Map();

                  if (similarityMode === 'same_suffix') {
                    // Find all pairs of objects that end with the same suffix, e.g.
                    // "_a" and "_b".
                    for (let [srcId, src] of matchingSources) {
                      if (!src) continue;
                      for (let id of src) {
                        let name = nameService.get(srcId)(id);
                        let lastSeperator = name.lastIndexOf('_');
                        // If no separator is found, the element will be part of an
                        // group.with no name.
                        let groupName = lastSeperator === -1 ? '' : name.substr(lastSeperator + 1);
                        let group = groups.get(groupName);
                        if (!group) {
                          group = [];
                          groups.set(groupName, group);
                        }
                        // Format: [type, id] with type = 0 for skeletons
                        group.push([srcId, id]);
                      }
                    }
                  } else if (similarityMode === 'lr_suffix') {
                    // Find all pairs of objects that share the same name before a
                    // _left and a _right suffix.
                    for (let [srcId, src] of matchingSources) {
                      if (!src) continue;
                      for (let id of src) {
                        let name = nameService.get(srcId)(id);
                        let lastSeperator = name.indexOf('_');
                        if (lastSeperator === -1) continue;

                        // We only want left and right suffix items
                        let suffix = name.substr(lastSeperator + 1);
                        if (suffix !== 'left' && suffix !== 'right') continue;

                        let groupName = name.substr(0, lastSeperator);
                        let group = groups.get(groupName);
                        if (!group) {
                          group = [];
                          groups.set(groupName, group);
                        }
                        // Format: [type, id] with type = 0 for skeletons
                        group.push([srcId, id]);
                      }
                    }
                  } else if (similarityMode === 'same_name') {
                    // Find all pairs of objects that share the same name
                    for (let [srcId, src] of matchingSources) {
                      if (!src) continue;
                      for (let id of src) {
                        let groupName = nameService.get(srcId)(id);
                        let group = groups.get(groupName);
                        if (!group) {
                          group = [];
                          groups.set(groupName, group);
                        }
                        // Format: [type, id] with type = 0 for skeletons
                        group.push([srcId, id]);
                      }
                    }
                  } else if (similarityMode === 'regex') {
                    // Create regex and capture everything before pattern in
                    // group for easier access.
                    let regex = new RegExp(`(.*)(${similarityModeRegex})`);
                    // Find all pairs of objects that share the same name in
                    // front of a pattern. described by a custom regex.
                    for (let [srcId, src] of matchingSources) {
                      if (!src) continue;
                      for (let id of src) {
                        let name = nameService.get(srcId)(id);
                        if (!regex.test(name)) {
                          // Ignore everything not matching
                          continue;
                        }
                        let match = regex.exec(name);
                        let groupName = match[1];
                        let group = groups.get(groupName);
                        if (!group) {
                          group = [];
                          groups.set(groupName, group);
                        }
                        // Format: [type, id] with type = 0 for skeletons, type
                        // = 1 for point sets (transformed skeletons) and type =
                        // 2 for point clouds.
                        group.push([srcId, id]);
                      }
                    }
                  } else {
                    throw new CATMAID.ValueError("Unknown similarity mode: " + similarityMode);
                  }

                  return getGroupConfirmation(widget, groups)
                    .then(() => {
                      matchingSubset = Array.from(groups.keys()).map(k => groups.get(k));
                    });
                }
              });

            let randomSkeletonIds;
            if (backendRandomSelection) {
              randomSkeletonIds = 'backend';
            } else {
              let randomSkeletonSource = CATMAID.skeletonListSources.getSource(randomSource);
              if (!randomSkeletonSource) {
                CATMAID.error("Can't find source: " + randomSource);
                return;
              }
              randomSkeletonIds = randomSkeletonSource.getSelectedSkeletons();
            }

            prepare
              .then(() => CATMAID.Similarity.addConfig(project.id, newIndexName,
                  matchingSkeletonIds, matchingPointSetIds, matchingPointcloudIds,
                  randomSkeletonIds, numRandomNeurons, lengthRandomNeurons,
                  minNodesRandomNeurons, newDistBreaks, newDotBreaks,
                  newTangentNeighbors, matchingMeta, matchingSubset))
              .then(function() {
                return widget.refresh();
              })
              .catch(CATMAID.handleError);
          }
        }, {
          type: 'file',
          label: 'Create from CSV file',
          title: 'Can read a CSV File with space as delimiter.',
          multiple: false,
          onclick: function(e) {
            let prepare = !CATMAID.containsSingleValidFile(e.target.files, 'csv') ?
                Promise.reject(new CATMAID.ValueError("No valid CSV file found")) :
                CATMAID.parseCSVFile(e.target.files[0], ' ', 0);
            prepare
              .then(csvLines => {
                // Show dialog with first three lines
                let dialog = new CATMAID.OptionsDialog("Load scores from CSV");
                dialog.appendMessage("The first two lines of the file you are going to " +
                    "import are shown below. Please select the appropriate import options.");
                let tableContainer = document.createElement('div');
                tableContainer.classList.add('help');
                let table = document.createElement('table');
                table.style.width = "100%";
                let nPreviewRows = csvLines.length > 1 ? 2 : 1;
                for (var i=0; i<nPreviewRows; ++i) {
                  let tr = document.createElement('tr');
                  let data = csvLines[i];
                  for (var j=0; j<data.length; ++j) {
                    let td = document.createElement('td');
                    td.appendChild(document.createTextNode(data[j]));
                    tr.appendChild(td);
                  }
                  table.appendChild(tr);
                }
                tableContainer.appendChild(table);
                dialog.appendChild(tableContainer);

                // Add option to change line skipping
                let hasHeaders = Number.isNaN(Number(csvLines[0][0]));
                var hasHeaderCb = dialog.appendCheckbox(
                    'Includes row and column headers (distance and dot breaks)', 'csv-import-has-headers',
                    hasHeaders, 'If enabled the first row and column are expected to be header rows.');
                // Add option to select column to read skeleton IDs from
                var distanceScaleInput = dialog.appendNumericField(
                    'Distance break scale', 'csv-import-distance-sclae',
                    1, 0, undefined, 0.1);

                let addHeaderPairToList = (value, list) => {
                  value = value.replace(/['"]/g, '').trim();
                  if (value[0] !== '(' && value[value.length - 1] !== ']') {
                    throw new CATMAID.ValueError("Expecting column and row headers of the form \"(a,b]\"");
                  }
                  let [a, b] = value.substr(1, value.length - 2).split(',');
                  if (list.length === 0 || Math.abs(list[list.length - 1] - a) > 0.00001) {
                    list.push(Number(a));
                  }
                  if (list.length === 0 || Math.abs(list[list.length - 1] - b) > 0.00001) {
                    list.push(Number(b));
                  }
                };

                return new Promise((resolve, reject) => {
                  dialog.onOK = function() {
                    let minRow = 0, minCol = 0;
                    let dotBreaks = newDotBreaks;
                    let distBreaks = newDistBreaks;
                    if (hasHeaderCb.checked) {
                      // We expect a line with values of the form "(0,0.1]"
                      dotBreaks = csvLines[0].reduce((o, v) => {
                        addHeaderPairToList(v, o);
                        return o;
                      }, []);
                      distBreaks = csvLines.reduce((o, line, r) => {
                        if (r > 0 && line.length > 1) {
                          addHeaderPairToList(line[0], o);
                        }
                        return o;
                      }, []);
                      minRow = 1;
                      minCol = 1;
                    }
                    if (dotBreaks.length !== csvLines[1].length - minCol + 1) {
                      throw new CATMAID.ValueError("The specified dot product breaks don't match the CSV data");
                    }
                    if (distBreaks.length !== csvLines.length - minRow) {
                      throw new CATMAID.ValueError("The specified distance breaks don't match the CSV data");
                    }

                    let distScale = Number(distanceScaleInput.value);
                    if (Number.isNaN(distScale)) {
                      throw new CATMAID.ValueError("Distance scaling is not a number");
                    }
                    distBreaks = distBreaks.map(b => b * distScale);

                    let score = csvLines.reduce((o, line, r) => {
                      if (r < minRow) {
                        return o;
                      }
                      let csvLine = [];
                      for (let c=0; c<line.length; ++c) {
                        if (c < minCol) {
                          continue;
                        }
                        csvLine.push(Number(line[c]));
                      }
                      o.push(csvLine);
                      return o;
                    }, []);
                    resolve({
                      distBreaks: distBreaks,
                      dotBreaks: dotBreaks,
                      score: score,
                    });
                  };
                  dialog.onCancel = function() {
                    reject();
                  };
                  dialog.show('500', 'auto');
                });
              })
              .then(fileScore => CATMAID.Similarity.addConfigFromScoring(project.id, newIndexName,
                  fileScore.distBreaks, fileScore.dotBreaks, fileScore.score, newTangentNeighbors))
              .then(function() {
                return widget.refresh();
              })
              .catch(CATMAID.handleError);
          },
        }, {
          type: 'button',
          label: 'Create built-in matrix',
          title: 'Create a new scoring matrix based on the matrix computed in the orginal publication.',
          multiple: false,
          onclick: function(e) {
            const scores = [
              [9.50009681841246, 9.21508335662349, 9.21115065315115, 8.77846019988287, 9.16480790878709, 9.22670304852642, 9.98177124602054, 9.98769540562331, 10.8047703362607, 11.3892297520051],
              [8.44775535484291, 9.04606831917705, 8.66795898209567, 8.62098080152923, 8.77627481345128, 8.99169678916886, 9.61799941175952, 9.49397224483499, 9.9038964289191, 10.5558600418055],
              [7.81414322934284, 8.27557633457944, 8.18660682886048, 8.23731427922735, 8.15598516511639, 8.44982093548525, 9.00303252641918, 8.77951149081028, 9.07759820573496, 9.72735167147373],
              [7.51616719646677, 7.68155524590478, 7.82523642940135, 7.79365902977448, 7.88687632703958, 8.03176502548019, 7.90419447261403, 7.89167667941778, 8.46217860141364, 9.35647238546052],
              [6.9783147327761, 6.94307801953134, 7.07921765812687, 7.04965078503871, 7.2130628384463, 6.93874902118156, 7.63696822638669, 7.4002162293118, 8.24372400571991, 8.80558524903729],
              [6.33719877733494, 6.51045037496395, 6.35737422729476, 6.73066764513181, 6.64133577166606, 6.68494299661635, 6.84521100428193, 6.96540340394039, 7.58420978365021, 8.30995640318606],
              [5.73499742229333, 5.77656385564567, 5.87488116875011, 6.07846921345912, 6.02417745573855, 5.93648482795035, 6.16518921344934, 6.30063662788765, 6.95985181784445, 7.87373732354423],
              [5.11581548287475, 5.02164949649811, 5.15657495321943, 5.10426523641483, 5.14093105810577, 5.10869075730527, 5.31350417757688, 5.3295303700301, 5.90895075813729, 6.51317233424717],
              [4.23399496093427, 4.15794772207134, 4.20728157596594, 4.15459017748659, 4.12686066546627, 4.07336802392446, 4.13970890702555, 4.30027565331642, 4.57805060814703, 5.16486934998009],
              [3.34026906899444, 3.3051324872601, 3.29598747412083, 3.26045243973712, 3.29236938733991, 3.17886713646518, 3.35977585932096, 3.35409654930982, 3.57637236900113, 3.97585033429852],
              [2.49516039627968, 2.52098424995215, 2.52305843981493, 2.46950414929279, 2.48275585435263, 2.49589362243518, 2.53247964713067, 2.47889449294332, 2.57140862978384, 3.03387575286047],
              [1.80239308584322, 1.78109465478104, 1.70675762037913, 1.77535908912846, 1.75289855885997, 1.75146698137153, 1.79082680877923, 1.71478695619744, 1.76591615076793, 2.11190542667794],
              [1.23204089761119, 1.24902175781678, 1.15056046332701, 1.15360646172969, 1.10537643865398, 1.09095576409395, 1.11211340817387, 1.0739799591457, 1.21329534346802, 1.36231448114903],
              [0.401029977653807, 0.405860318670642, 0.364813354157233, 0.445292761733466, 0.340571513975563, 0.338199499746287, 0.28008292141423, 0.257239082236011, 0.309758722887181, 0.460951328334644],
              [-0.232687426817219, -0.284912539606733, -0.336660961477481, -0.341205197026599, -0.403612584363158, -0.449623119741235, -0.410464639556653, -0.494928060332013, -0.486278922443352, -0.343856434129093],
              [-0.720642343060965, -0.737187893583455, -0.791598721371623, -0.913295681308958, -0.865874510428618, -0.929914609825734, -0.938060798925512, -0.949574939903263, -0.949001462020957, -0.892505828852155],
              [-1.20775367451133, -1.22429143802357, -1.2328210224835, -1.31777889984332, -1.3345851397256, -1.38169640073789, -1.39943889386218, -1.35585589894259, -1.36677833201497, -1.31413253590163],
              [-1.64590453464875, -1.67268478052567, -1.69807588928856, -1.75618281243588, -1.79136287047847, -1.87854037507812, -1.87418727262208, -1.91954256176612, -1.93941093200183, -1.93797132206708],
              [-2.51777719454819, -2.54534918684165, -2.5397234879536, -2.54576319981858, -2.60681273498349, -2.68594630871072, -2.66326887245257, -2.70184701924541, -2.78173786253938, -2.91227645240933],
              [-3.96009040652025, -4.03138759725922, -4.07211802129466, -4.14735135252196, -4.33002990458046, -4.42005336179794, -4.5079151442239, -4.79405146609799, -4.83321292801167, -5.08567253503641],
              [-9.92103817171225, -10.08763000068, -10.0554347237019, -10.1026820447963, -10.0868240800316, -9.91220186436133, -10.0799576279701, -9.95197881595302, -10.0536078316845, -10.1287588679926]
            ];
            let dotBreaks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
            let distBreaks = [0, 0.75, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 25, 30, 40, 500];
            let configName = 'New config';

            let dialog = new CATMAID.OptionsDialog("Create common config", {
              "Cancel": function() {},
              "Add similarity configuration": function() {
                let minRow = 0, minCol = 0;
                if (dotBreaks.length !== scores[1].length + 1) {
                  throw new CATMAID.ValueError("The specified dot product breaks don't match the CSV data");
                }
                if (distBreaks.length !== scores.length + 1) {
                  throw new CATMAID.ValueError("The specified distance breaks don't match the CSV data");
                }

                let distScale = Number(distanceScaleInput.value);
                if (Number.isNaN(distScale)) {
                  throw new CATMAID.ValueError("Distance scaling is not a number");
                }
                distBreaks = distBreaks.map(b => b * distScale);

                let score = scores.reduce((o, line, r) => {
                  if (r < minRow) {
                    return o;
                  }
                  let lineScores = [];
                  for (let c=0; c<line.length; ++c) {
                    if (c < minCol) {
                      continue;
                    }
                    lineScores.push(Number(line[c]));
                  }
                  o.push(lineScores);
                  return o;
                }, []);

                CATMAID.Similarity.addConfigFromScoring(project.id, configName,
                    distBreaks, dotBreaks, score, newTangentNeighbors)
                  .then(function() {
                    return widget.refresh();
                  })
                  .catch(CATMAID.handleError);
              }
            });
            let newScoreNameInput = dialog.appendField('Similarity name', 'name', configName);
            newScoreNameInput.addEventListener('change', function(e) {
              configName = e.target.value;
            });
            dialog.appendMessage("The built-in scoring matrix values close points with a similar tangent. Its columns form the breaks/buckets of the range of possible dot products of the tangents. They can be edited below:");

            let dotBreaksField = dialog.appendField('Dot breaks', 'dot-breaks', dotBreaks.map(String).join(', '));
            dotBreaksField.style.width = '25em';
            dotBreaksField.onchange = function(e) {
              let breaks = e.target.value.split(',').map(v => Number(v.trim()));
              if (breaks.some(v => v === undefined || Number.isNaN(v))) {
                CATMAID.warn('Can\'t parse list of tangent dot product breaks');
                return;
              }
              dotBreaks = breaks;
            };

            dialog.appendMessage("The rows map to distance ranges, that are scored separately, provided in micrometer (!):");

            let distBreaksField = dialog.appendField('Distance breaks', 'distance-breaks', distBreaks.map(String).join(', '));
            distBreaksField.style.width = '25em';
            distBreaksField.onchange = function(e) {
              let breaks = e.target.value.split(',').map(v => Number(v.trim()));
              if (breaks.some(v => v === undefined || Number.isNaN(v))) {
                CATMAID.warn('Can\'t parse list of distance breaks');
                return;
              }
              distBreaks = breaks;
            };

            dialog.appendMessage("These distance breaks were chosen for an adult fly brain of the size of 0.1mm^3. You might want to scale the distances breaks to fit your dataset:");

            let distanceScaleInput = dialog.appendNumericField('Distance scale', 'distance-scale', '1', 0);
            distanceScaleInput.style.width = '5em';

            dialog.show('500', 'auto');
          }
        }];
      },
      createContent: function(content, widget) {
        // Create table of all visible configurations.
        let container = content.appendChild(document.createElement('div'));
        container.classList.add('container');
        let table = container.appendChild(document.createElement('table'));
        table.setAttribute('id', widget.idPrefix + 'config-table');
        let datatable = $(table).DataTable({
          dom: 'lfrtip',
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            CATMAID.Similarity.listAllConfigs(project.id)
              .then(function(result) {
                callback({
                  draw: data.draw,
                  data: result,
                  recordsTotal: result.length,
                  recordsFiltered: result.length
                });
              })
              .catch(CATMAID.handleError);
          },
          order: [[4, 'desc']],
          columns: [{
              data: "id",
              title: "Id",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return row.id;
              }
            }, {
              data: "name",
              title: "Name",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                if ("display") {
                  return '<a href="#" data-action="select-group" data-group-id="' +
                      row.id + '" >' + row.name + '</a>';
                } else {
                  return row.name;
                }
              }
            }, {
              title: "User",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(row.user_id).login;
              }
            }, {
              data: "status",
              title: "Status",
              orderable: true,
              class: 'cm-center',
            }, {
              data: "creation_time",
              title: "Created on (UTC)",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  var date = CATMAID.tools.isoStringToDate(row.creation_time);
                  if (date) {
                    return CATMAID.tools.dateToString(date);
                  } else {
                    return "(parse error)";
                  }
                } else {
                  return data;
                }
              }
            }, {
              title: "Distance bins",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return row.distance_breaks.length - 1;
              }
            }, {
              data: "distance_breaks",
              title: "Distance breaks",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                let db = row.distance_breaks;
                let allBins = db.join(', ');
                let text = (db && db.length > 4) ?
                    (db[0] + ', ' +  db[1] +  ' … ' + db[db.length - 2] + ', ' + db[db.length - 1]) :
                    allBins;
                return '<span title="' + allBins + '">' + text + '</span>';
              }
            }, {
              title: "Dot product bins",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return row.dot_breaks.length - 1;
              }
            }, {
              data: "dot_breaks",
              title: "Dot product breaks",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                let db = row.dot_breaks;
                let allBins = db.join(', ');
                let text = (db && db.length > 4) ?
                    (db[0] + ', ' +  db[1] +  ' … ' + db[db.length - 2] + ', ' + db[db.length - 1]) :
                    allBins;
                return '<span title="' + allBins + '">' + text + '</span>';
              }
            }, {
              data: "resample_step",
              title: "Resample (nm)",
              orderable: true,
              class: 'cm-center',
            }, {
              data: "tangent_neighbors",
              title: "Tangent neighbors",
              orderable: true,
              class: 'cm-center',
            }, {
              data: "match_sample",
              title: "Match sample",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                if (row.match_sample) {
                  let ms = row.match_sample;
                  if (type === 'display') {
                    let components = [`ID: ${ms.id}`];
                    if (ms.sample_neurons && ms.sample_neurons.length > 0) {
                      components.push('Neurons: ' + ms.sample_neurons.length);
                    }
                    if (ms.sample_pointclouds && ms.sample_pointclouds.length > 0) {
                      components.push('Point clouds: ' + ms.sample_pointclouds.length);
                    }
                    if (ms.sample_pointsets && ms.sample_pointsets.length > 0) {
                      components.push('Point sets: ' + ms.sample_pointsets.length);
                    }
                    return '<a href="#" data-role="show-match-sample">' + components.join(', ') + '</a>';
                  } else {
                    return ms.id;
                  }
                }
                return '-';
              }
            }, {
              data: "random_sample",
              title: "Random sample",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                if (row.random_sample) {
                  let rs = row.random_sample;
                  if (type === 'display') {
                    return '<a href="#" data-role="show-random-sample">ID: ' + rs.id +
                        ', Neurons: ' + rs.sample_neurons.length + '</a>';
                  }
                  return row.random_sample.id;
                }
                return '-';
              }
            }, {
              data: "scoring",
              title: "Scoring",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {

                if (row.scoring && row.scoring.length > 0) {
                  let allCells = '[' + row.scoring.map(listToStr).join('\n, ') + ']';
                  return '<a data-role="show-similarity" href="#" title="' + allCells + '">View</a>';
                } else {
                  return '-';
                }
              }
            }, {
              title: "Action",
              render: function(data, type, row, meta) {
                return '<a href="#" data-role="delete-config">Delete</a> <a href="#" data-role="recompute-config">Recompute</a>';
              }
            }]
        }).on('click', 'a[data-role=recompute-config]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          if (!confirm('Are you sure you want to to recompute NBLAST similarity matrix #' +
              data.id + '?')) {
            return;
          }
          CATMAID.Similarity.recomputeConfig(project.id, data.id)
            .then(function() {
              CATMAID.msg('Success', 'NBLAST config recomputation queued');
              widget.refresh();
            })
            .catch(CATMAID.handleError);
        }).on('click', 'a[data-role=delete-config]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          if (!confirm('Are you sure you want to to delete NBLAST configuration #' +
              data.id + '?')) {
            return;
          }
          CATMAID.Similarity.deleteConfig(project.id, data.id)
            .then(function() {
              CATMAID.msg('Success', 'NBLAST configuration deleted');
              widget.refresh();
            })
            .catch(CATMAID.handleError);
        }).on('click', 'a[data-role=show-match-sample]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          NeuronSimilarityWidget.showSampleDialog(data, data.match_sample, "Matching sample");
        }).on('click', 'a[data-role=show-random-sample]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          NeuronSimilarityWidget.showSampleDialog(data, data.random_sample, "Random sample");
        }).on('click', 'a[data-role=show-similarity]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          NeuronSimilarityWidget.showSimilarityScoringDialog(data);
        });
      },
      handleConfigStatusChange: function(widget, configId, status) {
        let table = document.getElementById(widget.idPrefix + 'config-table');
        if (table) {
          $(table).DataTable().ajax.reload();
        }
      },
      refresh: function(widget) {
        let table = document.getElementById(widget.idPrefix + 'config-table');
        if (table) {
          $(table).DataTable().ajax.reload();
        }

        widget.updateDisplayTransformOptions();
      }
    },
    pointclouds: {
      title: "Point clouds",
      createControls: function(widget) {
        let newPointcloudName = '';
        let newPointcloudDescription = '';
        let csvLineSkip = true;
        let pointData = null;
        let pointMatches = null;
        let loadedTransforms = 0;
        let images = null;
        let swapZY = false;
        let invertY = false;
        let sample = true;
        let sampleSize = 1000;
        let leftDim = 'y';

        let newPointcloudSection = document.createElement('span');
        newPointcloudSection.classList.add('section-header');
        newPointcloudSection.appendChild(document.createTextNode('New point cloud'));

        // Group selection
        let groupSelectWrapper = document.createElement('label');
        groupSelectWrapper.appendChild(document.createTextNode('Restrict to group'));
        groupSelectWrapper.setAttribute('title', 'A group that has permission to see this point cloud. It is hidden for everyone else. Only groups this user is member of are shown.');
        let groupSelect = document.createElement('select');
        groupSelect.setAttribute('id', widget.idPrefix + 'group-select');
        groupSelectWrapper.appendChild(groupSelect);
        let groupId = groupSelect.value && groupSelect.value.length > 0 ?
            parseInt(groupSelect.value, 10) : null;
        groupSelect.onchange = function(e) {
          groupId = parseInt(e.target.value, 10);
        };

        // Add available groups to select
        NeuronSimilarityWidget.updateGroupSelect(groupSelect)
          .then(function() {
            // Select first option by default.
            if (groupSelect.options.length > 0 && !groupId && groupId !== 0) {
              groupId = groupSelect.options[0].value;
              groupSelect.value = groupId;
            }
          });

        return [{
          type: 'button',
          label: 'Refresh',
          onclick: widget.refresh.bind(widget),
        }, {
          type: 'button',
          label: 'Reset',
          onclick: function() {
            newPointcloudName = '';
            newPointcloudDescription = '';
            csvLineSkip = true;
            pointData = null;
            pointMatches = null;
            loadedTransforms = 0;
            images = null;
            // Reset UI
            $('#neuron-similarity-new-pointcloud-name' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-pointcloud-description' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-pointcloud-header' + widget.widgetID)
              .prop('checked', true);
            $('#neuron-similarity-new-pointcloud-points' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-pointcloud-images' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-pointcloud-images' + widget.widgetID + ' + input[type=button]')
              .val('Images');
            $('#neuron-similarity-new-pointcloud-transformation' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-pointcloud-transformation' + widget.widgetID + ' + input[type=button]')
              .val('Transformation CSVs');
            $('#neuron-similarity-new-pointcloud-points' + widget.widgetID)
              .closest('div')
              .find('.files-loaded')
              .removeClass('files-loaded');

            widget.importJob = null;
            widget.refresh();

            CATMAID.msg("Success", "Point cloud form reset");
          }
        }, {
          type: 'checkbox',
          label: 'With images',
          id: 'neuron-similarity-pointcloud-with-images' + widget.widgetID,
          value: widget.showPointCloudImages,
          onclick: function() {
            widget.showPointCloudImages = this.checked;
            widget.refresh();
          },
        }, {
          type: 'child',
          element: newPointcloudSection,
        }, {
          type: 'text',
          label: 'Name',
          title: 'An optional name for this pointcloud',
          id: 'neuron-similarity-new-pointcloud-name' + widget.widgetID,
          value: newPointcloudName,
          length: 8,
          onchange: function() {
            newPointcloudName = this.value;
          }
        }, {
          type: 'text',
          label: 'Descr.',
          title: 'An optional description of this pointcloud',
          id: 'neuron-similarity-new-pointcloud-description' + widget.widgetID,
          placeholder: '(optional)',
          value: newPointcloudDescription,
          length: 8,
          onchange: function() {
            newPointcloudDescription = this.value;
          }
        }, {
          type: 'checkbox',
          label: 'CSV header',
          id: 'neuron-similarity-new-pointcloud-header' + widget.widgetID,
          value: csvLineSkip,
          onclick: function() {
            csvLineSkip = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Swap Y/Z',
          id: 'neuron-similarity-new-pointcloud-swap-yz' + widget.widgetID,
          value: swapZY,
          onclick: function() {
            swapZY = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Invert Y',
          id: 'neuron-similarity-new-pointcloud-invert-y' + widget.widgetID,
          value: invertY,
          onclick: function() {
            invertY = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Resample (nm)',
          value: sample,
          onclick: function() {
            sample = this.checked;
            let sampleSizeInput = document.getElementById(
                'neuron-similarity-sample-size' + widget.widgetID);
            if (sampleSizeInput) {
              sampleSizeInput.disabled = !this.checked;
            }
          },
        }, {
          type: 'numeric',
          id: 'neuron-similarity-sample-size' + widget.widgetID,
          min: 0,
          length: 4,
          value: sampleSize,
          disabled: !sample,
          onchange: function() {
            let val = parseFloat(this.value);
            if (val !== undefined && !Number.isNaN(val)) {
              sampleSize = val;
            }
          },
        }, {
          type: 'file',
          label: 'Point CSV',
          title: 'A CSV file that contains each point of this pointcloud. Each row should have the x, y and z values.',
          id: 'neuron-similarity-new-pointcloud-points' + widget.widgetID,
          multiple: false,
          onclick: function(e, clickedButton) {
            // Try loading point CSV file
            if (e.target.files.length !== 1) {
              CATMAID.warn("Please select a single point CSV file");
              return;
            }
            let self = this;
            CATMAID.parseCSVFile(e.target.files[0], ',', csvLineSkip ? 1 : 0,
                hasThreeElements)
              .then(function(parsedPointData) {
                parsedPointData.forEach(function(p) {
                  p[0] = parseFloat(p[0]);
                  p[1] = parseFloat(p[1]);
                  p[2] = parseFloat(p[2]);
                });
                pointData = parsedPointData;
                self.classList.add('files-loaded');
                clickedButton.classList.add('files-loaded');
                CATMAID.msg("Success", "Read " + parsedPointData.length + " points");
              })
              .catch(CATMAID.handleError);
          }
        }, {
          type: 'select',
          label: 'Project left dir',
          title: 'Select the direction in project space (where all tracing data is) that represents a canonical "left" (as opposed to right) in the data set. This is only used when 7-column transformation data is imported to know which landmark location is left.',
          value: leftDim,
          entries: [
            {title: '+X', value: 'x'},
            {title: '+Y', value: 'y'},
            {title: '+Z', value: 'z'},
            {title: '-X', value: '-x'},
            {title: '-Y', value: '-y'},
            {title: '-Z', value: '-z'},
          ],
          onchange: function() {
            leftDim = this.value;
          },
        }, {
          type: 'file',
          label: 'Transformation CSVs',
          title: 'An optional set of CSV files that contain a set of point matches each that are used to build a transformation that is applied to the input points.',
          id: 'neuron-similarity-new-pointcloud-transformation' + widget.widgetID,
          multiple: false,
          onclick: function(e, clickedButton) {
            // Try loading point CSV file
            if (e.target.files.length !== 1) {
              CATMAID.warn("Please select a single transformation CSV file");
              return;
            }
            let self = this;

            if (!pointMatches) {
              pointMatches = [];
            }

            CATMAID.NeuronSimilarityWidget.loadTransformationFile(e.target.files[0],
                csvLineSkip, leftDim)
              .then(function(loadedPointMatches) {
                ++loadedTransforms;
                Array.prototype.push.apply(pointMatches, loadedPointMatches);
                self.classList.add('files-loaded');
                clickedButton.classList.add('files-loaded');
                clickedButton.value = "Transformation CSVs (" + loadedTransforms + ")";
                CATMAID.msg("Success", "Read " + pointMatches.length + " point matches");
              })
              .catch(CATMAID.handleError);
          }
        }, {
          type: 'file',
          label: 'Images',
          title: 'An optional set of image files that represents the pointcloud',
          id: 'neuron-similarity-new-pointcloud-images' + widget.widgetID,
          multiple: false,
          onclick: function(e, clickedButton) {
            // Try loading point CSV file
            if (e.target.files.length !== 1) {
              CATMAID.warn("Please select a single image file at a time");
              return;
            }
            let self = this;
            let file = e.target.files[0];
            let reader = new FileReader();
            reader.onload = function() {
              let dataURL = reader.result;
              // Ask user for description for each image
              let dialog = new CATMAID.OptionsDialog("Image description");
              dialog.appendMessage("Please add a description for image \"" + file.name +"\".");
              let description = dialog.appendField("Description", undefined, "", true);
              dialog.onOK = function() {
                if (!images) {
                  images = [];
                }
                images.push({
                  description: description.value,
                  image: dataURL,
                  file: file,
                  name: file.name,
                });
                self.classList.add('files-loaded');
                clickedButton.classList.add('files-loaded');
                clickedButton.value = "Images (" + images.length + ")";
                CATMAID.msg("Success", "Image \"" + file.name + "\" added");
              };
              dialog.show("auto", "auto");
            };
            reader.readAsDataURL(file);
          }
        }, {
          type: 'child',
          element: groupSelectWrapper,
        }, {
          type: 'button',
          label: 'Add point cloud',
          onclick: function() {
            if (!newPointcloudName) {
              CATMAID.warn("Need a point cloud name");
              return;
            }
            if (!pointData) {
              CATMAID.warn("Need point data for point cloud");
              return;
            }
            let effectiveGroupId = (groupId & groupId !== 'none') ?
                groupId : undefined;
            let effectiveSampleSize = (sample && sampleSize) ?
                sampleSize : undefined;
            widget.addPointCloud(newPointcloudName, newPointcloudDescription,
                pointData, pointMatches, images, swapZY, invertY, effectiveGroupId,
                effectiveSampleSize)
              .then(function() {
                widget.refresh();
                CATMAID.msg("Success", "Point cloud created");
              })
              .catch(CATMAID.handleError);
          },
        }];
      },
      createContent: function(content, widget) {
        // Create table of all visible configurations.
        let container = content.appendChild(document.createElement('div'));
        container.classList.add('container');
        let table = container.appendChild(document.createElement('table'));
        table.setAttribute('id', widget.idPrefix + 'pointcloud-table');
        let datatable = $(table).DataTable({
          dom: 'lfrtip',
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            widget.updatePointClouds()
              .then(function(result) {
                callback({
                  draw: data.draw,
                  data: result,
                  recordsTotal: result.length,
                  recordsFiltered: result.length
                });
              })
              .catch(CATMAID.handleError);
          },
          order: [],
          columns: [{
              title: "",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return '<input type="checkbox" data-role="select-pointcloud"' +
                    (widget.pointCloudSelection[row.id] ? ' checked' : '') + '></input>';
              }
            }, {
              data: "id",
              title: "Id",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return row.id;
              }
            }, {
              data: "name",
              title: "Name",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                if ("display") {
                  return '<a href="#" data-action="select-group" data-group-id="' +
                      row.id + '" >' + row.name + '</a>';
                } else {
                  return row.name;
                }
              }
            }, {
              data: "description",
              title: "Description",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return data && data.length > 0 ? data : '(none)';
              }
            }, {
              title: "User",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(row.user_id).login;
              }
            }, {
              data: "creation_time",
              title: "Created on (UTC)",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  var date = CATMAID.tools.isoStringToDate(row.creation_time);
                  if (date) {
                    return CATMAID.tools.dateToString(date);
                  } else {
                    return "(parse error)";
                  }
                } else {
                  return data;
                }
              }
            }, {
              title: "Images",
              orderable: false,
              class: "cm-center",
              visible: widget.showPointCloudImages,
              render: function(data, type, row, meta) {
                return `<span class="image-list" data-pointcloud-id="${row.id}"></span>`;
              }
            }, {
              title: "Action",
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return '<a href="#" data-role="delete-pointcloud">Delete</a> <a href="#" data-role="show-images">View images</a> <a href="#" data-role="show-pointcloud">View</a>';
              }
            }],
          createdRow: function( row, data, dataIndex ) {
            row.setAttribute('data-pointcloud-id', data.id);
          },
        }).on('click', 'a[data-role=delete-pointcloud]', function() {
          let pointcloudId = this.closest('tr').dataset.pointcloudId;
          if (pointcloudId) {
            CATMAID.Pointcloud.delete(project.id, pointcloudId)
              .then(result => {
                datatable.ajax.reload();
                CATMAID.msg("Success", "Deleted point cloud #" + result.pointcloud_id);
              })
              .catch(CATMAID.handleError);
          }
        }).on('click', 'a[data-role=show-pointcloud]', function() {
          let pointcloudId = this.closest('tr').dataset.pointcloudId;
          if (pointcloudId) {
            // Show point cloud in a new 3D viewer dialog.
            let widget3d = WindowMaker.create('3d-viewer').widget;
            widget3d.showPointCloud(pointcloudId, true);
          }
        }).on('click', 'a[data-role=show-images]', function() {
          let pointcloudId = this.closest('tr').dataset.pointcloudId;
          if (pointcloudId) {
            // Show point cloud in a new 3D viewer dialog.
            NeuronSimilarityWidget.showPointCloudImages(project.id, pointcloudId, true);
          }
        }).on('click', 'input[data-role=select-pointcloud]', function() {
          let pointcloudId = this.closest('tr').dataset.pointcloudId;
          if (pointcloudId) {
            widget.pointCloudSelection[pointcloudId] = !widget.pointCloudSelection[pointcloudId];
          }
        }).on('draw', function() {
          // Update image column, if visible
          if (widget.showPointCloudImages) {
            // Get image information on currently displayed point clouds
            let table = $(this).closest('table');
            let datatable = table.DataTable();
            let pageData = datatable.rows({'page': 'current'}).data();
            let pagePointcloudIds = pageData.map(function(p) { return p.id; }).toArray();
            if (pagePointcloudIds && pagePointcloudIds.length > 0) {
              CATMAID.Pointcloud.list(project.id, false, true, pagePointcloudIds)
                .then(function(result) {
                  // Find span elements of individual point clouds
                  result.forEach(function(pointcloud) {
                    let span = $(`span.image-list[data-pointcloud-id=${pointcloud.id}]`, table).empty();

                    for (let image of pointcloud.images) {
                      let imageSource = CATMAID.Pointcloud.getImagePath(project.id, pointcloud.id, image.id);
                      let description = image.description ? image.description : '(no description)';
                      let imageTitle = `${image.name} (${image.id}): ${description}`;
                      span.append('<img src="' + imageSource + '" title="' + imageTitle + '" style="height: 150px; margin: 0 0.4em 0 0.4em;" />');
                    }
                  });
                })
                .catch(CATMAID.handleError);
            }
          }
        });

        // Add a toggle-all checkbox for point cloud selection
        $($('th', table)[0]).append($('<input title="Toogle selection of all pointclouds" ' +
            'type="checkbox"></input>').on('change', function() {
              for (let pcid in widget.pointCloudSelection) {
                widget.pointCloudSelection[pcid] = this.checked;
              }
              datatable.rows().invalidate();
            }));
      },
      refresh: function(widget) {
        let table = document.getElementById(widget.idPrefix + 'pointcloud-table');
        if (table) {
          let datatable = $(table).DataTable();
          datatable.column(6).visible(widget.showPointCloudImages);
          datatable.ajax.reload();

        }
      }
    },
    'pointcloud-import': {
      /**
       * Import a series of CSV files along with images and a shared
       * transformation.
       */
      title: "Point cloud import",
      createControls: function(widget) {
        let newPointcloudFilter = '';
        let newPointcloudSkipN = 0;
        let newPointcloudName = '%f';
        let newPointcloudDescription = '';
        let csvLineSkip = true;
        let pointMatches = null;
        let loadedTransforms = 0;
        let images = null;
        let swapZY = false;
        let invertY = false;
        let sample = true;
        let sampleSize = 1000;
        let csvFiles = [];
        let imageFileSets = [];
        let leftDim = 'y';

        let newPointcloudSection = document.createElement('span');
        newPointcloudSection.classList.add('section-header');
        newPointcloudSection.appendChild(document.createTextNode('New point clouds'));

        // Group selection
        let groupSelectWrapper = document.createElement('label');
        groupSelectWrapper.appendChild(document.createTextNode('Restrict to group'));
        groupSelectWrapper.setAttribute('title', 'A group that has permission to see this point cloud. It is hidden for everyone else. Only groups this user is member of are shown.');
        let groupSelect = document.createElement('select');
        groupSelect.setAttribute('id', widget.idPrefix + 'group-select');
        groupSelectWrapper.appendChild(groupSelect);
        let groupId = groupSelect.value && groupSelect.value.length > 0 ?
            parseInt(groupSelect.value, 10) : null;
        groupSelect.onchange = function(e) {
          groupId = parseInt(e.target.value, 10);
        };

        // Add available groups to select
        NeuronSimilarityWidget.updateGroupSelect(groupSelect)
          .then(function() {
            // Select first option by default.
            if (groupSelect.options.length > 0 && !groupId && groupId !== 0) {
              groupId = groupSelect.options[0].value;
              groupSelect.value = groupId;
            }
          });

        return [{
          type: 'button',
          label: 'Refresh',
          onclick: widget.refresh.bind(widget),
        }, {
          type: 'button',
          label: 'Reset',
          onclick: function() {
            self.importJob = null;
            newPointcloudName = '%f';
            newPointcloudFilter = '';
            newPointcloudSkipN = 0;
            newPointcloudDescription = '';
            csvLineSkip = true;
            pointMatches = null;
            loadedTransforms = 0;
            images = null;
            // Reset UI
            $('#neuron-similarity-new-import-pointcloud-name' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-import-pointcloud-description' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-import-pointcloud-header' + widget.widgetID)
              .prop('checked', true);
            $('#neuron-similarity-new-import-pointcloud-points' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-import-pointcloud-images' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-import-pointcloud-images' + widget.widgetID + ' + input[type=button]')
              .val('Images');
            $('#neuron-similarity-new-import-pointcloud-transformation' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-import-pointcloud-transformation' + widget.widgetID + ' + input[type=button]')
              .val('Transformation CSVs');
            $('#neuron-similarity-new-import-pointcloud-points' + widget.widgetID)
              .closest('div')
              .find('.files-loaded')
              .removeClass('files-loaded');
            $('#neuron-similarity-new-import-pointcloud-import' + widget.widgetID)
              .attr('disabled', 'disabled');

            CATMAID.msg("Success", "Point cloud form reset");
          }
        }, {
          type: 'child',
          element: newPointcloudSection,
        }, {
          type: 'text',
          label: 'Path filter',
          placeholder: 'Use \'/\' for RegEx',
          title: 'An optional filter for loaded data',
          id: 'neuron-similarity-new-import-pointcloud-filter' + widget.widgetID,
          value: newPointcloudFilter,
          length: 8,
          onchange: function() {
            newPointcloudFilter = this.value;
          }
        }, {
          type: 'numeric',
          label: 'Skip N',
          title: 'An optional offset to the available files from where to start to import',
          id: 'neuron-similarity-new-import-pointcloud-skip' + widget.widgetID,
          value: newPointcloudSkipN,
          length: 3,
          onchange: function() {
            let value = parseInt(this.value, 10);
            if (value && !Number.isNaN(value)) {
              newPointcloudSkipN = value;
            }
          }
        }, {
          type: 'text',
          label: 'Name',
          title: 'An optional name for this pointcloud. The placehoolder %f can be used for the file name without extension',
          id: 'neuron-similarity-new-import-pointcloud-name' + widget.widgetID,
          value: newPointcloudName,
          length: 8,
          onchange: function() {
            newPointcloudName = this.value;
          }
        }, {
          type: 'text',
          label: 'Descr.',
          title: 'An optional description of this pointcloud',
          id: 'neuron-similarity-new-import-pointcloud-description' + widget.widgetID,
          placeholder: '(optional)',
          value: newPointcloudDescription,
          length: 8,
          onchange: function() {
            newPointcloudDescription = this.value;
          }
        }, {
          type: 'checkbox',
          label: 'CSV header',
          id: 'neuron-similarity-new-import-pointcloud-header' + widget.widgetID,
          value: csvLineSkip,
          onclick: function() {
            csvLineSkip = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Swap Y/Z',
          id: 'neuron-similarity-new-import-pointcloud-swap-yz' + widget.widgetID,
          value: swapZY,
          onclick: function() {
            swapZY = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Invert Y',
          id: 'neuron-similarity-new-import-pointcloud-invert-y' + widget.widgetID,
          value: invertY,
          onclick: function() {
            invertY = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Resample (nm)',
          value: sample,
          onclick: function() {
            sample = this.checked;
            let sampleSizeInput = document.getElementById(
                'neuron-similarity-sample-size' + widget.widgetID);
            if (sampleSizeInput) {
              sampleSizeInput.disabled = !this.checked;
            }
          },
        }, {
          type: 'numeric',
          id: 'neuron-similarity-sample-size' + widget.widgetID,
          min: 0,
          length: 4,
          value: sampleSize,
          disabled: !sample,
          onchange: function() {
            let val = parseFloat(this.value);
            if (val !== undefined && !Number.isNaN(val)) {
              sampleSize = val;
            }
          },
        }, {
          type: 'folder',
          label: 'Point CSV folder',
          title: 'Set a folder containing CSV file that contains each point of this pointcloud. Each row should have the x, y and z values.',
          id: 'neuron-similarity-new-import-pointcloud-points' + widget.widgetID,
          multiple: false,
          onclick: function(e, clickedButton) {
            // Try loading point CSV file
            if (e.target.files.length === 0) {
              CATMAID.warn("No files found in folder");
              return;
            }
            csvFiles = Array.from(e.target.files);
            this.classList.add('files-loaded');
            clickedButton.classList.add('files-loaded');
            CATMAID.msg("Success", "Found " + e.target.files.length + " files in the selected folder");
          }
        }, {
          type: 'select',
          label: 'Project left dir',
          title: 'Select the direction in project space (where all tracing data is) that represents a canonical "left" (as opposed to right) in the data set. This is only used when 7-column transformation data is imported to know which landmark location is left.',
          value: leftDim,
          entries: [
            {title: '+X', value: 'x'},
            {title: '+Y', value: 'y'},
            {title: '+Z', value: 'z'},
            {title: '-X', value: '-x'},
            {title: '-Y', value: '-y'},
            {title: '-Z', value: '-z'},
          ],
          onchange: function() {
            leftDim = this.value;
          },
        }, {
          type: 'file',
          label: 'Transformation CSVs',
          title: 'A CSV file that contains an optional set of point matches that is used to build a transformation that is applied to the input points.',
          id: 'neuron-similarity-new-import-pointcloud-transformation' + widget.widgetID,
          multiple: false,
          onclick: function(e, clickedButton) {
            // Try loading point CSV file
            if (e.target.files.length !== 1) {
              CATMAID.warn("Please select a single transformation CSV file");
              return;
            }
            let self = this;

            if (!pointMatches) {
              pointMatches = [];
            }

            CATMAID.NeuronSimilarityWidget.loadTransformationFile(e.target.files[0],
                csvLineSkip, leftDim)
              .then(function(loadedPointMatches) {
                ++loadedTransforms;
                Array.prototype.push.apply(pointMatches, loadedPointMatches);
                self.classList.add('files-loaded');
                clickedButton.classList.add('files-loaded');
                clickedButton.value = "Transformation CSVs (" + loadedTransforms + ")";
                CATMAID.msg("Success", "Read " + pointMatches.length + " point matches");
              })
              .catch(CATMAID.handleError);
          }
        }, {
          type: 'folder',
          label: 'Image folders',
          title: 'An optional set of folders that contain image files that represent individual  pointclouds',
          id: 'neuron-similarity-new-import-pointcloud-images' + widget.widgetID,
          multiple: false,
          onclick: function(e, clickedButton) {
            let imageFiles = Array.from(e.target.files);
            // Try loading point CSV file
            if (imageFiles.length === 0) {
              CATMAID.warn("Could not find any file in the selected image folder");
              return;
            }
            let self = this;
            // Ask user for description for each image
            let dialog = new CATMAID.OptionsDialog("Image description");
            dialog.appendMessage("Please add a description for images from " +
                "this folder. You can use the placeholer %f to reference the " +
                "filename of an actual file (e.g. \"Skeleton projection %f\")");
            let description = dialog.appendField("Description", undefined, "", true);
            dialog.onOK = function() {
              imageFileSets.push({
                description: description.value,
                files: imageFiles,
              });
              self.classList.add('files-loaded');
              clickedButton.classList.add('files-loaded');
              clickedButton.value = "Images folders (" + imageFileSets.length + ")";
              CATMAID.msg("Success", "Image folder added");
            };
            dialog.show(500, "auto", true);
          }
        }, {
          type: 'child',
          element: groupSelectWrapper,
        }, {
          type: 'button',
          label: 'Load point clouds',
          onclick: function() {
            if (!newPointcloudName) {
              CATMAID.warn("Need a point cloud name");
              return;
            }
            if (!csvFiles || csvFiles.length === 0) {
              CATMAID.warn("No CSV file folder selected");
              return;
            }
            let effectiveGroupId = (groupId & groupId !== 'none') ?
                groupId : undefined;
            let effectiveSampleSize = (sample && sampleSize) ?
                sampleSize : undefined;

            NeuronSimilarityWidget.loadPointcloudsFromFiles(newPointcloudName, newPointcloudDescription,
                csvFiles, pointMatches, imageFileSets, swapZY, invertY, effectiveGroupId,
                effectiveSampleSize, newPointcloudFilter, newPointcloudSkipN)
              .then(function(importJob) {
                widget.importJob = importJob;
                widget.refresh();
                CATMAID.msg("Success", "Point clouds loaded");
              })
              .catch(CATMAID.handleError);
          },
        }, {
          type: 'button',
          label: 'Import point clouds',
          disabled: true,
          id: 'neuron-similarity-new-import-pointcloud-import' + widget.widgetID,
          onclick: function() {
            // Requires all fields to be set.
            if (widget.importJob) {
              widget.runQueuedPointcloudImport(widget.importJob);
            } else {
              CATMAID.warn("No data to import");
            }
          },
        }];
      },
      createContent: function(content, widget) {
        // Add a datatable, but hide it if no import job is created.
        let container = content.appendChild(document.createElement('div'));
        container.classList.add('container');
        container.style.display = widget.importJob ? 'block' : 'none';
        let p = container.appendChild(document.createElement('p'));
        p.classList.add('info-text');
        p.appendChild(document.createTextNode('This is an overview on the ' +
            'current import task. If everything looks like expected, the ' +
            'import can be started using the "Import point clouds" button above.'));
        let table = container.appendChild(document.createElement('table'));
        table.setAttribute('id', widget.idPrefix + 'pointcloud-import-table');
        $(table).DataTable({
          dom: 'lfrtip',
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            let importData = widget.importJob ? Array.from(widget.importJob.pointClouds.values()) : [];
            callback({
              draw: data.draw,
              data: importData,
              recordsTotal: importData.length,
              recordsFiltered: importData.length,
            });
          },
          order: [[0, 'desc']],
          columns: [{
            data: 'name',
            title: 'Name',
            orderable: true,
          }, {
            data: 'file.name',
            title: 'File name',
            orderable: true,
          }, {
            data: 'path',
            title: 'Images',
            orderable: false,
            render: function(data, type, row, meta) {
              return '<a href="#" data-role="show-images">' + row.images.length + ' images</a>';
            },
          }],
        });
      },
      refresh: function(widget) {
        let table = document.getElementById(widget.idPrefix + 'pointcloud-import-table');
        if (table) {
          $(table).DataTable().ajax.reload();
        }
        let container = table.closest('div.container');
        if (container) {
          container.style.display = widget.importJob ? 'block' : 'none';
        }
        let importButton = document.getElementById('neuron-similarity-new-import-pointcloud-import' + widget.widgetID);
        if (importButton) {
          if (widget.importJob) {
            importButton.removeAttribute('disabled');
          } else {
            importButton.setAttribute('disabled', 'disabled');
          }
        }
      },
    },
  };

  function hasThreeElements(l) {
    return l.length === 3;
  }

  function makeRegularFilter(filter) {
    return function(value) {
      return value.indexOf(filter) !== -1;
    };
  }

  function makeRegExFilter(filter) {
    let re = new RegExp(filter);
    return function(value) {
      return re.test(value);
    };
  }

  /**
   * Try to load all CSV files and match them to the respective image files by
   * name.
   */
  NeuronSimilarityWidget.loadPointcloudsFromFiles = function(newPointcloudName,
      newPointcloudDescription, csvFiles, pointMatches, imageFileSets, swapZY,
      invertY, effectiveGroupId, effectiveSampleSize, newPointcloudFilter,
      newPointcloudSkipN) {
    newPointcloudSkipN = newPointcloudSkipN || 0;
    return new Promise(function(resolve, reject) {
      let filter;
      if (newPointcloudFilter && newPointcloudFilter.length > 0) {
        // Treat filter as regex search if it stats with '/'.
        if (newPointcloudFilter[0] === '/') {
          filter = makeRegExFilter(newPointcloudFilter.substr(1));
        } else {
          filter = makeRegularFilter(newPointcloudFilter);
        }
      } else {
        filter = function() { return true; };
      }

      // Compute name matches and list imports in table
      let pointclouds = csvFiles.reduce(function(m, f, i) {
        if (i < newPointcloudSkipN) {
          return m;
        }
        let filename = CATMAID.tools.extractFileNameNoExt(f.name);
        if (!filter(filename)) {
          return m;
        }
        m.set(filename, {
          'file': f,
          'filename': filename,
          'name': newPointcloudName.replace(/%f/g, filename) || filename,
          'description': newPointcloudDescription.replace(/%f/g, filename) || '',
          'images': [],
        });
        return m;
      }, new Map());

      // Iterate over images and match them with CSV files.
      if (imageFileSets) {
        imageFileSets.forEach(function(ifs) {
          let description = ifs.description;
          let nIgnoredFiles = 0;
          for (let i=0; i<ifs.files.length; ++i) {
            let file = ifs.files[i];
            let filename = CATMAID.tools.extractFileNameNoExt(file.name);
            let pointcloud = pointclouds.get(filename);
            if (!pointcloud) {
              console.log('Filtering file: ' + file.name);
              ++nIgnoredFiles;
              continue;
            }
            pointcloud.images.push({
              'file': file,
              'description': description.replace(/%f/g, filename),
              'name': file.name,
            });
          }
        });
      }

      // Store a copy of the current import target.
      resolve({
        pointClouds: pointclouds,
        pointMatches: pointMatches,
        swapZY: swapZY,
        invertY: invertY,
        effectiveGroupId: effectiveGroupId,
        effectiveSampleSize: effectiveSampleSize,
      });
    });
  };

  /**
   * This imports a set of CSV files along with images.
   */
  NeuronSimilarityWidget.prototype.runQueuedPointcloudImport = function(importJob) {
    let self = this;
    let csvFiles = Array.from(importJob.pointClouds.keys());
    let nTotalImports = importJob.pointClouds.size;
    let successfulImports = 0;
    let attemptedImports = 0;
    let errors = [];

    if (!csvFiles || csvFiles.length === 0) {
      CATMAID.warn("No files to import");
      return;
    }

    function parseCSVFile(pointCloudInfo) {
      return CATMAID.parseCSVFile(pointCloudInfo.file, ',',
          importJob.csvLineSkip ? 1 : 0, hasThreeElements)
        .then(function(parsedPointData) {
          parsedPointData.forEach(function(p) {
            p[0] = parseFloat(p[0]);
            p[1] = parseFloat(p[1]);
            p[2] = parseFloat(p[2]);
          });

          return self.addPointCloud(pointCloudInfo.name, pointCloudInfo.description,
              parsedPointData, importJob.pointMatches, pointCloudInfo.images,
              importJob.swapZY, importJob.invertY, importJob.effectiveGroupId,
              importJob.effectiveSampleSize);
        });
    }

    function parseFiles() {
      let pointCloudName = csvFiles.pop();
      if (pointCloudName) {
        let csvFile = importJob.pointClouds.get(pointCloudName);
        return parseCSVFile(csvFile)
          .then(function(pointCloud) {
            ++successfulImports;
            ++attemptedImports;
            CATMAID.msg("Success", "Point cloud " + pointCloud.name +
                " imported (ID: " + pointCloud.id + ") - " +
                attemptedImports + '/' + nTotalImports);
            return parseFiles();
          })
          .catch(function(e) {
            ++attemptedImports;
            errors.push({
              'error': e,
              'fileDescription': csvFile,
            });
            return parseFiles();
          });
      }
      return Promise.resolve();
    }

    parseFiles()
      .then(function() {
        if (successfulImports === 0) {
          CATMAID.msg("No successful imports", "No file imported");
        } else {
          CATMAID.msg("Success", "Imported " + successfulImports + '/' +
              nTotalImports + " files successfully");
        }
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Show a dialog with all images linked to this point cloud.
   */
  NeuronSimilarityWidget.showPointCloudImages = function(projectId, pointcloudId) {
    CATMAID.Pointcloud.get(projectId, pointcloudId, false, true)
      .then(function(pointcloud) {

        if (!pointcloud.images || pointcloud.images.length === 0) {
          CATMAID.warn("No images are linked to this point cloud");
          return;
        }

        // Create a new dialog with image elements
        let dialog = new CATMAID.OptionsDialog("Images linked to point cloud " +
            pointcloud.name + " (" + pointcloud.id + ")", {
              'Ok': CATMAID.tools.noop,
            });

        let imageContainer = document.createElement('span');
        imageContainer.style.display = 'flex';

        for (let image of pointcloud.images) {
          let img = document.createElement('img');
          img.src = CATMAID.Pointcloud.getImagePath(projectId, pointcloud.id, image.id);
          let description = image.description ? image.description : '(no description)';
          img.title = `${image.name} (${image.id}): ${description}`;
          img.style.height = '400px';
          imageContainer.appendChild(img);
        }

        dialog.appendChild(imageContainer);
        dialog.show('auto', 'auto');
      })
      .catch(CATMAID.handleError);
  };

  NeuronSimilarityWidget.showSimilarityScoringDialog = function(similarity) {
    let dialog = new CATMAID.OptionsDialog("Similarity configuration", {
      'Ok': function() {}
    });

    if (similarity.scoring && similarity.scoring.length > 0) {
      dialog.appendMessage('Scoring matrix for selected similar skeletons ' +
          'and random skeletons (columns: dot product, rows: distance).');
      let dataContainer = document.createElement('div');
      dataContainer.style.display = 'flex';
      dialog.appendChild(dataContainer);
      let table = dataContainer.appendChild(document.createElement('table'));
      table.classList.add('cm-center');

      let thead = table.appendChild(document.createElement('thead'));
      let th = thead.appendChild(document.createElement('tr'));
      th.appendChild(document.createElement('th'));
      for (let i=0; i<(similarity.dot_breaks.length - 1); ++i) {
        let td = th.appendChild(document.createElement('th'));
        let text = '(' + similarity.dot_breaks[i] + ',' +
            similarity.dot_breaks[i+1] + ']';
        td.appendChild(document.createTextNode(text));
      }

      let tbody = table.appendChild(document.createElement('tbody'));
      for (let i=0; i<similarity.scoring.length; ++i) {
        let column = similarity.scoring[i];
        let tr = tbody.appendChild(document.createElement('tr'));
        for (let j=-1; j<column.length; ++j) {
          let td = tr.appendChild(document.createElement('td'));
          if (j === -1) {
            let text = '(' + similarity.distance_breaks[i] + ',' +
                similarity.distance_breaks[i+1] + ']';
            td.appendChild(document.createTextNode(text));
            td.classList.add('row-head');
          } else {
            td.appendChild(document.createTextNode(Number(column[j]).toFixed(2)));
          }
        }
      }

      let plot = dataContainer.appendChild(document.createElement('div'));

      Plotly.newPlot(plot, [{
        type: 'surface',
        x: similarity.dot_breaks,
        y: similarity.distance_breaks,
        z: similarity.scoring
      }], {
        autosize: true,
        width: 300,
        height: 350,
        margin: {
          l: 10,
          r: 10,
          b: 30,
          t: 30,
          pad: 4
        },
        scene: {
          xaxis: {
            title: 'Absolute dot product',
            nticks: 6,
          },
          yaxis: {
            title: 'Distance (µm)',
          },
          zaxis: {
            title: 'Score',
          }
        }
      });
    } else {
      dialog.appendMessage("No scoring available");
    }

    dialog.show(880, 510, false);
  };

  /**
   * Show a particular similarity result in a result dialog or result window,
   * depending on the widget settings.
   */
  NeuronSimilarityWidget.prototype.showSimilarity = function(similarity) {
    let self = this;
    if (this.resultMode === 'dialog') {
      let targetModels = CATMAID.Similarity.getReferencedSkeletonModels(similarity);
      let needsPointclouds = similarity.query_type === 'pointcloud' ||
          similarity.target_type === 'pointcloud';

      let prepare = [];
      if (!CATMAID.tools.isEmpty(targetModels)) {
        prepare.push(this.neuronNameService.registerAll(this, targetModels));
      }

      Promise.all(prepare)
        .then(function() {
          if (needsPointclouds) {
            return CATMAID.Pointcloud.listAll(project.id, true);
          }
        })
        .then(function(pointclouds) {
          NeuronSimilarityWidget.showSimilarityDialog(self, similarity, pointclouds);
        })
        .catch(CATMAID.handleError);
    } else if (this.resultMode === 'window') {
      NeuronSimilarityWidget.showSimilarityWindow(similarity);
    } else {
      throw new CATMAID.ValueError('Unknown result mode: ' + this.resultMode);
    }
  };

  NeuronSimilarityWidget.showSimilarityWindow = function(similarity) {
    let widgetInfo = CATMAID.WindowMaker.create('neuron-similarity-detail');
    widgetInfo.widget.setSimilarity(similarity);
  };

  /**
   * Show similarity results in a simple dialog.
   */
  NeuronSimilarityWidget.showSimilarityDialog = function(widget, similarity, pointClouds) {
    let dialog = new CATMAID.OptionsDialog("Similarity result", {
      'Ok': function() {},
    });

    dialog.dialog.setAttribute('id', 'no-confirm-dialog');

    if (similarity.scoring && similarity.scoring.length > 0) {
      dialog.appendMessage("Below you will find the top 10 matches for " +
          "each query skeleton with a score larger than zero, i.e. it " +
          "is more likely, the respecive skeleton is similar to the query " +
          "than random.");

      let table = document.createElement('table');
      table.classList.add('cm-center');

      let matchesOnly = dialog.appendCheckbox("Only show matches", undefined,
          widget.showOnlyMatchesInResult,
          "If checked, the result table will only show matches");
      matchesOnly.onchange = function() {
        widget.showOnlyMatchesInResult = this.checked;
        if (this.checked) {
          $(table).DataTable().columns(1).search('^(?!.*no match).*$', true, false, true).draw();
        } else {
          $(table).DataTable().columns(1).search('').draw();
        }
      };

      dialog.appendChild(table);

      let thead = table.appendChild(document.createElement('thead'));
      let theadTr = thead.appendChild(document.createElement('tr'));
      let theadTh1 = theadTr.appendChild(document.createElement('th'));
      theadTh1.appendChild(document.createTextNode('Query ' + similarity.query_type));
      let theadTh2 = theadTr.appendChild(document.createElement('th'));
      theadTh2.appendChild(document.createTextNode('Top 10 target ' + similarity.target_type + 's'));

      table.appendChild(document.createElement('tbody'));

      let getQueryName;
      if (similarity.query_type === 'skeleton') {
        getQueryName = function(element) {
          return CATMAID.NeuronNameService.getInstance().getName(element);
        };
      } else if (similarity.query_type === 'pointcloud') {
        getQueryName = function(element) {
          let pc = pointClouds[element];
          return pc ? pc.name : (element + ' (not found)');
        };
      } else {
        getQueryName = function(element) {
          return element;
        };
      }

      let getTargetName;
      if (similarity.target_type === 'skeleton') {
        getTargetName = function(element) {
          return CATMAID.NeuronNameService.getInstance().getName(element);
        };
      } else if (similarity.target_type === 'pointcloud') {
        getTargetName = function(element) {
          let pc = pointClouds[element];
          return pc ? pc.name : (element + ' (not found)');
        };
      } else {
        getTargetName = function(element) {
          return element;
        };
      }

      let collectEntries = function(target, element, i) {
        if (element >= 0) {
          target.push([similarity.target_objects[i], getTargetName(similarity.target_objects[i]), element]);
        }
        return target;
      };

      let compareEntriesDesc = function(a, b) {
        if (a[2] > b[2]) return -1;
        if (a[2] < b[2]) return 1;
        return 0;
      };

      let dataAboveZero = similarity.query_objects.map(function(qskid, i) {
        let sortedMatches = similarity.scoring[i].reduce(collectEntries, []).sort(compareEntriesDesc);
        return [qskid, sortedMatches];
      });

      $(table).DataTable({
        dom: 'lfrtip',
        data: dataAboveZero,
        order: [],
        columns: [{
          orderable: true,
          class: 'cm-center',
          render: function(data, type, row, meta) {
            return `<a href="#" data-skeleton-id="${row[0]}" data-role="select-skeleton">${getQueryName(row[0])}</a>`;
          }
        }, {
          orderable: false,
          class: 'cm-left',
          render: function(data, type, row, meta) {
            if (row[1].length > 0) {
              let nTop10Elements = Math.min(10, row[1].length);
              let elements = ['<span class="result-list">'];
              for (let i=0; i<nTop10Elements; ++i) {
                let entry = row[1][i];
                elements.push(`<span class="result-element"><span class="li">${i+1}.</span><a href="#" data-skeleton-id="${entry[0]}" data-role="select-skeleton">${entry[1]}</a> (${entry[2]})</span>`);
              }
              elements.push('</span>');
              return elements.join('');
            } else {
              return '(no match)';
            }
          }
        }]
      }).on('click', 'a[data-role=select-skeleton]', function() {
        let skeletonId = parseInt(this.dataset.skeletonId, 10);
        CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
      });

      if (widget.showOnlyMatchesInResult) {
        $(table).DataTable().columns(1).search('^(?!.*no match).*$', true, false, true).draw();
      }
    } else {
      dialog.appendMessage("No similarity data available");
    }

    dialog.show(700, 'auto', false);


    // A button to open the scoring matrix dialog
    let configButton = document.createElement('button');
    configButton.setAttribute('class', 'ui-button');
    configButton.classList.add('ui-button', 'ui-corner-all',
      'ui-state-default', 'ui-widget', 'ui-button-text-only');
    var configButtonLabel = configButton.appendChild(document.createElement('span'));
    configButtonLabel.classList.add('ui-button-text');
    configButtonLabel.appendChild(document.createTextNode('Show scoring matrix'));
    configButton.onclick = function() {
      CATMAID.Similarity.getConfig(project.id, similarity.config_id)
        .then(function(config) {
          NeuronSimilarityWidget.showSimilarityScoringDialog(config);
        })
        .catch(CATMAID.handleError);
    };

    // Download scoring matrix as CSV
    let downloadButton = document.createElement('button');
    downloadButton.setAttribute('class', 'ui-button');
    downloadButton.classList.add('ui-button', 'ui-corner-all',
      'ui-state-default', 'ui-widget', 'ui-button-text-only');
    var downloadButtonLabel = downloadButton.appendChild(document.createElement('span'));
    downloadButtonLabel.classList.add('ui-button-text');
    downloadButtonLabel.appendChild(document.createTextNode('Download scores as CSV'));
    downloadButton.onclick = function() {
      CATMAID.Similarity.getConfig(project.id, similarity.config_id)
        .then(function(config) {
          NeuronSimilarityWidget.exportNblastCSV(similarity, config);
          CATMAID.msg("Success", "CSV exported");
        })
        .catch(CATMAID.handleError);
    };

    dialog.appendExtraControls([{
      type: 'child',
      element: configButton,
    }, {
      type: 'child',
      element: downloadButton,
    }]);
  };

  NeuronSimilarityWidget.showSampleDialog = function(config, sample, title) {
    title = title || "NBLAST Sample";
    let dialog = new CATMAID.OptionsDialog(title, {
      'Ok': function() {}
    });

    dialog.appendMessage('Probability distribution for sample of ' +
        sample.sample_neurons.length + ' neurons.');

    if (sample.probability && sample.probability.length > 0) {
      let table = document.createElement('table');
      table.classList.add('cm-center');
      dialog.appendChild(table);

      let thead = table.appendChild(document.createElement('thead'));
      let th = thead.appendChild(document.createElement('tr'));
      th.appendChild(document.createElement('th'));
      for (let i=0; i<(config.dot_breaks.length - 1); ++i) {
        let td = th.appendChild(document.createElement('th'));
        let text = '(' + config.dot_breaks[i] + ',' +
            config.dot_breaks[i+1] + ']';
        td.appendChild(document.createTextNode(text));
      }

      let tbody = table.appendChild(document.createElement('tbody'));
      for (let i=0; i<config.scoring.length; ++i) {
        let column = sample.probability[i];
        let tr = tbody.appendChild(document.createElement('tr'));
        for (let j=-1; j<column.length; ++j) {
          let td = tr.appendChild(document.createElement('td'));
          if (j === -1) {
            let text = '(' + config.distance_breaks[i] + ',' +
                config.distance_breaks[i+1] + ']';
            td.appendChild(document.createTextNode(text));
            td.classList.add('row-head');
          } else {
            td.appendChild(document.createTextNode(Number(column[j]).toFixed(3)));
          }
        }
      }
    } else {
      dialog.appendMessage("No scoring available");
    }

    if (sample.sample_neurons && sample.sample_neurons.length > 0) {
      let a = document.createElement('a');
      a.href = '#';
      a.appendChild(document.createTextNode('Show all ' +
          sample.sample_neurons.length + ' sample skeletons in new Selection Table.'));
      a.onclick = function() {
        let widget = WindowMaker.create('selection-table').widget;
        widget.addSkeletons(sample.sample_neurons);
        CATMAID.msg(widget.getName(), 'Added ' + sample.sample_neurons.length +
            ' neurons to ' + widget.getName());
      };
      dialog.appendChild(a);
    } else {
      dialog.appendMessage("No sample skeletons linked");
    }

    dialog.show(620, 550, false);
  };

  NeuronSimilarityWidget.updateGroupSelect = function (select) {
    return CATMAID.Group.list(CATMAID.session.userid)
      .then(function(groups) {
        let selectedIndex = select.selectedIndex;
        let selectedValue = selectedIndex === -1 ? null : select.value;

        // Clear options
        select.options.length = 0;

        // Add default option
        select.options.add(new Option("(none)", "none"));

        for (let i=0; i<groups.length; ++i) {
          let group = groups[i];
          let selected = group.id === selectedValue;
          let name = `${group.name} (${group.id})`;
          let option = new Option(name, group.id, selected, selected);
          select.options.add(option);
        }
      })
      .catch(CATMAID.handleError);
  };

  NeuronSimilarityWidget.updateConfigSelect = function (select) {
    return CATMAID.Similarity.listAllConfigs(project.id, true)
      .then(function(configs) {
        let selectedIndex = select.selectedIndex;
        let selectedValue = selectedIndex === -1 ? null : select.value;

        // Clear options
        select.options.length = 0;

        // Add a default none option
        select.options.add(new Option("(none)", "none"));

        for (let i=0; i<configs.length; ++i) {
          let config = configs[i];
          if (config.status === 'complete') {
            let selected = config.id === selectedValue;
            let name = `${config.name} (${config.id})`;
            let option = new Option(name, config.id, selected, selected);
            select.options.add(option);
          }
        }
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Return a Promise resolving into point matches from data with the following
   * 4-column format: Landmark, Source x, Source y, Source z.
   */
  NeuronSimilarityWidget.loadTransformationFrom4ColData = function(data) {
    let nColumns = 4;
    return CATMAID.Landmarks.list(project.id, true)
      .then(function(landmarks) {
        let pointMatches = [];
        let landmarkIndex = landmarks.reduce(function(m, l) {
          m.set(l.name, l);
          return m;
        }, new Map());
        data.forEach(function(p, i) {
          if (p.length !== nColumns) {
            CATMAID.warn("Skipping line " + (i + 1) + " due to unexpected number of columns");
            return;
          }
          let landmarkName = p[0],
              sourceX = parseFloat(p[1]), sourceY = parseFloat(p[2]), sourceZ = parseFloat(p[3]);

          // Find landmark and its location
          let landmark = landmarkIndex.get(landmarkName);
          if (!landmark) {
            CATMAID.warn("Could not find landmark \"" + landmarkName + "\"");
            return;
          }
          if (!landmark.locations || landmark.locations.length === 0) {
            CATMAID.warn("Landmark \"" + landmarkName + "\" doesn't have any location linked.");
            return;
          }
          if (landmark.locations.length > 1) {
            CATMAID.warn("Landmark \"" + landmarkName + "\" has more than one location linked.");
            return;
          }

          let name = landmarkName;
          let targetName = landmarkName;
          let target = landmark.locations[0];

          pointMatches.push({
            name: name,
            sourceName: sourceName,
            targetName: targetName,
            source: [sourceX, sourceY, sourceZ],
            target: [target.x, target.y, target.z],
          });
        });
        return pointMatches;
      });
  };

  /**
   * Return a Promise resolving into point matches from data with the following
   * 7-column format: Landmark, Source left x, Source left y, Source left z,
   * Source right x, Source right y, Source right z.
   *
   * @param {transformationData[]} data A list of lists, representing the data
   *                                    to parse.
   * @param {string} leftDim (optinal) Either "x", "y", "z", "-x", "-y" or "-z".
   *                         Represents the dimension which means "left".
   *                         Defaults to "y".
   */
  NeuronSimilarityWidget.loadTransformationFrom7ColData = function(data, leftDim) {
    leftDim = leftDim || 'y';
    let nColumns = 7;
    return CATMAID.Landmarks.list(project.id, true)
      .then(function(landmarks) {
        let pointMatches = [];
        let landmarkIndex = landmarks.reduce(function(m, l) {
          m.set(l.name, l);
          return m;
        }, new Map());
        data.forEach(function(p, i) {
          if (p.length !== nColumns) {
            CATMAID.warn("Skipping line " + (i + 1) + " due to unexpected number of columns");
            return;
          }
          let landmarkName = p[0],
              lSourceX = parseFloat(p[1]), lSourceY = parseFloat(p[2]), lSourceZ = parseFloat(p[3]),
              rSourceX = parseFloat(p[4]), rSourceY = parseFloat(p[5]), rSourceZ = parseFloat(p[6]);

          // Allow special case with only one linked location when lSource and
          // rSource are the same.
          let singleLocationAllowed = p[1] === p[4] && p[2] === p[5] && p[3] === p[6];

          // Find landmark and its location
          let landmark = landmarkIndex.get(landmarkName);
          if (!landmark) {
            CATMAID.warn("Could not find landmark \"" + landmarkName + "\"");
            return;
          }
          if (!landmark.locations || landmark.locations.length === 0) {
            CATMAID.warn("Landmark \"" + landmarkName + "\" doesn't have any location linked. Need two (left and right).");
            return;
          }
          if (landmark.locations.length == 1 && !singleLocationAllowed) {
            CATMAID.warn("Landmark \"" + landmarkName + "\" has only one location linked. Need two (left and right).");
            return;
          }
          if (landmark.locations.length > 2) {
            CATMAID.warn("Landmark \"" + landmarkName + "\" has more than two location linked. Need two (left and right).");
            return;
          }

          let name = landmarkName;
          let targetName = landmarkName;
          if (singleLocationAllowed) {
            let lTarget = landmark.locations[0];
            if ([lTarget.x, lTarget.y, lTarget.z].every(CATMAID.tools.isNumber)) {
              pointMatches.push({
                name: name,
                sourceName: landmarkName,
                targetName: targetName,
                source: [lSourceX, lSourceY, lSourceZ],
                target: [lTarget.x, lTarget.x, lTarget.z],
              });
            } else {
              CATMAID.warn("Skipping left target of " + i + ". entry. No numbers found.");
            }
          } else {
            // Find landmark location on 'left' side. Which dimension that is
            // exactly is specified by the caller.
            let location1 = landmark.locations[0], location2 = landmark.locations[1];
            let lTarget, rTarget;
            if (leftDim === 'x' || leftDim === 'y' || leftDim === 'z') {
              if (location1[leftDim] > location2[leftDim]) {
                lTarget = location1;
                rTarget = location2;
              } else {
                lTarget = location2;
                rTarget = location1;
              }
            } else if (leftDim === '-x' || leftDim === '-y' || leftDim === '-z') {
              if (location1[leftDim[1]] < location2[leftDim[1]]) {
                lTarget = location1;
                rTarget = location2;
              } else {
                lTarget = location2;
                rTarget = location1;
              }
            } else {
              throw new CATMAID.ValueError("Unknown project space 'left' dimension: " + leftDim);
            }

            let lSourceLocation = [lSourceX, lSourceY, lSourceZ];
            if (lSourceLocation.every(CATMAID.tools.isNumber)) {
              pointMatches.push({
                name: name,
                sourceName: landmarkName,
                targetName: targetName,
                source: lSourceLocation,
                target: [lTarget.x, lTarget.x, lTarget.z],
              });
            } else {
              CATMAID.warn("Skipping left target of " + i + ". entry. No numbers found.");
            }

            let rSourceLocation = [rSourceX, rSourceY, rSourceZ];
            if (rSourceLocation.every(CATMAID.tools.isNumber)) {
              pointMatches.push({
                name: name,
                sourceName: landmarkName,
                targetName: targetName,
                source: rSourceLocation,
                target: [rTarget.x, rTarget.y, rTarget.z],
              });
            } else {
              CATMAID.warn("Skipping right target of " + i + ". entry. No numbers found.");
            }
          }
        });
        return pointMatches;
      });
  };

  /**
   * Return a Promise resolving into point matches from data with the following
   * 9-column format: Name, Source name, Target name, Source x, Source y, Source
   * z, Target x, Target y, Target z
   *
   * @param {transformationData[]} data A list of lists, representing the data
   *                                    to parse.
   */
  NeuronSimilarityWidget.loadTransformationFrom9ColData = function(data) {
    let nColumns = 9;
    let pointMatches = [];
    data.forEach(function(p) {
      if (p.length !== nColumns) {
        return;
      }
      let name = p[0], sourceName = p[1], targetName = p[2],
          sourceX = parseFloat(p[3]), sourceY = parseFloat(p[4]), sourceZ = parseFloat(p[5]),
          targetX = parseFloat(p[6]), targetY = parseFloat(p[7]), targetZ = parseFloat(p[8]);
      pointMatches.push({
        name: name,
        sourceName: sourceName,
        targetName: targetName,
        source: [sourceX, sourceY, sourceZ],
        target: [targetX, targetY, targetZ],
      });
    });
    return Promise.resolve(pointMatches);
  };

  /**
   * Return a Promise resolving into point matches from data with the following
   * 9-column format: Name, Source name, Target name, Source left x, Source left
   * y, Source left z, Target left x, Target left y, Target left z, Source right
   * x, Source right y, Source right z, Target right x, Target right y, Target
   * right z
   *
   * @param {transformationData[]} data A list of lists, representing the data
   *                                    to parse.
   */
  NeuronSimilarityWidget.loadTransformationFrom15ColData = function(data) {
    let nColumns = 15;
    let pointMatches = [];
    data.forEach(function(p) {
      if (p.length !== nColumns) {
        return;
      }
      let name = p[0], sourceName = p[1], targetName = p[2],
          lSourceX = parseFloat(p[3]), lSourceY = parseFloat(p[4]), lSourceZ = parseFloat(p[5]),
          lTargetX = parseFloat(p[6]), lTargetY = parseFloat(p[7]), lTargetZ = parseFloat(p[8]),
          rSourceX = parseFloat(p[9]), rSourceY = parseFloat(p[10]), rSourceZ = parseFloat(p[11]),
          rTargetX = parseFloat(p[12]), rTargetY = parseFloat(p[13]), rTargetZ = parseFloat(p[14]);
      pointMatches.push({
        name: name,
        sourceName: sourceName,
        targetName: targetName,
        source: [lSourceX, lSourceY, lSourceZ],
        target: [lTargetX, lTargetY, lTargetZ],
      });
      pointMatches.push({
        name: name,
        sourceName: sourceName,
        targetName: targetName,
        source: [rSourceX, rSourceY, rSourceZ],
        target: [rTargetX, rTargetY, rTargetZ],
      });
    });
    return Promise.resolve(pointMatches);
  };

  NeuronSimilarityWidget.loadTransformationFile = function(file, csvLineSkip, leftDim) {
    return CATMAID.parseCSVFile(file, ',', csvLineSkip ? 1 : 0)
      .then(function(transformationData) {
        if (!transformationData || transformationData.length === 0) {
          throw new CATMAID.ValueError("Could not find any transformation data");
        }

        let nColumns = transformationData[0].length;
        if (nColumns === 4) {
          return NeuronSimilarityWidget.loadTransformationFrom4ColData(transformationData);
        } else if (nColumns === 7) {
          return NeuronSimilarityWidget.loadTransformationFrom7ColData(transformationData, leftDim);
        } else if (nColumns === 9) {
          return NeuronSimilarityWidget.loadTransformationFrom9ColData(transformationData);
        } else if (nColumns === 15) {
          return NeuronSimilarityWidget.loadTransformationFrom15ColData(transformationData);
        }
        throw new CATMAID.ValueError("Expected 4, 7, 9 or 15 columns, found " + nColumns);
      });
  };

  NeuronSimilarityWidget.exportNblastCSV = function(similarity, config, with_ids = true,
      with_names = false, id_map_fn = undefined, name_map_fn = undefined) {
    // Create a CSV that includes the query skeletons as first column and the
    // target skeletons as first row/header.
    let today = new Date();
    let filename = `catmaid-similarity-${similarity.id}-${similarity.name.substr(0, 15)}-${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}.csv`;
    let data = [];
    let emptyBufferLength = (with_ids ? 1 : 0) + (with_names ? 1 : 0);
    let buffer = new Array(emptyBufferLength).map(v => '""');
    id_map_fn = id_map_fn ? id_map_fn : v => v;
    if (with_names && !name_map_fn) {
      throw new CATMAID.ValueError('Need name mapping functon if names should be exported');
    }
    if (with_ids) {
      let header = buffer.concat(similarity.target_objects.map(function(s) {
        return `"${id_map_fn(s, similarity.target_type)}"`;
      })).join(',');
      data.push(header);
    }
    if (with_names) {
      let header = buffer.concat(similarity.target_objects.map(function(s) {
        return `"${name_map_fn(s, similarity.target_type)}"`;
      })).join(',');
      data.push(header);
    }
    similarity.query_objects.forEach(function(s, i) {
      let line = [];
      if (with_ids) {
        line.push(`"${id_map_fn(s, similarity.query_type)}"`);
      }
      if (with_names) {
        line.push(`"${name_map_fn(s, similarity.query_type)}"`);
      }
      line = line.concat(similarity.scoring[i]);
      data.push(line.join(','));
    });
    saveAs(new Blob([data.join('\n')], {type: 'text/plain'}), filename);
  };

  // Export widget
  CATMAID.NeuronSimilarityWidget = NeuronSimilarityWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Neuron similarity",
    description: "Compare neurons and rank them by similarity using NBLAST",
    key: "neuron-similarity",
    creator: NeuronSimilarityWidget,
    websocketHandlers: {
      'similarity-config-update': function(client, payload) {
        let id = payload.config_id;
        let status = payload.config_status;

        // Show a status message
        if (status === 'complete') {
          CATMAID.msg('Success', 'NBLAST config #' + id + ' can now be used');
        } else if (status === 'error') {
          CATMAID.warn('There was an error during the computation of NBLAST config #' + id);
        } else {
          CATMAID.msg('NBLAST config #' + id + ' status change', 'New status: ' + status);
        }

        // Update all neuron similarity matrix widgets
        let windowMap = WindowMaker.getOpenWindows('neuron-similarity', false, null, true);
        if (windowMap) {
          for (let widget of windowMap.values()) {
            widget.handleConfigStatusChange(id, status);
          }
        }
      },
      'similarity-update': function(client, payload) {
        var status = payload.similarity_status;
        var id = payload.similarity_id;

        // Show a status message
        if (status === 'complete') {
          CATMAID.msg('Success', 'NBLAST similarity #' + id + ' is now computed');
        } else if (status === 'error') {
          CATMAID.warn('There was an error during the computation of NBLAST similarity #' + id);
        } else {
          CATMAID.msg('NBLAST similarity #' + id + ' status change', 'New status: ' + status);
        }

        // Update all neuron similarity matrix widgets
        let windowMap = WindowMaker.getOpenWindows('neuron-similarity', false, null, true);
        if (windowMap) {
          for (let widget of windowMap.values()) {
            widget.handleSimilarityStatusChange(id, status);
          }
        }
      }
    }
  });

})(CATMAID);
