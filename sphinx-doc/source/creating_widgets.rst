Creating widgets
================

Individual tools and views on the data are displayed in individual windows, so
called *widgets*. This section will go over the steps required to create a new
widget and how widgets can interact.

To make CATMAID of a new widget, the new window has to be registered::

  CATMAID.widget(name, options);

The name is an arbitrary unique string that is used to refer to the new widget.
With the help of the ``options``  object, more detail about what the widget
should do, can be specified. For instance, general event handlers for e.g.
initialization and destruction can declared. See below for more information.

Registering widgets this way allows for a very modular and extensible design.
New UI elements and tools can be added without any change in CATMAID itself.

If the widget registration was successful, the new widget can be instantiated by
calling::

  CATMAID.createWidget(name);


Widget options
--------------

Details on how a widget should be realized, is specified in the ``options``
object during widget registration. The following fields are *required*:

================== =====
Field              Value
================== =====
``getName``        Function, returning human readable name of the widget.
``getContentID``   Function, returning the expected container ID used for controls
``createContent``  Function, called with a DOM container where the widget content can be placed in
================== =====

Additionally, the following fields can be used:

================== ============== =====
Field              Default        Value
================== ============== =====
``helpText``       ``undefined``  String, describing the usage of this widget.
``class``          ``undefined``  String, containing a CSS class name that the widget window should get assigned
``controlsID``     ``undefined``  String, containing the expected container ID used for controls
``createControls`` ``undefined``  Function, called with a DOM container where controls can be placed in
``destroy``        ``undefined``  Function, called when the widget should be destroyed. Own handlers should be unregistered in here.
================== ============== =====


Example widget
--------------

In this section, the information above is used to create an example widget. It
registers itself with CATMAID and can be opened. Like it is explained in
:ref:`contributing`, the widget is defined with an IIFE::


  (function(CATMAID) {
    CATMAID.widget('test-widget', {
      getName: function() { return "Test widget"; },
      getContentID: function() { return "test-widget"; },
      createContent: function(container) {
        // Add some example text
      }
    });
  });

This widget has one button to refresh
