/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Ask the user for confirmation before attemting to remove a set of
   * annotations from a set of target objects. An error handler is attached to
   * the returned promise.
   */
  CATMAID.confirmAndRemoveAnnotations = function(projectId, targetIds, annotationIds) {
    var annotations = annotationIds.map(function(annotationId) {
      return CATMAID.annotations.getName(annotationId);
    });

    if (!confirm('Are you sure you want to remove annotations "' +
          annotations.join(', ') + '"?')) {
      return;
    }

    return CATMAID.Annotations.remove(projectId, targetIds, annotationIds)
        .then(function(data) {
          var msg = (data.deleted_annotations.length > 0) ?
            "Removed " + data.deleted_annotations.length + " annotation(s)." :
            "Couldn not delete any annotation";
          CATMAID.info(msg);
        }).catch(CATMAID.handleError);
  };

})(CATMAID);

