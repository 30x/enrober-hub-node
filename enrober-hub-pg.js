'use strict'
var Pool = require('pg').Pool
var lib = require('http-helper-functions')
var pge = require('pg-event-producer')

var config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
}

var pool = new Pool(config)
var eventProducer = new pge.eventProducer(pool)

function createDeploymentThen(req, id, selfURL, deployment, callback) {
  var query = `INSERT INTO deployments (id, etag, data) values('${id}', 1, '${JSON.stringify(deployment)}') RETURNING etag`
  function eventData(pgResult) {
    return {id: selfURL, action: 'create', etag: pgResult.rows[0].etag, deployment: deployment}
  }
  pge.queryAndStoreEvent(req, pool, query, 'deployments', eventData, eventProducer, function(err, pgResult, pgEventResult) {
    callback(err, pgResult.rows[0].etag)
  })
}

function withDeploymentDo(req, id, callback) {
  pool.query('SELECT etag, data FROM deployments WHERE id = $1', [id], function (err, pg_res) {
    if (err) {
      callback(500)
    }
    else {
      if (pg_res.rowCount === 0) { 
        callback(404)
      }
      else {
        var row = pg_res.rows[0]
        callback(null, row.data, row.etag)
      }
    }
  })
}

function withDeploymentsForEnvironmentDo(req, environment, callback) {
  var query = `SELECT id FROM deployments WHERE data @> '{"env": "${environment}"}'`
  pool.query(query, function (err, pg_res) {
    if (err) {
      callback(err)
    }
    else {
      callback(null, pg_res.rows.map(row => row.id))
    }
  })
}
    
function deleteDeploymentThen(req, id, callback) {
  var query = `DELETE FROM deployments WHERE id = '${id}' RETURNING *`
  function eventData(pgResult) {
    return {id: id, action: 'delete', etag: pgResult.rows[0].etag, deployment: pgResult.rows[0].data}
  }
  pge.queryAndStoreEvent(req, pool, query, 'deployments', eventData, eventProducer, function(err, pgResult, pgEventResult) {
    console.log('etag from db', pgResult.rows[0].etag)
    callback(err, pgResult.rows[0].data, pgResult.rows[0].etag)
  })
}

function updateDeploymentThen(req, id, deployment, patchedDeployment, etag, callback) {
  var key = lib.internalizeURL(id, req.headers.host)
  var query = `UPDATE deployments SET (etag, data) = (${(etag+1) % 2147483647}, '${JSON.stringify(patchedDeployment)}') WHERE subject = '${key}' AND etag = ${etag} RETURNING etag`
  function eventData(pgResult) {
    return {id: id, action: 'update', etag: pgResult.rows[0].etag, before: deployment, after: patchedDeployment}
  }
  pge.queryAndStoreEvent(req, pool, query, 'deployments', eventData, eventProducer, function(err, pgResult, pgEventResult) {
    callback(err, pgResult.rows[0].etag)
  })
}

function init(callback) {
  var query = 'CREATE TABLE IF NOT EXISTS deployments (id text primary key, etag int, data jsonb)'
  pool.query(query, function(err, pgResult) {
    if(err) {
      console.error('error creating deployments table', err)
    } else {
      console.log(`connected to PG at ${config.host}`)
      eventProducer.init(callback)
    }
  })    
}

process.on('unhandledRejection', function(e) {
  console.log(e.message, e.stack)
})

exports.createDeploymentThen = createDeploymentThen
exports.updateDeploymentThen = updateDeploymentThen
exports.deleteDeploymentThen = deleteDeploymentThen
exports.withDeploymentDo = withDeploymentDo
exports.withDeploymentsForEnvironmentDo = withDeploymentsForEnvironmentDo
exports.init = init