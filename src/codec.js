import { createPackr } from 'nanomessage'

const ATTR_EVENT = 1

const kEmpty = Symbol('empty')

class ActionInfo {
  constructor (header, name, getData) {
    this.event = !!(header & ATTR_EVENT)
    this.name = name
    this._data = kEmpty
    this._getData = getData
  }

  get data () {
    if (this._data !== kEmpty) return this._data
    this._data = this._getData()
    return this._data
  }
}

const staticPackr = createPackr({
  structures: [
    ['header', 'name', 'data']
  ]
})

const dynamicPackr = createPackr()
const defaultValueEncoding = {
  encode: (data) => dynamicPackr.pack(data),
  decode: (data) => dynamicPackr.unpack(data)
}

export { createPackr }

export default function (valueEncoding = defaultValueEncoding) {
  return {
    encode (info) {
      const data = valueEncoding.encode(info.data)
      let header = 0

      if (info.name) {
        if (info.event) header = header | ATTR_EVENT

        return staticPackr.pack({
          header,
          name: info.name,
          data
        })
      }

      return staticPackr.pack({
        header,
        name: info.name,
        data
      })
    },
    decode (buf) {
      const { header, name, data } = staticPackr.unpack(buf)
      return new ActionInfo(header, name, () => valueEncoding.decode(data))
    }
  }
}
