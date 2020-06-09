(function(CATMAID) {

  "use strict";

  /**
   * A minimal JSON serializer.
   */
  CATMAID.JsonSerializer = function() {};

  CATMAID.JsonSerializer.prototype.serialize = function(state) {
    return JSON.stringify(state);
  };

  CATMAID.JsonSerializer.prototype.deserialize = function(serializedState) {
    return JSON.parse(serializedState);
  };

})(CATMAID);
