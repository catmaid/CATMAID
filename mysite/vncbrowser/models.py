from django import forms
from django.db import models
from datetime import datetime
import sys
import re

def now():
    return datetime.now()

# ------------------------------------------------------------------------
# Classes to support the integer3d compound type:

class Integer3D(object):
    def __init__(self, x=0, y=0, z=0):
        self.x, self.y, self.z = x, y, z
    integer_re = '[-+0-9]+'
    tuple_pattern = re.compile('^\((%s),(%s),(%s)\)$'%((integer_re,)*3))
    @classmethod
    def from_str(cls, s):
        m = cls.tuple_pattern.match(s)
        if m:
            return Integer3D(x=int(m.group(1), 10),
                             y=int(m.group(2), 10),
                             z=int(m.group(3), 10))
        else:
            raise Exception, "Couldn't parse value from the database as an Integer3D: "+str(s)

class Integer3DField(models.Field):
    __metaclass__ = models.SubfieldBase
    def db_type(self, connection):
        return 'integer3d'
    def to_python(self, value):
        if isinstance(value, Integer3D):
            return value
        # When contructing a Location, we get the empty string
        # here; return a new Integer3D for any falsy value:
        if not value:
            return Integer3D()
        return Integer3D.from_str(value)
    def get_db_prep_value(self, value, connection, prepared=False):
        return "(%d,%d,%d)" % (value.x, value.y, value.z)

# ------------------------------------------------------------------------
# Classes to support the integer3d compound type:

class Double3D(object):
    def __init__(self, x=0, y=0, z=0):
        self.x, self.y, self.z = x, y, z
    double_re = '[-+0-9\.Ee]+'
    tuple_pattern = re.compile('^\((%s),(%s),(%s)\)$'%((double_re,)*3))
    @classmethod
    def from_str(cls, s):
        m = cls.tuple_pattern.match(s)
        if m:
            return Double3D(x=float(m.group(1)),
                            y=float(m.group(2)),
                            z=float(m.group(3)))
        else:
            raise Exception, "Couldn't parse value from the database as a Double3D: "+str(s)

class Double3DField(models.Field):
    __metaclass__ = models.SubfieldBase
    def db_type(self, connection):
        return 'double3d'
    def to_python(self, value):
        if isinstance(value, Double3D):
            return value
        # When contructing a Location, we get the empty string
        # here; return a new Double3D for any falsy value:
        if not value:
            return Double3D()
        return Double3D.from_str(value)
    def get_db_prep_value(self, value, connection, prepared=False):
        return "(%f,%f,%f)" % (value.x, value.y, value.z)

# ------------------------------------------------------------------------

class SQLPlaceholder:
    pass

table_abbrev = {
    'treenode': 't',
    'class_instance': 'ci',
    'class': 'c',
    'connector': 'cn',
    'class_instance_class_instance': 'cici',
    'treenode_class_instance': 'tci',
    'connector_class_instance': 'cnci',
    'treenode_connector': 'tcn',
    'relation': 'r'
}

join_table_columns = {
    'class_instance_class_instance': ('class_instance_a', 'class_instance_b'),
    'treenode_class_instance': ('treenode_id', 'class_instance_id'),
    'connector_class_instance': ('connector_id', 'class_instance_id'),
    'treenode_connector': ('treenode_id', 'connector_id')
}

def split_table_name(s):
    l = s.split(':')
    if len(l) == 1:
        return (l[0], None)
    elif len(l) == 2:
        return tuple(l)
    else:
        raise Exception, "Malformed table name '%s'" % (s,)

def parse_relation_name(s):
    if s.startswith('<'):
        return s[1:], False
    elif s.endswith('>'):
        return s[:-1], True
    else:
        raise Exception, "Relation ('%s') should start with '<' or end with '>'" % (s,)

def quote_value(v):
    if isinstance(v, SQLPlaceholder):
        return '%s'
    # FIXME: shouldn't be using isinstance, find a better way
    if isinstance(v, int) or isinstance(v, float):
        return str(v)
    else:
        # FIXME: lookup proper quoting function when I have
        # internet again:
        return "'" + v.replace("'", "'\\''") + "'"

def generate_catmaid_sql(joins):
    """
    Querying across CATMAID's relations requires huge SQL statements
    with many joins.  This helper method takes a reduced
    representation and generates an SQL statement.  (For examples, see
    tests.py.)
    """
    if (len(joins) % 2) == 0:
        raise Exception, 'Malformed joins - there must be an odd number of entries'
    from_list = []
    where_list = []
    for i, e in enumerate(joins):
        suffix = i / 2
        if (i % 2) == 1:
            # Odd lines represent relations between the table in the
            # previous and next line.  Find the name of the relation,
            # and the direction it goes in:
            relation_name, forward = parse_relation_name(e[0])
            # Get the names of the tables in the previous and next elements:
            prev_table_name = split_table_name(joins[i-1][0])[0]
            next_table_name  = split_table_name(joins[i+1][0])[0]
            # Derive unique abbreviated names for those tables:
            short_prev_table_name = table_abbrev[prev_table_name] + str(suffix)
            short_next_table_name = table_abbrev[next_table_name] + str(suffix + 1)
            # Find the name of the join table:
            if forward:
                join_table = "%s_%s" % (prev_table_name, next_table_name)
            else:
                join_table = "%s_%s" % (next_table_name, prev_table_name)
            # Get the abbreviated join table name:
            short_join_table = table_abbrev[join_table] + str(suffix)
            # Add the join table to the FROM list:
            from_list.append('%s %s' % (join_table, short_join_table))
            # Find the names of the two columns in the join table:
            columns = join_table_columns[join_table]
            if forward:
                first, second = short_prev_table_name, short_next_table_name
            else:
                first, second = short_next_table_name, short_prev_table_name
            # Add the join condition to the WHERE list:
            where_list.append(
                "%s.%s = %s.id" % (short_join_table,
                                   join_table_columns[join_table][0],
                                   first))
            where_list.append(
                "%s.%s = %s.id" % (short_join_table,
                                   join_table_columns[join_table][1],
                                   second))
            # And make sure the relation in the join table is right:
            where_list.append("%s.relation_id = r%d.id" % (short_join_table, suffix))
            from_list.append("relation r%d" % (suffix,))
            where_list.append("r%d.relation_name = '%s'" % (suffix, relation_name))
            # Now add any addition conditions on the relation:
            for k, v in sorted(e[1].items()):
                where_list.append("r%d.%s = %s" % (suffix, k, quote_value(v)))
        else:
            # Even lines represent tables of class instances,
            # treenodes or connectors.  Find the table name, and the
            # class name in the case that this is a class_instance
            # table.
            table, class_name = split_table_name(e[0])
            # Find the abbreviated form of the table name:
            short_table_name = "%s%d" % (table_abbrev[table], suffix)
            # Store the first such abbreviated table name to use in
            # the SELECT clause:
            if suffix == 0:
                first_abbreviated_table_name = short_table_name
            # Append the table name to the FROM list:
            from_list.append("%s %s" % (table, short_table_name))
            # Add any additional constraints on the rows in this table:
            for k, v in sorted(e[1].items()):
                where_list.append(
                    "%s.%s = %s" % (short_table_name,
                                    k,
                                    quote_value(v)))
            # If this was a class_instance, join with the class table:
            if class_name:
                from_list.append("class c%d" % (suffix,))
                where_list.append("%s.class_id = c%d.id" % (short_table_name, suffix))
                where_list.append("c%d.class_name = %s" % (suffix, quote_value(class_name)))
    select_columns = split_table_name(joins[0][0])[0]
    result = "SELECT %s.*\n   FROM\n      " % (first_abbreviated_table_name,)
    result += ",\n      ".join(from_list)
    result += "\n   WHERE\n      "
    result += " AND\n      ".join(where_list)
    return result

# ------------------------------------------------------------------------

class Project(models.Model):
    class Meta:
        db_table = "project"
        managed = False
    id = models.AutoField(primary_key=True)
    title = models.TextField()
    public = models.BooleanField(default=True)
    stacks = models.ManyToManyField("Stack",
                                    through='ProjectStack',
                                    related_name='projects')

class Stack(models.Model):
    class Meta:
        db_table = "stack"
        managed = False
    id = models.AutoField(primary_key=True)
    title = models.TextField()
    dimension = Integer3DField()
    resolution = Double3DField()
    image_base = models.TextField()
    comment = models.TextField(null=True)
    trakem2_project = models.BooleanField()

class ProjectStack(models.Model):
    class Meta:
        db_table = "project_stack"
        managed = False
    project = models.ForeignKey(Project)
    stack = models.ForeignKey(Stack)

class User(models.Model):
    class Meta:
        db_table = "user"
        managed = False
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=30)
    pwd = models.CharField(max_length=30)
    longname = models.TextField()

class Concept(models.Model):
    class Meta:
        db_table = "concept"
        managed = False
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)

class Class(models.Model):
    class Meta:
        db_table = "class"
        managed = False
    # Repeat the columns inherited from 'concept'
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    # Now new columns:
    class_name = models.CharField(max_length=255)
    description = models.TextField()

class ConnectivityDirection:
    PRESYNAPTIC_PARTNERS = 0
    POSTSYNAPTIC_PARTNERS = 1

class ClassInstance(models.Model):
    class Meta:
        db_table = "class_instance"
        managed = False
    # Repeat the columns inherited from 'concept'
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    # Now new columns:
    class_column = models.ForeignKey(Class, db_column="class_id") # underscore since class is a keyword
    name = models.CharField(max_length=255)
    def get_connected_query(direction):
        if direction == ConnectivityDirection.POSTSYNAPTIC_PARTNERS:
            con_to_syn_relation = 'postsynaptic_to>'
            src_to_syn_relation = '<presynaptic_to'
        elif direction == ConnectivityDirection.PRESYNAPTIC_PARTNERS:
            con_to_syn_relation = 'presynaptic_to>'
            src_to_syn_relation = '<postsynaptic_to'
        else:
            raise Exception, "Unknown connectivity direction"
        return generate_catmaid_sql(
            [('class_instance:neuron', {}),
             ('<model_of', {}),
             ('class_instance:skeleton', {}),
             ('<element_of', {}),
             ('treenode', {}),
             (con_to_syn_relation, {}),
             ('connector', {}),
             (src_to_syn_relation, {}),
             ('treenode', {}),
             ('element_of>', {}),
             ('class_instance:skeleton', {}),
             ('model_of>', {}),
             ('class_instance:neuron', {'id': SQLPlaceholder()})])
    connected_downstream_query = get_connected_query(
        ConnectivityDirection.POSTSYNAPTIC_PARTNERS)
    connected_upstream_query = get_connected_query(
        ConnectivityDirection.PRESYNAPTIC_PARTNERS)
    @classmethod
    def get_connected_neurons(cls, direction, original_neuron):
        if direction == ConnectivityDirection.POSTSYNAPTIC_PARTNERS:
            query = cls.connected_downstream_query
        elif direction == ConnectivityDirection.PRESYNAPTIC_PARTNERS:
            query = cls.connected_upstream_query
        else:
            raise Exception, "Unknown connectivity direction "+str(direction)
        return ClassInstance.objects.raw(query, (original_neuron.id,))

    @classmethod
    def all_neurons_upstream(cls, downstream_neuron):
        return cls.get_connected_neurons(
            ConnectivityDirection.PRESYNAPTIC_PARTNERS,
            downstream_neuron)

    @classmethod
    def all_neurons_downstream(cls, upstream_neuron):
        return cls.get_connected_neurons(
            ConnectivityDirection.POSTSYNAPTIC_PARTNERS,
            upstream_neuron)

class Relation(models.Model):
    class Meta:
        db_table = "relation"
        managed = False
    # Repeat the columns inherited from 'concept'
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    # Now new columns:
    relation_name = models.CharField(max_length=255)
    uri = models.TextField()
    description = models.TextField()
    isreciprocal = models.BooleanField()

class RelationInstance(models.Model):
    class Meta:
        db_table = "relation_instance"
        managed = False
    # Repeat the columns inherited from 'concept'
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    # Now new columns:
    relation = models.ForeignKey(Relation)

class ClassInstanceClassInstance(models.Model):
    class Meta:
        db_table = "class_instance_class_instance"
        managed = False
    # Repeat the columns inherited from 'relation_instance'
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    relation = models.ForeignKey(Relation)
    # Now new columns:
    class_instance_a = models.ForeignKey(ClassInstance,
                                         related_name='class_instances_a',
                                         db_column='class_instance_a')
    class_instance_b = models.ForeignKey(ClassInstance,
                                         related_name='class_instances_b',
                                         db_column='class_instance_b')

class BrokenSlice(models.Model):
    class Meta:
        db_table = "broken_slice"
        managed = False
    stack = models.ForeignKey(Stack)
    index = models.IntegerField()

class ClassClass(models.Model):
    class Meta:
        db_table = "class_class"
        managed = False
    # Repeat the columns inherited from 'relation_instance'
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    relation = models.ForeignKey(Relation)
    # Now new columns:
    class_a = models.ForeignKey(Class, related_name='classes_a')
    class_b = models.ForeignKey(Class, related_name='classes_b')

class Message(models.Model):
    class Meta:
        db_table = "message"
        managed = False
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    time = models.DateTimeField(default=now)
    read = models.BooleanField()
    title = models.TextField()
    text = models.TextField(null=True)
    action = models.TextField()

class Settings(models.Model):
    class Meta:
        db_table = "settings"
        managed = False
    key = models.TextField()
    value = models.TextField(null=True)

class Textlabel(models.Model):
    class Meta:
        db_table = "textlabel"
        managed = False
    id = models.AutoField(primary_key=True)
    type = models.CharField(max_length=32)
    text = models.TextField(default="Edit this text ...")
    # colour is of type rgba, can't represent that yet
    font_name = models.TextField(null=True)
    font_style = models.TextField(null=True)
    font_size = models.FloatField(default=32)
    project = models.ForeignKey(Project)
    scaling = models.BooleanField(default=True)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    deleted = models.BooleanField()

class TextlabelLocation(models.Model):
    class Meta:
        db_table = "textlabel_location"
        managed = False
    textlabel = models.ForeignKey(Textlabel)
    # location is of type double3d, can't represent that yet
    deleted = models.BooleanField()

class Location(models.Model):
    class Meta:
        db_table = "location"
        managed = False
    # id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    location = Double3DField()


# ------------------------------------------------------------------------
# Now the non-Django tables:

SORT_ORDERS_TUPLES = [ ( 'name', ('name', False, 'Neuron name') ),
                       ( 'namer', ('name', True, 'Neuron name (reversed)') ),
                       ( 'gal4', ('gal4', False, 'GAL4 lines') ),
                       ( 'gal4r', ('gal4', True, 'GAL4 lines (reversed)') ),
                       ( 'cellbody', ('cell_body', False, 'Cell body location') ),
                       ( 'cellbodyr' , ('cell_body', True, 'Cell body location (reversed)') ) ]
SORT_ORDERS_DICT = dict(SORT_ORDERS_TUPLES)
SORT_ORDERS_CHOICES = tuple((x[0],SORT_ORDERS_DICT[x[0]][2]) for x in SORT_ORDERS_TUPLES)

class Neuron(object):
    # name = models.CharField(max_length=1000,unique=True,null=False)
    # trakem2_id = models.IntegerField(null=True)
    # lines = models.ManyToManyField(Line)
    CELL_BODY_UNKNOWN = 0
    CELL_BODY_LOCAL = 1
    CELL_BODY_NON_LOCAL = 2
    CELL_BODY_CHOICES = ( (CELL_BODY_UNKNOWN, 'Unknown'),
                          (CELL_BODY_LOCAL, 'Local'),
                          (CELL_BODY_NON_LOCAL, 'Non-Local') )
    cell_body_choices_dict = dict(CELL_BODY_CHOICES)
    # cell_body = models.IntegerField(default=CELL_BODY_UNKNOWN,choices=CELL_BODY_CHOICES)
    def __unicode__(self):
        return self.name
    def lines_as_str(self):
        return ', '.join([unicode(x) for x in self.lines.all()])
    def to_dict(self):
        return {'id': self.id,
                'trakem2_id': self.trakem2_id,
                'lineage' : 'unknown',
                'neurotransmitters': [],
                'cell_body_location': [ self.cell_body, Neuron.cell_body_choices_dict[self.cell_body] ],
                'name': self.name}

class NeuronSearch(forms.Form):
    search = forms.CharField(max_length=100,required=False)
    cell_body_location = forms.ChoiceField(
        choices=(((-1,'Any'),)+Neuron.CELL_BODY_CHOICES))
    order_by = forms.ChoiceField(SORT_ORDERS_CHOICES)
    def minimal_search_path(self):
        result = ""
        parameters = [ ( 'search', '/find/', '' ),
                       ( 'order_by', '/sorted/', 'name' ),
                       ( 'cell_body_location', '/cell_body_location/', "-1" ) ]
        for p in parameters:
            if self.cleaned_data[p[0]] != p[2]:
                result += p[1] + urllib.quote(str(self.cleaned_data[p[0]]))
        return result

class ApiKey(models.Model):
    description = models.TextField()
    key = models.CharField(max_length=128)
