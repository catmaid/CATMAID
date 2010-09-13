#!/usr/bin/env python
# -*- coding: UTF-8 -*-

"""
A parser for the OBO format.

"""

__author__ = 'Chris Lasher'
__email__ = 'chris DOT lasher <AT> gmail DOT com'

import ontology

"""
from pyparsing import (
        Word,
        alphas,
        nums,
        SkipTo,
        Suppress,
        restOfLine,
        Optional,
        Group,
        Literal,
        lineEnd,
        ZeroOrMore
        )

# comments begin with an exclamation point; anything after them needs to
# be parsed as a comment and otherwise ignored
comment = Suppress('!') + SkipTo(lineEnd)
comment.setParseAction(lambda t: t[0].strip())
# the parsing portion of a line should end either at a newline, or at
# the appearance of a comment
end = comment | lineEnd
# value strings can be broken up over multiple lines if escaped by a
# backslash character immediately before the end of a line (newline)
end_escape = Literal('\\') + lineEnd
continuation = Suppress(end_escape) + ZeroOrMore(SkipTo(end_escape)) +\
        SkipTo(end)
tag = Word(alphas + '_-')
tag.setParseAction(lambda tokens: ' '.join(tokens))
value = (SkipTo(continuation) + continuation) | SkipTo(end)
# we want the value returned as a single string, rather than a disjoint
# list of strings
value.setParseAction(lambda tokens: ''.join((t.lstrip() for t in
    tokens)))
tag_value_pair = tag('tag') + Suppress(':') + value('value') + \
        Optional(comment('comment'))
"""

import re
import string


class FormatError(Exception):
    pass

def parseStanza( stanza ):
    print stanza
    term = None
    if stanza['type'][0] == 'Term':
        term = ontology.GOTerm( stanza['id'][0], name=stanza['name'][0] )
    else:
        term = ontology.Term( stanza['id'][0] )
    return term


def Parse( handle, load_obsolete=True ):
    curStanza = {}
    termHash = {}
    reStanzaStart = re.compile(r'^\[(.*)\]\s*$')
    reComment     = re.compile(r'\!.*$')
    reTagLine     = re.compile(r'^(\w+):\s*(.*)$')
    for line in handle:
        res = reStanzaStart.search(line)
        if res:
            if len( curStanza ):
                if load_obsolete or curStanza.get( 'is_obsolete', ['false'] )[0] == 'false':
                    newTerm = parseStanza( curStanza )
                    termHash[ newTerm.identifier ] = newTerm
            curStanza = { 'type' : [res.group(1)] }
        elif len( curStanza ):
            res = reTagLine.search( reComment.sub("", line) )
            if res:
                [tag, value] = res.groups()
                try:
                    curStanza[tag].append( value )
                except KeyError:
                    curStanza[ tag ] = [ value ]
            else:
                if len(line) > 1:
                    raise FormatError( "unparsed line: %s" % (line) )
    #get the last entry
    if len( curStanza ):
        if load_obsolete or curStanza.get( 'is_obsolete', ['false'] )[0] == 'false':
            newTerm = parseStanza( curStanza )
            termHash[ newTerm.identifier ] = newTerm

#    ont = ontology.GeneOntologyNX("GO")
#    for term in termHash:
#        ont.add_term( termHash[ term ] )
    print termHash
#    return ont
            
    
o = Parse(open('test.obo'))
