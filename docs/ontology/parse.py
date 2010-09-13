import networkx as nx
from pyparsing import *

di = {}

f = open('fly_anatomy_nohead.obo')
a = {}
for lines in f:
    line = lines.strip()
    
    if "[Term]" == line:
        obj = {}
    elif "id:" in line:
        s = line.split(': ',1)
        a[s[1]] = obj
        print s
    elif len(line) == 0:
        s = None
    else:
        h = line.split(': ', 1)
        a[s[1]][h[0]] = h[1]
        
print a

f.close()

#startterm = Literal("[Term]")
#prop = Word( alphas )
#endline = LineEnd()
#
#greet = startterm + prop + ":" + endline
#
#print greet.parseString( d )
