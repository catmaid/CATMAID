(function(CATMAID) {

  "use strict";

  /**
   * Export an array of arrays as XLSX file. The following optional parameters
   * can be provided as fields of the options argument:
   *
   * boldFirstRow: boolean, whether first row should be bold
   * boldFirstCol: boolean, whether first column should be bold
   * colorIndex:   object, map cell content to background colors
   *
   * @param {Array}  lines   An array of arrays (rows) to be exported.
   * @param {Object} options A set of optional parameters. See above for details.
   */
  CATMAID.exportXLSX = function(lines, options) {
    options = options || {};
    var boldFirstRow = options.boldFirstRow || false;
    var boldFirstCol = options.boldFirstCol || false;
    var colorIndex = options.colorIndex || {};
    var filename = options.filename || 'catmaid-export';

    if (0 === lines.length) {
      throw new CATMAID.ValueError('No data provided to export');
    }

    // Construct temporary data table instance
    var content = document.createElement('div');
    var container = document.createElement('table');
    container.style.display = 'none';
    content.appendChild(container);

    try {
      var table = $(container).DataTable({
        dom: 'Bfrtip',
        paging: false,
        order: [],
        buttons: [{
          extend: 'excelHtml5',
          header: false, // We take care of heder ourselves
          footer: false,
          filename: filename,
          customize: function(xlsx) {
            var sheet = xlsx.xl.worksheets['sheet1.xml'];
            // Find style definitions
            var styles = xlsx.xl['styles.xml'];
            var cellStyles = null, cellFills = null, fonts = null;
            var nextStyleIndex = -1, nextFillIndex = -1, nextFontIndex = -1;
            if (styles) {
              // Style reference
              cellStyles = $('cellXfs', styles);
              if (1 !== cellStyles.length) {
                CATMAID.warn('Could\'t find XLSX cell style definition');
              } else {
                nextStyleIndex = cellStyles.attr('count');
              }
              // Fill reference
              cellFills = $('fills', styles);
              if (1 !== cellFills.length) {
                CATMAID.warn('Could\'t find XLSX cell fill definition');
              } else {
                nextFillIndex = cellFills.attr('count');
              }
              // Font reference
              fonts = $('fonts', styles);
              if (1 !== fonts.length) {
                CATMAID.warn('Could\'t find XLSX cell font definition');
              } else {
                nextFontIndex = fonts.attr('count');
              }
            } else {
              CATMAID.warn('Could\'t find XLSX style definition');
            }

            if (boldFirstRow) {
              // Make fist row use a bold font
              $('row c[r$="1"]', sheet).filter(function(c) {
                return this.attributes.r.value.match(/^[A-Z]+1$/);
              }).each( function () {
                $(this).attr( 's', '2' );
              });
            }

            if (boldFirstCol) {
              // Make first column use a bold font
              $('row c[r^="A"]', sheet).filter(function(c) {
                return this.attributes.r.value.match(/^A[0-9]+$/);
              }).each( function () {
                $(this).attr( 's', '2' );
              });
            }

            // Export colors
            var foundStyles = [];
            var foundStylesIndex = {};
            $('row c', sheet).each( function () {
              var value = $('v', this).text();
              var color = colorIndex[value];
              // Only add style information if there is a color available for
              // the value of this cell.
              if (color) {
                var style = foundStylesIndex[value];
                if (!style) {
                  style = {
                    value: value,
                    bgColor: color.replace(/#/, ''),
                    fgColor: CATMAID.tools.getContrastColor(color, true).replace(/#/, ''),
                    styleIndex: nextStyleIndex,
                    fillIndex: nextFillIndex,
                    fontIndex: nextFontIndex
                  };
                  foundStyles.push(style);
                  foundStylesIndex[value] = style;


                  // Increment style index counters
                  ++nextStyleIndex;
                  ++nextFillIndex;
                  ++nextFontIndex;
                }
                $(this).attr( 's', style.styleIndex );
              }
            });
            // Store all found styles in XLSX stylesheet section. We use cell
            // styles, which are part of the <cellXfs> collection.
            if (foundStyles.length > 0) {
              if (styles && cellStyles && cellFills) {
                for (var i=0; i<foundStyles.length; ++i) {
                  var style = foundStyles[i];
                  // Add a new pattern fill with ARGB color format
                  var bgColor = 'FF' + style.bgColor;
                  var fill = '<fill><patternFill patternType="solid"><fgColor rgb="' +
                      bgColor + '"></fgColor></patternFill></fill>';
                  cellFills.append(fill);

                  // Add a font entry for each fill. While a little bit
                  // redundant in most cases, it allows more flexibility.
                  var fontColor = 'FF' + style.fgColor;
                  var font = '<font><sz val="11" /><name val="Calibri" /><color rgb="' +
                      fontColor + '" /></font>';
                  fonts.append(font);

                  // Add a new <xf> entry:
                  var xf = '<xf numFmtId="0" fontId="' + style.fontIndex +'" fillId="' + style.fillIndex +
                      '" borderId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
                      '<alignment horizontal="center"/></xf>';
                  cellStyles.append(xf);
                }
                // Set required count properties for syles and fills
                cellFills.attr('count', nextFillIndex);
                cellStyles.attr('count', nextStyleIndex);
                fonts.attr('count', nextFontIndex);
              }
            }
          }
        }],
        data: lines,
        columns: lines[0].map(function(l) {
          return {
            title: l
          };
        })
      });

      // Press excel export button
      var exportButton = $('a.buttons-excel', content);
      if (0 === exportButton.length) {
        CATMAID.warn('Could not load XLSX extension');
        if (container) {
          table.destroy();
          content.removeChild(container);
        }
        return;
      }
      exportButton.trigger('click');
    } catch (error) {
      CATMAID.error(error);
    } finally {
      if (container) {
        table.destroy();
        content.removeChild(container);
      }
    }
  };

})(CATMAID);
