/**
 * simple pulldown menu
 */

/**
 * a [ nested ] pulldown menu
 *
 */
Menu = function () {
  /**
   * returns the html-element
   */
  this.getView = function () {
    return view;
  };

  /**
   * get a pulldown-menu by it's title
   */
  this.getPulldown = function (title) {
    return pulldowns[title];
  };

  /**
   * update the content of the menu
   */
  this.update = function (
  content //!< object menu content
  ) {
    if (view.firstChild) view.removeChild(view.firstChild);
    pulldowns = {};
    var table = document.createElement("table");

    let elements;
    if (!content) {
      elements = [];
    } else if (content instanceof Array) {
      elements = content;
    } else {
      elements = Object.keys(content).map(e => content[e]);
    }

    for (var element of elements) {
      var row = table.insertRow(-1);
      row.className = "menu_item";

      let hasSubMenuAction = typeof element.action === "object" || element.action instanceof Array;
      let hasSubMenuField = typeof element.submenu === "object" || element.submenu instanceof Array;
      let hasSubMenu = hasSubMenuAction || hasSubMenuField;
      if (hasSubMenuAction && hasSubMenuField) {
        throw new CATMAID.ValueError("Please use either menu action or menu submenu field for menu creation, not both.");
      }

      row.onpointerover = function (e) {
        if (this.className == "menu_item") this.className = "menu_item_hover";
        if (hasSubMenu) this.cells[0].firstChild.lastChild.style.display = "block";
        return false;
      };
      row.onpointerout = function (e) {
        if (this.className == "menu_item_hover") this.className = "menu_item";
        if (hasSubMenu) this.cells[0].firstChild.lastChild.style.display = "none";
        return false;
      };

      if (typeof element.id !== 'undefined') row.id = element.id;

      //var icon = row.insertCell( -1 );
      var item = row.insertCell(-1);
      var note = row.insertCell(-1);

      //icon.appendChild( document.createElement( "p" ) );
      //icon.firstChild.appendChild( document.createTextNode( key + "." ) );

      // Expect valid HTML for a stack's comment/note
      var noteContainer = document.createElement("div");
      noteContainer.setAttribute("class", "menu_item_note");
      noteContainer.innerHTML = element.note === undefined ? '' : element.note;
      note.appendChild(noteContainer);

      var d = document.createElement("div");
      d.className = "pulldown_item";
      var a = document.createElement("a");
      a.appendChild(document.createTextNode(element.title));
      if (element.state) {
        a.dataset.state = element.state;
      }

      d.appendChild(document.createElement("p"));
      d.firstChild.appendChild(a);

      // hasSubMenuAction is covered by "object" case below.
      if (hasSubMenuField) {
        var m = new Menu();
        m.update(element.submenu);
        var p = document.createElement("div");
        p.className = "pulldown";
        pulldowns[element.title] = m;
        p.appendChild(m.getView());

        d.appendChild(p);
      }

      switch (typeof element.action) {
      case "function":
        a.onclick = element.action;
        break;
      case "string":
        a.href = element.action;
        break;
      case "object":
        // Will also catch Array
        var m = new Menu();
        m.update(element.action);
        var p = document.createElement("div");
        p.className = "pulldown";
        pulldowns[element.title] = m;
        p.appendChild(m.getView());

        d.appendChild(p);
        break;
      }

      item.appendChild(d);
    }
    view.appendChild(table);
    return;
  };

  // initialise
  var self = this;
  var view = document.createElement("div");
  view.className = "menu_text";

  var pulldowns = {};
};
