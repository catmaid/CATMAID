/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

// active treenode or connector
var atn = null;
var atn_fillcolor = "rgb(0, 255, 0)";

var active_skeleton_id = null;

var openSkeletonNodeInObjectTree = function(node) {
  // Check if the Object Tree div is visible
  if ($('#object_tree_widget').css('display') === "none" || ! $('#synchronize_object_tree').attr('checked')) {
    return;
  }
  // Else, synchronize:
  requestOpenTreePath(node);
};

var refreshAllWidgets = function() {

  if ($('#connectortable_widget').css('display') === "block" && $('#synchronize_connectortable').attr('checked')) {
    initConnectorTable(pid);
  }

  if ($('#treenode_table_widget').css('display') === "block" && $('#synchronize_treenodetable').attr('checked')) {
    initTreenodeTable(pid);
  }

}


var SVGOverlay = function ( stack )
{
  var self = this;

  var edgetoggle = true;
  var nodes = {};
  var labels = {};
  var show_labels = false;

  this.exportSWC = function () {
    // retrieve SWC file of currently active treenode's skeleton
    var recipe = window.open('', 'RecipeWindow', 'width=600,height=600');

    requestQueue.register("model/export.skeleton.php", "GET", {
      pid: project.id,
      tnid: atn.id
    }, function (status, text, xml) {
      if (status === 200) {

        $('#recipe1').clone().appendTo('#myprintrecipe');
        var html = "<html><head><title>Skeleton as SWC</title></head><body><pre><div id='myprintrecipe'>" + text + "</div></pre></body></html>";
        recipe.document.open();
        recipe.document.write(html);
        recipe.document.close();
      }
    }); // endfunction
  };

  this.selectNode = function (id) {
    var nodeid;
    // activates the given node id if it exists
    // in the current retrieved set of nodes
    for (nodeid in nodes) {
      if (nodes.hasOwnProperty(nodeid)) {
        if (nodes[nodeid].id === id) {
          activateNode(nodes[nodeid]);
        }
      }
    }
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

  function activateNode(node) {
      var skeleton_switched = false;
      // if node === null, just deactivate
      if (node === null) {
        atn = null;
        active_skeleton_id = null;
      } else {

        if ( node.type === "treenode" && node.skeleton_id !== active_skeleton_id ) {
          skeleton_switched = true;
        }

        atn = node;
        active_skeleton_id = atn.skeleton_id;

        // update statusBar
        if (atn.type === "treenode") {
          statusBar.replaceLast("activated treenode with id " + atn.id + " skeleton id " + atn.skeleton_id );
          if ( skeleton_switched ) {
            // if we switched the skeleton, we need to reopen the object tree
            openSkeletonNodeInObjectTree(node);
          }
          // refresh all widgets except for the object tree
          // the reason is that calling a refresh just after a request to open tree path
          // prevents the opening of the tree path. thus, the opening of the treepath
          // and/or refresh have to be added to the individual operation's
          // (such as split tree) callbacks
          refreshAllWidgets();

      } else {
        statusBar.replaceLast("activated connector node with id " + atn.id);
      }
    }
    self.recolorAllNodes();
  }

  this.activateNearestNode = function (x, y, z) {
    var xdiff, ydiff, zdiff, distsq, mindistsq = Number.MAX_VALUE, nearestnode = null;
    for (nodeid in nodes) {
      if (nodes.hasOwnProperty(nodeid)) {
        node = nodes[nodeid];
        xdiff = x - this.pix2physX(node.x);
        ydiff = y - this.pix2physY(node.y);
        zdiff = z - this.pix2physZ(node.z);
        distsq = xdiff*xdiff + ydiff*ydiff + zdiff*zdiff;
        if (distsq < mindistsq) {
          mindistsq = distsq;
          nearestnode = node;
        }
      }
    }
    if (nearestnode) {
      activateNode(nearestnode);
    } else {
      statusBar.replaceLast("No nodes were visible - can't activate the nearest");
    }
  }

  this.showTags = function (val) {
    this.toggleLabels(val);
  };

  this.toggleLabels = function (toval) {
    var labid, nods = {}, nodeid;

    for (labid in labels) {
      if (labels.hasOwnProperty(labid)) {
        labels[labid].remove();
      }
    }
    labels = {};

    if(toval === undefined) {
      show_labels = !show_labels;
    } else {
      show_labels = toval;
    }

    // retrieve labels for the set of currently visible nodes
    if (show_labels) {
      // retrieve all currently existing
      // create node id array
      for (nodeid in nodes) {
        if (nodes.hasOwnProperty(nodeid)) {
          if (0 === nodes[nodeid].zdiff) {
            nods[nodeid] = nodeid;
          }
        }
      }
      jQuery.ajax({
        url: "model/label.node.list.all.php",
        type: "POST",
        data: {
          nods: JSON.stringify(nods),
          pid: project.id
        },
        dataType: "json",
        beforeSend: function (x) {
          if (x && x.overrideMimeType) {
            x.overrideMimeType("application/json;charset=UTF-8");
          }
        },
        success: function (nodeitems) {
          // for all retrieved, create a label
          for (var nodeid in nodeitems) {
            if (nodeitems.hasOwnProperty(nodeid)) {
              var tl = new OverlayLabel(nodeitems[nodeid], self.paper, nodes[nodeid].x, nodes[nodeid].y, nodeitems[nodeid]);
              labels[nodeid] = tl;
            }
          }
        }
      });
    }

  };

  this.tagATN = function () {

    // tagbox from
    // http://blog.crazybeavers.se/wp-content/Demos/jquery.tag.editor/
    if ($("#tagBoxId" + atn.id).length !== 0) {
      alert("TagBox is already open!");
      return;
    }

    var e = $("<div class='tagBox' id='tagBoxId" + atn.id + "' style='z-index: 8; border: 1px solid #B3B2B2; padding: 5px; left: " + atn.x + "px; top: " + atn.y + "px;'>" +
    "Tag: <input id='Tags" + atn.id + "' name='Tags' type='text' value='' />" );
    e.css('background-color', 'white');
    e.css('position', 'absolute');
    e.appendTo("#sliceSVGOverlayId");

    // update click event handling
    $("#tagBoxId" + atn.id).click(function (event) {
      event.stopPropagation();
      // update the tags
      updateTags();
      $("#tagBoxId" + atn.id).remove();
    });

    $("#tagBoxId" + atn.id).mousedown(function (event) {
      event.stopPropagation();
    });

    $("#Tags" + atn.id).bind('focusout', function() {
      // focus out with tab updates tags and remove tagbox
      updateTags();
      $("#tagBoxId" + atn.id).fadeOut( 1500, function() {
        $("#tagBoxId" + atn.id).remove();
      });
    });

    // add autocompletion
    requestQueue.register("model/label.all.list.php", "POST", {
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

    requestQueue.register("model/label.node.list.php", "POST", {
      pid: project.id,
      nid: atn.id,
      ntype: atn.type
    }, function (status, text, xml) {

      if (status === 200) {
        if (text && text !== " ") {
          var e = $.parseJSON(text);
          if (e.error) {
            alert(e.error);
          } else {
            var nodeitems = $.parseJSON(text);
            $("#Tags" + atn.id).tagEditor({
              items: nodeitems[atn.id],
              confirmRemoval: false,
              completeOnSeparator: true
            });
            $("#Tags" + atn.id).focus();

          }
        }
      }
    });

    var updateTags = function() {
      requestQueue.register("model/label.update.php", "POST", {
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
            } else {
              $("#Tags" + atn.id).focus();
              project.showTags(true);
            }
          }
        }
      });
    }
  };

  this.rerootSkeleton = function () {
    if (confirm("Do you really want to to reroot the skeleton?")) {
      requestQueue.register("model/treenode.reroot.php", "POST", {
        pid: project.id,
        tnid: atn.id
      }, function (status, text, xml) {
        if (status === 200) {
          if (text && text !== " ") {
            var e = $.parseJSON(text);
            if (e.error) {
              alert(e.error);
            } else {
              // just redraw all for now
              project.updateNodes();
            }
          }
        }
      });
    }
  };

  this.splitSkeleton = function () {
    if (confirm("Do you really want to to split the skeleton?")) {
      requestQueue.register("model/treenode.split.php", "POST", {
        pid: project.id,
        tnid: atn.id
      }, function (status, text, xml) {
        if (status === 200) {
          if (text && text !== " ") {
            var e = $.parseJSON(text);
            if (e.error) {
              alert(e.error);
            } else {
              // just redraw all for now
              project.updateNodes();
              refreshObjectTree();
              refreshAllWidgets();
            }
          }
        }
      });
    }
  };

  // Used to join two skeleton together
  this.createTreenodeLink = function (fromid, toid) {
    // TODO: rerooting operation should be called on the backend
    // first make sure to reroot target
    requestQueue.register("model/treenode.reroot.php", "POST", {
      pid: project.id,
      tnid: toid
    }, function (status, text, xml) {
      if (status === 200) {
        if (text && text !== " ") {
          var e = $.parseJSON(text);
          // console.log(e);
          if (e.error) {
            alert(e.error);
          } else {
            // just redraw all for now
            project.updateNodes();
            refreshObjectTree();
            refreshAllWidgets();
          }
        }
      }
    });
    // then link again
    requestQueue.register("model/treenode.link.php", "POST", {
      pid: project.id,
      from_id: fromid,
      to_id: toid
    }, function (status, text, xml) {
      if (status === 200) {
        if (text && text !== " ") {
          var e = $.parseJSON(text);
          if (e.error) {
            alert(e.error);
          } else {
            nodes[toid].parent = nodes[fromid];
            // update the parents children
            nodes[fromid].children[toid] = nodes[toid];
            nodes[toid].drawEdges();
            nodes[fromid].drawEdges();
            // make target active treenode
            // activateNode(nodes[toid]);
            requestOpenTreePath( nodes[fromid] );
            refreshAllWidgets();
          }
        }
      }
      return true;
    });
    return;
  };

  this.createLink = function (fromid, toid, link_type, from_type, to_type, from_nodetype, to_nodetype) {

    requestQueue.register("model/link.create.php", "POST", {
      pid: project.id,
      from_id: fromid,
      from_relation: 'model_of',
      from_type: from_type,
      from_nodetype: from_nodetype,
      link_type: link_type,
      to_id: toid,
      to_type: to_type,
      to_nodetype: to_nodetype,
      to_relation: 'model_of'
    }, function (status, text, xml) {
      if (status === 200) {
        if (text && text !== " ") {
          var e = $.parseJSON(text);
          if (e.error) {
            alert(e.error);
          } else {
            // just redraw all for now
            project.updateNodes();
          }
        }
      }
      return true;
    });
    return;
  };

  var createSingleConnector = function (phys_x, phys_y, phys_z, pos_x, pos_y, pos_z, confval) {
    // create a single connector with a synapse instance that is
    // not linked to any treenode
    requestQueue.register("model/connector.create.php", "POST", {
      pid: project.id,
      class_instance_type: 'synapse',
      class_instance_relation: 'model_of',
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
            var nn = new ConnectorNode(jso.connector_id, self.paper, 8, pos_x, pos_y, pos_z, 0);
            nodes[jso.connector_id] = nn;
            nn.draw();
            activateNode(nn);
          }
        } // endif
      } // end if
    }); // endfunction
  };

  // Create a new connector. We also use this function to join connector and treenode (postsynaptic case)
  // when the locidval is not null, but the id of the connector
  var createConnector = function (locidval, id, phys_x, phys_y, phys_z, pos_x, pos_y, pos_z) {
    var ip_type, iplre, locid;
    // id is treenode id
    if (locidval === null) {
      // we have the presynaptic case where the connector has to be created
      ip_type = 'presynaptic terminal';
      iplre = 'presynaptic_to';
      locid = 0;
    } else {
      // we have the postsynaptic case where the connector and treenode is already existing
      ip_type = 'postsynaptic terminal';
      iplre = 'postsynaptic_to';
      locid = locidval;
    }

    requestQueue.register("model/treenode.connector.create.php", "POST", {
      pid: project.id,
      input_id: id,
      input_relation: 'model_of',
      input_type: ip_type,
      input_location_relation: iplre,
      x: phys_x,
      y: phys_y,
      z: phys_z,
      location_id: locid,
      location_type: 'synapse',
      location_relation: 'model_of'
    }, function (status, text, xml) {
      if (status === 200) {
        if (text && text !== " ") {
          var jso = $.parseJSON(text);
          if (jso.error) {
            alert(jso.error);
          } else {
            var locid_retrieved = jso.location_id;

            if (locidval === null) {
              // presynaptic case, we create a new connector node and use the retrieved id
              var nn = new ConnectorNode(locid_retrieved, self.paper, 8, pos_x, pos_y, pos_z, 0);
              // store the currently activated treenode into the pregroup of the connector
              nn.pregroup[id] = nodes[id];
              nodes[locid_retrieved] = nn;
              nn.draw();
              // update the reference to the connector from the treenode
              nodes[id].connectors[locid_retrieved] = nn;
              // activate the newly created connector
              activateNode(nn);

            } else {
              // postsynaptic case, no requirement to create new connector
              // but we need to update the postgroup with corresponding original treenod
              nodes[locid_retrieved].postgroup[id] = nodes[id];
              // do not activate anything but redraw
              nodes[locid_retrieved].draw();
              // update the reference to the connector from the treenode
              nodes[id].connectors[locid_retrieved] = nodes[locid_retrieved];
            }

          }
        }
      }
      return true;
    });
    return;
  };

  // Create a new postsynaptic treenode from a connector. Store new skeleton/neuron in Isolated synaptic terminals
  // We create the treenode first, then we create the link from the connector
  var createNodeWithConnector = function (locid, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z) {
    // set to rootnode (no parent exists)
    var parid = -1;

    requestQueue.register("model/treenode.create.php", "POST", {
      pid: project.id,
      parent_id: parid,
      x: phys_x,
      y: phys_y,
      z: phys_z,
      radius: radius,
      confidence: confidence,
      targetgroup: "Isolated synaptic terminals"
    }, function (status, text, xml) {
      var nn, jso, e, tnid;
      if (status === 200) {
        if (text && text !== " ") {
          e = $.parseJSON(text);
          if (e.error) {
            alert(e.error);
          } else {
            // add treenode to the display and update it
            var jso = $.parseJSON(text);

            // always create a new treenode which is the root of a new skeleton
            var nn = new Node(jso.treenode_id, self.paper, null, radius, pos_x, pos_y, pos_z, 0, jso.skeleton_id, true);

            // add node to nodes list
            nodes[jso.treenode_id] = nn;
            nn.draw();

            // create connector : new atn postsynaptic_to deactivated atn.id (location)
            createConnector(locid, jso.treenode_id, phys_x, phys_y, phys_z, pos_x, pos_y, pos_z);

          }
        }
      }
      return true;
    });
    return;

  };

  var createNode = function (parentid, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z) {

    var parid, selneuron, useneuron;

    if (!parentid) {
      parid = -1;
    } else {
      parid = parentid.id;
    }

    // check if we want the newly create node to be
    // a model of a neuron
    console.log("TODO select a neuron from the project tree");
    selneuron = null; // project.selectedObjects.selectedneuron;
    if (selneuron !== null) {
      useneuron = selneuron;
    } else {
      useneuron = -1;
    }

    requestQueue.register("model/treenode.create.php", "POST", {
      pid: project.id,
      parent_id: parid,
      x: phys_x,
      y: phys_y,
      z: phys_z,
      radius: radius,
      confidence: confidence,
      targetgroup: "Fragments",
      useneuron: useneuron
    }, function (status, text, xml) {
      var e, jso, nn;
      if (status === 200) {
        if (text && text !== " ") {
          e = $.parseJSON(text);
          if (e.error) {
            alert(e.error);
          } else {
            // add treenode to the display and update it
            var jso = $.parseJSON(text);
            if (parid == -1) {
              var nn = new Node(jso.treenode_id, self.paper, null, radius, pos_x, pos_y, pos_z, 0, jso.skeleton_id, true);
            } else {
              var nn = new Node(jso.treenode_id, self.paper, nodes[parid], radius, pos_x, pos_y, pos_z, 0, jso.skeleton_id, false);
            }

            nodes[jso.treenode_id] = nn;
            nn.draw();
            var active_node = atn;
            activateNode(nn); // will alter atn
            refreshAllWidgets();
            
            // Check whether the Z coordinate of the new node is beyond one section away 
            // from the Z coordinate of the parent node (which is the active by definition)
            if (active_node) {
              if (Math.abs(active_node.z - nn.z) > 1) {
                var g = $('body').append('<div id="growl-alert" class="growl-message"></div>').find('#growl-alert');
                //var g = $('#growl-alert'); // doesn't work
                g.growlAlert({
                  autoShow: true,
                  content: 'Node added beyond one section from its parent node!',
                  title: 'BEWARE',
                  position: 'top-right',
                  delayTime: 2500,
                  onComplete: function() { g.remove(); }
                });
              }
            }
          }
        }
      }
      return true;
    });
    return;
  };

  var updateNodePositions = function (nodeArray, completedCallback) {
    var requestDicitionary = {}, i, k, node, callback;
    for (i in nodeArray) {
      if (nodeArray.hasOwnProperty(i)) {
        requestDicitionary['pid' + i] = project.id;
        node = nodeArray[i];
        for (k in node) {
          if (node.hasOwnProperty(k)) {
            requestDicitionary[k + i] = node[k];
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
            completedCallback(-1);
          } else {
            if (completedCallback) {
              completedCallback(e.updated);
            }
          }
        }
      }
      return true;
    };
    requestQueue.register("model/node.update.php", "POST", requestDicitionary, callback);
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

  // Only called when changing magnification
  this.updateNodeCoordinates = function (new_scale) {
    var i, x, y, fact, node, ID, xnew, ynew;
    // depending on the scale, update all the node coordinates
    for (ID in nodes) {
      if (nodes.hasOwnProperty(ID)) {
        node = nodes[ID];
        x = node.x;
        y = node.y;
        fact = new_scale / old_scale;
        xnew = Math.floor(x * fact);
        ynew = Math.floor(y * fact);
        node.setXY(xnew, ynew);
      }
    }
  };

  this.refreshNodes = function (jso)
  {
    var rad, nrtn = 0, nrcn = 0, parid, nid, nn, isRootNode, j;
    self.paper.clear();
    nodes = new Object();
    labels = new Object();

    for (var i in jso)
    {
      var id = parseInt(jso[i].id);
      var pos_x = phys2pixX(jso[i].x);
      var pos_y = phys2pixY(jso[i].y);
      var pos_z = phys2pixZ(jso[i].z);
      var zdiff = Math.floor(parseFloat(jso[i].z_diff) / stack.resolution.z);
      var skeleton_id = null;
      if (zdiff == 0)
      {
        if (jso[i].type == "treenode")
        {
          rad = parseFloat(jso[i].radius);
        }
        else
        {
          rad = 8; // default radius for locations
        }

      }
      else
      {
        rad = 0;
      }

      if (jso[i].type == "treenode")
      {
        isRootNode = isNaN(parseInt(jso[i].parentid));
        nn = new Node(id, this.paper, null, rad, pos_x, pos_y, pos_z, zdiff, jso[i].skeleton_id, isRootNode);
        nrtn++;
      }
      else
      {
        nn = new ConnectorNode(id, this.paper, rad, pos_x, pos_y, pos_z, zdiff);
        nrcn++;
      }
      nodes[id] = nn;
      // keep active state of previous active node
      if (atn != null && atn.id == id)
      {
        activateNode(nn);
      }
    }
    if (edgetoggle) {
      // loop again and add correct parent objects and parent's children update
      for (var i in jso)
      {
        nid = parseInt(jso[i].id);
        // for treenodes, make updates
        if (jso[i].type == "treenode")
        {
          parid = parseInt(jso[i].parentid);
          if (nodes[parid])
          {
            // if parent is existing, update the references
            nodes[nid].parent = nodes[parid];
            // update the parents children
            nodes[nid].parent.children[nid] = nodes[nid];
          }
        }
        else if (jso[i].type == "location")
        {
          //console.log("locations retrieved, check pre and post", jso)
          // update pregroup and postgroup
          // loop over pregroup
          if (jso[i].hasOwnProperty('pre')) {
            for (j = 0; j < jso[i].pre.length; j++ ) {
              // check if presynaptic treenode exist in nodes
              preloctnid = parseInt(jso[i].pre[j].tnid);
              if (preloctnid in nodes)
              {
                // link it to pregroup, to connect it to the connector
                nodes[nid].pregroup[preloctnid] = nodes[preloctnid];
                // add to pregroup of treenode
                nodes[preloctnid].connectors[nid] = nodes[nid];
              }
            }
          }
          // loop over postgroup
          if (jso[i].hasOwnProperty('post')) {
            for (j = 0; j < jso[i].post.length; j++ ) {
              // check if postsynaptic treenode exist in nodes
              postloctnid = parseInt(jso[i].post[j].tnid);
              if (postloctnid in nodes)
              {
                // link it to postgroup, to connect it to the connector
                nodes[nid].postgroup[postloctnid] = nodes[postloctnid];
                // add to postgroup of treenode
                nodes[postloctnid].connectors[nid] = nodes[nid];
              }
            }
          }
        }
      }
      // Draw node edges first
      for (i in nodes) {
        if (nodes.hasOwnProperty(i)) {
          nodes[i].drawEdges();
        }
      }
      // Create raphael's circles on top of the edges
      // so that the events reach the circles first
      for (i in nodes) {
        if (nodes.hasOwnProperty(i)) {
          nodes[i].createCircle();
        }
      }

    } // end speed toggle

    // show tags if necessary again
    self.showTags(show_labels);
    // recolor all nodes
    self.recolorAllNodes();

  };

  // Initialize to the value of stack.scale at instantiation of SVGOverlay
  var old_scale = stack.scale;

  this.redraw = function( stack ) {
    var wc = stack.getWorldTopLeft();
    var pl = wc.worldLeft,
        pt = wc.worldTop,
        new_scale = wc.scale;

    // check if new scale changed, if so, update all node coordinates
    if (old_scale !== new_scale) {
        self.updateNodeCoordinates(new_scale);
        old_scale = new_scale;
    }

    self.view.style.left = Math.floor((-pl / stack.resolution.x) * new_scale) + "px";
    self.view.style.top = Math.floor((-pt / stack.resolution.y) * new_scale) + "px";

    self.updatePaperDimensions(stack);
  }



  this.set_tracing_mode = function (mode) {
    // toggels the button correctly
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

  this.getView = function () {
    return view;
  };

  // This isn't called "onclick" to avoid confusion - click events
  // aren't generated when clicking in the overlay since the mousedown
  // and mouseup events happen in different divs.  This is actually
  // called from mousedown (or mouseup if we ever need to make
  // click-and-drag work with the left hand button too...)
  this.whenclicked = function (e) {
    var locid;
    var m = ui.getMouse(e);

    // take into account current local offset coordinates and scale
    var pos_x = m.offsetX;
    var pos_y = m.offsetY;
    var pos_z = phys2pixZ(project.coordinates.z);

    // get physical coordinates for node position creation
    var phys_x = pix2physX(pos_x);
    var phys_y = pix2physY(pos_y);
    var phys_z = project.coordinates.z;

    // e.metaKey should correspond to the command key on Mac OS
    if (e.ctrlKey || e.metaKey) {
      // ctrl-click deselects the current active node
      if (atn !== null) {
        statusBar.replaceLast("deactivated active node with id " + atn.id);
      }
      activateNode(null);
    } else if (e.shiftKey) {
      if (atn === null) {
        if (getMode() === "skeletontracing") {
          var g = $('body').append('<div id="growl-alert" class="growl-message"></div>').find('#growl-alert');
          g.growlAlert({
            autoShow: true,
            content: 'You need to activate a treenode first (skeleton tracing mode)!',
            title: 'BEWARE',
            position: 'top-right',
            delayTime: 2500,
            onComplete: function() { g.remove(); }
          });
          return true;
        }
      } else {
        if (atn instanceof Node) {
          // here we could create new connector presynaptic to the activated treenode
          // remove the automatic synapse creation for now
          // the user has to change into the synapsedropping mode and add the
          // connector, then active the original treenode again, and shift-click
          // on the target connector to link them presynaptically
          statusBar.replaceLast("created connector presynaptic to treenode with id " + atn.id);
          createConnector(null, atn.id, phys_x, phys_y, phys_z, pos_x, pos_y, pos_z);
          e.stopPropagation();
          return true;
        } else if (atn instanceof ConnectorNode) {
          // create new treenode (and skeleton) postsynaptic to activated connector
          locid = atn.id;
          statusBar.replaceLast("created treenode with id " + atn.id + "postsynaptic to activated connector");
          createNodeWithConnector(locid, phys_x, phys_y, phys_z, -1, 5, pos_x, pos_y, pos_z);
          e.stopPropagation();
          return true;
        }
      }
    } else {
      // depending on what mode we are in
      // do something else when clicking
      if (getMode() === "skeletontracing") {
        if (atn instanceof Node || atn === null) {
          // create a new treenode,
          // either root node if atn is null, or child if
          // it is not null
          if (atn !== null) {
            statusBar.replaceLast("created new treenode as child of treenode" + atn.id);
          }
          createNode(atn, phys_x, phys_y, phys_z, -1, 5, pos_x, pos_y, pos_z);
          e.stopPropagation();
          return true;
        }
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

  // currently there are two modes: skeletontracing and synapsedropping
  var currentmode = "skeletontracing";
  // TODO must set the tracing mode at some point
  //this.set_tracing_mode(currentmode);

  var view = document.createElement("div");
  view.className = "sliceSVGOverlay";
  view.id = "sliceSVGOverlayId";
  view.style.zIndex = 6;
  // Custom cursor for tracing
  view.style.cursor ="url(widgets/themes/kde/svg-circle.cur) 15 15, crosshair";
  // make view accessible from outside for setting additional mouse handlers
  this.view = view;

  this.paper = Raphael(view, Math.floor(stack.dimension.x * stack.scale), Math.floor(stack.dimension.y * stack.scale));

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
  var phys2pixY = function (y) {
    return (y - stack.translation.y) / stack.resolution.y * stack.scale;
  };
  var phys2pixZ = function (z) {
    return (z - stack.translation.z) / stack.resolution.z;
  };

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
  this.updateNodes = function () {

    var tl_width = Math.floor( stack.viewWidth );
    var tl_height = Math.floor( stack.viewHeight );
/*
		console.log("In updateTreelinenodes");
		console.log("scale is: "+scale);
		console.log("X_TILE_SIZE is: "+X_TILE_SIZE);
		console.log("Y_TILE_SIZE is: "+Y_TILE_SIZE);
		console.log("tl_width is: "+tl_width);
		console.log("tl_height is: "+tl_height);
		console.log("x is: "+x);
		console.log("y is: "+y);
		console.log("resolution.x is: "+resolution.x);
		console.log("resolution.y is: "+resolution.y);
		console.log("translation.x is: "+translation.x);
		console.log("translation.y is: "+translation.y);
		console.log('-----computed');
		console.log('z', z * resolution.z + translation.z);
		console.log('top', ( y - tl_height / 2 ) * resolution.y + translation.y);
		console.log('left', ( x - tl_width / 2 ) * resolution.x + translation.x);
		console.log('width', tl_width * resolution.x);
		console.log('height', tl_height * resolution.y);
			*/

    // FIXME: check if we need to wait for the result of this, which
    // can now be done with completedCallback...
    // first synchronize with database
    self.updateNodeCoordinatesinDB();

    requestQueue.register('model/node.list.php', 'POST', {
      pid: stack.getProject().id,
      sid: stack.getId(),
      z: stack.z *stack.resolution.z + stack.translation.z,
      top: (y - tl_height / 2) *stack.resolution.y + stack.translation.y,
      left: (x - tl_width / 2) *stack.resolution.x + stack.translation.x,
      width: tl_width * stack.resolution.x,
      height: tl_height * stack.resolution.y,
      zres: stack.resolution.z
    }, handle_updateNodes);
    return;
  };

      /**
   * handle an update-treelinenodes-request answer
   *
   */
  var handle_updateNodes = function (status, text, xml) {
    if (status == 200) {
      //console.log("update noded text", $.parseJSON(text));
      var e = eval("(" + text + ")");
      //var e = $.parseJSON(text);
      if (e.error) {
        alert(e.error);
      } else {
        var jso = $.parseJSON(text);
        // XXX: how much time does calling the function like this take?
        self.refreshNodes(jso);
      }
    }
    return;
  }
};
