/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('SVG overlay test', function( assert ) {

  // Don't run this test in PhantomJS, because ES6 Promises are not yet
  // supported, it seems.
  if (CATMAID.tests.runByPhantomJS()) {
    assert.expect(0);
    return;
  }

  // Create a mock server to fake XHR requests and replace CATMAID's request
  // queue with a new instance that makes automatically use of the fake XHR
  // requests.
  var server = this.sandbox.useFakeServer();

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
        "project", "user_permissions", "django_url"]);
    var orignalCATMAIDFields = mapFields(CATMAID, ["statusBar"]);

    // Override requestQueue that uses fake XHR requests
    requestQueue = new RequestQueue();

    // Set global project to custom mocking object
    project = {
      id: 1,
      getId: function() { return 1; }
    };

    // Set global user permissions to mocking object
    user_permissions = {
      'can_annotate': {'1': true}
    };

    // Set global Django URL and configure CATMAID
    /*global django_url:true */
    django_url = '/';
    CATMAID.configure(django_url, django_url);

    // Set global status bar mocking object
    CATMAID.statusBar = {
      replaceLast: function() {}
    };

    // Mock SVG overlay
    var nodeID = 42;
    var fakeOverlay = {
      nodes: {
        '41': {
          id: 41,
          can_edit: true,
          type: SkeletonAnnotations.TYPE_NODE,
          needsync: true
        },
        '42': {
          id: 42,
          can_edit: true,
          type: SkeletonAnnotations.TYPE_NODE,
          needsync: true
        }
      },
      selectNode: function() {},
      submit: submitterFn(),
      pix2physX: function() { return 0; },
      pix2physY: function() { return 0; },
      pix2physZ: function() { return 0; }
    };

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
    SkeletonAnnotations.SVGOverlay.prototype.deleteNode.call(
        fakeOverlay, nodeID);
    // Mark the node as deleted in fake backend, once the last request is done
    fakeOverlay.submit.then(function() {
      delete availableNodes[nodeID]; 
    });
    // Update the tracing layer immediately after queing the deleting
    SkeletonAnnotations.SVGOverlay.prototype.updateNodeCoordinatesinDB.call(
        fakeOverlay, function(json) {
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
      resetMapping(window, orignialGlobalFields);
      resetMapping(CATMAID, orignalCATMAIDFields);
    }
  })();
});
