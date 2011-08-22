from django.db import models
from datetime import datetime

def now():
    return datetime.now()

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
    # dimension is of type integer3d, can't represent that yet
    # resolution is of type double3d, can't represent that yet
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
    # Default=Now new columns:
    class_name = models.CharField(max_length=255)
    description = models.TextField()

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
    # Default=Now new columns:
    class_ = models.ForeignKey(Class, db_column="class") # underscore since class is a keyword
    name = models.CharField(max_length=255)


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
    # Default=Now new columns:
    relation_name = models.CharField(max_length=255)
    uri = models.TextField()
    description = models.TextField()
    isreciprocal = models.BooleanField()

class RelationInstance(models.Model):
    class Meta:
        db_table = "relation_instance"
    # Repeat the columns inherited from 'concept'
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    # Default=Now new columns:
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
    # Default=Now new columns:
    class_instance_a = models.ForeignKey(ClassInstance)
    class_instance_b = models.ForeignKey(ClassInstance)

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
    # Default=Now new columns:
    class_a = models.ForeignKey(Class)
    class_b = models.ForeignKey(Class)

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
