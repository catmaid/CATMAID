#!/usr/bin/python


import argparse
import requests
from requests.auth import AuthBase


class CatmaidApiTokenAuth(AuthBase):
    """Attaches HTTP X-Authorization Token headers to the given Request."""
    def __init__(self, token):
        self.token = token

    def __call__(self, r):
        r.headers['X-Authorization'] = 'Token {}'.format(self.token)
        return r


def main():
    parser = argparse.ArgumentParser(description='Import an SWC skeleton into a CATMAID instance.')
    parser.add_argument(
            'url',
            help='CATMAID server URL.')
    parser.add_argument(
            'token',
            help='CATMAID API token.')
    parser.add_argument(
            'project_id', type=int,
            help='CATMAID project ID.')
    parser.add_argument(
            'swc_file',
            help='Filename of the SWC skeleton to upload and import.')

    args = parser.parse_args()

    session = requests.Session()
    session.auth = CatmaidApiTokenAuth(args.token)
    response = session.post(
        '{}/{}/skeletons/import'.format(args.url, args.project_id),
        files={'file.swc': open(args.swc_file, 'rb')})

    print 'Upload completed in {}ms'.format(response.elapsed.total_seconds() * 1000)
    skel = response.json()

    if 'error' in skel:
        print skel
        raise SystemExit, 1

    print 'Skeleton ID: {}'.format(skel['skeleton_id'])
    print 'Neuron ID: {}'.format(skel['neuron_id'])

    response = session.post(
        '{}/{}/stacks'.format(args.url, args.project_id))
    stacks = response.json()

    response = session.post(
        '{}/{}/node/get_location'.format(args.url, args.project_id),
        {'tnid': skel['node_id_map'].itervalues().next()})
    tn = response.json()
    print 'Link: {}?pid={}&zp={}&yp={}&xp={}&sid0={}&s0=0&tool=tracingtool&active_node_id={}&active_skeleton_id={}'.format(
            args.url,
            args.project_id,
            tn[3], tn[2], tn[1],
            stacks[0]['id'],
            tn[0],
            skel['skeleton_id'])


if __name__ == "__main__":
    main()
