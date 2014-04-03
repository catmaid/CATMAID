/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

/**
 * The ontology search widget provides means to search for classifications,
 * based on features of one or more ontologies. The resulting set of
 * classification graphs can then be filtered according to a selection of tags.
 * Based on this filtering, the result is shown to the user.
 */
var OntologySearch = function()
{
  this.widgetID = this.registerInstance();
  this.workspacePid = -1;
};

OntologySearch.prototype = {};
$.extend(OntologySearch.prototype, new InstanceRegistry());

/* Implement interfaces */

OntologySearch.prototype.getName = function()
{
    return "Ontology Search " + this.widgetID;
};

OntologySearch.prototype.destroy = function()
{
  this.unregisterInstance();
  this.workspacePid = null;
};

/* Ontology search implementation */

/**
 * Returns a proper URL in the ontology search namespace.
 */
OntologySearch.prototype.getURL = function(subUrl)
{
  return django_url + 'classification/' + this.workspacePid + subUrl;
};

/**
 * Initializes the ontology search's user interface. It creates a list of the
 * available classification ontologies ans allows the user the select all or
 * parts of it.
 */
OntologySearch.prototype.init_ui = function(container)
{
  /**
   * Modifies all links and form actions to not reload the page, but to let the
   * content stay in this widget.
   */
  var patch_search = (function(container)
  {
    var form = $("#classification-search-form", container);
    var found = form.length !== 0;
    if (found) {
      // Take care of submission on our own
      form.submit(function() {
        var src_button = $(".button[clicked=true]", $(this));
        // The button that caused the submission has to be treated
        // separately, because jQuery's serialize() used below won't
        // serialize submit button values (it doesn't know the origin)
        var post = $(src_button).attr("name") + "=" + $(src_button).val();
        $.ajax({
            type: "POST",
            url: form.attr('action'),
            data: form.serialize() + "&" + post,
            success: function(data, textStatus) {
              container.innerHTML = "<p>" + data + "</p>";
              patch_search(container);
            }
        });
        return false;
      });
      // Override click event of all buttons in the form to
      // indicate which button was the one that was clicked.
      var submit_buttons = $(".button", form);
      submit_buttons.click(function(){
          $(".button", $(this).parents("form")).removeAttr("clicked");
          $(this).attr("clicked", "true");
      });
      // Add ontology selection tree
      var feature_div = $(".classification-search-features", container);
      if (feature_div.length !== 0) {
          // load tree for every ontology div found below
          this.loadFeatureTree(feature_div);
      }
    }
  }).bind(this);

  this.renderToContent(container, this.getURL("/search"), patch_search);
};

/**
 * Requests the given <url> and puts the response into the given <container> if
 * no error occurs. On success the patch function is called with <container> as
 * parameter.
 */
OntologySearch.prototype.renderToContent = function(container, url, patch)
{

  requestQueue.register(url,
    'GET', undefined,
    function(status, data, text) {
      if (status !== 200) {
        new ErrorDialog("Couldn't fetch requested content", "The server " +
            "returned an unexpected status (" + status + ") " + "with error " +
            " message:\n" + text).show();
      } else {
        $(container).html("<p>" + data + "</p>");
        // patch the data if requested
        if (patch)
        {
          patch(container);
        }
      }
    });
};


/**
 * Loads all available ontologies that are a classification root (is_a
 * classification_root) into a jsTree. A user can successively open sub
 * branches.
 */
OntologySearch.prototype.loadFeatureTree = function($feature_div)
{
  // Only ontologies that are a "classification_root" should be loaded.
  var root_class = "classification_root";
  // The project ID used, is the workspace ID
  var pid = this.workspacePid;

  $feature_div.jstree({
    "core": {
      "html_titles": false
    },
    "plugins": ["themes", "json_data", "ui", "crrm", "types",
        "contextmenu", "checkbox"],
    "json_data": {
      "ajax": {
        "url": django_url + pid + '/ontology/list',
        "data": function (n) {
          var expandRequest, parentName, parameters;
          // depending on which type of node it is, display those
          // the result is fed to the AJAX request `data` option
          parameters = {
            "pid": pid,
            "parenttype": n.attr ? n.attr("rel") : "relation",
            "parentid": n.attr ? n.attr("id").replace("node_", "") : 0
          };
          // if a specific root class is requested, add it to the request
          if (root_class) {
            parameters["rootclass"] = root_class;
          }
          if (ObjectTree.currentExpandRequest) {
            parameters['expandtarget'] = ObjectTree.currentExpandRequest.join(',');
          }
          if (n[0]) {
            parameters['parentname'] = n[0].innerText;
          }
          if (n.attr && n.attr("rel") == "relation") {
            parameters['classbid'] = n.attr("classbid");
          }
          return parameters;
        },
        "success": function (e) {
          if (e.warning) {
            $("#classification-search-warning").html("Warning: " + e.warning);
          } else {
            $("#classification-search-warning").html("");
          }
          if (e.error) {
            new ErrorDialog(e.error, e.detail).show();
          }
        }
      },
      "progressive_render": true
    },
    "ui": {
      "select_limit": 1,
      "select_multiple_modifier": "ctrl",
      "selected_parent_close": "deselect"
    },

    "themes": {
      "theme": "classic",
      "url": STATIC_URL_JS + "widgets/themes/kde/jsTree/classic/style.css",
      "dots": true,
      "icons": true
    },
    "checkbox": {
      override_ui: true,
      //two_state: true,
      real_checkboxes: true,
      real_checkboxes_names: function(n) {
        var id = n[0].id.replace("node_", "");
        return ["check_feature_" + id, 1];
      },
    },
    "contextmenu": {
      "items": function (obj) {
        var menu = {};
        // add "Expand sub-tree" option to each menu
        menu["expand_subtree"] = {
          "separator_before": true,
          "separator_after": false,
          "label": "Expand sub-tree",
          "action": function (obj) {
            this.open_all(obj);
           }
        };
        return menu;
      }
    },
    "crrm": {},
    "types": {
      "types": {
        "root": {
          "icon": {
            "image": STATIC_URL_JS +
                "widgets/themes/kde/jsTree/ontology/root.png"
          },
        },
        "class": {
          "icon": {
            "image": STATIC_URL_JS +
                "widgets/themes/kde/jsTree/ontology/class.png"
          },
        },
        "relation": {
          "icon": {
            "image": STATIC_URL_JS +
                "widgets/themes/kde/jsTree/ontology/relation.png"
          },
        }
      }
    }
  });
};
