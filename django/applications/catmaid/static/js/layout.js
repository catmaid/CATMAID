(function(CATMAID) {

  "use strict";

  /**
   * Layout currently open stack viewers. Currently, this only changes the layout
   * if there are three ortho-views present.
   */
  CATMAID.layoutStackViewer = function() {
    var stackViewers = project.getStackViewers();
    var orientations = stackViewers.reduce(function(o, s) {
      o[s.primaryStack.orientation] = s;
      return o;
    }, {});

    // If there are three different ortho stacks, arrange viewers in four-pane
    // layout. On the left side XY on top of XZ, on the righ ZY on top of a
    // selection table.
    var Stack = CATMAID.Stack;
    if (3 === stackViewers.length && orientations[Stack.ORIENTATION_XY] &&
        orientations[Stack.ORIENTATION_XZ] && orientations[Stack.ORIENTATION_ZY]) {
      // Test if a fourth window has to be created
      var windows = CATMAID.rootWindow.getWindows();
      if (3 === windows.length) {
        // Create fourth window for nicer layout
        WindowMaker.create('keyboard-shortcuts');
      } else if (4 < windows.length) {
        // Stop layouting if there are more than four windows
        return;
      }

      // Get references to stack viewer windows
      var xyWin = orientations[Stack.ORIENTATION_XY].getWindow();
      var xzWin = orientations[Stack.ORIENTATION_XZ].getWindow();
      var zyWin = orientations[Stack.ORIENTATION_ZY].getWindow();

      // Find fourth window
      var extraWin = CATMAID.rootWindow.getWindows().filter(function(w) {
        return w !== xyWin && w !== xzWin && w !== zyWin;
      });

      // Raise error if there is more than one extra window
      if (1 !== extraWin.length) {
        throw CATMAID.Error("Couldn't find extra window for layouting");
      }

      // Arrange windows in four-pane layout
      var left = new CMWVSplitNode(xyWin, xzWin);
      var right = new CMWVSplitNode(zyWin, extraWin[0]);
      CATMAID.rootWindow.replaceChild(new CMWHSplitNode(left, right));
    }
  };



})(CATMAID);
