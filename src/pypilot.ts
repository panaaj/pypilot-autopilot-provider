import { AutopilotProviderApp } from './'

import { io, Socket } from 'socket.io-client'

export interface PYPILOT_CONFIG {
  host: string
  port: number
}

// autopilot data
export const apData: any = {
  options: {
    state: ['enabled', 'disabled'],
    mode: []
  },
  state: null,
  mode: null,
  target: null
}

let server: AutopilotProviderApp
let pluginId: string
let socket: Socket

// initialise connection to autopilot and register pypilot_web socket listeners
export const initPyPilot = (
  app: AutopilotProviderApp,
  id: string,
  config: PYPILOT_CONFIG
) => {
  server = app
  pluginId = id
  server.debug(`** Connecting to PyPilot **`)
  socket = io(`http://${config.host}:${config.port}`)

  if (!socket) {
    const msg = `PyPilot NOT connected @ ${config.host}:${config.port}... ensure 'pypilot_web' is running.`
    console.log(msg)
    server.setPluginStatus(msg)
    return
  }
  initPyPilotListeners()
}

export const closePyPilot = () => {
  if (socket) {
    socket.close()
  }
  if(!server.handleMessage) { return }
  server.handleMessage(pluginId, {
    updates: [
      {
        values: [
          {
            path: 'steering.autopilot.href',
            value: null
          }
        ]
      }
    ]
  })
}

// PyPilot socket event listeners
const initPyPilotListeners = () => {
  socket.on('connect', () => {
    server.debug('socket connected...')
    let msg = `Started: Connected to PyPilot.`
    server.setPluginStatus(msg)

    setTimeout(() => {
      const period = 1
      socket.emit('pypilot', `watch={"ap.heading": ${JSON.stringify(period)}}`)
      socket.emit(
        'pypilot',
        `watch={"ap.heading_command": ${JSON.stringify(period)}}`
      )
      socket.emit('pypilot', `watch={"ap.enabled": ${JSON.stringify(period)}}`)
      socket.emit('pypilot', `watch={"ap.mode": ${JSON.stringify(period)}}`)
    }, 1000)

    // flag pypilot as active pilot
    server.handleMessage(pluginId, {
      updates: [
        {
          values: [
            {
              path: 'steering.autopilot.href',
              value: `./pypilot`
            }
          ]
        }
      ]
    })
  })

  socket.on('connect_error', () => {
    server.debug('socket connect_error!')
    server.setPluginStatus(`Unable to connect to PyPilot!`)
  })

  // pypilot updates listener
  socket.on('pypilot', (msg) => {
    handlePyPilotUpdateMsg(JSON.parse(msg))
  })

  // pypilot_values listener
  socket.on('pypilot_values', (msg) => {
    handlePyPilotValuesMsg(JSON.parse(msg))
  })
}

// Send values to pypilot
const sendToPyPilot = (path: string, value: any): Promise<void> => {
  server.debug(path)
  server.debug(value)
  let mode: string = ''

  if (path === 'mode') {
    if (typeof value === 'string') {
      mode = 'ap.mode'
    }
  } else if (path === 'state') {
    if (typeof value === 'boolean') {
      mode = 'ap.enabled'
    }
  } else if (path === 'target') {
    if (typeof value === 'number') {
      mode = 'ap.heading_command'
    }
  } else if (path === 'tack') {
    if (
      typeof value === 'string' &&
      (value === 'port' || value === 'starboard')
    ) {
      mode = 'ap.tack.direction'
    }
  } else {
    server.debug('Error: Invalid value!')
  }

  if (mode) {
    try {
      socket.emit('pypilot', mode + '=' + JSON.stringify(value))
      return Promise.resolve()
    } catch (error) {
      server.debug((error as Error).message)
      throw new Error('Error: Sending data to autopilot!')
    }
  } else {
    throw new Error('Error: Invalid value!')
  }
}

interface PYPILOT_UPDATE_MSG {
  'ap.heading': number
  'ap.heading_command': boolean
  'ap.mode': string
  'ap.enabled': boolean
}

// process received pypilot update messages and send SK delta
const handlePyPilotUpdateMsg = (data: PYPILOT_UPDATE_MSG) => {
  // compare and send delta

  /*if (typeof data['ap.heading'] !== 'undefined') {
    let heading = data['ap.heading'] === false ? null : data['ap.heading']
    if (heading !== apData.heading) {
      apData.heading = heading
      emitDelta('target', (Math.PI /180) * apData.heading)
    }
  }*/

  //server.debug(`apUpdateMsg: ${JSON.stringify(data)}`)

  if (typeof data['ap.heading_command'] !== 'undefined') {
    let heading =
      data['ap.heading_command'] === false ? null : data['ap.heading_command']
    if (heading !== apData.target) {
      apData.target = heading
      emitDelta('target', (Math.PI / 180) * apData.target)
    }
  }

  if (typeof data['ap.mode'] !== 'undefined') {
    server.debug(`ap.mode -> data = ${JSON.stringify(data)}`)
    if (data['ap.mode'] !== apData.mode) {
      apData.mode = data['ap.mode']
      emitDelta('mode', apData.mode)
    }
  }

  if (typeof data['ap.enabled'] !== 'undefined') {
    if (data['ap.enabled'] !== apData.state) {
      apData.state = data['ap.enabled'] ? 'enabled' : 'disabled'
      emitDelta('state', apData.state)
    }
  }
}

interface PYPILOT_VALUES_MSG {
  'ap.mode': {
    choices: string[]
  }
}

// process received pypilot_values message and send SK delta
const handlePyPilotValuesMsg = (data: PYPILOT_VALUES_MSG) => {
  // available modes
  if (typeof data['ap.mode'] !== undefined && data['ap.mode'].choices) {
    apData.options.mode = Array.isArray(data['ap.mode'].choices)
      ? data['ap.mode'].choices
      : []
  }
}

// emit SK delta steering.autopilot.xxx
const emitDelta = (path: string, value: any) => {
  const pathRoot = 'steering.autopilot'
  let msg = {
    path: `${pathRoot}.${path}`,
    value: value
  }
  server.debug(`delta ${path} -> ${JSON.stringify(msg)}`)
  server.handleMessage(pluginId, {
    updates: [
      {
        values: [msg]
      }
    ]
  })
}

// set autopilot state
export const apEnable = (enable: boolean): Promise<void> => {
  server.debug(`${pluginId} => apEnable(${enable})`)
  apData.state = enable ? 'enabled' : 'disabled'
  return sendToPyPilot('state', enable)
}

// set autopilot mode
export const apSetMode = (mode: string): Promise<void> => {
  server.debug(`${pluginId} => apsetMode(${mode})`)
  if (apData.options.mode.includes(mode)) {
    apData.mode = mode
    return sendToPyPilot('mode', mode)
  } else {
    return Promise.reject()
  }
}

// set autopilot target
export const apSetTarget = (value: number): Promise<void> => {
  if (value > 359) {
    apData.target = 359
  } else if (value < -179) {
    apData.target = -179
  } else {
    apData.target = value
  }
  server.debug(`${pluginId} => Target value set = ${apData.target}`)
  return sendToPyPilot('target', value)
}

// perform tack
export const apTack = (port: boolean): Promise<void> => {
  server.debug(`${pluginId} => apTack(${port})`)
  return sendToPyPilot('tack', port ? 'port' : 'starboard')
}
