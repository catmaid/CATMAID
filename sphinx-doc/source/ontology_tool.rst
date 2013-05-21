.. _ontology-tools:

Ontology tools
==============

As the name implies, CATMAID has some annotation capabilities.  Besides
the main *annotation* tools there are also *tags*. Both can be used to
attach additional information to projects and stacks. They are used for
different purposes, though.

Tags are independent words that can be given to projects and stacks.
They are easy to manipulate and edit. However, it is basically the data
views that make use of them. In contrast to annotations, tags can not be
linked to each other.

Annotations can do much more than that. They are actually both
*ontologies* and *instantiations* of *types* (or classes) defined with
these ontologies. Additionally, one can define restrictions (OWL term
for constraints) for single links. This is useful to be more explicit
about valid models of tho domain.

Ontologies
----------

Ontologies are made up from classes and relations and form a semantic space.
These form triplets to express links between classes by following the pattern
*subject relation object*. Common relations are *is_a* and *part_of*. If
*galaxy* and *universe* are classes, one could define a triplet *galaxy part_of
universe* which formulates that galaxies are part of the universe. Such
triplets can thereby define a vocabulary and relations/links of entities to
each other.

Let's extend the universe ontology by the fact that all galaxies contain
matter: *matter part_of galaxy*. We could also define a restriction that says
that something that claims to be a galaxy has at least one entity that is
considered matter. If it doesn't have matter it is no galaxy in the sense of
our ontology.

Instantiation
--------------

With ontologies one usually defines abstract concepts which are valid
for actual individual entities. The concept that galaxies are part of
the universe holds for all the actual galaxy instances (i.e. the real
galaxies). If we would declare a galaxy that doesn't contain matter, we
could actually test that and see that it is wrong in terms of our
ontology.

To model something (e.g. observations in the real world) with respect to
an ontology one would create instances of classes (i.e. types) defined
by the ontology and put these classes into relation to each other.

Work spaces
-----------

CATMAID supports two ways to work with ontologies and their instantiation with
respect to a certain project: *project specific* and *project independent*. When
in project specific mode (the default), ontologies and their instantiations are
only visible in the current project. In contrast, if set to project independent,
they are visible to all other projects (when in project independent mode).

Visibility across projects is important for linking classification graphs
(ontology instantiations) to multiple projects at the same time.

Whether the one or the other mode is the default for a user can be set in his/her
user profile settings. This is needed when e.g. repetitions of a an experiment
are organized into different projects, but need one common annotation.

Ontology editor
---------------

A front-end for editing the semantic space is provided by the *ontology
editor*. It allows to create relations and classes and of course to link those
to each other. It can be accessed by selecting the ontology tools and clicking
the button with the capital *O*.

Classification editor
---------------------

The *classification editor* can be used to create new class instances based on
an ontology.
