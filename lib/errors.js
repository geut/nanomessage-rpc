const nanoerror = require('nanoerror')

exports.encodeError = encodeError
exports.decodeError = decodeError

const errors = new Map()

function createError (code, message) {
  exports[code] = nanoerror(code, message)
}

function encodeError (err) {
  return { err: true, code: err.code, unformatMessage: err.unformatMessage, args: err.args }
}

function decodeError (code, message) {
  if (exports[code]) return exports[code]

  if (errors.has(code)) return errors.get(code)

  const error = nanoerror(code, message)
  errors.set(code, error)
  return error
}

createError('ERR_ACTION_NAME_MISSING', 'missing action handler for: %s')
createError('ERR_ACTION_RESPONSE_ERROR', '%s')
