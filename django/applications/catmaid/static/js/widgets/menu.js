/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

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
    for (var key in content) {
      var row = table.insertRow(-1);
      row.className = "menu_item";
      if (typeof content[key].action == "object") {
        row.onpointerover = function (e) {
          if (this.className == "menu_item") this.className = "menu_item_hover";
          this.cells[0].firstChild.lastChild.style.display = "block";
          return false;
        };
        row.onpointerout = function (e) {
          if (this.className == "menu_item_hover") this.className = "menu_item";
          this.cells[0].firstChild.lastChild.style.display = "none";
          return false;
        };
      } else {
        row.onpointerover = function (e) {
          if (this.className == "menu_item") this.className = "menu_item_hover";
          return false;
        };
        row.onpointerout = function (e) {
          if (this.className == "menu_item_hover") this.className = "menu_item";
          return false;
        };
      }
      if (typeof content[key].id !== 'undefined') row.id = content[key].id;

      //var icon = row.insertCell( -1 );
      var item = row.insertCell(-1);
      var note = row.insertCell(-1);

      //icon.appendChild( document.createElement( "p" ) );
      //icon.firstChild.appendChild( document.createTextNode( key + "." ) );

      // Expect valid HTML for a stack's comment/note
      var noteContainer = document.createElement("div");
      noteContainer.setAttribute("class", "menu_item_note");
      noteContainer.innerHTML = content[key].note;
      note.appendChild(noteContainer);

      var d = document.createElement("div");
      d.className = "pulldown_item";
      var a = document.createElement("a");
      a.appendChild(document.createTextNode(content[key].title));

      d.appendChild(document.createElement("p"));
      d.firstChild.appendChild(a);

      switch (typeof content[key].action) {
      case "function":
        a.onclick = content[key].action;
        break;
      case "string":
        a.href = content[key].action;
        break;
      case "object":
        var m = new Menu();
        m.update(content[key].action);
        var p = document.createElement("div");
        p.className = "pulldown";
        pulldowns[content[key].title] = m;
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
