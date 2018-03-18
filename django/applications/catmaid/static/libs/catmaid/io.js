(function(CATMAID) {

  "use strict";

  /**
   * Parse a single file as CSV and return a promise once complete with the
   * file's content split into single lines.
   *
   * @param {File} file                The file path to open.
   * @param {(String|RegEx)} delimiter (Optional) Delimiter to split lines
   *                                   with, defaults to ",".
   * @param {Number} nLinestoSkip      The number of lines to skip in the
   *                                   file, defaults to 0.
   * @parma {Function} filter          (Optional) Filter applied to parsed lines
   *                                    to exclude selected lines from results.
   *                                    No filtering is done by default.
   * @returns {Promise} Promise resolving in all read lines.
   */
  CATMAID.parseCSVFile = function(file, delimiter, nLinesToSkip, filter) {
    delimiter = delimiter || ',';
    return new Promise(function(resolve, reject) {
      let reader = new FileReader();
      reader.onload = function(e) {
        // Split text into individual lines
        var lines = e.target.result.split(/[\n\r]+/);
        // Remove first N lines
        if (nLinesToSkip && nLinesToSkip > 0) {
          lines = lines.slice(nLinesToSkip);
        }
        // Split individual lines
        lines = lines.map(function(l) {
          return l.split(delimiter);
        });
        // Optionally, apply filter
        if (CATMAID.tools.isFn(filter)) {
          lines = lines.filter(filter);
        }

        resolve(lines);
      };
      reader.onerror = reject;
      reader.onabort = reject;
      reader.readAsText(file);
    });
  };

})(CATMAID);
