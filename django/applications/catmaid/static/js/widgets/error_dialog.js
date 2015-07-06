/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

    /**
     * Creates a jQuery UI based error dialog. If detail is passed, it is hidden by
     * default. The dialog allows to expand it, however.
     */
    var ErrorDialog = function(text, detail) {
      this.dialog = document.getElementById("error-dialog-confirm");
      if (null === this.dialog) {
        this.dialog = document.createElement('div');
        this.dialog.setAttribute("id", "error-dialog-confirm");
        this.dialog.setAttribute("title", "An error occured");
      } else {
        var metaMsg = "Several errors have occured:";
        if (this.dialog.firstChild.textContent !== metaMsg) {
          this.dialog.insertAdjacentHTML("afterbegin", "<h3>" + metaMsg + "</h3>");
        }
      }
      // Create error message tags
      var msg = document.createElement('p');
      msg.appendChild(document.createTextNode(text));
      this.dialog.appendChild(msg);
      // Create detail field, if detail available
      if (detail) {
        var detail_head = document.createElement('p');
        var detail_head_em = document.createElement('em');
        detail_head_em.appendChild(document.createTextNode('Show/hide detail'));
        detail_head.appendChild(detail_head_em);
        this.dialog.appendChild(detail_head);
        var detail_text = document.createElement('p');
        detail_text.appendChild(document.createTextNode(detail));
        this.dialog.appendChild(detail_text);
        // Hide detail by default and toggle display by click on header
        $(detail_text).hide();
        $(detail_head).click(function() {
          $(detail_text).toggle();
        });
        $(detail_head_em).css('cursor', 'pointer');
      }
    };

    ErrorDialog.prototype = {};

    /**
     * Displays the error dialog.
     */
    ErrorDialog.prototype.show = function() {
      $(this.dialog).dialog({
        width: '400px',
        height: 'auto',
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

    // Make ErrorDialog available in CATMAID namespace
    CATMAID.ErrorDialog = ErrorDialog;

})(CATMAID);
