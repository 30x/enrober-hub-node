import requests
import base64
import json
from os import environ as env
from urlparse import urljoin

PG_HOST = env['PG_HOST']
PG_USER = env['PG_USER']
PG_PASSWORD = env['PG_PASSWORD']
PG_DATABASE = env['PG_DATABASE']
EXTERNAL_SCHEME = env['EXTERNAL_SCHEME']
BASE_URL = '%s://%s:%s' % (EXTERNAL_SCHEME, env['EXTERNAL_SY_ROUTER_HOST'], env['EXTERNAL_SY_ROUTER_PORT']) if 'EXTERNAL_SY_ROUTER_PORT' in env else '%s://%s' % (EXTERNAL_SCHEME, env['EXTERNAL_SY_ROUTER_HOST'])

def b64_decode(data):
    missing_padding = (4 - len(data) % 4) % 4
    if missing_padding:
        data += b'='* missing_padding
    return base64.decodestring(data)

if 'APIGEE_TOKEN1' in env:
    TOKEN1 = env['APIGEE_TOKEN1']
else:
    with open('token.txt') as f:
        TOKEN1 = f.read()
claims = json.loads(b64_decode(TOKEN1.split('.')[1]))
USER1 = claims['iss'] + '#' + claims['sub']

if 'APIGEE_TOKEN2' in env:
    TOKEN2 = env['APIGEE_TOKEN2']
else:
    with open('token2.txt') as f:
        TOKEN2 = f.read()
claims = json.loads(b64_decode(TOKEN2.split('.')[1]))
USER2 = claims['iss'] + '#' + claims['sub']

if 'APIGEE_TOKEN3' in env:
    TOKEN3 = env['APIGEE_TOKEN3']
else:
    with open('token3.txt') as f:
        TOKEN3 = f.read()
claims = json.loads(b64_decode(TOKEN2.split('.')[1]))
USER2 = claims['iss'] + '#' + claims['sub']

def main():
    
    # Make sure the permissions exist for the test environment

    env_url = '/o/ayesha/e/test'

    permissions = {
        '_subject': env_url,
        '_permissions': {
          'read': [USER1],
          'update': [USER1],
          'delete': [USER1]
        },
        '_self': {
          'read': [USER1],
          'delete': [USER1],
          'update': [USER1],
          'create': [USER1]
        },
        'deployments': {
          'read': [USER1],
          'delete': [USER1],
          'create': [USER1]
        },
        '_permissionsHeirs': {
          'read': [USER1],
          'add': [USER1],
          'remove': [USER1]
        }
      }

    permissons_url = urljoin(BASE_URL, '/permissions')
    headers = {'Authorization': 'Bearer %s' % TOKEN1, 'Content-Type': 'application/json'}
    r = requests.post(permissons_url, headers=headers, json=permissions)
    if r.status_code == 201:
        print 'correctly created permissions for org %s etag: %s' % (r.headers['Location'], r.headers['etag'])
    elif r.status_code == 409:
        print 'correctly saw that permissions for env %s already exist' % (env_url)    
    else:
        print 'failed to create map %s %s %s' % (maps_url, r.status_code, r.text)
        return

    # Create deployment using POST

    deployment = {
        'isA': 'Deployment',
        'env': env_url,
        'name': 'example-app-deployment',
        'test-data': True,
        'replicas': 1,
        'pts': {
            'apiVersion': 'v1',
            'kind': 'Pod',
            'metadata': {
                'name': 'helloworld',
                'annotations': {
                    'paths': '80:/hello'
                }
            },
            'spec': {
                'containers': [{
                    'name': 'test',
                    'image': 'jbowen/testapp:v0',
                    'env': [{
                        'name': 'PORT',
                        'value': '80'
                        }],
                    'ports': [{
                        'containerPort': 80
                        }]
                    }]
                }
            },
        'envVars': [{
            'name': 'test1',
            'value': 'test3'
            },
            {
            'name': 'test2',
            'value': 'test4'
           }] 
        } 

    deployments_url = urljoin(BASE_URL, '/deployments') 
    
    headers = {'Content-Type': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.post(deployments_url, headers=headers, json=deployment)
    if r.status_code == 201:
        print 'correctly created deployment %s etag: %s' % (r.headers['Location'], r.headers['etag'])
        deployment_url = urljoin(BASE_URL, r.headers['Location'])
    else:
        print 'failed to create deployment %s %s %s' % (deployments_url, r.status_code, r.text)
        return
        
    # GET deployment

    headers = {'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(deployment_url, headers=headers, json=deployment)
    if r.status_code == 200:
        deployment_url2 = urljoin(BASE_URL, r.headers['Content-Location'])
        if deployment_url == deployment_url2:
            deployment = r.json()
            print 'correctly retrieved deployment: %s etag: %s' % (deployment_url, r.headers['etag'])
        else:
            print 'retrieved deployment at %s but Content-Location is wrong: %s' % (deployment_url, deployment_url2)
            return
    else:
        print 'failed to retrieve deployment %s %s %s' % (deployment_url, r.status_code, r.text)
        return

    # DELETE deployment

    headers = {'Authorization': 'Bearer %s' % TOKEN1}
    r = requests.delete(deployment_url, headers=headers)
    if r.status_code == 200:
        print 'correctly deleted deployment %s etag: %s' % (r.headers['Content-Location'], r.headers['etag'])
    else:
        print 'failed to delete deployment %s %s %s' % (deployments_url, r.status_code, r.text)
        return

if __name__ == '__main__':
    main()