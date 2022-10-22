import { createError } from 'nanomessage'

export {
  NM_ERR_TIMEOUT,
  NM_ERR_ENCODE,
  NM_ERR_DECODE,
  NM_ERR_MESSAGE,
  NM_ERR_REMOTE_RESPONSE,
  NM_ERR_CLOSE,
  NM_ERR_NOT_OPEN,
  NM_ERR_CANCEL,
  createError
} from 'nanomessage'

export const NRPC_ERR_NAME_MISSING = createError('NRPC_ERR_NAME_MISSING', 'missing action handler for: %s')
export const NRPC_ERR_REQUEST_CANCELED = createError('NRPC_ERR_REQUEST_CANCELED', '%o')
export const NRPC_ERR_INTERNAL_EVENT = createError('NRPC_ERR_INTERNAL_EVENT', 'the event "%s" is only for internal use')
