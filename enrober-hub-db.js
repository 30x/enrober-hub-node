'use strict'
var Pool = require('pg').Pool
var lib = require('http-helper-functions')
const db = require('./enrober-hub-pg.js')

function withErrorHandling(req, res, callback) {
  return function (err) {
    if (err == 404) 
      lib.notFound(req, res)
    else if (err)
      lib.internalError(res, err)
    else 
      callback.apply(this, Array.prototype.slice.call(arguments, 1))
  }
}

function createDeploymentThen(req, res, id, selfURL, team, callback) {
  db.createDeploymentThen(req, id, selfURL, team, withErrorHandling(req, res, callback))
}

function withDeploymentDo(req, res, id, callback) {
  db.withDeploymentDo(req, id, withErrorHandling(req, res, callback))
}

function withDeploymentsForEnvironmentDo(req, res, environment, callback) {
  db.withDeploymentsForEnvironmentDo(req, environment, withErrorHandling(req, res, callback))
}
    
function deleteDeploymentThen(req, res, id, callback) {
  db.deleteDeploymentThen(req, id, withErrorHandling(req, res, callback))
}

function updateDeploymentThen(req, res, id, team, patchedDeployment, etag, callback) {
  db.updateDeploymentThen(req, id, team, patchedDeployment, etag, withErrorHandling(req, res, callback))
}

function init(callback) {
  db.init(callback)
}

exports.createDeploymentThen = createDeploymentThen
exports.updateDeploymentThen = updateDeploymentThen
exports.deleteDeploymentThen = deleteDeploymentThen
exports.withDeploymentDo = withDeploymentDo
exports.withDeploymentsForEnvironmentDo = withDeploymentsForEnvironmentDo
exports.init = init