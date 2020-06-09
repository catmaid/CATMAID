(function (CATMAID) {

  var Bookmarks = {};

  Bookmarks.MODES = Object.freeze({MARK: 0, SKELETON: 1, NODE: 2});

  /**
   * A map from bookmark keycodes to an object with at least `skeletonID`,
   * `nodeID` and `projectPosition` of the bookmarked location.
   * @type {Map}
   */
  Bookmarks.entries = new Map();

  Bookmarks.DATA_STORE_NAME = 'bookmarks';
  Bookmarks.store = CATMAID.DataStoreManager.get(Bookmarks.DATA_STORE_NAME);

  Bookmarks.store.on(CATMAID.DataStore.EVENT_LOADED, function () {
    Bookmarks.store.get('entries').then(function (values) {
      if (values.USER_PROJECT) {
        Bookmarks.entries = new Map(values.USER_PROJECT);
      } else {
        Bookmarks.entries.clear();
      }
    });
  });

  /**
   * Mark the current location, node and skeleton in the bookmarks.
   *
   * @param  {number} keyCode      Emitted browser code for the mark key.
   * @param  {string} keyCharacter Display character for the mark key.
   */
  Bookmarks.mark = function (keyCode, keyCharacter) {
    var atnID = SkeletonAnnotations.getActiveNodeId();
    var atnPos = SkeletonAnnotations.getActiveNodePositionW();

    if (null === atnID) {
      atnPos = project.focusedStackViewer.projectCoordinates();
    }

    Bookmarks.entries.set(keyCode, {
      key: keyCharacter,
      nodeID: atnID,
      skeletonID: SkeletonAnnotations.getActiveSkeletonId(),
      projectPosition: atnPos
    });

    // TODO in full ES6 this is just `new Array(...Bookmarks.entries)`
    var serializedEntries = [];
    Bookmarks.entries.forEach(function (value, key) {
      serializedEntries.push([key, value]);
    });

    Bookmarks.store.set('entries', serializedEntries, 'USER_PROJECT', true);
  };

  /**
   * Go to a bookmark.
   *
   * @param  {number} keyCode      Emitted browser code for the mark key.
   * @param  {string} mode         Retrieval mode, from Bookmarks.MODES.
   * @return {Promise}             A promise succeeding after arriving at the
   *                               bookmark.
   */
  Bookmarks.goTo = function (keyCode, mode) {
    var bookmark = Bookmarks.entries.get(keyCode);

    if (!bookmark) {
      CATMAID.info('Bookmark not found');
      return Promise.resolve();
    }

    if (mode === Bookmarks.MODES.SKELETON && bookmark.skeletonID) {
      return CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', bookmark.skeletonID);
    } else if (bookmark.nodeID) {
      return SkeletonAnnotations.staticMoveToAndSelectNode(bookmark.nodeID)
          .then(function (nodes) {
            var pos = SkeletonAnnotations.getActiveNodePositionW();
            if (pos.x !== bookmark.projectPosition.x ||
                pos.y !== bookmark.projectPosition.y ||
                pos.z !== bookmark.projectPosition.z) {
              CATMAID.info('This node has moved since it was bookmarked.');
            }

            var node = nodes[0];
            if (node.id && node.skeleton_id !== bookmark.skeletonID) {
              CATMAID.info('This node has changed skeletons since it was bookmarked.');
            }
          });
    } else {
      project.deselectActiveNode();
      return SkeletonAnnotations.staticMoveTo(bookmark.projectPosition.z,
                                       bookmark.projectPosition.y,
                                       bookmark.projectPosition.x);
    }
  };

  /**
   * Predicate to test if a particular key code is available for the passed in
   * mode.
   *
   * @param  {number} keyCode      Emitted browser code for the mark key.
   * @param  {string} mode         Retrieval mode, from Bookmarks.MODES.
   * @return {boolean}             Indicates if bookmark is known.
   */
  Bookmarks.has = function (keyCode, mode) {
    let bookmark = Bookmarks.entries.get(keyCode);
    if (!bookmark) {
      return false;
    }
    if (mode === Bookmarks.MODES.SKELETON && !bookmark.skeletonID) {
      return false;
    } else if (mode === Bookmarks.MODES.NODE && !bookmark.nodeID) {
      return false;
    }
    return true;
  };

  /**
   * A simple bookmark creation and retrieval dialog.
   */
  Bookmarks.Dialog = function (mode, callback) {
    this.dialog = new CATMAID.OptionsDialog("Bookmarks");
    this.dialog.buttons = {'Cancel': undefined};

    var message;
    switch (mode) {
      case Bookmarks.MODES.MARK:
        message = "Press key to mark current location";
        break;
      case Bookmarks.MODES.SKELETON:
        message = "Press key to go to bookmarked skeleton";
        break;
      case Bookmarks.MODES.NODE:
        message = "Press key to go to bookmarked node";
        break;
    }
    message += " (ESC to cancel)";
    this.dialog.appendMessage(message);

    this.markerField = this.dialog.appendField('Marker', 'marker', '');
    $(this.dialog.dialog).find('label').css('width', '25%');
    $(this.dialog.dialog).find('label').css('display', 'inline-block');

    $(this.markerField).keypress((function (e) {
      if (e.keyCode !== $.ui.keyCode.ESCAPE &&
          e.keyCode !== $.ui.keyCode.ENTER) {
        if (mode === Bookmarks.MODES.MARK) {
          Bookmarks.mark(e.keyCode, e.key);
        } else {
          Bookmarks.goTo(e.keyCode, mode);
        }
      }

      this.destroy();
      return false;
    }).bind(this));

    var bookmarkEntries = $('<tbody>');
    Bookmarks.entries.forEach(function (bookmark, keyCode) {
      bookmarkEntries.append($('<tr>')
          .append($('<td>').text(bookmark.key))
          .append($('<td>').text(bookmark.skeletonID))
          .append($('<td>').text(bookmark.nodeID))
          .append($('<td>').text(bookmark.projectPosition.x))
          .append($('<td>').text(bookmark.projectPosition.y))
          .append($('<td>').text(bookmark.projectPosition.z))
          .append($('<td>').html('<span data-key="' + keyCode +
              '" class="ui-icon ui-icon-close action-remove" alt="Remove bookmark" title="Remove bookmark"></span>')));
    });
    $(this.dialog.dialog).append($('<table>')
        .append($('<thead><tr><th>Key</th><th>Skeleton</th><th>Node</th><th>x</th><th>y</th><th>z</th></tr></thead>'))
        .append(bookmarkEntries))
      .on('click', 'span.action-remove', this, function(event) {
        var dialogInstance = event.data;
        var key = $(this).data()['key'];
        Bookmarks.entries.delete(key);
        $(this).closest('div').find('input').focus();
        $(this).closest('tr').remove();
      });
  };

  /**
   * Displays the bookmark dialog.
   */
  Bookmarks.Dialog.prototype.show = function () {
    this.dialog.show('350', 'auto', true);
  };

  Bookmarks.Dialog.prototype.destroy = function () {
    $(this.dialog.dialog).dialog('destroy');
  };

  // Make dialog available in CATMAID namespace
  CATMAID.Bookmarks = Bookmarks;

})(CATMAID);

