(function(CATMAID) {

  "use strict";

    /**
     * Creates a jQuery UI based dialog that allows the additional display of
     * details of provided. By default, though, details are hidden.
     *
     * @param {string} text    main text of the dialog
     * @param {string} detail  detailed information (hidden by default)
     * @param {string} title   dialog title
     * @param {string} metaMsg sub-section header for repeated dialog call list
     * @param {string} id      ID used to check if a dialog is open already
     */
    var DetailDialog = function(text, detail, title, metaMsg, id) {
      id = id || "detail-dialog-confirm";
      title= title || "An error occured";
      metaMsg = metaMsg || "Several errors have occured";
      this.dialog = document.getElementById(id);
      if (null === this.dialog) {
        this.dialog = document.createElement('div');
        this.dialog.setAttribute("id", id);
        this.dialog.setAttribute("title", title);
      } else {
        var _metaMsg = metaMsg + ":";
        if (this.dialog.firstChild.textContent !== _metaMsg) {
          this.dialog.insertAdjacentHTML("afterbegin", "<h3>" + _metaMsg + "</h3>");
        }
      }
      this.dialog.classList.add('error-dialog');
      // Create error message tags
      var msg = document.createElement('p');
      msg.appendChild(document.createTextNode(text));
      this.dialog.appendChild(msg);
      // Create detail field, if detail available
      if (detail) {
        var detail_head = document.createElement('p');
        detail_head.classList.add('error-detail-button');
        detail_head.appendChild(document.createTextNode('Click to show/hide detail '));
        let detailNote = detail_head.appendChild(document.createElement('span'));
        detailNote.appendChild(document.createTextNode('(please include in bug reports)'));

        this.dialog.appendChild(detail_head);
        var detail_text = document.createElement('p');
        detail_text.classList.add('error-details');
        // Split detail text by line breaks
        if (typeof(detail) === "string") {
          var detail_lines = detail.split("\n");
          for (var i=0; i<detail_lines.length; ++i) {
            if (i > 0) {
              detail_text.appendChild(document.createElement('br'));
            }
            // Replace whitespace with a span with respective length
            var detail_line = detail_lines[i].replace(/\s/g, '\u00a0');
            detail_text.appendChild(document.createTextNode(detail_line));
          }
        } else {
          detail_text.appendChild(document.createTextNode(detail));
        }
        this.dialog.appendChild(detail_text);
        // Hide detail by default and toggle display by click on header
        if (!CATMAID.expandErrors) {
          $(detail_text).hide();
        }
        $(detail_head).click(function() {
          $(detail_text).toggle();
        });
      }
    };

    DetailDialog.prototype = {};

    /**
     * Displays the error dialog.
     */
    DetailDialog.prototype.show = function(width, height) {
      $(this.dialog).dialog({
        width: width || '400px',
        height: height || 'auto',
        maxHeight: 600,
        modal: true,
        buttons: {
          "OK": function() {
            $(this).dialog("destroy");
          }
        },
        close: function() {
          $( this ).dialog( "destroy" );
        }
      });
    };

    // Make DetailDialog available in CATMAID namespace
    CATMAID.DetailDialog = DetailDialog;

})(CATMAID);

