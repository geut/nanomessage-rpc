import nanoerror from 'nanoerror'

const errors = new Map()

function createError (code, message) {
  const err = nanoerror(code, message)
  errors.set(code, err)
  return err
}

export function encodeError (err) {
  return { error: true, data: { code: err.code, unformatMessage: err.unformatMessage, args: err.args, stack: err.stack } }
}

export function decodeError (code, message) {
  if (errors.has(code)) return errors.get(code)

  const err = nanoerror(code, message)
  errors.set(code, err)
  return err
}

export const NRPC_ERR_NAME_MISSING = createError('NRPC_ERR_NAME_MISSING', 'missing action handler for: %s')
export const NRPC_ERR_RESPONSE_ERROR = createError('NRPC_ERR_RESPONSE_ERROR', '%s')
export const NRPC_ERR_REQUEST_CANCELED = createError('NRPC_ERR_REQUEST_CANCELED', '%s')
export const NRPC_ERR_ENCODE = createError('NRPC_ERR_ENCODE', 'error encoding the request: %s')
export const NRPC_ERR_DECODE = createError('NRPC_ERR_DECODE', 'error decoding the request: %s')
export const NRPC_ERR_TIMEOUT_ZERO = createError('NRPC_ERR_TIMEOUT_ZERO', 'timeout cannot be %s in a request call')
