'use strict'

const fastifyPlugin = require('fastify-plugin')
const Store = require('./store')
const Session = require('./session')
const metadata = require('./metadata')
const cookieSignature = require('cookie-signature')

function session (fastify, options, next) {
  const error = checkOptions(options)
  if (error) return next(error)

  options = ensureDefaults(options)

  fastify.decorateRequest('sessionStore', options.store)
  fastify.decorateRequest('session', {})
  fastify.decorateRequest('destroySession', destroySession)
  fastify.addHook('preValidation', preValidation(options))
  fastify.addHook('onSend', onSend(options))
  next()
}

function preValidation (options) {
  const storeImplementsRequestAtGet = options.store.get.length >= 3
  const implementsRequestAtDestroy = options.store.destroy.length >= 3
  const cookieOpts = options.cookie
  const secret = options.secret
  return function handleSession (request, reply, done) {
    const url = request.req.url
    if (url.indexOf(cookieOpts.path || '/') !== 0) {
      done()
      return
    }
    const sessionId = request.cookies[options.cookieName]
    if (!sessionId) {
      newSession(secret, request, cookieOpts, done)
    } else {
      const decryptedSessionId = cookieSignature.unsign(sessionId, secret)
      if (decryptedSessionId === false) {
        newSession(secret, request, cookieOpts, done)
      } else {
        const getCallback = (err, session) => {
          if (err) {
            if (err.code === 'ENOENT') {
              newSession(secret, request, cookieOpts, done)
            } else {
              done(err)
            }
            return
          }
          if (!session) {
            newSession(secret, request, cookieOpts, done)
            return
          }
          if (session.isExpired()) {
            const destroyCallback = getDestroyCallback(secret, request, reply, done, cookieOpts)
            if (implementsRequestAtDestroy) {
              options.store.destroy(sessionId, request, destroyCallback)
            } else {
              options.store.destroy(sessionId, destroyCallback)
            }
            return
          }
          request.session = new Session(
            cookieOpts,
            secret,
            session
          )
          done()
        }
        if (storeImplementsRequestAtGet) {
          options.store.get(decryptedSessionId, request, getCallback)
        } else {
          options.store.get(decryptedSessionId, getCallback)
        }
      }
    }
  }
}

function onSend (options) {
  const storeImplementsRequestAtSet = options.store.set.length >= 4
  return function saveSession (request, reply, payload, done) {
    const session = request.session
    if (!session || !session.sessionId || !shouldSaveSession(request, options.cookie, options.saveUninitialized)) {
      done()
      return
    }
    const setCallback = (err) => {
      if (err) {
        done(err)
        return
      }
      reply.setCookie(
        options.cookieName,
        session.encryptedSessionId,
        session.cookie.options()
      )
      done()
    }
    if (storeImplementsRequestAtSet) {
      options.store.set(session.sessionId, session, request, setCallback)
    } else {
      options.store.set(session.sessionId, session, setCallback)
    }
  }
}

function getDestroyCallback (secret, request, reply, done, cookieOpts) {
  return function destroyCallback (err) {
    if (err) {
      done(err)
      return
    }
    newSession(secret, request, cookieOpts, done)
  }
}

function newSession (secret, request, cookieOpts, done) {
  request.session = new Session(cookieOpts, secret)
  done()
}

function destroySession (done) {
  const request = this
  const implementsRequestAtDestroy = request.sessionStore.destroy.length >= 3
  const destroyCallback = (err) => {
    request.session = null
    done(err)
  }
  if (implementsRequestAtDestroy) {
    request.sessionStore.destroy(request.session.sessionId, request, destroyCallback)
  } else {
    request.sessionStore.destroy(request.session.sessionId, destroyCallback)
  }
}

function checkOptions (options) {
  if (!options.secret) {
    return new Error('the secret option is required!')
  }
  if (options.secret.length < 32) {
    return new Error('the secret must have length 32 or greater')
  }
}

function ensureDefaults (options) {
  options.store = options.store || new Store()
  options.cookieName = options.cookieName || 'sessionId'
  options.cookie = options.cookie || {}
  options.cookie.secure = option(options.cookie, 'secure', true)
  options.saveUninitialized = option(options, 'saveUninitialized', true)
  return options
}

function shouldSaveSession (request, cookieOpts, saveUninitialized) {
  if (!saveUninitialized && !isSessionModified(request.session)) {
    return false
  }
  if (cookieOpts.secure !== true) {
    return true
  }
  const connection = request.req.connection
  if (connection && connection.encrypted === true) {
    return true
  }
  const forwardedProto = request.headers['x-forwarded-proto']
  return forwardedProto === 'https'
}

function isSessionModified (session) {
  return (Object.keys(session).length !== 4)
}

function option (options, key, def) {
  return options[key] === undefined ? def : options[key]
}

exports = module.exports = fastifyPlugin(session, metadata)
module.exports.Store = Store
