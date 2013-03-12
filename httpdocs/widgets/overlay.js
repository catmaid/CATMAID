/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/** A namespace to contain the current state of skeleton annotations. */
var SkeletonAnnotations = new function()
{
  // A table stack vs SVGOverlay instances.
  // The SVGOverlay construct adds the new instance here,
  // and the SVGOVerlay.destroy() removes it.
  var SVGOverlays = {};

  this.getSVGOverlay = function ( stack ) {
    return SVGOverlays[stack];
  };

  /** Select a node in any of the existing SVGOverlay instances, by its ID and its skeletonID. If it is a connector node, it expects a null skeletonID. */
  this.staticSelectNode = function(nodeID, skeletonID)
  {
    var stack, s;
    for (stack in SVGOverlays) {
      if (SVGOverlays.hasOwnProperty(stack)) {
        s = SVGOverlays[stack];
        s.selectNode(nodeID);
        if (SkeletonAnnotations.getActiveSkeletonId() === skeletonID) {
          return;
        } else {
          // Should never happen
          s.activateNode(null); // deselect: there's a mismatch between node and skeleton
        }
      }
    }
    statusBar.replaceLast("Could not find node #" + nodeID + " for skeleton #" + skeletonID);
  };

  // Data of the active Treenode or ConnectorNode
  var atn = {
    id: null,
    type: null,
    skeleton_id: null,
    x: null,
    y: null,
    z: null,
    parent_id: null,
    set: function(node) {
      if (node) {
        atn.id = node.id;
        atn.skeleton_id = node.skeleton_id;
        atn.type = node.type;
        atn.x = node.x;
        atn.y = node.y;
        atn.z = node.z;
        if (node.parent) {
          atn.parent_id = node.parent.id;
        } else {
          atn.parent_id = null;
        }
      } else {
        for (var prop in atn) {
          if ( prop === 'set' ) {
            // do not alter functions
            continue;
          }
          if (atn.hasOwnProperty(prop)) {
            atn[prop] = null;
          }
        }
      }
    }
  };

  var atn_fillcolor = "rgb(0, 255, 0)";

  this.getActiveNodeId = function() {
    return atn.id;
  };

  this.getActiveSkeletonId = function() {
    return atn.skeleton_id;
  };

  this.getActiveNodeType = function() {
    return atn.type;
  };

  this.getActiveNodeColor = function() {
    return atn_fillcolor;
  };

  this.getActiveNodePosition = function() {
    if (atn.id === null) {
      return null;
    } else {
      return {'x': atn.x, 'y': atn.y, 'z': atn.z};
    }
  };

  /**
   * Open the skeleton node in the Object Tree if the Object Tree is visible
   * and if the Object Tree synchronize_object_tree checkbox is checked.
   */
  var openSkeletonNodeInObjectTree = function(node) {
    // Check if the Object Tree div is visible
    if ($('#object_tree_widget').css('display') === "none" || ! $('#synchronize_object_tree').attr('checked')) {
      return;
    }
    // Else, synchronize:
    if( node )
      ObjectTree.requestOpenTreePath(node.skeleton_id);
  };

  var refreshAllWidgets = function()
  {
    if ($('#connectortable_widget').css('display') === "block" && $('#synchronize_connectortable').attr('checked')) {
      ConnectorTable.init( project.getId() );
    }

    if ($('#treenode_table_widget').css('display') === "block" && $('#synchronize_treenodetable').attr('checked')) {
      TreenodeTable.init( project.getId() );
    }
  };

  this.exportSWC = function() {
    if (!atn || !atn.id || !atn.skeleton_id) {
      alert('Need to activate a treenode before exporting to SWC!');
      return;
    }
    // retrieve SWC file of currently active treenode's skeleton
    var recipe = window.open('', 'RecipeWindow', 'width=600,height=600');

    requestQueue.register(django_url + project.id + '/skeleton/' + atn.skeleton_id + '/swc', "POST", {}, function (status, text, xml) {
      if (status === 200) {

        $('#recipe1').clone().appendTo('#myprintrecipe');
        var html = "<html><head><title>Skeleton as SWC</title></head><body><pre><div id='myprintrecipe'>" + text + "</div></pre></body></html>";
        recipe.document.open();
        recipe.document.write(html);
        recipe.document.close();
      }
    }); // endfunction
  };

  /** The constructor for SVGOverlay. */
  this.SVGOverlay = function ( stack )
  {
    var self = this;

    var edgetoggle = true;
    var nodes = {};
    var labels = {};
    var show_labels = false;

    /* Variables keeping state for toggling between a terminal and its connector. */
    var switchingConnectorID = null;
    var switchingTreenodeID = null;


    this.getLabelStatus = function() {
      return show_labels;
    };

    /** The original list of nodes; beware the instance of the list will change,
     * the contents of any one instance may change,
     * and the data of the nodes will change as they are recycled. */
    this.getNodes = function() { return nodes; };

    /** This returns true if focus had to be switched; typically if
        the focus had to be switched, you should return from any event
        handling, otherwise all kinds of surprising bugs happen...  */
    this.ensureFocused = function() {
      var window = stack.getWindow();
      if (window.hasFocus()) {
        return false;
      } else {
        window.focus();
        return true;
      }
    };

    var lastX = null, lastY = null;
    
    /* padding beyond screen borders for fetching data and updating nodes */
    var PAD = 256;
    
    /* old_x and old_y record the x and y position of the stack the
       last time that an updateNodes request was made.  When panning
       the stack, these are used to tell whether the user has panned
       far enough to merit issuing another updateNodes. */
    var old_x = stack.x;
    var old_y = stack.y;
    
    SkeletonElements.clearCache();

    // Register instance: only one per stack allowed
    SVGOverlays[stack] = this;

    /** Unregister the SVGOverlay instance and perform cleanup duties. */
    this.destroy = function() {
      if (self === SVGOverlays[stack]) {
        delete SVGOverlays[stack];
      }
    };

    // Note that this function will not return the active node if it
    // is not currently being displayed (e.g. if you pan such that the
    // active node is no longer in the set of nodes which are fetched)
    this.getActiveNode = function() {
      var result;
      if (null === atn.id)
        return null;
      result = nodes[atn.id];
      if (result === undefined)
        return null;
      else
        return result;
    };

    /**
     * Activates the given node id if it exists
      in the current retrieved set of nodes
     */
    this.selectNode = function (id) {
      var node = nodes[id];
      if (node) {
        self.activateNode(node);
      }
    };

    /**
     * Find connectors pre- and postsynaptic to the given node ID.
     * Returns an array of two arrays, containing IDs of pre and post connectors.
     */
    this.findConnectors = function (node_id) {
      var id, node;
      var pre = [];
      var post = [];
      for (id in nodes) {
        if (nodes.hasOwnProperty(id)) {
          node = nodes[id];
          if ("connector" === node.type) {
            if (node.pregroup.hasOwnProperty(node_id)) {
              pre.push(parseInt(id));
            } else if (node.postgroup.hasOwnProperty(node_id)) {
              post.push(parseInt(id));
            }
          }
        }
      }
      return [pre, post];
    };

    this.recolorAllNodes = function () {
      // Assumes that atn and active_skeleton_id are correct:
      var nodeid, node;
      for (nodeid in nodes) {
        if (nodes.hasOwnProperty(nodeid)) {
          node = nodes[nodeid];
          node.setColor();
          node.drawEdges();
        }
      }
    };

    this.setNeuronNameInTopbar = function( neuronname, skeletonid ) {
      $('#neuronName').text(neuronname + ' (Skeleton ID: '+ skeletonid +')');
    }

    this.activateNode = function(node)
    {
      if (node)
      {
        // Check if the node is already selected/activated
        if (node.id === atn.id && node.skeleton_id === atn.skeleton_id) {
          // Update coordinates
          atn.set(node);
          return;
        }
        // Else, select the node
        if ("treenode" === node.type) {
          // Update statusBar
          statusBar.replaceLast("Activated treenode with id " + node.id + " and skeleton id " + node.skeleton_id);
          // If changing skeletons:
          var changing_skeletons = atn.skeleton_id !== node.skeleton_id;
          if (changing_skeletons) {
            // 1. Open the object tree node if synchronizing:
            openSkeletonNodeInObjectTree(node);
            // 2. Update the status with the ancestry of that skeleton:
            requestQueue.register(django_url + project.id + '/skeleton/ancestry', "POST", {
              pid: project.id,
              skeleton_id: node.skeleton_id
            }, function (status, text) {
              var json = $.parseJSON(text), message, i, d, neuronid;
              if (status === 200) {
                if (json.error) {
                  growlAlert('Skeleton ancestry', "There was an error fetching the ancestry of skeleton "+node.skeleton_id+":\n" + json.error);
                } else {
                  message = "Activated treenode with id " + node.id + " and skeleton id " + node.skeleton_id;
                  for (i = 0; i < json.length; ++i) {
                    d = json[i];
                    message += " <i>part_of</i> [<strong>"+d.name+"</strong>]";
                  }
                  statusBar.replaceLastHTML(message);
                  neuronid = json[0].id;
                  self.setNeuronNameInTopbar(json[0].name, node.skeleton_id);
                  project.selectedObjects.selectedneuron = neuronid;
                  project.selectedObjects.selectedskeleton = parseInt(node.skeleton_id);
                }
              } else {
                alert("Getting the ancestry of the skeleton "+node.skeleton_id+" failed with HTTP status code "+status);
              }
            });
            // 3. Refresh the nodes with info from the database
            self.updateNodes(); // recolors nodes when recreating them
          }

          atn.set(node);

          if (!changing_skeletons) {
            // Nodes didn't change, but the active state has
            self.recolorAllNodes();
          }

          // refresh all widgets except for the object tree
          // the reason is that calling a refresh just after a request to open tree path
          // prevents the opening of the tree path. thus, the opening of the treepath
          // and/or refresh have to be added to the individual operation's
          // (such as split tree) callbacks
          refreshAllWidgets();
        } else {
          statusBar.replaceLast("Activated connector node #" + node.id);
          atn.set(node);
          self.recolorAllNodes();
        }
      } else {
        // Deselect
        atn.set(null);
        // Deselect all from Object Tree. It is necessary because the neuron ID
        // would be used to create the next skeleton, and it would fail
        // if the neuron doesn't exist.
        project.setSelectObject( null, null );
        $('#tree_object').jstree("deselect_all");
        self.recolorAllNodes();
      }

      // if displayed in 3d viewer, update position
      WebGLApp.updateActiveNode();

    };

    this.activateNearestNode = function (x, y, z) {
      var nearestnode = this.findNodeWithinRadius(x, y, z, Number.MAX_VALUE);
      if (nearestnode) {
        var physZ = self.pix2physZ(nearestnode.z);
        if (physZ >= z && physZ < z + stack.resolution.z) {
          self.activateNode(nearestnode);
        } else {
          statusBar.replaceLast("No nodes were visible in the current section - can't activate the nearest");
        }
      }
      return nearestnode;
    };

    this.findNodeWithinRadius = function (x, y, z, radius) {
      var xdiff, ydiff, zdiff, distsq, mindistsq = radius * radius, nearestnode = null, node, nodeid;
      for (nodeid in nodes) {
        if (nodes.hasOwnProperty(nodeid)) {
          node = nodes[nodeid];
          xdiff = x - self.pix2physX(node.x);
          ydiff = y - self.pix2physY(node.y);
          zdiff = z - self.pix2physZ(node.z);
          distsq = xdiff*xdiff + ydiff*ydiff + zdiff*zdiff;
          if (distsq < mindistsq) {
            mindistsq = distsq;
            nearestnode = node;
          }
        }
      }
      return nearestnode;
    };

    this.hideLabels = function() {
      // remove all labels in the view
      // empty the labels array
      document.getElementById( "trace_button_togglelabels" ).className = "button";
      for (var labid in labels) {
        if (labels.hasOwnProperty(labid)) {
          labels[labid].remove();
        }
      }
      labels = {};
      show_labels = false;
    };

    this.removeLabels = function() {
      // remove all labels in the view
      // empty the labels array
      for (var labid in labels) {
        if (labels.hasOwnProperty(labid)) {
          labels[labid].remove();
        }
      }
      labels = {};
    };

    this.showLabels = function() {
      show_labels = true;
      self.updateNodes(function() {
        document.getElementById( "trace_button_togglelabels" ).className = "button_active";
      });
    };

    var tagbox = null;

    var removeTagbox = function() {
      if(tagbox) {
        tagbox.remove();
        tagbox = null;
      }
    };

    this.tagATNwithLabel = function( label ) {
      requestQueue.register(django_url + project.id + '/label/' + atn.type + '/' + atn.id + '/update', "POST", {
        pid: project.id,
        tags: label
      }, function (status, text, xml) {
        if (status === 200) {
          if (text && text !== " ") {
            var e = $.parseJSON(text);
            if (e.error) {
              alert(e.error);
            } else {
            if( label === '' ) {
                $('#growl-alert').growlAlert({
                  autoShow: true,
                  content: 'Tags removed.',
                  title: 'Information',
                  position: 'top-right',
                  delayTime: 2000,
                  onComplete: function() { g.remove(); }
                });
            } else {
                $('#growl-alert').growlAlert({
                    autoShow: true,
                    content: 'Tag ' + label + ' added.',
                    title: 'Information',
                    position: 'top-right',
                    delayTime: 2000,
                    onComplete: function() { g.remove(); }
                });
            }
              self.updateNodes();
              return true;
            }
          }
          return false;
        }
      });
    };

    this.tagATN = function () {
      // tagbox from
      // http://blog.crazybeavers.se/wp-content/Demos/jquery.tag.editor/

      if(tagbox) {
        $('#growl-alert').growlAlert({
          autoShow: true,
          content: 'Close tagbox first before you tag another node!',
          title: 'BEWARE',
          position: 'top-right',
          delayTime: 2500,
          onComplete: function() { g.remove(); }
        });
        return;
      }

      var e = $("<div class='tagBox' id='tagBoxId" + atn.id + "' style='z-index: 8; border: 1px solid #B3B2B2; padding: 5px; left: " + atn.x + "px; top: " + atn.y + "px;'>" +
      "Tag: <input id='Tags" + atn.id + "' name='Tags' type='text' value='' /><div style='color:#949494'>(Save&Close: Enter)</div>" );
      e.css('background-color', 'white');
      e.css('position', 'absolute');
      e.appendTo("#"+view.id);

      tagbox = e;

      $("#tagBoxId" + atn.id).mousedown(function (event) {
        updateTags();
        if($("#Tags" + atn.id).tagEditorGetTags()==="") {
          removeTagbox();
          self.hideLabels();
          self.updateNodes();
        }
        event.stopPropagation();
      });

      $("#tagBoxId" + atn.id).keydown(function (event) {
        if (event.keyCode == 13) { // ENTER
          event.stopPropagation();
          if($("#Tags" + atn.id).val()==="") {
            updateTags();
            removeTagbox();
            $('#growl-alert').growlAlert({
              autoShow: true,
              content: 'Tags saved!',
              title: 'Information',
              position: 'top-right',
              delayTime: 2000,
              onComplete: function() { g.remove(); }
            });
            self.updateNodes();
          }
        }
      });

      $("#tagBoxId" + atn.id).keyup(function (event) {
        if (event.keyCode == 27) { // ESC
          event.stopPropagation();
          removeTagbox();
        }
      });

      // add autocompletion
      requestQueue.register(django_url + project.id + '/labels-all', "POST", {
        pid: project.id
      }, function (status, text, xml) {

        if (status === 200) {
          if (text && text !== " ") {
            var e = $.parseJSON(text);
            if (e.error) {
              alert(e.error);
            } else {
              var availableTags = $.parseJSON(text);
              $("#Tags" + atn.id).autocomplete({
                source: availableTags
              });
            }
          }
        }
      });
      
      requestQueue.register(django_url + project.id + '/labels-for-node/' + atn.type  + '/' + atn.id, "POST", {
        pid: project.id
      }, function (status, text, xml) {

        if (status === 200) {
          if (text && text !== " ") {
            var e = $.parseJSON(text);
            if (e.error) {
              alert(e.error);
            } else {
              var nodeitems = $.parseJSON(text);
              $("#Tags" + atn.id).tagEditor({
                items: nodeitems,
                confirmRemoval: false,
                completeOnSeparator: true
              });
              $("#Tags" + atn.id).focus();

            }
          }
        }
      });

      var updateTags = function() {
        requestQueue.register(django_url + project.id + '/label/' + atn.type + '/' + atn.id + '/update', "POST", {
          pid: project.id,
          nid: atn.id,
          ntype: atn.type,
          tags: $("#Tags" + atn.id).tagEditorGetTags()
        }, function (status, text, xml) {
          if (status === 200) {
            if (text && text !== " ") {
              var e = $.parseJSON(text);
              if (e.error) {
                alert(e.error);
              }
            }
          }
          else if (status === 500) {
            win = window.open('', '', 'width=1100,height=620');
            win.document.write(text);
            win.focus();
          }
        });
      };

    };

    this.rerootSkeleton = function () {
      if (confirm("Do you really want to to reroot the skeleton?")) {
        requestQueue.register(django_url + project.id + '/skeleton/reroot', "POST", {
          treenode_id: atn.id
        }, function (status, text, xml) {
          if (status === 200) {
            if (text && text !== " ") {
              var e = $.parseJSON(text);
              if (e.error) {
                alert(e.error);
              } else {
                // just redraw all for now
                self.updateNodes();
              }
            }
          }
        });
      }
    };

    this.splitSkeleton = function () {
        if( -1 === nodes[atn.id].parent_id ) {
            alert('Can not split at root node!');
            return;
        }
        if (confirm("Do you really want to to split the skeleton?")) {
        $.blockUI({ message: '<h2><img src="widgets/busy.gif" /> Splitting skeleton. Just a moment...</h2>' });
        requestQueue.register(
            //"model/treenode.split.php",
            django_url + project.id + '/skeleton/split',
            "POST", {
            treenode_id: atn.id
          }, function (status, text, xml) {
            $.unblockUI();
            if (status === 200) {
              if (text && text !== " ") {
                var e = $.parseJSON(text);
                if (e.error) {
                  alert(e.error);
                } else {
                  // just redraw all for now
                  self.updateNodes();
                  ObjectTree.refresh();
                  refreshAllWidgets();
                  self.selectNode(atn.id);
                }
              }
            }
          });
      }
    };

    /**
     * Execute the function fn if the skeleton with id skeleton_id
     * has more than one node, or if, having a single node,
     * the dialog is confirmed.
     * The verb is the action to perform, as written as a question in a dialog
     * to confirm the action if the skeleton has a single node.
     */
    var maybeExecuteIfSkeletonHasMoreThanOneNode = function(node_id, verb, fn) {
      requestQueue.register(django_url + project.id + '/skeleton/node/' + node_id + '/node_count', "POST", {}, function(status, text, xml) {
        if (status === 200) {
          if (text && text !== " ") {
            var r = $.parseJSON(text);
            if (r.error) {
              alert(r.error);
            } else {
              if (r.count > 1 && !confirm("Do you really want to " + verb + " skeleton #" + r.skeleton_id + ", which has more than one node?")) {
                return;
              }
              fn();
            }
          }
        }
      });
    };

    // Used to join two skeletons together
    // Permissions are checked at the server side, returning an error if not allowed.
    this.createTreenodeLink = function (fromid, toid) {
      if (fromid === toid) return;
      if( toid in nodes ) {
        maybeExecuteIfSkeletonHasMoreThanOneNode(
            toid,
            "join",
            function() {
              // The call to join will reroot the target skeleton at the shift-clicked treenode
              requestQueue.register(django_url + project.id + '/skeleton/join', "POST", {
                from_id: fromid,
                to_id: toid
              }, function (status, text, xml) {
                if (status === 200) {
                  if (text && text !== " ") {
                    var e = $.parseJSON(text);
                    if (e.error) {
                      alert(e.error);
                    } else {
                      // just redraw all for now
                      self.updateNodes(function () {
                        ObjectTree.refresh();
                        refreshAllWidgets();
                        self.selectNode(toid);
                      });
                    }
                  }
                }
              });
            });
      }
    };

    this.createLink = function (fromid, toid, link_type) {
      //requestQueue.register("model/link.create.php", "POST",
      requestQueue.register(django_url + project.id + '/link/create', "POST", {
        pid: project.id,
        from_id: fromid,
        link_type: link_type,
        to_id: toid
      }, function (status, text, xml) {
        if (status === 200) {
          if (text && text !== " ") {
            var e = $.parseJSON(text);
            if (e.error) {
              alert(e.error);
            } else {
              // just redraw all for now
              self.updateNodes();
            }
          }
        }
        return true;
      });
      return;
    };

    /** If given a completionCallback function, it is invoked with one argument: the ID of the newly created connector. */
    var createSingleConnector = function (phys_x, phys_y, phys_z, pos_x, pos_y, pos_z, confval, completionCallback) {
      // create a single connector not linked to any treenode
      requestQueue.register(django_url + project.id + '/connector/create', "POST", {
        pid: project.id,
        confidence: confval,
        x: phys_x,
        y: phys_y,
        z: phys_z
      }, function (status, text, xml) {
        if (status === 200) {
          if (text && text !== " ") {
            var e = $.parseJSON(text);
            if (e.error) {
              alert(e.error);
            } else {
              // add treenode to the display and update it
              var jso = $.parseJSON(text);
              var nn = SkeletonElements.newConnectorNode(jso.connector_id, self.paper, 8, pos_x, pos_y, pos_z, 0, 5 /* confidence */, true);
              nodes[jso.connector_id] = nn;
              nn.draw();
              self.activateNode(nn);
              if (typeof completionCallback !== "undefined") {
                completionCallback(jso.connector_id);
              }
            }
          } // endif
        } // end if
      }); // endfunction
    };

    // Create a new postsynaptic treenode from a connector. Store new skeleton/neuron in Isolated synaptic terminals
    // We create the treenode first, then we create the link from the connector
    var createPostsynapticTreenode = function (connectorID, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z) {
      createTreenodeWithLink(connectorID, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z, "postsynaptic_to");
    }

    var createPresynapticTreenode = function (connectorID, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z) {
      // Check that connectorID doesn't have a presynaptic treenode already
      // (It is also checked in the server on attempting to create a link. Here, it is checked for convenience to avoid creating an isolated treenode for no reason.)
      var connectorNode = nodes[connectorID];
      if (Object.keys(connectorNode.pregroup).length > 0) {
        growlAlert("WARNING", "The connector already has a presynaptic node!");
        return;
      }
      createTreenodeWithLink(connectorID, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z, "presynaptic_to");
    }

    var createTreenodeWithLink = function (connectorID, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z, link_type) {
      requestQueue.register(django_url + project.id + '/treenode/create', "POST", {
        pid: project.id,
        parent_id: -1,
        x: phys_x,
        y: phys_y,
        z: phys_z,
        radius: radius,
        confidence: confidence,
        targetgroup: "Isolated synaptic terminals"
      }, function (status, text, xml) {
        if (status === 200) {
          if (text && text !== " ") {
            var jso = $.parseJSON(text);
            if (jso.error) {
              alert(jso.error);
            } else {
              var nid = parseInt(jso.treenode_id);

              // always create a new treenode which is the root of a new skeleton
              var nn = SkeletonElements.newNode(nid, self.paper, null, null, radius, pos_x, pos_y, pos_z, 0, 5 /* confidence */, parseInt(jso.skeleton_id), true);
              if (nn.line) nn.line.toBack();

              // add node to nodes list
              nodes[nid] = nn;
              nn.draw();

              // create link : new treenode postsynaptic_to or presynaptic_to deactivated connectorID
              self.createLink(nid, connectorID, link_type);
            }
          }
        }
        return true;
      });
      return;

    };


    /** Caters both to the createInterpolatedNode and createTreenodeLinkInterpolated functions, which are almost identical. */
    var createInterpolatedNodeFn = function () {
      // Javascript is not multithreaded.
      // The only pseudo-threadedness occurs in the code execution between the AJAX request and the execution of the callback; that is, no concurrency, but continuations. Therefore altering the queue array is always safe.

      // Accumulate invocations of the createInterpolatedNode function
      var queue = [];

      // Function to handle the callback
      var handler = function (status, text, xml) {
        if (status !== 200) {
          queue.length = 0; // reset
          return false;
        }
        if (text && text !== " ") {
          var json = $.parseJSON(text);
          if (json.error) {
            alert(json.error);
            queue.length = 0; // reset
          } else {
            // Check if any calls have accumulated
            if (queue.length > 1) {
              // Remove this call
              queue.shift();
              // Invoke the oldest of any accumulated calls
              requester(json.treenode_id, queue[0]);
            } else {
              // Start a new continuation to update the nodes,
              // ensuring that the desired active node will be loaded
              // (Could not be loaded if the user scrolled away between
              // the creation of the node and its activation)
              self.updateNodes(function () {
                self.selectNode(json.treenode_id);
                // Remove this call now that the active node is set properly
                queue.shift();
                // Invoke the oldest of any accumulated calls
                if (queue.length > 0) {
                  requester(json.treenode_id, queue[0]);
                }
              }, json.treenode_id);
            }
            if (json.has_changed_group) {
              ObjectTree.refresh();
            }
          }
        }
        return true;
      };

      // Function to request interpolated nodes
      var requester = function(parent_id, q) {
        // Creates treenodes from atn to new node in each z section
        var post = {
            pid: project.id,
            x: q.phys_x,
            y: q.phys_y,
            z: q.phys_z,
            resx: stack.resolution.x,
            resy: stack.resolution.y,
            resz: stack.resolution.z,
            stack_translation_z: stack.translation.z,
            stack_id: project.focusedStack.id
        };
        var url;
        if (q.nearestnode_id) {
          url = '/skeleton/join_interpolated';
          post['from_id'] = parent_id;
          post['to_id'] = q.nearestnode_id;
        } else {
          url = '/treenode/create/interpolated';
          post['parent_id'] = parent_id;
        }
        requestQueue.register(django_url + project.id + url, "POST", post, handler);
      };

      return function (phys_x, phys_y, phys_z, nearestnode_id) {
        queue.push({phys_x: phys_x,
                    phys_y: phys_y,
                    phys_z: phys_z,
                    nearestnode_id: nearestnode_id});

        if (queue.length > 1) {
          return; // will be handled by the callback
        }

        if (!atn.id) {
            growlAlert("WARNING", "No node selected!");
            return;
        }
        requester(atn.id, queue[0]);
      }
    };

    var createInterpolatedNode = createInterpolatedNodeFn();

    // Interpolate and join, both: uses same function as createInterpolatedNode
    var createTreenodeLinkInterpolated = createInterpolatedNode;


    // Create a node and activate it
    var createNode = function (parentID, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z)
    {
      var selneuron, useneuron;

      if (!parentID) {
        parentID = -1;
      }

      // check if we want the newly create node to be
      // a model of a neuron
      selneuron = project.selectedObjects.selectedneuron;
      if (selneuron !== null) {
        useneuron = selneuron;
      } else {
        useneuron = -1;
      }

      requestQueue.register(django_url + project.id + '/treenode/create', "POST", {
        pid: project.id,
        parent_id: parentID,
        x: phys_x,
        y: phys_y,
        z: phys_z,
        radius: radius,
        confidence: confidence,
        targetgroup: "Fragments",
        useneuron: useneuron
      }, function (status, text, xml) {
        if (status === 200) {
          if (text && text !== " ") {
            var jso = $.parseJSON(text);
            if (jso.error) {
              alert(jso.error);
            } else {
              // add treenode to the display and update it
              var nid = parseInt(jso.treenode_id);
              // The parent will be null if there isn't one or if the parent Node object is not within the set of retrieved nodes, but the parentID will be defined.
              var nn = SkeletonElements.newNode(nid, self.paper, nodes[parentID], parentID, radius, pos_x, pos_y, pos_z, 0, 5 /* confidence */, parseInt(jso.skeleton_id), true);

              nodes[nid] = nn;
              nn.draw();
              var active_node_z = atn.z;
              self.activateNode(nn); // will alter atn

              // ALREADY DONE by activate node // refreshAllWidgets();

              // Check whether the Z coordinate of the new node is beyond one section away
              // from the Z coordinate of the parent node (which is the active by definition)
              if (active_node_z !== null) {
                if (Math.abs(active_node_z - nn.z) > 1) {
                  $('#growl-alert').growlAlert({
                    autoShow: true,
                    content: 'Node added beyond one section from its parent node!',
                    title: 'BEWARE',
                    position: 'top-right',
                    delayTime: 2500,
                    onComplete: function() { g.remove(); }
                  });
                }
              }

              if (jso.has_changed_group) {
                ObjectTree.refresh();
              }
            }
          }
        }
        return true;
      });
      return;
    };

    var updateNodePositions = function (nodeArray, completedCallback) {
      var requestDictionary = {}, i, k, node, callback;
      for (i in nodeArray) {
        if (nodeArray.hasOwnProperty(i)) {
          requestDictionary['pid' + i] = project.id;
          node = nodeArray[i];
          for (k in node) {
            if (node.hasOwnProperty(k)) {
              requestDictionary[k + i] = node[k];
            }
          }
        }
      }
      callback = function (status, text, xml) {
        var e;
        if (status === 200) {
          if (text && text !== " ") {
            e = $.parseJSON(text);
            if (e.error) {
              alert(e.error);
              if (typeof completedCallback !== "undefined") {
                completedCallback(-1);
              }
            } else {
              if (typeof completedCallback !== "undefined") {
                completedCallback(e.updated);
              }
            }
          }
        }
        return true;
      };
      //requestQueue.register("model/node.update.php", "POST", requestDictionary, callback);
      requestQueue.register(django_url + project.id + '/node/update', "POST", requestDictionary, callback);
    };

    this.updateNodeCoordinatesinDB = function (completedCallback) {
      var nodesToUpdate = [], i, phys_x, phys_y, phys_z;
      for (i in nodes) {
        if (nodes.hasOwnProperty(i)) {
          // only updated nodes that need sync, e.g.
          // when they changed position
          if (nodes[i].needsync) {
            // get physical
            phys_x = this.pix2physX(nodes[i].x);
            phys_y = this.pix2physY(nodes[i].y);
            phys_z = this.pix2physZ(nodes[i].z);
            nodes[i].needsync = false;

            nodesToUpdate.push({
              'node_id': nodes[i].id,
              'x': phys_x,
              'y': phys_y,
              'z': phys_z,
              'type': nodes[i].type
            });
          }
        }
      }
      if (nodesToUpdate.length > 0) {
        updateNodePositions(nodesToUpdate, completedCallback);
      } else {
        if (completedCallback) {
          completedCallback(0);
        }
      }
    };

    /** Only called when changing magnification. */
/*
    this.updateNodeCoordinates = function (new_scale) {
      var i,
          fact = new_scale / old_scale,
          node, ID;
      // depending on the scale, update all the node coordinates
      // First alter X,Y
      for (ID in nodes) {
        if (nodes.hasOwnProperty(ID)) {
          node = nodes[ID];
          node.setXY(Math.floor(node.x * fact), Math.floor(node.y * fact));
        }
      }
      // Then redraw edges, now that children and parents have been updated
      for (ID in nodes) {
        if (nodes.hasOwnProperty(ID)) {
          nodes[ID].drawEdges();
        }
      }
    };
*/


    /** Recreate all nodes (or reuse existing ones if possible).
     *
     * @param jso is an array of JSON objects, where each object may specify a Node or a ConnectorNode
     * @param pz is the z of the section in calibrated coordinates
     */
    var refreshNodesFromTuples = function (jso, pz)
    {
      // Reset nodes and labels
      nodes = {};
      // remove labels, but do not hide them
      self.removeLabels();

      // Prepare existing Node and ConnectorNode instances for reuse
      SkeletonElements.resetCache();

      // Populate Nodes
      jso[0].forEach(function(a, index, array) {
        // a[0]: ID, a[1]: parent ID, a[2]: x, a[3]: y, a[4]: z, a[5]: confidence
        // a[8]: user_id, a[6]: radius, a[7]: skeleton_id, a[8]: user can edit or not
        nodes[a[0]] = SkeletonElements.newNode(
          a[0], self.paper, null, a[1], a[6], phys2pixX(a[2]),
          phys2pixY(a[3]), phys2pixZ(a[4]),
          (a[4] - pz) / stack.resolution.z, a[5], a[7], a[8]);
      });

      // Populate ConnectorNodes
      jso[1].forEach(function(a, index, array) {
        // a[0]: ID, a[1]: x, a[2]: y, a[3]: z, a[4]: confidence,
        // a[5]: presynaptic nodes as array of arrays with treenode id
        // and confidence, a[6]: postsynaptic nodes as array of arrays with treenode id
        // and confidence, a[7]: whether the user can edit the connector
        nodes[a[0]] = SkeletonElements.newConnectorNode(
          a[0], self.paper, 8, phys2pixX(a[1]),
          phys2pixY(a[2]), phys2pixZ(a[3]),
          (a[3] - pz) / stack.resolution.z, a[4], a[7]);
      });

      // Disable any unused instances
      SkeletonElements.disableBeyond(jso[0].length, jso[1].length);

      // Now that all Node instances are in place, loop nodes again
      // and set correct parent objects and parent's children update
      jso[0].forEach(function(a, index, array) {
        var nid = a[0]; // Node's ID
        var pn = nodes[a[1]]; // parent Node
        if (pn) {
          var nn = nodes[nid];
          // if parent exists, update the references
          nn.parent = pn;
          // update the parent's children
          pn.addChildNode(nn);
        }
      });

      // Now that ConnectorNode and Node instances are in place,
      // set the pre and post relations
      jso[1].forEach(function(a, index, array) {
        // a[0] is the ID of the ConnectorNode
        var connector = nodes[a[0]];
        // a[5]: pre relation which is an array of arrays of tnid and tc_confidence
        a[5].forEach(function(r, i, ar) {
          // r[0]: tnid, r[1]: tc_confidence
          var tnid = r[0];
          var node = nodes[tnid];
          if (node) {
            // link it to pregroup, to connect it to the connector
            connector.pregroup[tnid] = {'treenode': node,
                                        'confidence': r[1]};
          }
        });
        // a[6]: post relation which is an array of arrays of tnid and tc_confidence
        a[6].forEach(function(r, i, ar) {
          // r[0]: tnid, r[1]: tc_confidence
          var tnid = r[0];
          var node = nodes[tnid];
          if (node) {
            // link it to postgroup, to connect it to the connector
            connector.postgroup[tnid] = {'treenode': node,
                                         'confidence': r[1]};
          }
        });
      });

      if (edgetoggle) {
        // Draw node edges first
        for (var i in nodes) {
          if (nodes.hasOwnProperty(i)) {
            nodes[i].setColor();
            // Will only create it or unhide it the edge is to be displayed
            nodes[i].drawEdges();
          }
        }
      } // end speed toggle

      // Create raphael's circles on top of the edges
      // so that the events reach the circles first
      for (var i in nodes) {
        if (nodes.hasOwnProperty(i)) {
          // Will only create it or unhide it if the node is to be displayed
          nodes[i].createCircle();
        }
      }

      if (self.getLabelStatus()) {
        // For every node ID
        var m = jso[2];
        for (var nid in m) {
          if (m.hasOwnProperty(nid)) {
            var node = nodes[nid];
            labels[nid] = new OverlayLabel(nid, self.paper, node.x, node.y, m[nid]);
          }
        }
      }

      // Warn about nodes not retrieved because of limit
      if (true === jso[3]) {
        var msg = "Did not retrieve all visible nodes--too many! Zoom in to constrain the field of view.";
        statusBar.replaceLast("*WARNING*: " + msg);
        growlAlert('WARNING', msg);
      }
    };

    // Initialize to the value of stack.scale at instantiation of SVGOverlay
    var old_scale = stack.scale;


    /* When we pass a completedCallback to redraw, it's essentially
       always because we want to know that, if any fetching of nodes
       was required for the redraw, those nodes have now been fetched.
       So, if we *do* need to call updateNodes, we should pass it the
       completionCallback.  Otherwise, just fire the
       completionCallback at the end of this method. */

    this.redraw = function( stack, completionCallback ) {
      var wc = stack.getWorldTopLeft();
      var pl = wc.worldLeft,
          pt = wc.worldTop,
          new_scale = wc.scale;
      
      // FIXME: this should also check for the size of the containing
      // div having changed.  You can see this problem if you have
      // another window open beside one with the tracing overlay -
      // when you close the window, the tracing overlay window is
      // enlarged but will have extra nodes fetched for the exposed
      // area.

      var doNotUpdate = stack.old_z == stack.z && stack.old_s == stack.s;
      if ( doNotUpdate )
      {
        var sPAD = PAD / stack.scale;
        var dx = old_x - stack.x;
        doNotUpdate = dx < sPAD && dx > -sPAD;
        
        if ( doNotUpdate )
        {
          var dy = old_y - stack.y;
          doNotUpdate = dy < sPAD && dy > -sPAD;
        }
      }

      if ( !doNotUpdate ) {
        self.updateNodes(completionCallback);
      }

      self.view.style.left = Math.floor((-pl / stack.resolution.x) * new_scale) + "px";
      self.view.style.top = Math.floor((-pt / stack.resolution.y) * new_scale) + "px";

      self.updatePaperDimensions(stack);
      if (doNotUpdate) {
        if (typeof completionCallback !== "undefined") {
          completionCallback();
        }
      }
    };

    // TODO This doc below is obsolete
    // This isn't called "onclick" to avoid confusion - click events
    // aren't generated when clicking in the overlay since the mousedown
    // and mouseup events happen in different divs.  This is actually
    // called from mousedown (or mouseup if we ever need to make
    // click-and-drag work with the left hand button too...)
    this.whenclicked = function (e) {
      if (this.ensureFocused()) {
        e.stopPropagation();
        return;
      }
      var m = ui.getMouse(e, self.view);

      if (!mayEdit()) {
        statusBar.replaceLast("You don't have permission.");
        e.stopPropagation();
        return;
      }

      // take into account current local offset coordinates and scale
      var pos_x = m.offsetX;
      var pos_y = m.offsetY;
      var pos_z = phys2pixZ(project.coordinates.z);

      // get physical coordinates for node position creation
      var phys_x = pix2physX(pos_x);
      var phys_y = pix2physY(pos_y);
      var phys_z = project.coordinates.z;

      var targetTreenodeID;

      // e.metaKey should correspond to the command key on Mac OS
      if (e.ctrlKey || e.metaKey) {
        // ctrl-click deselects the current active node
        if (null !== atn.id) {
          statusBar.replaceLast("Deactivated node #" + atn.id);
        }
        // TODO: deactivation should be encapsulated in a separate method,
        // like it is partially in tracingtool's deselectActiveNode
        $('#neuronName').text('');
        ObjectTree.deselectAll();
        self.activateNode(null);
        e.stopPropagation();
      } else if (e.shiftKey) {
        if (null === atn.id) {
          if (getMode() === "skeletontracing") {
            $('#growl-alert').growlAlert({
              autoShow: true,
              content: 'You need to activate a treenode first (skeleton tracing mode)!',
              title: 'BEWARE',
              position: 'top-right',
              delayTime: 2500,
              onComplete: function() { g.remove(); }
            });
            e.stopPropagation();
            return true;
          }
        } else {
          targetTreenodeID = atn.id;
          if ("treenode" === atn.type) {
            if (e.shiftKey && e.altKey) {
              statusBar.replaceLast("created connector, with postynaptic treenode id " + atn.id);
              createSingleConnector(phys_x, phys_y, phys_z, pos_x, pos_y, pos_z, 5,
                  function (connectorID) {
                    self.createLink(targetTreenodeID, connectorID, "postsynaptic_to");
                  });
            } else if (e.shiftKey) {
              statusBar.replaceLast("created connector, with presynaptic treenode id " + atn.id);
              createSingleConnector( phys_x, phys_y, phys_z, pos_x, pos_y, pos_z, 5,
                  function (connectorID) {
                    self.createLink( targetTreenodeID, connectorID, "presynaptic_to" );
                  });
            }
            e.stopPropagation();
            return true;
          } else if ("connector" === atn.type) {
            // create new treenode (and skeleton) postsynaptic to activated connector
            statusBar.replaceLast("created treenode with id " + atn.id + "postsynaptic to activated connector");
            createPostsynapticTreenode(atn.id, phys_x, phys_y, phys_z, -1, 5, pos_x, pos_y, pos_z);
            e.stopPropagation();
            return true;
          }
        }
      } else {
        // depending on what mode we are in
        // do something else when clicking
        if (getMode() === "skeletontracing") {
          if ("treenode" === atn.type || null === atn.id) {
            // Create a new treenode,
            // either root node if atn is null, or child if it is not null
            if (null !== atn.id) {
              statusBar.replaceLast("Created new node as child of node #" + atn.id);
            }
            createNode(atn.id, phys_x, phys_y, phys_z, -1, 5, pos_x, pos_y, pos_z);
          } else if ("connector" === atn.type) {
            // create new treenode (and skeleton) presynaptic to activated connector
            // if the connector doesn't have a presynaptic node already
            createPresynapticTreenode(atn.id, phys_x, phys_y, phys_z, -1, 5, pos_x, pos_y, pos_z);
          }
          e.stopPropagation();
          return true;
        } else if (getMode() === "synapsedropping") {
          // only create single synapses/connectors
          createSingleConnector(phys_x, phys_y, phys_z, pos_x, pos_y, pos_z, 5);
        }
      }
      e.stopPropagation();
      return true;
    };

    // offset of stack in physical coordinates
    this.offleft = 0;
    this.offtop = 0;
    this.offsetXPhysical = 0;
    this.offsetYPhysical = 0;

    // currently there are two modes: skeletontracing and synapsedropping
    var currentmode = "skeletontracing";

    var view = document.createElement("div");
    view.className = "sliceSVGOverlay";
    view.id = "sliceSVGOverlayId"+stack.getId();
    view.style.zIndex = 5;
    // Custom cursor for tracing
    view.style.cursor ="url(widgets/themes/kde/svg-circle.cur) 15 15, crosshair";
    // make view accessible from outside for setting additional mouse handlers
    this.view = view;

    view.onmousemove = function( e ) {
      var wc;
      var worldX, worldY;
      var stackX, stackY;
      m = ui.getMouse(e, stack.getView(), true);
      if (m) {
        wc = stack.getWorldTopLeft();
        worldX = wc.worldLeft + ((m.offsetX / stack.scale) * stack.resolution.x);
        worldY = wc.worldTop + ((m.offsetY / stack.scale) * stack.resolution.y);
        lastX = worldX;
        lastY = worldY;
        statusBar.printCoords('['+worldX+', '+worldY+', '+project.coordinates.z+']');
        self.offsetXPhysical = worldX;
        self.offsetYPhysical = worldY;
      }
    };

    this.paper = Raphael(view, Math.floor(stack.dimension.x * stack.scale), Math.floor(stack.dimension.y * stack.scale));
    this.paper.catmaidSVGOverlay = this;

    this.updatePaperDimensions = function () {
      var wi = Math.floor(stack.dimension.x * stack.scale);
      var he = Math.floor(stack.dimension.y * stack.scale);
      // update width/height with the dimension from the database, which is in pixel unit
      view.style.width = wi + "px";
      view.style.height = he + "px";
      // update the raphael canvas as well
      self.paper.setSize(wi, he);
    };

    var phys2pixX = function (x) {
      return (x - stack.translation.x) / stack.resolution.x * stack.scale;
    };
    this.phys2pixX = phys2pixX;
    var phys2pixY = function (y) {
      return (y - stack.translation.y) / stack.resolution.y * stack.scale;
    };
    this.phys2pixY = phys2pixY;
    var phys2pixZ = function (z) {
      return (z - stack.translation.z) / stack.resolution.z;
    };
    this.phys2pixZ = phys2pixZ;

    var pix2physX = function (x) {
      return stack.translation.x + ((x) / stack.scale) * stack.resolution.x;
    };
    var pix2physY = function (y) {
      return stack.translation.y + ((y) / stack.scale) * stack.resolution.y;
    };
    this.pix2physX = function (x) {
      return stack.translation.x + ((x) / stack.scale) * stack.resolution.x;
    };
    this.pix2physY = function (y) {
      return stack.translation.y + ((y) / stack.scale) * stack.resolution.y;
    };
    this.pix2physZ = function (z) {
      return z *stack.resolution.z + stack.translation.z;
    };

    this.show = function () {
      view.style.display = "block";
    };
    this.hide = function () {
      view.style.display = "none";
    };

    $('input#edgetoggle').change(function () {
      if ($(this).attr("checked")) {
        //do the stuff that you would do when 'checked'
        edgetoggle = true;
        self.updateNodes();
        return;
      } else {
        edgetoggle = false;
        self.updateNodes();
        return;
      }
      //Here do the stuff you want to do when 'unchecked'
    });

    /**
     * update treeline nodes by querying them from the server
     * with a bounding volume dependant on the current view
     */
    this.updateNodes = function (callback, future_active_node_id)
    {
      var activeSkeleton = SkeletonAnnotations.getActiveSkeletonId();
      if (!activeSkeleton) {
        activeSkeleton = 0;
      }

      self.updateNodeCoordinatesinDB(function () {
        // stack.viewWidth and .viewHeight are in screen pixels
        // so they must be scaled and then transformed to nanometers
        // and stack.x, .y are in absolute pixels, so they also must be brought to nanometers
        var atnid = -1; // cannot send a null
        var atntype = "";
        if (atn.id && "treenode" === atn.type) {
          if (future_active_node_id) {
            atnid = future_active_node_id;
          } else {
            atnid = atn.id;
          }
        }

        //requestQueue.replace('model/node.list.php', 'POST',
        var pz = stack.z * stack.resolution.z + stack.translation.z;
        requestQueue.replace(django_url + project.id + '/node/list', 'POST', {
          pid: stack.getProject().id,
          sid: stack.getId(),
          z: pz,
          top: (stack.y - (stack.viewHeight / 2) / stack.scale) * stack.resolution.y + stack.translation.y,
          left: (stack.x - (stack.viewWidth / 2) / stack.scale) * stack.resolution.x + stack.translation.x,
          width: (stack.viewWidth / stack.scale) * stack.resolution.x,
          height: (stack.viewHeight / stack.scale) * stack.resolution.y,
          zres: stack.resolution.z,
          atnid: atnid,
          labels: self.getLabelStatus()
        }, function (status, text, xml) {
          handle_updateNodes(status, text, xml, callback, pz);
        },
        'nodes_for_overlay_request');
      
        old_x = stack.x;
        old_y = stack.y;
      });
    };

    /**
     * handle an update-treelinenodes-request answer
     *
     */
    var handle_updateNodes = function (status, text, xml, callback, pz) {
      if (status == 200) {
        var jso = $.parseJSON(text);
        // There could be a genuine error (something went wrong in the server)
        // or a subsequent request replaced this request, which was canceled
        // and served with the "REPLACED" tag as error message.
        if (jso.error) {
          if ("REPLACED" !== jso.error) {
            alert(jso.error);
          }
        } else {
          // XXX: how much time does calling the function like this take?
          refreshNodesFromTuples(jso, pz);
          stack.redraw();
        }
      }
      if (typeof callback !== "undefined") {
        callback();
      }
      return;
    };




    this.set_tracing_mode = function (mode) {
      // toggles the button correctly
      // might update the mouse pointer
      document.getElementById("trace_button_skeleton").className = "button";
      document.getElementById("trace_button_synapse").className = "button";

      if (mode === "skeletontracing") {
        currentmode = mode;
        document.getElementById("trace_button_skeleton").className = "button_active";
      } else if (currentmode === "skeletontracing") {
        currentmode = mode;
        document.getElementById("trace_button_synapse").className = "button_active";
      }
    };

    var getMode = function (e) {
      return currentmode;
    };

    this.updateNeuronName = function() {
      var activeSkeleton = SkeletonAnnotations.getActiveSkeletonId();
      if( activeSkeleton ) {
        requestQueue.register(django_url + project.id + '/skeleton/' + SkeletonAnnotations.getActiveSkeletonId() + '/neuronname', "POST", {}, function (status, text, xml) {
          var e;
          if (status === 200) {
            if (text && text !== " ") {
              e = $.parseJSON(text);
              if (e.error) {
                alert(e.error);
              }
              var new_neuronname = prompt("Change neuron name", e['neuronname']);
              $.post(django_url + project.id + '/object-tree/instance-operation', {
                "operation": "rename_node",
                "id": e['neuronid'],
                "title": new_neuronname,
                "classname": "neuron",
                "pid": project.id
              }, function (r) {
                  r = $.parseJSON(r);
                  if(r['error']) {
                      alert(r['error']);
                  }
                  self.setNeuronNameInTopbar(new_neuronname, activeSkeleton)
                  refreshAllWidgets();
              });
            }
          }
        });

      }
    
    };

    this.setConfidence = function(newConfidence, toConnector) {

      var atn = self.getActiveNode();
      if (atn !== null && (atn.type === 'treenode')) {
        if (atn.parent !== null || toConnector) {
          requestQueue.register(django_url + project.id + '/node/' + atn.id + '/confidence/update', "POST", {
            pid: project.id,
            to_connector: toConnector,
            tnid: atn.id,
            new_confidence: newConfidence
          }, function (status, text, xml) {
            var e;
            if (status === 200) {
              if (text && text !== " ") {
                e = $.parseJSON(text);
                if (e.error) {
                  alert(e.error);
                }
                self.updateNodes();
              }
            }
          });
        }
      }
    };

    this.goToPreviousBranchOrRootNode = function(treenode_id, e) {
      requestQueue.register(
          django_url + project.id + "/node/previous_branch_or_root",
          "POST",
          {tnid: treenode_id,
           alt: e.altKey ? 1 : 0},
          function(status, text) {
            if (200 === status) {
              var json = $.parseJSON(text);
              if (json.error) {
                alert("Error when trying to find previous branch or root node:" + json.error);
              } else {
                // json is a tuple:
                // json[0]: treenode id
                // json[1], [2], [3]: x, y, z in calibrated world units
                if (treenode_id === json[0]) {
                  // Already at the root node
                  $('#growl-alert').growlAlert({
                    autoShow: true,
                    content: "You are already at the root node",
                    title: 'Already there',
                    position: 'top-right',
                    delayTime: 2000,
                    onComplete: function() { g.remove(); }
                  });
                } else {
                  stack.getProject().moveTo(json[3], json[2], json[1], undefined,
                    function() {
                      SkeletonAnnotations.staticSelectNode(json[0], json[4]);
                    });
                }
              }
            }
          });
    };

    this.goToNextBranchOrEndNode = function(treenode_id, e) {
      requestQueue.register(
          django_url + project.id + "/node/next_branch_or_end",
          "POST",
          {tnid: treenode_id,
           shift: e.shiftKey ? 1 : 0,
           alt: e.altKey ? 1 : 0},
          function(status, text) {
            if (200 === status) {
              var json = $.parseJSON(text);
              if (json.error) {
                alert("Error when trying to find next branch or end node:" + json.error);
              } else {
                // json is a tuple:
                // json[0]: treenode id
                // json[1], [2], [3]: x, y, z in calibrated world units
                if (treenode_id === json[0]) {
                  // Already at a branch or end node
                  // TODO issue a growl
                } else {
                  stack.getProject().moveTo(json[3], json[2], json[1], undefined,
                    function() {
                      SkeletonAnnotations.staticSelectNode(json[0], json[4]);
                    });
                }
              }
            }
          });
    };

    /** Checks first if the parent is loaded,
     * otherwise fetches its location from the database. */
    this.goToParentNode = function(treenode_id, skeleton_id) {
      if (null === treenode_id) { return; }
      var node = nodes[treenode_id];
      if (!node) {
        alert("Could not find node with id #" + treenode_id);
        return;
      }
      if (-1 === node.parent_id) {
        alert("This is the root node - can't move to its parent");
        return;
      }
      var parent_id = node.parent_id; // caching ID for the continuation
      var parent_node = nodes[parent_id];
      if (parent_node) {
        // Parent node is already loaded
        self.moveToAndSelectNode(parent_node);
      } else {
        requestQueue.replace(
          django_url + project.id + "/node/get_location",
          "POST",
          {tnid: parent_id},
          function(status, text) {
            if (200 === status) {
              var json = $.parseJSON(text);
              if (json.error) {
                alert("Could not retrieve parent node location: " + json.error);
              } else {
                // json[0], [1], [2], [3]: id, x, y, z
                stack.getProject().moveTo(json[3], json[2], json[1], undefined,
                  function() {
                    SkeletonAnnotations.staticSelectNode(parent_id, skeleton_id);
                  });
              }
            }
          }, "get_location");
      }
    };

    this.moveToAndSelectNode = function (node) {
      var nodeIDToActivate, skeletonIDToActivate, afterMove;
      nodeIDToActivate = node.id;
      if (node.type === "connector") {
        afterMove = function() {
          SkeletonAnnotations.staticSelectNode(nodeIDToActivate, null);
        };
      } else if (node.type === "treenode") {
        skeletonIDToActivate = node.skeleton_id;
        afterMove = function() {
          SkeletonAnnotations.staticSelectNode(nodeIDToActivate, skeletonIDToActivate);
        };
      } else {
        alert("BUG: unknown node type '"+node.type+"'");
        return;
      }
      stack.getProject().moveTo(
        self.pix2physZ(node.z),
        self.pix2physY(node.y),
        self.pix2physX(node.x),
        undefined,
        afterMove);
    };

    // Commands for the sub-buttons of the tracing tool
    this.tracingCommand = function (m) {
      var nodeToActivate, skeletonToActivate,
          connector, treenode, node, n, connectorID;
      switch (m) {
      case "skeleton":
        self.set_tracing_mode("skeletontracing");
        break;
      case "synapse":
        self.set_tracing_mode("synapsedropping");
        break;
      case "goparent":
        if (null !== atn.id) {
          self.goToParentNode(atn.id, atn.skeleton_id);
        } else {
          alert('There must be a currently active node in order to move to its parent.');
        }
        break;
      case "goactive":
        var activeNodePosition = SkeletonAnnotations.getActiveNodePosition();
        if (activeNodePosition === null) {
          alert("No active node to go to!");
        } else {
          requestQueue.register(django_url + project.id + '/node/get_location', "POST", {
            pid: project.id,
            tnid: atn.id
          }, function (status, text, xml) {
            if (status === 200) {
              if (text && text != " ") {
                var jso = $.parseJSON(text);
                if (jso.error) {
                  alert(jso.error);
                } else {
                  project.moveTo(jso[3], jso[2], jso[1], undefined, function() { });
                }
              }
            }
          });
        }
        break;
      case "golastedited":
        if (atn.id === null) {
          alert("Need an active skeleton to go to last edited node.");
          break;
        }
        self.updateNodeCoordinatesinDB(function () {
          //requestQueue.register("model/last.edited.or.added.php", "POST",
          requestQueue.register(django_url + project.id + '/node/most_recent', "POST", {
            pid: project.id,
            treenode_id: atn.id
          }, function (status, text, xml) {
            var nodeToActivate, skeletonToActivate;
            if (status === 200) {
              if (text && text != " ") {
                var jso = $.parseJSON(text);
                if (jso.error) {
                  alert(jso.error);
                } else {
                  project.moveTo(jso.z, jso.y, jso.x, undefined, function() { self.selectNode(jso.id) });
                }
              }
            }
          });
        });
        break;
      case "gonextbranch":
        if (atn.id !== null) {
          self.goToNextBranchOrEndNode(atn.id, arguments[1]);
        }
        break;
      case "goprevbranch":
        if (atn.id !== null) {
          self.goToPreviousBranchOrRootNode(atn.id, arguments[1]);
        }
        break;
      case "skelsplitting":
        if (atn.id !== null) {
          self.splitSkeleton();
        } else {
          alert('Need to activate a treenode before splitting!');
        }
        break;
      case "skelrerooting":
        if (atn.id !== null) {
          self.rerootSkeleton();
        } else {
          alert('Need to activate a treenode before rerooting!');
        }
        break;
      case "tagging":
        if (atn.id !== null) {
          self.tagATN();
        } else {
          alert('Need to activate a treenode or connector before tagging!');
        }
        break;
      case "selectnearestnode":
        if (lastX !== null && lastY !== null) {
          self.activateNearestNode(lastX, lastY, project.coordinates.z);
        }
        break;
      case 'retrievetreenodeinfo':
        if (atn !== null) {
          requestQueue.replace(django_url + project.id + '/node/user-info', 'POST', { treenode_id: atn.id }, function(status, text, xml) {
            if (200 === status) {
              var jso = $.parseJSON(text);
              if (jso.error) {
                alert(jso.error);
              } else {
                var msg =
                  "Created by " + jso.user.first_name + " " + jso.user.last_name + " (" + jso.user.username +
                  ") on " + jso.creation_time +
                  ", last edited by " + jso.editor.first_name + " " + jso.editor.last_name + " (" + jso.editor.username +
                  ") on " + jso.edition_time +
                  ", reviewed by ";
                if (jso.reviewer) {
                  msg += jso.reviewer.first_name + " " + jso.reviewer.last_name + " (" + jso.reviewer.username + ") on " + jso.review_time;
                } else {
                  msg += "no one";
                }
                statusBar.replaceLast(msg);
              }
            }
          }, 'retrievetreenodeinfo');
        }
        break;

      }
      return;

    };


    /** @param e The mouse event, to read out whether shift is down. */
    this.createInterpolatedTreenode = function(e) {
      // Check if there is already a node under the mouse
      // and if so, then activate it
      if (lastX !== null && lastY !== null) {
        // Radius of 7 pixels, in physical coordinates
        var phys_radius = (7.0 / stack.scale) * Math.max(stack.resolution.x, stack.resolution.y);
        var nearestnode = self.findNodeWithinRadius(lastX, lastY, project.coordinates.z, phys_radius);

        if (nearestnode !== null) {
          if (e && e.shiftKey) {
            // Shift down: interpolate and join
            if (null === atn.id) { return; }
            if (nearestnode.skeleton_id === atn.skeleton_id) {
              self.activateNode(nearestnode);
              return;
            }
            // If the target skeleton has more than one node, ask for confirmation
            var nearestnode_id = nearestnode.id;
            var nearestnode_skid = nearestnode.skeleton_id;
            var atn_id = atn.id;
            var atn_skid = atn.skeleton_id;
            var atn_x = atn.x;
            var atn_y = atn.y;
            var atn_z = atn.z;
            maybeExecuteIfSkeletonHasMoreThanOneNode(
                nearestnode.id,
                "join",
                function() {
                  // Take into account current local offset coordinates and scale
                  var pos_x = self.phys2pixX(self.offsetXPhysical);
                  var pos_y = self.phys2pixY(self.offsetYPhysical);
                  // At this point of the execution
                  // project.coordinates.z is not on the new z index, thus simulate it here
                  var pos_z = self.phys2pixZ(project.coordinates.z);
                  var phys_z = self.pix2physZ(pos_z);
                  // Get physical coordinates for node position creation
                  var phys_x = self.pix2physX(pos_x);
                  var phys_y = self.pix2physY(pos_y);
                  // Ask to join the two skeletons with interpolated nodes
                  createTreenodeLinkInterpolated(phys_x, phys_y, phys_z, nearestnode_id);
                });
            return;
          } else {
            // If shift is not down, just select the node:
            self.activateNode(nearestnode);
            return;
          }
        }
      }
      // Else, check that there is a node activated
      if (atn.id === null) {
        alert('Need to activate a treenode first!');
        return;
      }
      // TODO this needs revision: (same above)
      //  * the self.offsetXPhysical is converted to pixels and then back to physical coordinates
      //  * the self.offsetXPhysical reads like the 'x' of the mouse, rather than the stack offset.
      //
      // Take into account current local offset coordinates and scale
      var pos_x = self.phys2pixX(self.offsetXPhysical);
      var pos_y = self.phys2pixY(self.offsetYPhysical);
      // At this point of the execution
      // project.coordinates.z is not on the new z index, thus simulate it here
      var pos_z = self.phys2pixZ(project.coordinates.z);
      var phys_z = self.pix2physZ(pos_z);
      // Get physical coordinates for node position creation
      var phys_x = self.pix2physX(pos_x);
      var phys_y = self.pix2physY(pos_y);
      createInterpolatedNode(phys_x, phys_y, phys_z, null);
    };


    /** If you select a pre- or post-synaptic terminal, then run
        this command, the active node will be switched to its
        connector (if one uniquely exists).  If you then run the
        command again, it will switch back to the terminal. */
    this.switchBetweenTerminalAndConnector = function() {
      if (null === atn.id) {
        growlAlert("A terminal must be select in order to switch to its connector");
        return;
      }
      var ob = nodes[atn.id];
      if ("connector" === ob.type) {
        if (switchingConnectorID === ob.id) {
          // Switch back to the terminal
          self.moveToAndSelectNode(nodes[switchingTreenodeID]);
        } else {
          // Go to the postsynaptic terminal if there is only one
          if (1 === countProperties(ob.postgroup)) {
            self.moveToAndSelectNode(nodes[Object.keys(ob.postgroup)[0]]);
          // Otherwise, go to the presynaptic terminal if there is only one
          } else if (1 === countProperties(ob.pregroup)) {
            self.moveToAndSelectNode(nodes[Object.keys(ob.pregroup)[0]]);
          } else {
            growlAlert("Oops", "Don't know which terminal to switch to");
            switchingTreenodeID = null;
            switchingConnectorID = null;
            return;
          }
        }
      } else if ("treenode" === ob.type) {
        if (switchingTreenodeID === ob.id) {
          // Switch back to the connector
          self.moveToAndSelectNode(nodes[switchingConnectorID]);
        } else {
          // Find a connector for the treenode 'ob'
          var cs = self.findConnectors(ob.id);
          var preIDs = cs[0];
          var postIDs = cs[1];
          if (1 === postIDs.length) {
            switchingTreenodeID = ob.id;
            switchingConnectorID = postIDs[0];
          } else if (1 === preIDs.length) {
            switchingTreenodeID = ob.id;
            switchingConnectorID = preIDs[0];
          } else {
            growlAlert("Oops", "Don't know which connector to switch to");
            switchingTreenodeID = null;
            switchingConnectorID = null;
            return;
          }
          self.moveToAndSelectNode(nodes[switchingConnectorID]);
        }
      } else {
        alert("ERROR: unknown node type: " + ob.type);
      }
    };
  };

}();

var growlAlert = function(title, message) {
  $('#growl-alert').growlAlert({
    autoShow: true,
    content: message,
    title: title,
    position: 'top-right',
    delayTime: 2500,
    onComplete: function() { g.remove(); }
  });
};
