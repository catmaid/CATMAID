(function(CATMAID) {

  "use strict";

  let Publication = {};

  Publication.hasAnnotation = function(p, annotationName) {
    return p.annotations.some(pa => pa.name.toLowerCase() === annotationName);
  };

  Publication.ConnectorAnnotations = {
    ConnectorsOriginalPlaceholders: 'export: intra-connectors-and-original-placeholders',
    ConnectorsNewPlaceholders: 'export: intra-connectors-and-placeholders',
    ConnectorsOnlyIntra: 'export: intra-connectors-only',
    ConnectorsNo: 'export: no-connectors',
  };

  Publication.ConnectorAnnotationTerms = Object.values(Publication.ConnectorAnnotations);

  Publication.getFirstConnectorAnnotation = function(p) {
    for (let ann in Publication.ConnectorAnnotations) {
      if (Publication.hasAnnotation(p, Publication.ConnectorAnnotations[ann])) {
        return Publication.ConnectorAnnotations[ann];
      }
    }
    return null;
  };

  /**
   * Return a promise that resolves in a list of publication objects. A
   * publication is any annotation that is that is annotated with "paper" or
   * "papers".
   */
  Publication.listAllPublications = function(projectId, publicationAnnotations=["paper", "papers"], api = undefined) {
    return CATMAID.Annotations.byAnnotation(projectId, publicationAnnotations.join(','), false, true, api, true, true)
      .then(result => {
        // Build publication response. All required information should be
        // available from annotations on the result "publication annotations".
        let publications = result.entities.filter(p => p.type === 'annotation').map(p => {
          return {
            id: p.id,
            name: p.name,
            creation_time: p.creation_time,
            edition_time: p.edition_time,
            preprint: Publication.hasAnnotation(p, 'preprint'),
            public: Publication.hasAnnotation(p, 'published'),
            treenodes: Publication.hasAnnotation(p, 'export: treenodes') ? true :
                (Publication.hasAnnotation(p, 'export: no-treenodes') ? false : null),
            annotations: Publication.hasAnnotation(p, 'export: annotations') ? true :
                (Publication.hasAnnotation(p, 'export: no-annotations') ? false : null),
            tags: Publication.hasAnnotation(p, 'export: tags') ? true :
                (Publication.hasAnnotation(p, 'export: no-tags') ? false : null),
            connectors: Publication.getFirstConnectorAnnotation(p),
          };
        });

        return publications;
      })
      .then(publications => {
        if (!publications || publications.length === 0) {
          for (let p of publications) {
            p.targets = [];
          }
          return publications;
        }
        // Get annotated skeletons for all publications
        let publicationAnnotations = publications.map(p => p.id);
        return CATMAID.Skeletons.byAnnotation(projectId,
            publicationAnnotations.join(','), false, api, true, true, true, 'id')
          .then(publishedNeurons => {
            let annIndex = {};
            for (let t of publishedNeurons.entities) {
              for (let a of t.annotations) {
                let targetList = annIndex[a.name];
                if (!targetList) {
                  annIndex[a.name] = targetList = [];
                }
                targetList.push(t);
              }
            }

            for (let p of publications) {
              p.targets = annIndex[p.name] || [];
            }

            return publications;
          });
      });
  };

  Publication.addPublication = function(projectId, name, isPreprint, isPublic, metaAnnotations=['paper']) {
    let annotations = [name];
    return CATMAID.Annotations.add(projectId, undefined, undefined,
          annotations, metaAnnotations);
  };

  /**
   * Configure if treenodes should be exported for a particular publication. The
   * allowed modes are `true`, `false` and `undefined`. On `true`, the
   * annotation "export: treenodes" is added to the neuron. On `false`, the
   * annotation "export: no-treenodes` is added to the neuron. If `undefined is
   * provided, no annotation is allowed and an externally provided value will be
   * used.
   */
  Publication.setTreenodeExport = function(projectId, publicationId, exportTreenodes) {
    CATMAID.warn("Not implemented");
  };

  CATMAID.Publication = Publication;

})(CATMAID);
