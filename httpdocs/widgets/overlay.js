/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

// active treenode or connector
var atn = null;
var atn_fillcolor = "rgb(0, 255, 0)";

function activateNode(node)
{
  // changes the color attributes of
  // the newly activated node
  if (atn != null)
  {
    atn.setDefaultColor();
  };
  // if node == null, just deactivate
  if (node == null)
  {
    atn = null;
    return;
  }
  atn = node;
  atn.getC().attr(
  {
    fill: atn_fillcolor
  });
  // update statusBar
  if (atn.type == "treenode") statusBar.replaceLast("activated treenode with id " + atn.id);
  else
  statusBar.replaceLast("activated node with id " + atn.id);
};

SVGOverlay = function (
resolution, translation, dimension, // dimension of the stack
current_scale // current scale of the stack
)
{

  var speedtoggle = false;
  var nodes = new Object();
  var labels = new Object();
  var show_labels = false;

  this.exportSWC = function ()
  {
    // retrieve SWC file of currently active treenode's skeleton
    var recipe = window.open('', 'RecipeWindow', 'width=600,height=600');

    requestQueue.register("model/export.skeleton.php", "GET", {
      pid: project.id,
      tnid: atn.id,
    }, function (status, text, xml)
    {
      if (status == 200)
      {

        console.log("output", text);
        $('#recipe1').clone().appendTo('#myprintrecipe');
        var html = "<html><head><title>Skeleton as SWC</title></head><body><pre><div id='myprintrecipe'>" + text + "</div></pre></body></html>";
        recipe.document.open();
        recipe.document.write(html);
        recipe.document.close();




      }
    }); // endfunction
  }

  this.selectNode = function (id)
  {
    // activates the given node id if it exists
    // in the current retrieved set of nodes
    for (nodeid in nodes)
    {
      if (nodes[nodeid].id == id)
      {
        activateNode(nodes[nodeid]);
      }
    }
  }

  this.showTags = function (val)
  {
    this.toggleLabels(val);
  }

  this.toggleLabels = function (toval)
  {
    for (labid in labels)
    {
      labels[labid].remove();
    }
    labels = new Object();

    // update state variable
    if (toval == null)
    {
      if (show_labels)
      {
        show_labels = false;
      }
      else
      {
        show_labels = true;
      }
    }
    else
    {
      show_labels = toval;
    }

    // retrieve labels for the set of currently visible nodes
    if (show_labels)
    {
      // retrieve all currently existing
      var nods =
      {
      };
      // create node id array
      for (nodeid in nodes)
      {
        if (nodes[nodeid].zdiff == 0)
        {
          nods[nodeid + ""] = nodeid;
        }
      }
      jQuery.ajax(
      {
        url: "model/label.node.list.all.php",
        type: "POST",
        data: {
          nods: JSON.stringify(nods),
          pid: project.id
        },
        dataType: "json",
        beforeSend: function (x)
        {
          if (x && x.overrideMimeType)
          {
            x.overrideMimeType("application/json;charset=UTF-8");
          }
        },
        success: function (result)
        {
          var nodeitems = result;

          // for all retrieved, create a label
          for (nodeid in nodeitems)
          {
            var tl = new OverlayLabel(nodeitems[nodeid], r, nodes[nodeid].x, nodes[nodeid].y, nodeitems[nodeid]);
            // console.log(tl);
            labels[nodeid] = tl;
          }
        }
      });
    }

  }

  this.tagATN = function ()
  {

    // tagbox from
    // http://blog.crazybeavers.se/wp-content/demos/jquery.tag.editor/
    if ($("#tagBoxId" + atn.id).length != 0)
    {
      alert("TagBox is already open!");
      return;
    }

    var e = $("<div class='tagBox' id='tagBoxId" + atn.id + "' style='z-index: 8; border: 1px solid #B3B2B2; padding: 5px; left: " + atn.x + "px; top: " + atn.y + "px;'>" +
    //var e = $("<div class='tagBox' id='tagBoxId' style='z-index: 7; left: 0px; top: 0px; color:white; bgcolor:blue;font-size:12pt'>" +
    "Tag (id:" + atn.id + "): <input id='Tags" + atn.id + "' name='Tags' type='text' value='' />" + "<button id='SaveCloseButton" + atn.id + "'>Save</button>" + "<button id='CloseButton" + atn.id + "'>Cancel</button>" + "</div>");
    e.onclick = function (e)
    {
      e.stopPropagation();
      return true;
    }
    e.css('background-color', 'white');
    //e.css('width', '200px');
    //e.css('height', '200px');
    e.css('position', 'absolute');
    e.appendTo("#sliceSVGOverlayId");

    // update click event handling
    $("#tagBoxId" + atn.id).click(function (event)
    {
      // console.log(event);
      event.stopPropagation();
    });

    // add autocompletion
    requestQueue.register("model/label.all.list.php", "POST", {
      pid: project.id
    }, function (status, text, xml)
    {

      if (status == 200)
      {
        if (text && text != " ")
        {
          var e = eval("(" + text + ")");
          if (e.error)
          {
            alert(e.error);
          }
          else
          {
            var availableTags = $.parseJSON(text);
            $("#Tags" + atn.id).autocomplete(
            {
              source: availableTags
            });
          }
        }
      }
    }); // endfunction
    requestQueue.register("model/label.node.list.php", "POST", {
      pid: project.id,
      nid: atn.id,
      ntype: atn.type
    }, function (status, text, xml)
    {

      if (status == 200)
      {
        if (text && text != " ")
        {
          var e = eval("(" + text + ")");
          if (e.error)
          {
            alert(e.error);
          }
          else
          {
            var nodeitems = $.parseJSON(text);
            // retrieved nodeitems should be for active
            // node anyways
            $("#Tags" + atn.id).tagEditor(
            {
              items: nodeitems[atn.id],
              confirmRemoval: true,
              completeOnSeparator: true
            });
            $("#Tags" + atn.id).focus();

          }
        }
      }
    }); // endfunction
    $("#CloseButton" + atn.id).click(function (event)
    {
      // save and close
      // alert($("#Tags" + atn.id).tagEditorGetTags());
      $("#tagBoxId" + atn.id).remove();
      event.stopPropagation();
    });

    $("#SaveCloseButton" + atn.id).click(function (event)
    {
      // save and close
      requestQueue.register("model/label.update.php", "POST", {
        pid: project.id,
        nid: atn.id,
        ntype: atn.type,
        tags: $("#Tags" + atn.id).tagEditorGetTags()
      }, function (status, text, xml)
      {

        if (status == 200)
        {
          if (text && text != " ")
          {
            var e = eval("(" + text + ")");
            if (e.error)
            {
              alert(e.error);
            }
            else
            {
              project.showTags(true);
            }
          }
        }
      }); // endfunction
      $("#tagBoxId" + atn.id).remove();
      event.stopPropagation();
    });


  }

  this.rerootSkeleton = function ()
  {
    if (confirm("Do you really want to to reroot the skeleton?"))
    {
      requestQueue.register("model/treenode.reroot.php", "POST", {
        pid: project.id,
        tnid: atn.id
      }, function (status, text, xml)
      {
        if (status == 200)
        {
          if (text && text != " ")
          {
            var e = eval("(" + text + ")");
            if (e.error)
            {
              alert(e.error);
            }
            else
            {
              // just redraw all for now
              project.updateNodes();
            }
          } // endif
        } // end if
      }); // endfunction
    };
  }

  this.splitSkeleton = function ()
  {
    if (confirm("Do you really want to to split the skeleton?"))
    {
      requestQueue.register("model/treenode.split.php", "POST", {
        pid: project.id,
        tnid: atn.id
      }, function (status, text, xml)
      {
        if (status == 200)
        {
          if (text && text != " ")
          {
            var e = eval("(" + text + ")");
            if (e.error)
            {
              alert(e.error);
            }
            else
            {
              // just redraw all for now
              project.updateNodes();
            }
          } // endif
        } // end if
      }); // endfunction
    };
  }

  this.createTreenodeLink = function (fromid, toid)
  {
    // first make sure to reroot target
    requestQueue.register("model/treenode.reroot.php", "POST", {
      pid: project.id,
      tnid: toid
    }, function (status, text, xml)
    {
      if (status == 200)
      {
        if (text && text != " ")
        {
          var e = eval("(" + text + ")");
          // console.log(e);
          if (e.error)
          {
            alert(e.error);
          }
          else
          {
            // just redraw all for now
            project.updateNodes();
          }
        } // endif
      } // end if
    }); // endfunction
    // then link again
    requestQueue.register("model/treenode.link.php", "POST", {
      pid: project.id,
      from_id: fromid,
      to_id: toid,
    }, function (status, text, xml)
    {
      if (status == 200)
      {
        if (text && text != " ")
        {
          var e = eval("(" + text + ")");
          if (e.error)
          {
            alert(e.error);
          }
          else
          {
            nodes[toid].parent = nodes[fromid];
            // update the parents children
            nodes[fromid].children[toid] = nodes[toid];
            nodes[toid].draw();
            nodes[fromid].draw();
            // make target active treenode
            activateNode(nodes[toid]);
          }
        }
      }
      return true;
    });
    return;
  }

  this.createLink = function (fromid, toid, link_type, from_type, to_type, from_nodetype, to_nodetype)
  {

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
      to_relation: 'model_of',
    }, function (status, text, xml)
    {
      if (status == 200)
      {
        if (text && text != " ")
        {
          var e = eval("(" + text + ")");
          if (e.error)
          {
            alert(e.error);
          }
          else
          {
            // just redraw all for now
            project.updateNodes();
          }
        }
      }
      return true;
    });
    return;
  }

  var createSingleConnector = function (phys_x, phys_y, phys_z, pos_x, pos_y, pos_z, confval)
  {
    // create a single connector with a synapse instance that is
    // not linked to any treenode
    requestQueue.register("model/connector.create.php", "POST", {
      pid: project.id,
      class_instance_type: 'synapse',
      class_instance_relation: 'model_of',
      confidence: confval,
      x: phys_x,
      y: phys_y,
      z: phys_z,
    }, function (status, text, xml)
    {
      if (status == 200)
      {
        if (text && text != " ")
        {
          var e = eval("(" + text + ")");
          if (e.error)
          {
            alert(e.error);
          }
          else
          {
            // add treenode to the display and update it
            var jso = $.parseJSON(text);
            var cid = parseInt(jso.connector_id);

            var nn = new ConnectorNode(cid, r, 8, pos_x, pos_y, pos_z, 0);
            nodes[cid] = nn;
            nn.draw();
            activateNode(nn);
          }
        } // endif
      } // end if
    }); // endfunction
  }

  var createConnector = function (locidval, id, phys_x, phys_y, phys_z, pos_x, pos_y, pos_z)
  {
    //console.log("start: locidval", locidval, "id", id);
    // id is treenode id
    if (locidval == null)
    {
      // we have the presynaptic case
      ip_type = 'presynaptic terminal'
      iplre = 'presynaptic_to'
      locid = 0
    }
    else
    {
      // we have the postsynaptic case where the location and synapse is already existing
      ip_type = 'postsynaptic terminal'
      iplre = 'postsynaptic_to'
      locid = locidval
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
      location_relation: 'model_of',
    }, function (status, text, xml)
    {
      if (status == 200)
      {
        if (text && text != " ")
        {
          var e = eval("(" + text + ")");
          if (e.error)
          {
            alert(e.error);
          }
          else
          {
            // add treenode to the display and update it
            var jso = $.parseJSON(text);
            var locid_retrieved = parseInt(jso.location_id);
            //alert("locid retrieved"+ locid_retrieved);
            //console.log("handler: locidval", locidval, "id", id);
            if (locidval == null)
            {
              // presynaptic case
              var nn = new ConnectorNode(locid_retrieved, r, 8, pos_x, pos_y, pos_z, 0);

              // take the currently activated treenode into the pregroup
              nn.pregroup[id] = nodes[id];
              nodes[locid_retrieved] = nn;
              nn.draw();
              // update the reference to the connector from the treenode
              nodes[id].connectors[locid_retrieved] = nn;
              // activate the newly created connector
              activateNode(nn);
            }
            else
            {
              // do not need to create a new connector, already existing
              // need to update the postgroup with corresponding original treenode
              //console.log("existing syn", nodes[locid_retrieved], "locid", locid,  "retrieved", locid_retrieved);
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
  }

  var createNodeWithConnector = function (locid, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z)
  {
    // no parent exists
    // this is invoked to create a new node giving a location_id for a postynaptic linking
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
    }, function (status, text, xml)
    {
      if (status == 200)
      {
        if (text && text != " ")
        {
          var e = eval("(" + text + ")");
          if (e.error)
          {
            alert(e.error);
          }
          else
          {
            // add treenode to the display and update it
            var jso = $.parseJSON(text);
            if (parid == -1)
            {
              var nn = new Node(jso.treenode_id, r, null, radius, pos_x, pos_y, pos_z, 0);
            }
            else
            {
              var nn = new Node(jso.treenode_id, r, nodes[parid], radius, pos_x, pos_y, pos_z, 0);
            }

            nodes[jso.treenode_id] = nn;
            nn.draw();
            //activateNode( nn );
            // grab the treenode id
            var tnid = jso.treenode_id;

            //console.log("treenode id to use for the create connector", tnid, "with locid", locid);
            // create connector : new atn postsynaptic_to deactivated atn.id (location)
            createConnector(locid, tnid, phys_x, phys_y, phys_z, pos_x, pos_y, pos_z);

          }
        }
      }
      return true;
    });
    return;

  }

  var createNode = function (parentid, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z)
  {

    if (!parentid) var parid = -1;
    else
    var parid = parentid.id;

    // check if we want the newly create node to be
    // a model of a neuron
    var selneuron = project.selectedObjects['selectedneuron'];
    if (selneuron != null) var useneuron = selneuron;
    else
    var useneuron = -1;

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
    }, function (status, text, xml)
    {
      if (status == 200)
      {
        if (text && text != " ")
        {
          var e = eval("(" + text + ")");
          if (e.error)
          {
            alert(e.error);
          }
          else
          {
            // add treenode to the display and update it
            var jso = $.parseJSON(text);
            if (parid == -1)
            {
              var nn = new Node(jso.treenode_id, r, null, radius, pos_x, pos_y, pos_z, 0);
            }
            else
            {
              var nn = new Node(jso.treenode_id, r, nodes[parid], radius, pos_x, pos_y, pos_z, 0);
            }

            nodes[jso.treenode_id] = nn;
            nn.draw();
            activateNode(nn);

          }
        }
      }
      return true;
    });
    return;
  }

  var updateNodePositions = function (nodeArray, completedCallback)
  {
    var requestDicitionary = {};
    for( i in nodeArray ) {
      requestDicitionary['pid'+i] = project.id;
      var node = nodeArray[i];
      for( k in node ) {
        requestDicitionary[k+i] = node[k];
      }
    }
    var callback = function (status, text, xml)
    {
      if (status == 200)
      {
        if (text && text != " ")
        {
          var e = eval("(" + text + ")");
          if (e.error)
          {
            alert(e.error);
            completedCallback(-1);
          } else {
            if( completedCallback )
              completedCallback(e['updated']);
          }
        }
      }
      return true;
    }
    requestQueue.register("model/node.update.php", "POST",
                          requestDicitionary,
                          callback);
  }

  this.updateNodeCoordinatesinDB = function (completedCallback)
  {
    var nodesToUpdate = new Array();
    for (var i in nodes)
    {
      // only updated nodes that need sync, e.g.
      // when they changed position
      if (nodes[i].needsync)
      {
        // get physical
        var phys_x = this.pix2physX(nodes[i].x);
        var phys_y = this.pix2physY(nodes[i].y);
        var phys_z = this.pix2physZ(nodes[i].z);
        nodes[i].needsync = false;

        nodesToUpdate.push( { 'node_id': nodes[i].id,
                              'x': phys_x,
                              'y': phys_y,
                              'z': phys_z,
                              'type': nodes[i].type } );
      }
    }
    if( nodesToUpdate.length > 0 )
      updateNodePositions( nodesToUpdate, completedCallback );
    else {
      if( completedCallback )
        completedCallback(0);
    }
  }

  var updateNodeCoordinates = function (newscale)
  {
    // depending on the scale, update all the node coordinates
    for (var i = 0; i < nodes.length; ++i)
    {
      var x = nodes[i].x;
      var y = nodes[i].y;
      var fact = newscale / s;
      xnew = Math.floor(x * fact);
      ynew = Math.floor(y * fact);
      // use call to get the function working on this
      this.setXY.call(nodes[i], xnew, ynew);
    }
  }

  this.refreshNodes = function (jso)
  {
    this.paper.clear();
    nodes = new Object();
    labels = new Object();
    var nrtn = 0;
    var nrcn = 0;
    // deactive node, but keep id for reactivation
/*if(atn!=null) {
      oldatnid = atn.id;
      console.log("XXX:oldatnid", oldatnid);
    }*/

    // activateNode(null);
    for (var i in jso)
    {
      var id = parseInt(jso[i].id);
      var pos_x = phys2pixX(jso[i].x);
      var pos_y = phys2pixY(jso[i].y);
      var pos_z = phys2pixZ(jso[i].z);
      var zdiff = Math.floor(parseFloat(jso[i].z_diff) / resolution.z);
      if (zdiff == 0)
      {
        if (jso[i].type == "treenode") var rad = parseFloat(jso[i].radius);
        else
        var rad = 8; // default radius for locations
      }
      else
      var rad = 0;

      if (jso[i].type == "treenode")
      {
        var nn = new Node(id, this.paper, null, rad, pos_x, pos_y, pos_z, zdiff);
        nrtn++;
      }
      else
      {
        var nn = new ConnectorNode(id, this.paper, rad, pos_x, pos_y, pos_z, zdiff);
        nrcn++;
      }
      nodes[id] = nn;
      // keep active state of previous active node
      if (atn != null && atn.id == id)
      {
        activateNode(nn);
      }
    }
    if (speedtoggle)
    {
      // loop again and add correct parent objects and parent's children update
      for (var i in jso)
      {
        var nid = parseInt(jso[i].id);
        // for treenodes, make updates
        if (jso[i].type == "treenode")
        {
          var parid = parseInt(jso[i].parentid);

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
          // update pregroup and postgroup
          for (var j in jso[i].pre)
          {
            // check if presynaptic trenode id in list, if so,
            // link to its pbject
            preloctnid = parseInt(jso[i].pre[j].tnid);
            if (preloctnid in nodes)
            {
              // add presyn treenode to pregroup of
              // the location object
              nodes[nid].pregroup[preloctnid] = nodes[preloctnid];
              // add to pregroup of treenode
              nodes[preloctnid].connectors[nid] = nodes[nid];
            }
          }
          for (var j in jso[i].post)
          {
            // do the same for the post
            postloctnid = parseInt(jso[i].post[j].tnid);
            if (postloctnid in nodes)
            {
              nodes[nid].postgroup[postloctnid] = nodes[postloctnid];
              // add to postgroup of treenode (for nice drawing later)
              nodes[postloctnid].connectors[nid] = nodes[nid];
            }

          }
        }
      }
      // draw nodes
      for (var i in nodes)
      {
        nodes[i].draw();
      }

    } // end speed toggle
    // statusBar.replaceLast( "[" + pos_x.toFixed( 3 ) + ", " + pos_y.toFixed( 3 ) + "]" );
    // debugging the node retrieval
    //    statusBar.replaceLast( "number of treenodes (retrieved): " + nrtn +"; number of connectors: " + nrcn);
    // show tags if necessary again
    this.showTags(show_labels);
    // show nodes
    // console.log(nodes);
  }

  var updateDimension = function ()
  {
    wi = Math.floor(dimension.x * s);
    he = Math.floor(dimension.y * s);
    // update width/height with the dimension from the database, which is in pixel unit
    view.style.width = wi + "px";
    view.style.height = he + "px";
    // update the raphael canvas as well
    r.setSize(wi, he);
  }

  this.redraw = function (
  pl, //!< float left-most coordinate of the parent DOM element in nanometer
  pt, //!< float top-most coordinate of the parent DOM element in nanometer
  ns //!< scale factor to be applied to resolution [and fontsize]
  )
  {

    // check if new scale changed, if so, update all node coordinates
    if (ns != s)
    {
      updateNodeCoordinates(ns);
    }
    // update the scale of the internal scale variable
    s = ns;
    // pl/pt are in physical coordinates
    view.style.left = Math.floor(-pl / resolution.x * s) + "px";
    this.offleft = Math.floor(-pl / resolution.x * s);
    view.style.top = Math.floor(-pt / resolution.y * s) + "px";
    this.offtop = Math.floor(-pt / resolution.y * s);
    updateDimension(s);
    // do not want do updated node coordinates on
    // every redraw
    // updateNodeCoordinatesinDB();
  };

  this.set_tracing_mode = function (mode)
  {
    // toggels the button correctly
    // might update the mouse pointer
    document.getElementById("trace_button_skeleton").className = "button";
    document.getElementById("trace_button_synapse").className = "button";

    if (mode == "skeletontracing")
    {
      currentmode = mode;
      document.getElementById("trace_button_skeleton").className = "button_active";
    }
    else if (currentmode == "skeletontracing")
    {
      currentmode = mode;
      document.getElementById("trace_button_synapse").className = "button_active";
    }
  }

  var getMode = function (e)
  {
    return currentmode;
  }

  this.getView = function ()
  {
    return view;
  }

  this.onclick = function (e)
  {
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
    if (e.ctrlKey || e.metaKey)
    {
      // ctrl-click deselects the current active node
      if (atn != null)
      {
        statusBar.replaceLast("deactivated active node with id " + atn.id);
      }
      activateNode(null);
    }
    else if (e.shiftKey)
    {
      if (atn == null)
      {
        if (getMode() == "skeletontracing")
        {
          alert("You need to activate a treenode first (skeleton tracing mode)");
          return true;
        }
      }
      else
      {
        if (atn instanceof Node)
        {
          // here we could create new synapse presynaptic to the activated treenode
          // remove the automatic synapse creation for now
          // the user has to change into the synapsedropping mode and add the
          // connector, then active the original treenode again, and shift-click
          // on the target connector to link them presynaptically
          statusBar.replaceLast("created connector presynaptic to treenode with id " + atn.id);
          createConnector(null, atn.id, phys_x, phys_y, phys_z, pos_x, pos_y, pos_z);
          e.stopPropagation();
          return true;
        }
        else if (atn instanceof ConnectorNode)
        // create new treenode (and skeleton) postsynaptic to activated connector
        // deactiveate atn, cache atn id
        var locid = atn.id;
        // keep connector active because you might want
        // to quickly add several postsynaptic treenodes
        //activateNode( null );
        // create root node, creates a new active node
        // because the treenode creation is asynchronous, we have to invoke
        // the connector creation in the event handler
        statusBar.replaceLast("created connector postsynaptic to treenode with id " + atn.id);
        createNodeWithConnector(locid, phys_x, phys_y, phys_z, -1, 5, pos_x, pos_y, pos_z);
        e.stopPropagation();
        return true;
      }
    }
    else
    {
      // depending on what mode we are in
      // do something else when clicking
      if (getMode() == "skeletontracing")
      {
        if (atn instanceof Node || atn == null)
        {
          // create a new treenode,
          // either root node if atn is null, or child if
          // it is not null
          if (atn != null)
          {
            statusBar.replaceLast("created new treenode as child of treenode" + atn.id);
          }
          createNode(atn, phys_x, phys_y, phys_z, -1, 5, pos_x, pos_y, pos_z);
          e.stopPropagation();
          return true;
        }
      }
      else if (getMode() == "synapsedropping")
      {
        // only create single synapses/connectors
        createSingleConnector(phys_x, phys_y, phys_z, pos_x, pos_y, pos_z, 5);
      }
    }
    e.stopPropagation();
    return true;
  }

  this.resolution = resolution;
  this.translation = translation;
  this.dimension = dimension;

  // offset of stack in physical coordinates
  this.offleft = 0;
  this.offtop = 0;

  // currently there are two modes: skeletontracing and synapsedropping
  var currentmode = "skeletontracing";
  this.set_tracing_mode(currentmode);

  var view = document.createElement("div");
  view.className = "sliceSVGOverlay";
  view.id = "sliceSVGOverlayId";
  view.onclick = this.onclick;
  view.style.zIndex = 6;
  view.style.cursor = "crosshair";
  // make view accessible from outside for setting additional mouse handlers
  this.view = view;


  var s = current_scale;
  var r = Raphael(view, Math.floor(dimension.x * s), Math.floor(dimension.y * s));
  this.paper = r;

  var phys2pixX = function (x)
  {
    return (x - translation.x) / resolution.x * s;
  }
  var phys2pixY = function (y)
  {
    return (y - translation.y) / resolution.y * s;
  }
  var phys2pixZ = function (z)
  {
    return (z - translation.z) / resolution.z;
  }

  var pix2physX = function (x)
  {
    return translation.x + ((x) / s) * resolution.x;
  }
  var pix2physY = function (y)
  {
    return translation.y + ((y) / s) * resolution.y;
  }
  this.pix2physX = function (x)
  {
    return translation.x + ((x) / s) * resolution.x;
  }
  this.pix2physY = function (y)
  {
    return translation.y + ((y) / s) * resolution.y;
  }
  this.pix2physZ = function (z)
  {
    return z * resolution.z + translation.z;
  }

  this.show = function ()
  {
    view.style.display = "block";
  }
  this.hide = function ()
  {
    view.style.display = "none";
  }

  $('input#speedtoggle').change(function ()
  {
    if ($(this).attr("checked"))
    {
      //do the stuff that you would do when 'checked'
      speedtoggle = true;
      project.updateNodes();
      return;
    }
    else
    {
      speedtoggle = false;
      project.updateNodes();
      return;
    }
    //Here do the stuff you want to do when 'unchecked'
  });



};
