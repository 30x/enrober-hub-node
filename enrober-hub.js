'use strict'
const http = require('http')
const url = require('url')
const lib = require('http-helper-functions')
const db = require('./enrober-hub-db.js')
const pLib = require('permissions-helper-functions')

var DEPLOYMENTS = '/ZGVw-'

function verifyDeployment(req, deployment, user) {
  var rslt = lib.setStandardCreationProperties(req, deployment, user)
  if (deployment.isA == 'Deployment')
    if (typeof deployment.env == 'string')
      if (deployment.permissions === undefined)
        return null
      else
        return `invalid JSON: may not set "permissions" property: ${JSON.stringify(deployment)}`
    else
      return `invalid JSON: "env" property not set to the URL of an Edge environment: ${JSON.stringify(deployment)}`
  else
    return 'invalid JSON: "isA" property not set to "Deployment" ' + JSON.stringify(deployment)
}

function createDeployment(req, res, deployment) {
  var user = lib.getUser(req.headers.authorization)
  if (user == null)
    lib.unauthorized(req, res)
  else { 
    var err = verifyDeployment(req, deployment, user)
    if (err !== null) 
      lib.badRequest(res, err)
    else
      pLib.ifAllowedThen(req, res, deployment.env, 'deployments', 'create', function() {
        var id = lib.uuid4()
        var selfURL = makeSelfURL(req, id)
        var permissions = {'_inheritsPermissionsOf': [deployment.env],'test-data': true}; // ; required
        (new pLib.Permissions(permissions)).resolveRelativeURLs(selfURL)
        pLib.createPermissionsThen(req, res, selfURL, permissions, function(err, permissionsURL, permissions, responseHeaders){
          // Create permissions first. If we fail after creating the permissions resource but before creating the main resource, 
          // there will be a useless but harmless permissions document.
          // If we do things the other way around, a deployment without matching permissions could cause problems.
          db.createDeploymentThen(req, res, id, selfURL, deployment, function(etag) {
            deployment.self = selfURL 
            addCalculatedProperties(req, deployment)
            lib.externalizeURLs(deployment, req.headers.host)
            lib.created(req, res, deployment, deployment.self, etag)
          })
        })
      })
  }
}

function addCalculatedProperties(req, deployment) {
  deployment._permissions = `scheme://authority/permissions?${deployment.self}`
  deployment._permissionsHeirs = `scheme://authority/permissions-heirs?${deployment.self}`  
}

function makeSelfURL(req, key) {
  return 'scheme://authority' + DEPLOYMENTS + key
}

function getDeployment(req, res, id) {
  pLib.ifAllowedThen(req, res, null, '_self', 'read', function(err, reason) {
    db.withDeploymentDo(req, res, id, function(deployment , etag) {
      deployment.self = makeSelfURL(req, id)
      addCalculatedProperties(req, deployment)
      lib.externalizeURLs(deployment, req.headers.host)
      lib.found(req, res, deployment, etag)
    })
  })
}

function deleteDeployment(req, res, id) {
  pLib.ifAllowedThen(req, res, null, '_self', 'delete', function(err, reason) {
    db.deleteDeploymentThen(req, res, id, function (deployment, etag) {
      lib.found(req, res, deployment, etag)
    })
  })
}

function updateDeployment(req, res, id, patch) {
  pLib.ifAllowedThen(req, res, null, '_self', 'update', function() {
    db.withDeploymentDo(req, res, id, function(deployment , etag) {
      lib.applyPatch(req, res, deployment, patch, function(patchedDeployment) {
        db.updateDeploymentThen(req, res, id, deployment, patchedDeployment, etag, function (etag) {
          patchedPermissions.self = selfURL(id, req) 
          addCalculatedProperties(req, deployment)
          lib.externalizeURLs(deployment, req.headers.host)
          lib.found(req, res, deployment, etag)
        })
      })
    })
  })
}

function getDeploymentsForEnvironment(req, res, environment) {
  var requestingUser = lib.getUser(req.headers.authorization)
  pLib.ifAllowedThen(req, res, environment, 'deployments', 'read', function() {
    db.withDeploymentsForEnvironmentDo(req, res, environment, function (deploymentIDs) {
      var rslt = {
        self: `scheme://authority${req.url}`,
        contents: deploymentIDs.map(id => `//${req.headers.host}${DEPLOYMENTS}${id}`)
      }
      lib.externalizeURLs(rslt)
      lib.found(req, res, rslt)
    })
  })
}

function requestHandler(req, res) {
  if (req.url == '/deployments') 
    if (req.method == 'POST') 
      lib.getServerPostObject(req, res, (t) => createDeployment(req, res, t))
    else 
      lib.methodNotAllowed(req, res, ['POST'])
  else {
    var req_url = url.parse(req.url)
    if (req_url.pathname.lastIndexOf(DEPLOYMENTS, 0) > -1) {
      var id = req_url.pathname.substring(DEPLOYMENTS.length)
      if (req.method == 'GET')
        getDeployment(req, res, id)
      else if (req.method == 'DELETE') 
        deleteDeployment(req, res, id)
      else if (req.method == 'PATCH') 
        lib.getServerPostObject(req, res, (jso) => updateDeployment(req, res, id, jso))
      else
        lib.methodNotAllowed(req, res, ['GET', 'DELETE', 'PATCH'])
    } else if (req_url.pathname == '/deployments' && req_url.search !== null)
      getDeploymentsForEnvironment(req, res, req_url.search.substring(1))
    else
      lib.notFound(req, res)
  }
}

function start(){
  db.init(function(){
    var port = process.env.PORT
    http.createServer(requestHandler).listen(port, function() {
      console.log(`server is listening on ${port}`)
    })
  })
}

if (process.env.INTERNAL_SY_ROUTER_HOST == 'kubernetes_host_ip') 
  lib.getHostIPThen(function(err, hostIP){
    if (err) 
      process.exit(1)
    else {
      process.env.INTERNAL_SY_ROUTER_HOST = hostIP
      start()
    }
  })
else 
  start()
