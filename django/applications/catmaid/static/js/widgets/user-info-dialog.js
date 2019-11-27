(function(CATMAID) {

  /**
   * Shows information on the currently logged in user.
   */
  CATMAID.UserInfoDialog = class UserInfoDialog extends CATMAID.OptionsDialog {
    constructor(userId) {
      super("User information", {
        "Close": () => {},
      });
      this.userId = CATMAID.tools.getDefined(userId, CATMAID.session.userid);
      this.user = CATMAID.User(this.userId);
      this.refresh();
    }

    refresh() {
      let gridContainer = document.createElement('div');
      gridContainer.classList.add('three-column-grid');
      for (let element of CATMAID.UserInfoDialog.Items) {
        let key = gridContainer.appendChild(document.createElement('div'));
        key.appendChild(document.createTextNode(element.label));
        key.classList.add('grid-item');
        let value = gridContainer.appendChild(document.createElement('div'));
        value.classList.add('grid-item');
        element.addValue(value, this.user);
        let copy = gridContainer.appendChild(document.createElement('div'));
        copy.classList.add('grid-item');
        if (CATMAID.tools.isFn(element.getTextValue)) {
          copy.classList.add('fa', 'fa-copy', 'hover-highlight');
          copy.dataset.role = 'copy-to-clipboard';
          copy.dataset.value = element.getTextValue(this.user);
          copy.onclick = (e) => {
            CATMAID.tools.copyToClipBoard(e.target.dataset.value);
          };
          copy.title = "Copy to clipboard";
        }
      }
      this.appendChild(gridContainer);
    }
  };

  CATMAID.UserInfoDialog.Items = [{
      label: "Full name",
      addValue: (target, user) => {
        target.appendChild(document.createTextNode(`${user.firstName} ${user.lastName}`));
      },
      getTextValue: user => `${user.firstName} ${user.lastName}`,
    }, {
      label: "Username",
      addValue: (target, user) => {
        target.appendChild(document.createTextNode(user.login));
      },
      getTextValue: user => user.login,
    }, {
      label: "ID",
      addValue: (target, user) => {
        target.appendChild(document.createTextNode(user.id));
      },
      getTextValue: user => user.id,
    }, {
      label: "Primary group",
      addValue: (target, user) => {
        target.appendChild(document.createTextNode(
            user.primaryGroupId === undefined || user.primaryGroupId === null ?
            '(none)' : CATMAID.groups.get(user.primaryGroupId)));
      },
      getTextValue: user => user.primaryGroupId === undefined || user.primaryGroupId === null ?
            '(none)' : CATMAID.groups.get(user.primaryGroupId),
    }, {
      label: "Assigned color",
      addValue: (target, user) => {
        let colorElement = target.appendChild(document.createElement('span'));
        colorElement.style.width = '3em';
        colorElement.style.border = '1px #aaa solid';
        colorElement.style.color = user.color.getStyle();
      },
      getTextValue: (user) => {
        return user.color.getHexString();
      },
    }
  ];

})(CATMAID);
