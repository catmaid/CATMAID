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

  /**
   * Create a TSV string from an array of arrays.
   * Will fail (loudly) if unit/ record separators are found in a unit,
   * unless checks are explicitly skipped,
   * but does not check for record length consistency.
   *
   * @param {*[][]} data - array of arrays, where the outer array contains records and the inner array contains units.
   * @param {*} [transformer=no-op] - optional function which takes the unit, the record index, and the unit index, and returns a new unit to use in place.
   * @param {String} [unitSep="\t"] - unit (column) separator, default TAB.
   * @param {String} [recordSep="\n"] - record (row) separator, default NEWLINE.
   * @param {boolean} [skipChecks=false] - if true, do not check for separators within units. For use where the transformer function handles escaping etc.
   * @returns {String}
   */
  CATMAID.createTSVString = function (data, transformer, unitSep, recordSep, skipChecks) {
    transformer = CATMAID.tools.nullish(transformer, (x) => x);
    unitSep = CATMAID.tools.nullish(unitSep, "\t");
    recordSep = CATMAID.tools.nullish(recordSep, "\n");
    const check = !skipChecks;
    return data.map(
      (inRow, recIdx) => {
        return inRow.map(
          (item, unitIdx) => {
            const outItem = String(transformer(item, recIdx, unitIdx));
            if (check && outItem.includes(unitSep)) {
              CATMAID.error(`Data item '${outItem}' at row ${recIdx} col ${unitIdx} includes unit (column) separator '${unitSep}'`);
            }
            if (check && outItem.includes(recordSep)) {
              CATMAID.error(`Data item '${outItem}' at row ${recIdx} col ${unitIdx} includes record (row) separator '${recordSep}'`);
            }
            return outItem;
          }
        ).join(unitSep);
      }
    ).join(recordSep);
  };

})(CATMAID);
