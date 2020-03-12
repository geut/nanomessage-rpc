const nanoerror = require('nanoerror')

exports.encodeError = encodeError
exports.decodeError = decodeError

function createError (code, message) {
  exports[code] = nanoerror(code, message)
}

function encodeError (err) {
  return { err: true, code: err.code, message: err.message }
}

function decodeError (code) {
  return exports[code]
}

createError('ERR_ACTION_NAME_MISSING', '%s')
createError('ERR_ACTION_RESPONSE_ERROR', '%s')
