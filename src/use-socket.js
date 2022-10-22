import eos from 'end-of-stream'
import { EVENTS } from './nanomessage-rpc.js'

export function useSocket (socket, onCloseDestroyStream = true) {
  return {
    send (buf) {
      if (socket.destroyed) {
        this
          .close()
          .catch(err => this.emit(EVENTS.errorSocket, err))
        return
      }
      socket.write(buf)
    },

    subscribe (next) {
      socket.on('data', next)
      return () => socket.removeListener('data', next)
    },

    open () {
      this.socket = socket
      eos(socket, () => {
        this
          .close()
          .catch(err => this.emit(EVENTS.errorSocket, err))
      })
    },

    close () {
      return new Promise(resolve => {
        if (socket.destroyed || !onCloseDestroyStream) return resolve()
        eos(socket, () => resolve())
        socket.destroy()
      })
    }
  }
}
