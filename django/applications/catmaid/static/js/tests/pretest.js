(function(CATMAID) {
  // Override error handling to print error also to log
  let originalHandleError = CATMAID.handleError;
  CATMAID.handleError = function(error) {
    if (error && error.message) {
    console.log("An error occured: " + error.message);
    console.log(error.stack);
    } else {
    console.log("An error occured: " + error);
    }
    return originalHandleError.apply(CATMAID, arguments);
  };

  let originalGlobalErrorhandler = window.onerror;
  window.onerror = function(error) {
    if (error && error.message) {
    console.log("An unhandled error occured: " + error.message);
    console.log(error.stack);
    } else {
    console.log("An unhandled error occured: " + error);
    }
    return originalGlobalErrorhandler.apply(CATMAID, arguments);
  };
})(CATMAID);
