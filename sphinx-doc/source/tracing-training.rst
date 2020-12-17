.. _training_tracers:

Training tracers
================

Like with most things, to get good at tracing neurons, some training is needed.
The :ref:`introduction for tracing neurons <tracing-neurons>` helps with first
steps, but managing a whole team and being confident in the quality of the
results, will require some supervision. There are of course many ways on how to
go about this, and an ad-hoc approach is surely fine for smaller groups. Below
we show one example of a systematic approach that was developed by Ruchi Parekh
and trainers in the Connectome Annotation Team (`CAT
<https://www.janelia.org/support-team/connectome-annotation>`_) at Janelia
Research Campus, where it worked for groups of tracers with 20 and more people.

Systematic training and evaluation
----------------------------------

This approach trains new users in using CATMAID and was developed with the `FAFB
<http://temca2data.org/>`_ dataset in mind along with manually reconstructed neurons that have been
published for it. New tracers were asked to reconstruct particular neurons in
increasing difficulty, highlighting different aspects of CATMAID and the
dataset. Selecting such neurons for other dataset requires certainly an expert
tracers.

We found that going through four levels of difficulty over the course of
multiple weeks gave tracers the skills they needed. We started
with asking trainees to look at 22 neurons, eventually settled on 18 though,
where the easiest level now includes only a single neuron. A shared spreadsheet
was used to keep track of the progress of all trainees. This was also used as a
means of communication between trainees and trainers. An example of such a
spreadsheet is shown as table below can be downloaded as `Open Document
Spreadsheet <_static/tracing/training/cat-training-pipeline.ods>`_ or
`Excel format <_static/tracing/training/cat-training-pipeline.xlsx>`_.

.. csv-table:: CAT Training Pipeline
   :class: cat-training-pipeline

    "Neuron name","CAT L1-5 ""initials""","CAT L2-1","CAT L2-2","CAT L2-3","CAT L2-4","CAT L2-5","CAT L3-1","CAT L3-2","CAT L3-3","CAT L3-4","CAT L3-5","CAT L4-1A","CAT L4-1B","CAT L4-2A","CAT L4-2B","CAT L4-3A ***","CAT L4-3B ***","CAT L4-3C ***","*** If soma and soma tract found, then stop tracing"
    "Brain region","Commisure","LO","LH","LP","MB","PB-EB-gall ","Connectives","Noduli ","PB","EB","GNG","--","MB","PB-EB-NO","PB-EB-NO","LP","LP","LP",
    "Cell type","Giant fiber input interneuron","LC4 neuron","Projection neuron ","VSN","KC - CA","PB-EB-gall","CNN","PB-EB-NO","PB-EB-NO","PB-EB-NO","VCN","Giant fiber branch","PN","PB-EB-NO","PB-EB-NO","LPLC","LPLC","HSE",
    "What to trace","Main trunk skeleton only","Trace arborization only (no synapses)","Trace arborization only (no synapses)","Trunk + soma tract + soma (no synapses)","Skeleton + synapses + soma tract + soma","Skeleton + synapses","Skeleton (no synapses)","Skeleton + synapses","Skeleton + soma tract + soma + synapses","Skeleton + synapses (tracing reviewed at 1 week mark)","Skeleton (no synapses) **","Skeleton + synapses","Skeleton + synapses","Skeleton (no synapses)","Skeleton (no synapses)","Skeleton (no synapses) + soma + soma tract","Skeleton (no synapses) + soma + soma tract","Skeleton (no synapses) + soma + soma tract",
    "                                                                Where to trace (Z)","Start on 3470 towards 3469. Stop on 3256.","Start on 4771 towards 4772","Start on 4622 towards 4621","Start on 5368 towards 5369 and stop at end node tagged with ""DO NOT PROCEED"". There will be a small soma tract between the tagged end node and seed node - do not trace beyond the two nodes!","Start on 4991 towards 4992","Start on 1635 towards 1636","Start on 5397 towards 5398","Start on 2869 towards 2868","Start on 4423 towards 4424","Start on 2889 towards 2888","Start on 5588 seed node towards 5055 end node (only stop at 5055 if there is an end node with tag ""DO NOT PROCEED"". Continue if there is no end node)","Start on 3795 towards 3796","Start on 4874 towards 4875","Start on 3569 seed node towards 3570. Stop on ""DO NOT PROCEED"" end node 3698","Start on 2364 seed node towards 2365. Stop on ""DO NOT PROCEED"" end node 2559","Start on 4291 towards 4292. Stop on  ""DO NOT PROCEED"" end node 4925. Find and trace soma tract between start and end nodes","Start on 5638 towards 5637. Stop on 4682. Find and trace soma tract between start and end sections","Start on 6271 towards 6272. Stop on  tagged as ""DO NOT PROCEED"" end node 5830 (only stop on section 5830 if this tag exists). Find and trace soma tract between start and end nodes","Review"
    "Trainee A",,,,,,,,,,,,,,,,,,,
    "Trainee B",,,,,,,,,,,,,,,,,,,
    "Trainee C",,,,,,,,,,,,,,,,,,,

Generally, the training pipeline follows following steps:

1. Trainee - Select "your" neuron name from above CAT LX-X list and search in CATMAID
2. Trainee - Trace neuron
3. Trainee - On completion - update progress sheet
4. Trainee - Pick next neuron from list
5. Trainer - Review completed neuron
6. Trainer - Update progress sheet

Example neuron names in the training dataset are:

- CAT L1-1 SC
- CAT L2-4 LR"
- CAT L1-3 AW
- CAT L5-1 TP
- CAT L4-4 CP
- CAT L3-1 SA

The status of each training neuron for each trainee follows the following color
code:

.. csv-table:: Status colors
  :class: cat-training-status

  "Trainee working on tracing", "Trainee completed tracing", "Trainer completed review", "Tracing deleted for given trainee", "Tracing on hold"

While tracing, trainees where advised to follow the following general guidelines
regarding the use of node tags and edge confidence values:

- use uncertain continuation/uncertain ends as necessary, however you will be
  evaluated based on how you use it
- L2-2 onwards - place confidence intervals as described below for uncertain
  continuations/ends
- L3-5 - If needed, clarify instructions with trainer

With confidence values assigned through the numeric keys 1-5 should be used like
the following:

.. csv-table:: Confidence intervals
  :class: cat-training-confidence

  "",5,4,3,2,1,""
  "I am",100%,75%,50%,25%,0%,"sure it continues/ends"
  "","don't add # 5 to node","add # 4 to node","add # 3 to node","add # 2 to node","add # 1 to node"
  "", "continue tracing","continue tracing if uncertain continuation or stop if uncertain end","stop tracing","stop tracing","stop tracing"

While also using the following rules on deciding when to mark an uncertain
continuation with a tag versus a low confidence value:

.. csv-table:: Tags versus confidence values
  :class: cat-training-tags
  "IF:","THEN:"
  "Uncert. end/cont. + 4 or 5 Confidence Interval","Uncert. end trumps"
  "Uncert. end/cont. + 1 or 2 or 3 Confidence Interval","Add both tags (Uncert. end + Conf. Interv.)"

And in addition:

- **Trainees should ask questions if confused about where to stop**
- **USE uncertain tags when confused about anything**


This document allows trainees to move through a defined and comparable process
to learn about CATMAID and tracing, as well as the dataset itself.

A Trainer would guide new trainees according to the above plan and track their
progress using the different color codes above in the trainee's "swim lane".
