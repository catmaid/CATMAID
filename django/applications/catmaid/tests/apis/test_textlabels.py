# -*- coding: utf-8 -*-

import json

from django.shortcuts import get_object_or_404

from catmaid.models import Textlabel, TextlabelLocation

from .common import CatmaidApiTestCase


class TextlabelsApiTests(CatmaidApiTestCase):
    def test_update_textlabel(self):
        self.fake_authentication()

        textlabel_id = 1

        params = {
                'tid': textlabel_id,
                'pid': self.test_project_id,
                'x': 3,
                'y': 1,
                'z': 4,
                'r': 0,
                'g': 0,
                'b': 0,
                'a': 0,
                'type': 'text',
                'text': 'Lets dance the Grim Fandango!',
                'font_name': 'We may have years, we may have hours',
                'font_style': 'But sooner or later we all push up flowers',
                'font_size': 5555,
                'scaling': 0}

        response = self.client.post(
                '/%d/textlabel/update' % self.test_project_id,
                params)
        expected_result = ' '
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, response.content.decode('utf-8'))

        label = Textlabel.objects.filter(id=textlabel_id)[0]
        label_location = TextlabelLocation.objects.filter(textlabel=textlabel_id)[0]
        self.assertEqual(params['pid'], label.project_id)
        self.assertEqual(params['x'], label_location.location.x)
        self.assertEqual(params['y'], label_location.location.y)
        self.assertEqual(params['z'], label_location.location.z)
        self.assertEqual(params['type'], label.type)
        self.assertEqual(params['text'], label.text)
        self.assertEqual(params['font_name'], label.font_name)
        self.assertEqual(params['font_style'], label.font_style)
        self.assertEqual(params['font_size'], label.font_size)
        self.assertEqual(False, label.scaling)


    def test_update_textlabel_using_optionals(self):
        """
        Omits some parameters and ensures corresponding
        properties of label were unchanged.
        """
        self.fake_authentication()

        textlabel_id = 1

        params = {
                'tid': textlabel_id,
                'text': 'Almost faltering, we held on to each other so that neither of us touched the ground.',
                'type': 'bubble'}

        label_before_update = Textlabel.objects.filter(id=textlabel_id)[0]
        label_location_before_update = TextlabelLocation.objects.filter(textlabel=textlabel_id)[0]

        response = self.client.post(
                '/%d/textlabel/update' % self.test_project_id,
                params)
        expected_result = ' '
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, response.content.decode('utf-8'))

        label = Textlabel.objects.filter(id=textlabel_id)[0]
        label_location = TextlabelLocation.objects.filter(textlabel=textlabel_id)[0]
        self.assertEqual(label_before_update.project_id, label.project_id)
        self.assertEqual(label_location_before_update.location.x, label_location.location.x)
        self.assertEqual(label_location_before_update.location.y, label_location.location.y)
        self.assertEqual(label_location_before_update.location.z, label_location.location.z)
        self.assertEqual(params['type'], label.type)
        self.assertEqual(params['text'], label.text)
        self.assertEqual(label_before_update.font_name, label.font_name)
        self.assertEqual(label_before_update.font_style, label.font_style)
        self.assertEqual(label_before_update.font_size, label.font_size)
        self.assertEqual(label_before_update.scaling, label.scaling)


    def test_update_textlabel_failure(self):
        self.fake_authentication()

        textlabel_id = 404

        params = {'tid': textlabel_id, 'pid': self.test_project_id}

        response = self.client.post(
                '/%d/textlabel/update' % self.test_project_id,
                params)
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = 'Failed to find Textlabel with id %s.' % textlabel_id
        self.assertIn('error', parsed_response)
        self.assertIn(expected_result, parsed_response['error'])


    def test_delete_textlabel(self):
        self.fake_authentication()

        textlabel_id = 1

        self.assertEqual(1, Textlabel.objects.filter(id=textlabel_id).count())
        self.assertEqual(1, TextlabelLocation.objects.filter(textlabel=textlabel_id).count())
        response = self.client.post(
                '/%d/textlabel/delete' % self.test_project_id,
                {'tid': textlabel_id})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {'message': 'Success.'}
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(0, Textlabel.objects.filter(id=textlabel_id).count())
        self.assertEqual(0, TextlabelLocation.objects.filter(textlabel=textlabel_id).count())


    def test_create_textlabel(self):
        self.fake_authentication()

        label_data = [
                # param-name, param values
                ('text', ['baba tiki dido', 'doop op', '']),
                ('type', ['text', 'bubble', 'non-valid-type']),
                ('font_name', [False, False, 'Times New Roman']),
                ('font_style', [False, 'bold', 'italic']),
                ('font_size', [55, 4, False]),
                ('x', [1, 2, 3]),
                ('y', [1, 100, 233]),
                ('z', [1, 0, 555]),
                ('r', [1, 2, 3]),
                ('g', [3, 4, 5]),
                ('b', [5, 7, 9]),
                ('a', [225, 225, 225])]

        label_count = Textlabel.objects.all().count()
        # Create and test labels
        for i in range(len(label_data[0][1])):
            params = {}
            # Fill request with POST-data
            for p, values in label_data:
                if values[i]:
                    params[p] = values[i]
            response = self.client.post(
                    '/%d/textlabel/create' % self.test_project_id,
                    params)

            parsed_response = json.loads(response.content.decode('utf-8'))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(label_count + 1 + i, Textlabel.objects.all().count())
            self.assertTrue('tid' in parsed_response.keys())
            label = get_object_or_404(Textlabel, id=parsed_response['tid'])
            label_location = TextlabelLocation.objects.get(textlabel=label.id)

            # For each attribute, ensure new label is in accord with input
            # label_location_data = Double3D(x=0, y=0, z=0)
            for p, values in label_data:
                value = values[i]
                if value is False:
                    continue  # Do not check for default values for now

                if (p == 'type' and value != 'bubble'):
                    self.assertEqual('text', getattr(label, p))
                elif (p == 'text' and value == ''):
                    self.assertEqual('Edit this text...', getattr(label, p))
                elif (p in ['x', 'y', 'z']):
                    self.assertEqual(value, getattr(label_location.location, p))
                elif (p in ['r', 'g', 'b', 'a']):
                    # Model does not include textlabel colour at the moment
                    pass
                else:
                    self.assertEqual(value, getattr(label, p))
            # self.assertEqual(label_location_data, label_location.location)


    def test_textlabels_empty(self):
        self.fake_authentication()
        expected_result = {}

        response = self.client.post('/%d/textlabel/all' % (self.test_project_id,), {
                'sid': 3,
                'z': 9,
                'top': 0,
                'left': 0,
                'width': 10240,
                'height': 7680,
                'scale': 0.5,
                'resolution': 5})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_result, parsed_response)


    def test_textlabels_nonempty(self):
        self.fake_authentication()
        expected_result = {
                '0': {
                    'tid': 1,
                    'type': 'text',
                    'text': 'World.',
                    'font_name': None,
                    'font_style': 'bold',
                    'font_size': 160,
                    'scaling': 1,
                    'z_diff': 0,
                    'colour': {'r': 255, 'g': 126, 'b': 0, 'a': 1},
                    'location': {'x': 3155, 'y': 1775, 'z': 27}},
                '1': {
                    'tid': 2,
                    'type': 'text',
                    'text': 'Helo.',
                    'font_name': None,
                    'font_style': 'bold',
                    'font_size': 160,
                    'scaling': 1,
                    'z_diff': 0,
                    'colour': {'r': 255, 'g': 126, 'b': 0, 'a': 1},
                    'location': {'x': 2345, 'y': 1785, 'z': 27}}}

        response = self.client.post('/%d/textlabel/all' % (self.test_project_id,), {
                'sid': 3,
                'z': 27,
                'top': 0,
                'left': 0,
                'width': 10240,
                'height': 7680,
                'scale': 0.5,
                'resolution': 5})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_result, parsed_response)
