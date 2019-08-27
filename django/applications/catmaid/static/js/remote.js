(function(CATMAID) {

  "use strict";

  let Remote = {};

  /**
   * Open a 3D dialog that has all neurons from the remote CATMAID project
   * loaded that are annotated with the passed in annotation..
   */
  Remote.previewSkeletons = function(projectId, neuronAnnotation, includeSubAnnotations, remote) {
    // Get all remote skeletons
    let api = remote ? remote : null;
    CATMAID.Skeletons.byAnnotation(projectId, [neuronAnnotation], includeSubAnnotations, api)
      .then(function(skeletonIds) {
        // Fetch skeletons
        let promises = skeletonIds.map(skeletonId => {
          return CATMAID.fetch({
              url: projectId + '/' + skeletonId + '/1/1/1/compact-arbor',
              method: 'POST',
              api: api,
            }) .then(function(result) {
              var ap = new CATMAID.ArborParser();
              ap.tree(result[0]);
              return [skeletonId, ap];
            });
        });

        return Promise.all(promises)
          .then((arborParsers) => {
            return new Map(arborParsers);
          });
      })
      .then(arborParsers => {
        let skeletonIds = Array.from(arborParsers.keys());
        if (!skeletonIds || skeletonIds.length === 0) {
          CATMAID.warn(`No neurons found with annotation "${neuronAnnotation}" from remote "${remote.name}"`);
          return;
        }
        // Create dialog
        var dialog = new CATMAID.Confirmation3dDialog({
          title: `Preview of all ${skeletonIds.length} remote neurons annotated with "${neuronAnnotation}"`,
          showControlPanel: false,
          buttons: {
            "Close": () => dialog.close(),
          }});

        dialog.show();

        let colorizer = new CATMAID.Colorizer();
        var glWidget = dialog.webglapp;
        var models = skeletonIds.reduce( (o, skid, i) => {
          let skeleton = new CATMAID.SkeletonModel(skid, undefined,
              colorizer.pickColor(), api);
          skeleton.projectId = projectId;
          o[skid] = skeleton;
          return o;
        }, {} );

        // Create virtual skeletons
        let nodeProvider = new CATMAID.ArborParserNodeProvider(arborParsers);

        glWidget.addSkeletons(models, () => {
            // Focus first skeleton
            glWidget.lookAtSkeleton(skeletonIds[0]);
          },
          nodeProvider);
      })
      .catch(CATMAID.handleError);
  };


  // Export into CATMAID namespace.
  CATMAID.Remote = Remote;

})(CATMAID);
