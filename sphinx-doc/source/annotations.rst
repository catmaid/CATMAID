Annotations
===========

One central way to organize neurons and other spatial data structures in CATMAID
is to use text annotations. They can be added to neurons and to annotations
themselves, allowing hierarchies and nomenclatures of annotations.

There are a few special annotations that CATMAID will interpret in a particular
way. The most commonly one is likely the ``locked`` annotation. If present on a
neuron, no part of the skeleton can be changed anymore. The section below will
introduce more special annotations:

Annotations can be added in many places within CATMAID. Often times widgets
contain an "Annotate" button. The active skeleton can be annotated using the
``F3`` key. This dialog shows also the present annotations and allows to add
meta-annotations, which are simply annotations on annotations. In order to do
that, click on the "Click here to also add a meta annotation" text link. The
Neuron Navigator widget is also a useful simple widget to see the annotations of
the current neuron.

Special Annotations
-------------------

The annotations below have meaning in some context within CATMAID. Whether they
need to be applied to neurons or annotations is noted in the description.

.. glossary::
  ``locked``
      If present on neuron, no change in morphology is allowed anymore.

.. glossary::
  ``export: annotations``
      If present on a "publication annotation", it is interpreted by the
      exporter to export annotations for the respective set of neurons,
      grouped by the publication annotation.

.. glossary::
  ``export: no-annotations``
      If present on a "publication annotation", it is interpreted by the
      exporter to not export annotations for the respective set of neurons,
      grouped by the publication annotation.

.. glossary::
  ``export: tags``
      If present on a "publication annotation", it is interpreted by the
      exporter to export tags for the respective set of neurons,
      grouped by the publication annotation.

.. glossary::
  ``export: no-tags``
      If present on a "publication annotation", it is interpreted by the
      exporter to not export tags for the respective set of neurons,
      grouped by the publication annotation.

.. glossary::
  ``export: intra-connectors-only``
      If present on a "publication annotation", it is interpreted by the
      exporter to export only the connectors linking between the members of
      the respective set of neurons, grouped by the publication annotation.

.. glossary::
  ``export: intra-connectors-and-placeholders``
      If present on a "publication annotation", it is interpreted by the
      exporter to export only the connectors linking between the members of
      the respective set of neurons, grouped by the publication annotation.
      Additionally placeholder nodes with random IDs and data will be exported
      to reflect additional connections.

.. glossary::
  ``export: intra-connectors-and-original-placeholders``
      If present on a "publication annotation", it is interpreted by the
      exporter to export only the connectors linking between the members of
      the respective set of neurons, grouped by the publication annotation.
      Additionally placeholder nodes with the original IDs and data will be
      exported to reflect additional connections.

.. glossary::
  ``export: no-connectors``
      If present on a "publication annotation", it is interpreted by the
      exporter not to export connectors linking between the members of the set
      of neurons grouped by the publication annotation.

