(function(CATMAID) {

  "use strict";

  class InactiveLoginDialog {

    constructor(inactivityGroups) {
      this.dialog = new CATMAID.OptionsDialog("Account inactive", {
        'Ok': CATMAID.noop,
      });


      if (inactivityGroups && inactivityGroups.length > 0) {
        let ig = inactivityGroups[0];
        // Max inactivity comes in seconds.
        let time = CATMAID.tools.humanReadableTimeInterval(ig.max_inactivity * 1000);
        let generalMsg = (ig.message && ig.message.length > 0) ? ig.message :
            ('This user account is currently inactive, because the last ' +
             `login exceeded the inactivity period of ${time}.`);
        this.dialog.appendMessage(generalMsg);

        if (ig.contacts && ig.contacts.length > 0) {
          let userList = ig.contacts.map(user => `${user.full_name} (${user.email || user.username})`).join(', ');
          let contactMsg = 'Please contact any of the following members of ' +
              `the CATMAID administration team for assistance: ${userList}`;
          this.dialog.appendMessage(contactMsg);
        } else {
          let contactMsg = 'Please contact the CATMAID administration team for further information.';
          this.dialog.appendMessage(contactMsg);
        }

      } else {
        this.dialog.appendMessage('This user account is currently ' +
            'inactive. Please contact the CATMAID administration ' +
            'team for further information.');
      }
    }

    show() {
      this.dialog.show(400, 'auto', true);
    }

  }


  // Export
  CATMAID.InactiveLoginDialog = InactiveLoginDialog;

})(CATMAID);
