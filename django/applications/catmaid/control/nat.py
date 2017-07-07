# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import os
import subprocess

from datetime import datetime

from django.conf import settings
from django.http import JsonResponse, HttpResponse

from catmaid.control.common import urljoin
from catmaid.control.authentication import requires_user_role
from catmaid.models import Message, User, UserRole

from celery.task import task

from rest_framework.authtoken.models import Token


# The path were server side exported files get stored in
output_path = os.path.join(settings.MEDIA_ROOT,
    settings.MEDIA_EXPORT_SUBDIRECTORY)

class CleanUpHTTPResponse(HttpResponse):
    """Remove a file after it has been sent as a HTTP response.
    """

    def __init__(self, file_path, file_name, content_type, *args, **kwargs):
        self.file_path = file_path
        self.file_handle = open(file_path, 'rb')
        kwargs['content'] = self.file_handle
        super(CleanUpHTTPResponse, self).__init__(*args, **kwargs)
        #self['Content-Disposition'] = 'attachment; filename="{}"'.format(file_name)

    def close(self):
        """Make sure all file handles are closed and the input file is removed.
        """
        super(CleanUpHTTPResponse, self).close()
        if self.file_handle:
            self.file_handle.close()
        if os.path.exists(self.file_path):
            os.remove(self.file_path)


@requires_user_role(UserRole.Browse)
def export_nrrd(request, project_id, skeleton_id):
    """Export a skeleton as NRRD file using the NAT R package. To make this
    work, R has to be intalled on the server. Within R the NAT package has to be
    installed and the easiest way to do this is by running the following R code:

    if(!require("devtools")) install.packages("devtools")
    devtools::source_gist("fdd1e5b6e009ff49e66be466a104fd92", filename = "install_flyconnectome_all.R")

    Also, CMTK has to be installed, which can be done either by installing their
    published packages or compiling it from source and making it available from
    /usr/local/lib/cmtk/bin for NAT to pick it up.
    """
    source_ref = request.POST['source_ref']
    target_ref = request.POST['target_ref']
    mirror = request.POST.get('mirror', 'false') == 'true'
    async_export = request.POST.get('async_export', 'false') =='true'

    # Make sure the output path can be written to
    if not os.path.exists(output_path) or not os.access(output_path, os.W_OK):
        raise ValueError("The output path is not accessible")

    if async_export:
        export_skeleton_as_nrrd_async.delay(skeleton_id, source_ref, target_ref,
                request.user.id, mirror)

        return JsonResponse({
            'success': True
        })
    else:
        result = export_skeleton_as_nrrd(skeleton_id, source_ref, target_ref,
                request.user.id, mirror)

        if result['errors']:
            raise RuntimeError("There were errors creating the NRRD file: {}".format(
                    '\n'.join(result['errors'])))

        return CleanUpHTTPResponse(result['nrrd_path'], result['nrrd_name'],
                content_type='application/octet-stream')

@task()
def export_skeleton_as_nrrd_async(skeleton_id, source_ref, target_ref, user_id,
                                  mirror=True, create_message=True):

    result = export_skeleton_as_nrrd(skeleton_id, source_ref, target_ref,
                                     user_id, mirror)
    if create_message:
        msg = Message()
        msg.user = User.objects.get(pk=int(user_id))
        msg.read = False
        if result['errors']:
            msg.title = "No NRRD file could be creaed for skeleton {}".format(skeleton_id)
            msg.text = "There was at least one error during the NRRD export: {}".format('\n'.join(result['errors']))
            msg.action = ""
        else:
            url = urljoin(urljoin(settings.MEDIA_URL, settings.MEDIA_EXPORT_SUBDIRECTORY), result['nrrd_name'])
            msg.title = "Exported skeleton {} as NRRD file".format(skeleton_id)
            msg.text = "The requested skeleton was exported as NRRD file. You " \
                    "can download it from this location: <a href='{}'>{}</a>".format(url, url)
            msg.action = url
        msg.save()

    return "Errors: {}".format('\n'.join(result['errors'])) if result['errors'] else result['nrrd_path']

def export_skeleton_as_nrrd(skeleton_id, source_ref, target_ref, user_id, mirror=True):
    """ Export the skeleton with the passed in ID as NRRD file using R. For
    this to work R has to be installed.

    source_ref: FAFB13
    target_ref: JFRC2
    """
    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    nrrd_name = "{}-{}.nrrd".format(skeleton_id, timestamp)
    nrrd_path = os.path.join(output_path, nrrd_name)
    errors = []
    try:
        token, _ = Token.objects.get_or_create(user_id=user_id)

        server_params = [
            'server="{}"'.format(settings.CATMAID_FULL_URL),
            'token="{}"'.format(token.key)
        ]

        if settings.CATMAID_HTTP_AUTH_USER:
            server_params.append('authname="{}"'.format(settings.CATMAID_HTTP_AUTH_USER))
            server_params.append('authpassword="{}"'.format(settings.CATMAID_HTTP_AUTH_PASS))

        r_script = """
        # if(!require("devtools")) install.packages("devtools")
        # devtools::source_gist("fdd1e5b6e009ff49e66be466a104fd92", filename = "install_flyconnectome_all.R")

        library(flycircuit)
        library(elmr)
        library(catmaid)
        library(nat.nblast)
        library(doMC)
        doMC::registerDoMC(7)

        conn = catmaid_login({server_params})

        # based on fetchn_fafb
        x=catmaid::read.neurons.catmaid({skeleton_id}, conn=conn)
        xt=xform_brain(x, sample="{source_ref}", reference={target_ref})
        if({mirror}) xt=mirror_brain(xt, {target_ref})

        # based on fetchdp_fafb
        xdp=nat::dotprops(xt, resample=1, k=5)
        regtemplate(xdp)=regtemplate(xt)

        im=as.im3d(xyzmatrix(xdp), {target_ref})
        write.im3d(im, '{output_path}')
        """.format(**{
            'server_params': ", ".join(server_params),
            'source_ref': source_ref,
            'target_ref': target_ref,
            'skeleton_id': skeleton_id,
            'output_path': nrrd_path,
            'mirror': "TRUE" if mirror else "FALSE",
        })

        # Call R, allow Rprofile.site file
        cmd = "R --no-save --no-restore --no-init-file --no-environ"
        pipe = subprocess.Popen(cmd, shell=True, stdin=subprocess.PIPE)
        stdout, stderr = pipe.communicate(input=r_script)

        if not os.path.exists(nrrd_path):
            raise ValueError("No output file created")

    except (IOError, OSError, ValueError) as e:
        errors.append(str(e))
        # Delete the file if parts of it have been written already
        if os.path.exists(nrrd_path):
            os.remove(nrrd_path)

    return {
        "errors": errors,
        "nrrd_path": nrrd_path,
        "nrrd_name": nrrd_name
    }
