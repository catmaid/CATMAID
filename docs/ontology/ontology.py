#!/usr/bin/env python
# -*- coding: UTF-8 -*-

"""Classes for the Gene Ontology."""

__author__ = 'Chris Lasher'
__email__ = 'chris DOT lasher <AT> gmail DOT com'


# The number of digits a GO ID should be, as determined by the GO
# Consortium
NUM_GO_ID_DIGITS = 7


class InternalStorageInconsistentError(Exception):
    """An exception to be raised when an ontology's internal storage
    data structures show inconsistent (conflicting) states of one or
    more terms being stored.

    """
    pass


class GOTerm(object):
    """
    A class to represent a term in the Gene Ontology.

    """

    def __init__(self, goid, name=None, ontology=None):
        """
        :Parameters:
        - `goid`: the GO ID for the term. Should be a string of the form
          `'GO:<digits>'` or simply `'<digits>'`, where `<digits>` is a
          zero-padded seven digit identifier (e.g., `'GO:0006955'`)
        - `name`: the name of the GO term (e.g., `'immune response'`)
        - `ontology`: the ontology that the term belongs to [should be
          an `Ontology` instance]

        """
        self.goid = _validate_and_normalize_go_id(goid)
	self.identifier = self.goid
        self.name = name
        self.ontology = ontology


    def __repr__(self):
        outstr = "<%s: %s-%s>" % (self.__class__.__name__, self.goid,
                self.name)
        return outstr


class GORelationship(object):
    """A generic class to represent a GO relationship between two terms
    in the ontology.

    """

    def __repr__(self):
        outstr = "<%s>" % self.__class__.__name__
        return outstr


class InheritableGORelationship(GORelationship):
    """A generic class to represent an inheritable GO relationship.

    An inheritable relationship between two terms implies the subject
    term inherits properties from the object term. Currently, two
    relationships exist for this: the 'is_a' and 'part_of'
    relationships.

    """
    pass


class IsARelationship(InheritableGORelationship):
    """A class representing the 'is_a' GO relationship.

    This relationship is an inheritable relationship. If Term A "is_a"
    Term B, then everything that applies to Term B also applies to Term
    A.

    """
    pass


class PartOfRelationship(InheritableGORelationship):
    """A class representing the 'part_of' GO relationship.

    This relationship is an inheritable relationship. If Term A "is_a"
    Term B, then everything that applies to Term B also applies to Term
    A.

    """
    pass


class RegulatesRelationship(GORelationship):
    """A class representing the 'regulates' GO relationship.

    This relationship is not an inheritable relationship.

    """
    pass


class PositivelyRegulatesRelationship(RegulatesRelationship):
    """A class representing the 'positively_regulates' GO relationship.

    This relationship is an inheritable relationship. If Term A "is_a"
    Term B, then everything that applies to Term B also applies to Term
    A.

    """
    pass


class NegativelyRegulatesRelationship(RegulatesRelationship):
    """A class representing the 'negatively_regulates' GO relationship.

    This relationship is an inheritable relationship. If Term A "is_a"
    Term B, then everything that applies to Term B also applies to Term
    A.

    """
    pass


class GeneOntologyNX(object):
    """This class represents a gene ontology using NetworkX as the
    underlying graph framework.

    """

    def __init__(self, name, authority=None, identifier=None):
        """
        :Parameters:
        - `name`: name for the ontology
        - `authority`: the name of the authority for this ontology
        - `identifier`: an identifier for the ontology

        """
        self.name = name
        self.authority = authority
        self.identifier = identifier
        # The NetworkX directed graph will serve as the backbone for
        # operations.
        import networkx
        self._internal_dag = networkx.DiGraph()
        # We'll use this so we can retrieve terms by their GO ID
        # strings, too.
        self._goid_dict = {}


    def __repr__(self):
        outstr = "<%s: %s>" % (self.__class__.__name__, self.name)
        return outstr


    def _test_existence_in_internal_storage(self, term):
        """Check on the state of storage of a given term within all the
        internal storage structures.

        Returns a tuple of storage states, where `True` represents that
        a term is stored by a storage structure, and `False` represents
        it is not stored.

        :Parameters:
        - `term`: a `GOTerm` instance

        """
        storage_states = (
                term in self._internal_dag,
                term.goid in self._goid_dict
            )
        return storage_states


    def __contains__(self, term):
        """Check to see if a term is present in the ontology.

        This allows doing a membership test using the `in` operator in
        Python, e.g., `if term in ontology: ...`.

        Raises `InternalStorageInconsistentError` in the event that
        internal storage shows inconsistent states of storage for the
        given term.

        :Parameters:
        - `term`: a `GOTerm` instance

        """
        storage_states = self._test_existence_in_internal_storage(term)
        # if all storage structures report existence, we're in a sane
        # state; return True
        if all(storage_states):
            return True
        # if all storage structures report no existence, we're in a sane
        # state; return False
        elif not any(storage_states):
            return False
        # if neither of those are true, something went horribly awry;
        # raise an error
        else:
            raise InternalStorageInconsistentError("Term %s has"
                    " inconsistent states of storage." % term)


    def has_term(self, term):
        """Check to see if a term is present in the ontology.

        Raises `InternalStorageInconsistentError` in the event that
        internal storage shows inconsistent states of storage for the
        given term.

        :Parameters:
        - `term`: a `GOTerm` instance

        """
        return self.__contains__(term)


    def add_term(self, term):
        """Add a term to the ontology.

        :Parameters:
        - `term`: a `GOTerm` instance

        """
        if term.goid in self._goid_dict:
            raise ValueError("Term %s already exists in ontology." %
                    term.goid)
        self._goid_dict[term.goid] = term
        self._internal_dag.add_node(term)


    def get_term_by_id(self, term_id):
        """Retrieve a term from the ontology by its GO ID.

        :Parameters:
        - `term_id`: a GO identifier (e.g., "GO:1234567")
        """
        return self._goid_dict[term_id]


    def remove_term(self, term):
        """Add a term to the ontology.

        :Parameters:
        - `term`: a `GOTerm` instance

        """
        del self._goid_dict[term.goid]
        self._internal_dag.remove_node(term)


    def has_relationship(self, term1, term2):
        """Check to see if the ontology has a relationship.

        :Parameters:
        - `term1`: the subject term; a GOTerm instance
        - `term2`: the object term; a GOTerm instance

        """
        edge_exists = self._internal_dag.has_edge(term1, term2)
        return edge_exists


    def add_relationship(self, term1, term2, relationship_type):
        """Add a relationship between two terms to the ontology.

        Ontologies are composed of triples in the following form:

            `<SUBJECT> <PREDICATE> <OBJECT>`

        e.g., "mitochondrion is_a organelle"

        We represent this as `term1 relationship term2`.

        :Parameters:
        - `term1`: the subject term; a GOTerm instance
        - `term2`: the object term; a GOTerm instance
        - `relationship`: the predicate term (relationship type)

        """
        # add the terms to the internal storage if they're not already
        # there
        for term in (term1, term2):
            if term not in self:
                self.add_term(term)
        self._internal_dag.add_edge(term1, term2, relationship)


    def remove_relationship(self, term1, term2, relationship_type):
        """
        Remove a relationship between two terms from the ontology.

        See `add_relationship()` for an explanation of the relationship
        structure.

        :Parameters:
        - `term1`: the subject term
        - `term2`: the object term
        - `type`

        """
        try:
            self._internal_dag.remove_edge(term1, term2)
        except:
            #TODO
            pass


    def orphaned_terms(self):
        """
        Returns an iterable of terms that have no relationship to any
        other terms in the ontology.

        """
        #TODO
        pass


def _validate_and_normalize_go_id(go_id):
    """
    Validates the format of a given GO identifier.

    Raises a ValueError if `go_id` is not a string of seven digits,
    optionally preceded by the prefix "GO:".

    Returns a GO ID guaranteed to be prefixed with "GO:".

    """

    try:
        if go_id.startswith('GO:'):
            digits = go_id[3:]
            normalized_id = go_id
        else:
            digits = go_id
            normalized_id = 'GO:%s' % go_id

        if not digits.isdigit():
            raise ValueError("GO ID %s should contain only digits "
                    "or optionally digits prefixed with \"GO:\"." % (
                    go_id))
        elif len(digits) != NUM_GO_ID_DIGITS:
            raise ValueError("GO ID %s should have precisely %d "
                    "digits." % (go_id, NUM_GO_ID_DIGITS))
    # If the go_id doesn't support indexing or .isdigit, the user
    # needs to be told to give a string instead.
    except AttributeError, TypeError:
        raise ValueError("GO ID %s should be a string." % go_id)

    return normalized_id
