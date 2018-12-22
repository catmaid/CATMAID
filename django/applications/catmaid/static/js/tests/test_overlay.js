/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Tracing overlay test', function( assert ) {

  // Create a mock server to fake XHR requests and replace CATMAID's request
  // queue with a new instance that makes automatically use of the fake XHR
  // requests.
  var server = sinon.fakeServer.create();
  var sandbox = sinon.sandbox.create();

  // Test queuing of node deleting and update operation
  (function() {
    // Create an async test assertion
    var done = assert.async();
    // Store original values of things we want to mock
    var mapFields = function(object, keys) {
      // Store each requested global in target object
      return keys.reduce(function(o, g) {
        o[g] = object[g];
        return o;
      }, {});
    };
    var orignialGlobalFields = mapFields(window, ["requestQueue",
        "project", "django_url"]);
    var orignalCATMAIDFields = mapFields(CATMAID, ["statusBar"]);

    // Set global project to custom mocking object
    project = {
      id: 1,
      getId: function() { return 1; }
    };

    // Set global Django URL and configure CATMAID wit override permissions
    /*global django_url:true */
    django_url = '/';
    var permissions = {
      'can_annotate': [1]
    };
    CATMAID.configure(django_url, django_url, undefined, undefined, undefined, permissions);

    // Set global status bar mocking object
    CATMAID.statusBar = {
      replaceLast: function() {}
    };

    // Mock SVG overlay
    var nodeID = 42;
    var FakeOverlay = function() {
      this.nodes = new Map([[
        41, {
          id: 41,
          canEdit: function () { return true; },
          type: SkeletonAnnotations.TYPE_NODE,
          obliterate: function() {},
          drawEdges: function() {}
        }], [
        42, {
          id: 42,
          canEdit: function () { return true; },
          type: SkeletonAnnotations.TYPE_NODE,
          obliterate: function() {},
          drawEdges: function() {},
          x: 0, y:0, z:0
        }]]);
      this.nodeIDsNeedingSync = new Set([41, 42]);
      this.state = new CATMAID.GenericState({
        getNode: function(nodeId) {
          return [nodeId, "fakeEditTime"];
        },
        getParent: function(nodeId) {
          return [nodeId, "fakeEditTime"];
        },
        getChildren: function(nodeId) {
          return [];
        },
        getLinks: function(nodeId) {
          return [];
        },
      });
      this.selectNode = function() {};
      this.submit = CATMAID.submitterFn();
      var space = {
        min: {x: -Infinity, y: -Infinity, z: -Infinity},
        max: {x: Infinity, y: Infinity, z: Infinity}
      };
      this.stackViewer = {
          createStackViewBox: function () {
            return space;
          },
          primaryStack: {
            createStackToProjectBox: function() {
              return space;
            }
          }
      };
      this.pixiLayer = {
        _renderIfReady: CATMAID.noop
      };
    };
    FakeOverlay.prototype = Object.create(CATMAID.TracingOverlay.prototype);
    var fakeOverlay = new FakeOverlay();

    // Indicates which nodes are available in our fake backend
    var availableNodes = { 41: {}, 42: {} };

    // Response to the deletion request
    var deletionResonse = {
      "deleted_neuron": false,
      "skeleton_id": 199,
      "success": "Removed treenode successfully.",
      "parent_id": 41
    };

    // Let the fake server reply to a deletion request with the prepared answer
    // above.
    server.respondWith("POST", "/1/treenode/delete",
     [200, { "Content-Type": "application/json" },
      JSON.stringify(deletionResonse)]);
    // Let the fake server return with a successful update if all nodes to
    // update are available in the backend. Return error otherwise.
    server.respondWith("POST", "/1/node/update",
      function(xhr) {
        // Parse request (see node.py)
        var items = xhr.requestBody.split("&");
        var pattern = /^[tc]\[(\d+)\]\[(\d+)\]=(\d+)$/;

        var nodeIDs = items.reduce(function(nodes, item) {
          var matches = pattern.exec(item);
          // If there are matches and the second index of the element is zero,
          // it means a node is specified (other indices are coordinateS).
          if (matches && matches[2] === "0") {
            // For the test there is no need to parse the node ID as int
            nodes.push(matches[3]);
          }
          return nodes;
        }, []);
        // Find all nodes that are not available anymore
        var nodesNotFound = nodeIDs.filter(function(n) {
          return !availableNodes.hasOwnProperty(n);
        });
        var response;
        if (nodesNotFound.length > 0) {
          response = JSON.stringify({
            "error": "One or more of the " + nodeIDs.length +
                " unique objects were not found in table treenode",
            "traceback": "Not needed in test"
          });
        } else {
          response = JSON.stringify({"updated": nodeIDs.length});
        }
        return xhr.respond(200, { "Content-Type": "application/json" }, response);
      });

    // Delete node
    CATMAID.TracingOverlay.prototype.deleteNode.call(
        fakeOverlay, nodeID);
    // Mark the node as deleted in fake backend, once the last request is done
    fakeOverlay.submit.then(function() {
      delete availableNodes[nodeID];
    });
    // Update the tracing layer immediately after queing the deleting
    fakeOverlay.updateNodeCoordinatesInDB(function(json) {
      assert.deepEqual(json, {"updated": 1},
          "The node update returns with expected response.");
    });
    // Update the tracing layer immediately after queing the deleting
    fakeOverlay.submit.then(function() {
      // Reset request queue to original queue
      reset();
      assert.ok(true, "Queing an update after node deletion works as expected.");
      done();
    }, function() {
      // Reset request queue to original queue
      reset();
      assert.ok(false, "Queing an update after node deletion works as expected.");
      done();
    });

    // Expect two responses from the server, try in 100ms intervals.
    respond(2, 100);

    function respond(requestsLeft, delay) {
      if (requestsLeft > 0) {
        setTimeout(function() {
          // The fake server will respond to all requests in queue
          var nResponds = server.requests.length;
          server.respond();
          respond(requestsLeft - nResponds, delay);
        }, delay);
      }
    }

    /**
     * Leave the environment as we found it.
     */
    function reset() {
      function resetMapping(object, mapping) {
        for (var g in mapping) {
          if (object.hasOwnProperty(g)) {
            object[g] = mapping[g];
          }
        }
      }
      // Restore original globals and CATMAID fields
      CATMAID.updatePermissions();
      resetMapping(window, orignialGlobalFields);
      resetMapping(CATMAID, orignalCATMAIDFields);
    }
  })();
});
