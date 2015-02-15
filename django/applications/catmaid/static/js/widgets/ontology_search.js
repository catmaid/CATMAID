/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  InstanceRegistry,
  requestQueue
*/

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
        new CATMAID.ErrorDialog("Couldn't fetch requested content", "The " +
            "server returned an unexpected status (" + status + ") " + "with " +
            "error message:\n" + text).show();
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
