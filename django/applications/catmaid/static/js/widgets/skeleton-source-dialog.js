(function(CATMAID) {

    /**
     * Creates a dialog to select a skeleton source.
     */
    var SkeletonSourceDialog = function(title, text, callback) {
      this.dialog = new CATMAID.OptionsDialog(title ?
          title : "Please select a skeleton source");
      if (text) {
        this.dialog.appendMessage(text);
      }

      var select = document.createElement('select');
      CATMAID.skeletonListSources.createOptions().forEach(function(option, i) {
        select.options.add(option);
        if (option.value === 'Active skeleton') select.selectedIndex = i;
      });
      var label_p = document.createElement('p');
      var label = document.createElement('label');
      label.appendChild(document.createTextNode('Source:'));
      label.appendChild(select);
      label_p.appendChild(label);
      this.dialog.dialog.appendChild(label_p);

      // If OK is pressed, the dialog should cause a (re-)login
      this.dialog.onOK = function() {
        var source = CATMAID.skeletonListSources.getSource($(select).val());
        if (source) {
          CATMAID.tools.callIfFn(callback, source);
        }
      };
    };

    /**
     * Displays the source select dialog.
     */
    SkeletonSourceDialog.prototype.show = function() {
      this.dialog.show('400', 'auto', true);
    };

    // Make dialog available in CATMAID namespace
    CATMAID.SkeletonSourceDialog = SkeletonSourceDialog;

})(CATMAID);
