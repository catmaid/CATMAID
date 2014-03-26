/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var OntologySearch = function()
{
  this.widgetID = this.registerInstance();
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
};

/* Ontology search implementation */

OntologySearch.prototype.init_ui = function(container)
{

};
