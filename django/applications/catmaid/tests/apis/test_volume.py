# -*- coding: utf-8 -*-

import json
import os

import pytz
import datetime

from dateutil.parser import parse as parse_date
from dateutil.tz import tzutc

from django.db import connection
from guardian.shortcuts import assign_perm

from .common import CatmaidApiTestCase
from catmaid.models import Volume
from catmaid.control.volume import BoxVolume


FIXTURE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fixtures')
CUBE_PATH = os.path.join(FIXTURE_DIR, 'cube.stl')


class VolumeTests(CatmaidApiTestCase):

    def setUp(self):
        super(VolumeTests, self).setUp()
        self.test_vol_1_box = BoxVolume(self.test_project_id, self.test_user_id, {
                'title': 'Test volume 1',
                'type': 'box',
                'comment': 'Comment on test volume 1',
                'min_x': -1,
                'min_y': -1,
                'min_z': -1,
                'max_x': 1,
                'max_y': 1,
                'max_z': 1
            })
        self.test_vol_1_id = self.test_vol_1_box.save()

        cursor = connection.cursor()
        cursor.execute("""
            SELECT row_to_json(v) FROM (
                SELECT id, project_id, name, comment, user_id, editor_id,
                    creation_time, edition_time, Box3D(geometry) as bbox,
                    ST_Asx3D(geometry) as geometry
                FROM catmaid_volume v
            ) v
        """)
        self.test_vol_1_data = cursor.fetchall()[0][0]
        self.test_vol_1_data['creation_time'] = parse_date(self.test_vol_1_data['creation_time'])
        self.test_vol_1_data['edition_time'] = parse_date(self.test_vol_1_data['edition_time'])

    def test_volume_edit_title_only(self):
        self.fake_authentication()
        # Change title only
        response = self.client.post('/%d/volumes/%d/' % (self.test_project_id,
            self.test_vol_1_id), {
                'title': 'New title'
            })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(parsed_response, {
            'success': True,
            'volume_id': self.test_vol_1_id
        })
        cursor = connection.cursor()
        cursor.execute("""
            SELECT user_id, project_id, creation_time, editor_id, edition_time,
                name, comment, ST_Asx3D(geometry)
            FROM catmaid_volume
        """)
        rows = cursor.fetchall()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row[0], self.test_user_id)
        self.assertEqual(row[1], self.test_project_id)
        self.assertTrue(abs(row[2] - self.test_vol_1_data['creation_time']) < datetime.timedelta(microseconds=1))
        self.assertEqual(row[3], self.test_user_id)
        # Edition time should be different, but needs to be set in a different
        # transaction.
        # self.assertTrue(abs(row[4] - self.test_vol_1_data['edition_time']) > datetime.timedelta(microseconds=1))
        self.assertEqual(row[5], 'New title')
        self.assertEqual(row[6], self.test_vol_1_data['comment'])
        self.assertEqual(row[7], self.test_vol_1_data['geometry'])

    def test_volume_edit_comment_only(self):
        self.fake_authentication()
        # Change comment only
        response = self.client.post('/%d/volumes/%d/' % (self.test_project_id,
            self.test_vol_1_id), {
                'comment': 'New comment'
            })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(parsed_response, {
            'success': True,
            'volume_id': self.test_vol_1_id
        })
        cursor = connection.cursor()
        cursor.execute("""
            SELECT user_id, project_id, creation_time, editor_id, edition_time,
                name, comment, ST_Asx3D(geometry)
            FROM catmaid_volume
        """)
        rows = cursor.fetchall()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row[0], self.test_user_id)
        self.assertEqual(row[1], self.test_project_id)
        self.assertTrue(abs(row[2] - self.test_vol_1_data['creation_time']) < datetime.timedelta(microseconds=1))
        self.assertEqual(row[3], self.test_user_id)
        # Edition time should be different, but needs to be set in a different
        # transaction.
        # self.assertTrue(abs(row[4] - self.test_vol_1_data['edition_time']) > datetime.timedelta(microseconds=1))
        self.assertEqual(row[5], self.test_vol_1_data['name'])
        self.assertEqual(row[6], 'New comment')
        self.assertEqual(row[7], self.test_vol_1_data['geometry'])

    def test_import_trimesh_from_stl(self):
        self.fake_authentication()
        assign_perm('can_import', self.test_user, self.test_project)
        with open(CUBE_PATH, 'rb') as f:
            response = self.client.post(
                "/{}/volumes/import".format(self.test_project_id),
                {"cube.stl": f}
            )

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(len(parsed_response), 1)
        self.assertTrue("cube.stl" in parsed_response)

        cube_id = parsed_response["cube.stl"]

        response = self.client.get("/{}/volumes/{}/".format(self.test_project_id, cube_id))

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(parsed_response['name'], 'cube')
        self.assertEqual(parsed_response['bbox'], {
                'min': {'x': 0, 'y': 0, 'z': 0},
                'max': {'x': 1, 'y': 1, 'z': 1}
            })

    def test_export_stl(self):
        self.fake_authentication()
        assign_perm('can_import', self.test_user, self.test_project)
        with open(CUBE_PATH, 'rb') as f:
            response = self.client.post(
                "/{}/volumes/import".format(self.test_project_id),
                {"cube.stl": f}
            )

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(len(parsed_response), 1)
        self.assertTrue("cube.stl" in parsed_response)

        cube_id = parsed_response["cube.stl"]

        response = self.client.get(
            "/{}/volumes/{}/export.stl".format(self.test_project_id, cube_id),
            HTTP_ACCEPT="model/x.stl-ascii,model/stl")

        self.assertEqual(response.status_code, 200)
