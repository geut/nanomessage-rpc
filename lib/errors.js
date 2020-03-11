const nanoerror = require('nanoerror')

exports.encodeError = encodeError
exports.decodeError = decodeError

const errors = new Map()

function createError (code, message) {
  exports[code] = decodeError(code, message)
}

function encodeError (code, message, ...args) {
  return { err: true, code, message, args }
}

function decodeError (code, message) {
  if (errors.has(code)) {
    return errors.get(code)
  }
  const error = nanoerror(code, message)
  errors.set(code, error)
  return error
}

createError('ERR_REQUEST_ARGUMENT_INVALID', 'the request has invalid arguments: %s')
