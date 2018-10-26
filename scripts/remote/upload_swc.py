#!/usr/bin/python

import sys
import argparse
import requests
from requests.auth import HTTPBasicAuth


class CatmaidApiTokenAuth(HTTPBasicAuth):
    """Attaches HTTP X-Authorization Token headers to the given Request.
    Optionally, Basic HTTP Authentication can be used in parallel.
    """
    def __init__(self, token, username=None, password=None):
        super(CatmaidApiTokenAuth, self).__init__(username, password)
        self.token = token

    def __call__(self, r):
        r.headers['X-Authorization'] = 'Token {}'.format(self.token)
        if self.username and self.password:
            super(CatmaidApiTokenAuth, self).__call__(r)
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
    parser.add_argument(
            '--http_auth_user',
            help='Optional HTTP Auth user')
    parser.add_argument(
            '--http_auth_pass',
            help='Optional HTTP Auth password')

    args = parser.parse_args()

    session = requests.Session()
    session.auth = CatmaidApiTokenAuth(args.token, args.http_auth_user,
            args.http_auth_pass)
    response = session.post(
        '{}/{}/skeletons/import'.format(args.url, args.project_id),
        files={'file.swc': open(args.swc_file, 'rb')})

    print('Upload completed in {}ms'.format(response.elapsed.total_seconds() * 1000))
    try:
        skel = response.json()
    except:
        e = sys.exc_info()[0]
        print("Parse error: " + str(e))
        print(response.content)
        raise SystemExit, 1

    if 'error' in skel:
        print(skel)
        raise SystemExit, 1

    print('Skeleton ID: {}'.format(skel['skeleton_id']))
    print('Neuron ID: {}'.format(skel['neuron_id']))

    response = session.post(
        '{}/{}/stacks'.format(args.url, args.project_id))
    stacks = response.json()

    response = session.post(
        '{}/{}/node/get_location'.format(args.url, args.project_id),
        {'tnid': skel['node_id_map'].itervalues().next()})
    tn = response.json()
    print('Link: {}?pid={}&zp={}&yp={}&xp={}&sid0={}&s0=0&tool=tracingtool&active_node_id={}&active_skeleton_id={}'.format()
            args.url,
            args.project_id,
            tn[3], tn[2], tn[1],
            stacks[0]['id'],
            tn[0],
            skel['skeleton_id'])


if __name__ == "__main__":
    main()
